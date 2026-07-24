import { describe, expect, it } from "vitest";

import { asHex32 } from "../bytes";
import {
  createDemoState,
  DEMO_STARTING_BALANCE,
  DemoCommitPassStore,
} from "../demo-store";
import type { CommitPassEvent } from "../domain";
import { EphemeralScannerSigner } from "../scanner-crypto";
import {
  DEMO_ATTENDEE_ADDRESS,
  DEMO_BENEFICIARY_ADDRESS,
  DEMO_CONTRACT_ID,
  DEMO_ORGANIZER_ADDRESS,
  XLM_TESTNET_SAC_ID,
} from "../seed";
import {
  createAttendeePass,
  createCheckInVoucher,
  intentVoucherMessageProvider,
  signCheckInVoucher,
  type VoucherSigningContext,
} from "../voucher";

const SECOND_ATTENDEE =
  "GACAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAJJHP";
const EVENT_ID = "11".repeat(32);
const CONTEXT: VoucherSigningContext = {
  networkId: "22".repeat(32),
  contractId: DEMO_CONTRACT_ID,
};

function eventWithScanner(scannerPublicKey: string): CommitPassEvent {
  return {
    id: EVENT_ID,
    eventSalt: "17".repeat(32),
    organizer: DEMO_ORGANIZER_ADDRESS,
    metadataHash: "33".repeat(32),
    startAt: 2_000,
    checkInDeadline: 2_200,
    endAt: 3_000,
    token: XLM_TESTNET_SAC_ID,
    tokenCode: "XLM",
    tokenDecimals: 7,
    depositAmount: 20_000_000n,
    capacity: 3,
    seatsReserved: 0,
    outstandingDeposits: 0,
    noShowBeneficiary: DEMO_BENEFICIARY_ADDRESS,
    cancellationPolicy: "FullRefund",
    scannerPublicKey,
    status: "Active",
    createdAt: 1_000,
    metadata: {
      title: "Test event",
      summary: "A test event",
      organizerName: "CommitPass",
      venueName: "Test venue",
      venueCity: "Bengaluru",
      timezone: "Asia/Kolkata",
    },
  };
}

async function fixture(initialNow = 1_500) {
  const signer = await EphemeralScannerSigner.fromPrivateKey(
    new Uint8Array(32).fill(7),
  );
  const clock = { now: initialNow };
  const store = new DemoCommitPassStore({
    initialState: createDemoState([
      eventWithScanner(signer.publicKeyHex),
    ]),
    now: () => clock.now,
    voucherContext: CONTEXT,
    voucherMessageProvider: intentVoucherMessageProvider(CONTEXT),
  });
  return { signer, store, clock };
}

describe("DemoCommitPassStore", () => {
  it("runs deterministic reservation and attendee-refund transitions", async () => {
    const { signer, store } = await fixture();

    const reserved = store.reserve(EVENT_ID, DEMO_ATTENDEE_ADDRESS);
    expect(reserved.id).toBe("demo-tx-000001");
    expect(store.getReservation(EVENT_ID, DEMO_ATTENDEE_ADDRESS)).toMatchObject(
      {
        status: "Reserved",
        settledAt: null,
      },
    );
    expect(store.getEvent(EVENT_ID)).toMatchObject({
      seatsReserved: 1,
      outstandingDeposits: 1,
    });
    expect(store.balanceOf(DEMO_ATTENDEE_ADDRESS)).toBe(
      DEMO_STARTING_BALANCE - 20_000_000n,
    );

    const cancelled = store.cancelReservation(
      EVENT_ID,
      DEMO_ATTENDEE_ADDRESS,
    );
    expect(cancelled.id).toBe("demo-tx-000002");
    expect(store.getReservation(EVENT_ID, DEMO_ATTENDEE_ADDRESS)).toMatchObject(
      {
        status: "AttendeeRefunded",
        settledAt: 1_500,
      },
    );
    expect(store.getEvent(EVENT_ID)).toMatchObject({
      seatsReserved: 0,
      outstandingDeposits: 0,
    });
    expect(store.balanceOf(DEMO_ATTENDEE_ADDRESS)).toBe(
      DEMO_STARTING_BALANCE,
    );
    expect(() => store.reserve(EVENT_ID, DEMO_ATTENDEE_ADDRESS)).toThrowError(
      expect.objectContaining({ name: "AlreadyReserved" }),
    );
    signer.destroy();
  });

  it("checks in once, refunds fully, and keeps the occupied seat count", async () => {
    const { signer, store, clock } = await fixture();
    store.reserve(EVENT_ID, DEMO_ATTENDEE_ADDRESS);
    clock.now = 2_000;
    const pass = createAttendeePass({
      eventId: EVENT_ID,
      attendee: DEMO_ATTENDEE_ADDRESS,
      issuedAt: clock.now,
      randomBytes: () => new Uint8Array(32).fill(5),
    });
    const voucher = createCheckInVoucher({
      pass,
      checkedInAt: clock.now,
      checkInDeadline: 2_200,
    });
    const signedVoucher = await signCheckInVoucher({
      voucher,
      context: CONTEXT,
      signer,
      messageProvider: intentVoucherMessageProvider(CONTEXT),
      encoding: "commitpass-intent-v1",
    });

    const invalidSignedVoucher = {
      ...signedVoucher,
      signature: `${
        signedVoucher.signature.startsWith("0") ? "1" : "0"
      }${signedVoucher.signature.slice(1)}`,
    };
    await expect(
      store.claimCheckInRefund({
        eventId: EVENT_ID,
        attendee: DEMO_ATTENDEE_ADDRESS,
        signedVoucher: invalidSignedVoucher,
      }),
    ).rejects.toMatchObject({ name: "InvalidVoucherSignature" });
    expect(store.isNonceUsed(EVENT_ID, voucher.nonce)).toBe(false);
    expect(store.getReservation(EVENT_ID, DEMO_ATTENDEE_ADDRESS)?.status).toBe(
      "Reserved",
    );

    const receipt = await store.claimCheckInRefund({
      eventId: EVENT_ID,
      attendee: DEMO_ATTENDEE_ADDRESS,
      signedVoucher,
    });

    expect(receipt.id).toBe("demo-tx-000002");
    expect(store.getReservation(EVENT_ID, DEMO_ATTENDEE_ADDRESS)).toMatchObject(
      {
        status: "CheckedIn",
        settledAt: 2_000,
      },
    );
    expect(store.getEvent(EVENT_ID)).toMatchObject({
      seatsReserved: 1,
      outstandingDeposits: 0,
    });
    expect(store.balanceOf(DEMO_ATTENDEE_ADDRESS)).toBe(
      DEMO_STARTING_BALANCE,
    );
    await expect(
      store.claimCheckInRefund({
        eventId: EVENT_ID,
        attendee: DEMO_ATTENDEE_ADDRESS,
        signedVoucher,
      }),
    ).rejects.toMatchObject({ name: "VoucherAlreadyUsed" });
    signer.destroy();
  });

  it("prevents event-scoped nonce replay against a second attendee", async () => {
    const { signer, store, clock } = await fixture();
    store.reserve(EVENT_ID, DEMO_ATTENDEE_ADDRESS);
    store.reserve(EVENT_ID, SECOND_ATTENDEE);
    clock.now = 2_000;
    const nonceBytes = new Uint8Array(32).fill(9);

    const firstPass = createAttendeePass({
      eventId: EVENT_ID,
      attendee: DEMO_ATTENDEE_ADDRESS,
      issuedAt: clock.now,
      randomBytes: () => nonceBytes,
    });
    const firstVoucher = createCheckInVoucher({
      pass: firstPass,
      checkedInAt: clock.now,
      checkInDeadline: 2_200,
    });
    const firstSigned = await signCheckInVoucher({
      voucher: firstVoucher,
      context: CONTEXT,
      signer,
      messageProvider: intentVoucherMessageProvider(CONTEXT),
      encoding: "commitpass-intent-v1",
    });
    await store.claimCheckInRefund({
      eventId: EVENT_ID,
      attendee: DEMO_ATTENDEE_ADDRESS,
      signedVoucher: firstSigned,
    });

    const secondPass = {
      ...firstPass,
      attendee: SECOND_ATTENDEE,
      nonce: asHex32(nonceBytes),
    };
    const secondVoucher = createCheckInVoucher({
      pass: secondPass,
      checkedInAt: clock.now,
      checkInDeadline: 2_200,
    });
    const secondSigned = await signCheckInVoucher({
      voucher: secondVoucher,
      context: CONTEXT,
      signer,
      messageProvider: intentVoucherMessageProvider(CONTEXT),
      encoding: "commitpass-intent-v1",
    });

    await expect(
      store.claimCheckInRefund({
        eventId: EVENT_ID,
        attendee: SECOND_ATTENDEE,
        signedVoucher: secondSigned,
      }),
    ).rejects.toMatchObject({ name: "VoucherAlreadyUsed" });
    expect(store.getReservation(EVENT_ID, SECOND_ATTENDEE)?.status).toBe(
      "Reserved",
    );
    signer.destroy();
  });

  it("uses pull refunds after organizer cancellation", async () => {
    const { signer, store } = await fixture();
    store.reserve(EVENT_ID, DEMO_ATTENDEE_ADDRESS);
    store.cancelEvent(EVENT_ID, DEMO_ORGANIZER_ADDRESS);

    expect(store.getEvent(EVENT_ID)).toMatchObject({
      status: "Cancelled",
      seatsReserved: 1,
      outstandingDeposits: 1,
    });
    store.claimEventRefund(EVENT_ID, DEMO_ATTENDEE_ADDRESS);
    expect(store.getReservation(EVENT_ID, DEMO_ATTENDEE_ADDRESS)?.status).toBe(
      "EventRefunded",
    );
    expect(store.getEvent(EVENT_ID)).toMatchObject({
      seatsReserved: 0,
      outstandingDeposits: 0,
    });
    expect(store.balanceOf(DEMO_ATTENDEE_ADDRESS)).toBe(
      DEMO_STARTING_BALANCE,
    );
    signer.destroy();
  });
});
