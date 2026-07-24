import { describe, expect, it, vi } from "vitest";

vi.mock("../wallet", () => ({
  generatedClientOptions: vi.fn(),
}));

import {
  GeneratedRefundableRsvpAdapter,
  type CreateEventContractInput,
  type RefundableRsvpGeneratedClient,
} from "../contract";
import {
  PUBLIC_TESTNET_CONFIG,
  XLM_TESTNET_SAC_ID,
} from "../seed";

const ORGANIZER =
  "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";

const input: CreateEventContractInput = {
  eventSalt: "11".repeat(32),
  organizer: ORGANIZER,
  metadataHash: "22".repeat(32),
  startAt: 1_900_000_000,
  checkInDeadline: 1_900_000_600,
  endAt: 1_900_001_200,
  token: XLM_TESTNET_SAC_ID,
  depositAmount: 1n,
  capacity: 1,
  noShowBeneficiary: ORGANIZER,
  cancellationPolicy: "FullRefund",
  scannerPublicKey: "33".repeat(32),
};

function bindingEvent() {
  return {
    cancellation_policy: { tag: "FullRefund" as const, values: undefined },
    capacity: 1,
    check_in_deadline: 1_900_000_600n,
    created_at: 1_800_000_000n,
    deposit_amount: 1n,
    end_at: 1_900_001_200n,
    event_id: new Uint8Array(32).fill(4),
    event_salt: new Uint8Array(32).fill(0x11),
    metadata_hash: new Uint8Array(32).fill(0x22),
    no_show_beneficiary: ORGANIZER,
    organizer: ORGANIZER,
    outstanding_deposits: 0,
    scanner_public_key: new Uint8Array(32).fill(0x33),
    seats_reserved: 0,
    start_at: 1_900_000_000n,
    status: { tag: "Active" as const, values: undefined },
    token: XLM_TESTNET_SAC_ID,
  };
}

function adapterWithCreateEvent(result: unknown) {
  const signAndSend = vi.fn();
  const createEvent = vi.fn(async () => ({
    result,
    signAndSend,
  }));
  const client = {
    create_event: createEvent,
  } as unknown as RefundableRsvpGeneratedClient<Uint8Array>;
  return {
    adapter: new GeneratedRefundableRsvpAdapter({
      config: PUBLIC_TESTNET_CONFIG,
      client,
      bytesFromHex: (hex) =>
        Uint8Array.from(hex.match(/.{2}/g) ?? [], (pair) =>
          Number.parseInt(pair, 16),
        ),
    }),
    createEvent,
    signAndSend,
  };
}

describe("GeneratedRefundableRsvpAdapter writes", () => {
  it("surfaces the full simulated-to-confirmed lifecycle and hash", async () => {
    const okResult = {
      isOk: () => true,
      isErr: () => false,
      unwrap: () => bindingEvent(),
      unwrapErr: () => ({ message: "" }),
    };
    const { adapter, signAndSend } = adapterWithCreateEvent(okResult);
    const hash = "a".repeat(64);
    signAndSend.mockImplementation(async ({ watcher }) => {
      watcher.onSubmitted({ hash });
      watcher.onProgress({ hash });
      return {
        result: okResult,
        sendTransactionResponse: { hash },
        getTransactionResponse: { txHash: hash },
      };
    });
    const phases: string[] = [];

    const receipt = await adapter.createEvent(input, {
      onStatus: (status) => phases.push(status.phase),
    });

    expect(phases).toEqual([
      "simulating",
      "awaiting-signature",
      "submitted",
      "pending",
      "confirmed",
    ]);
    expect(receipt.hash).toBe(hash);
    expect(receipt.result).toMatchObject({
      organizer: ORGANIZER,
      capacity: 1,
      depositAmount: 1n,
    });
  });

  it("fails a typed simulated contract error before opening the wallet", async () => {
    const errorResult = {
      isOk: () => false,
      isErr: () => true,
      unwrap: () => {
        throw new Error("not ok");
      },
      unwrapErr: () => ({ message: "EventAlreadyExists" }),
    };
    const { adapter, signAndSend } = adapterWithCreateEvent(errorResult);
    const phases: string[] = [];

    await expect(
      adapter.createEvent(input, {
        onStatus: (status) => phases.push(status.phase),
      }),
    ).rejects.toMatchObject({
      name: "EventAlreadyExists",
    });

    expect(signAndSend).not.toHaveBeenCalled();
    expect(phases).toEqual(["simulating", "failed"]);
  });
});
