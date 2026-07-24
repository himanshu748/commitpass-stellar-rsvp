import { describe, expect, it } from "vitest";

import { hexToBytes } from "../bytes";
import { EphemeralScannerSigner } from "../scanner-crypto";
import {
  DEMO_ATTENDEE_ADDRESS,
  DEMO_CONTRACT_ID,
} from "../seed";
import {
  createAttendeePass,
  createCheckInVoucher,
  decodeAttendeePass,
  decodeSignedCheckInVoucher,
  encodeAttendeePass,
  encodeSignedCheckInVoucher,
  intentVoucherMessageProvider,
  signCheckInVoucher,
  verifySignedCheckInVoucher,
  type VoucherSigningContext,
} from "../voucher";

const EVENT_ID = "44".repeat(32);
const CONTEXT: VoucherSigningContext = {
  networkId: "55".repeat(32),
  contractId: DEMO_CONTRACT_ID,
};

describe("attendee passes and signed vouchers", () => {
  it("round-trips a wallet-bound one-time pass and a signed voucher", async () => {
    const signer = await EphemeralScannerSigner.fromPrivateKey(
      new Uint8Array(32).fill(11),
    );
    const pass = createAttendeePass({
      eventId: EVENT_ID,
      attendee: DEMO_ATTENDEE_ADDRESS,
      issuedAt: 2_000,
      randomBytes: () => new Uint8Array(32).fill(12),
    });
    expect(decodeAttendeePass(encodeAttendeePass(pass))).toEqual(pass);

    const voucher = createCheckInVoucher({
      pass,
      checkedInAt: 2_000,
      checkInDeadline: 2_200,
    });
    expect(voucher.expiresAt).toBe(2_060);
    const signed = await signCheckInVoucher({
      voucher,
      context: CONTEXT,
      signer,
      messageProvider: intentVoucherMessageProvider(CONTEXT),
      encoding: "commitpass-intent-v1",
    });
    expect(
      decodeSignedCheckInVoucher(encodeSignedCheckInVoucher(signed)),
    ).toEqual(signed);

    const result = await verifySignedCheckInVoucher({
      signedVoucher: signed,
      expectedContext: CONTEXT,
      expectedEventId: EVENT_ID,
      expectedAttendee: DEMO_ATTENDEE_ADDRESS,
      scannerPublicKey: signer.publicKey,
      eventStartAt: 2_000,
      checkInDeadline: 2_200,
      now: 2_060,
      messageProvider: intentVoucherMessageProvider(CONTEXT),
    });
    expect(result).toEqual({ ok: true, voucher });
    signer.destroy();
  });

  it("rejects attendee substitution, tampering, a wrong key, and expiry", async () => {
    const signer = await EphemeralScannerSigner.fromPrivateKey(
      new Uint8Array(32).fill(13),
    );
    const wrongSigner = await EphemeralScannerSigner.fromPrivateKey(
      new Uint8Array(32).fill(14),
    );
    const pass = createAttendeePass({
      eventId: EVENT_ID,
      attendee: DEMO_ATTENDEE_ADDRESS,
      issuedAt: 2_000,
      randomBytes: () => new Uint8Array(32).fill(15),
    });
    const voucher = createCheckInVoucher({
      pass,
      checkedInAt: 2_000,
      checkInDeadline: 2_200,
    });
    const signed = await signCheckInVoucher({
      voucher,
      context: CONTEXT,
      signer,
      messageProvider: intentVoucherMessageProvider(CONTEXT),
      encoding: "commitpass-intent-v1",
    });

    const common = {
      expectedContext: CONTEXT,
      expectedEventId: EVENT_ID,
      expectedAttendee: DEMO_ATTENDEE_ADDRESS,
      eventStartAt: 2_000,
      checkInDeadline: 2_200,
      now: 2_001,
      messageProvider: intentVoucherMessageProvider(CONTEXT),
    };
    expect(
      await verifySignedCheckInVoucher({
        ...common,
        signedVoucher: {
          ...signed,
          voucher: {
            ...signed.voucher,
            attendee:
              "GACAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAJJHP",
          },
        },
        scannerPublicKey: signer.publicKey,
      }),
    ).toMatchObject({ ok: false, reason: "VoucherMismatch" });

    const signature = hexToBytes(signed.signature, 64);
    signature[0] ^= 1;
    expect(
      await verifySignedCheckInVoucher({
        ...common,
        signedVoucher: {
          ...signed,
          signature: Array.from(signature, (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join(""),
        },
        scannerPublicKey: signer.publicKey,
      }),
    ).toMatchObject({ ok: false, reason: "InvalidVoucherSignature" });

    expect(
      await verifySignedCheckInVoucher({
        ...common,
        signedVoucher: signed,
        scannerPublicKey: wrongSigner.publicKey,
      }),
    ).toMatchObject({ ok: false, reason: "InvalidVoucherSignature" });

    expect(
      await verifySignedCheckInVoucher({
        ...common,
        signedVoucher: signed,
        scannerPublicKey: signer.publicKey,
        now: 2_061,
      }),
    ).toMatchObject({ ok: false, reason: "VoucherExpired" });
    signer.destroy();
    wrongSigner.destroy();
  });

  it("clips the 60-second product voucher at the contract deadline", () => {
    const pass = createAttendeePass({
      eventId: EVENT_ID,
      attendee: DEMO_ATTENDEE_ADDRESS,
      issuedAt: 2_180,
      randomBytes: () => new Uint8Array(32).fill(16),
    });
    expect(
      createCheckInVoucher({
        pass,
        checkedInAt: 2_180,
        checkInDeadline: 2_200,
      }).expiresAt,
    ).toBe(2_200);
  });
});
