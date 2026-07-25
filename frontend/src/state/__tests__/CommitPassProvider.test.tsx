import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRefundableRsvpAdapter } from "../../lib/contract";
import type { ContractEventPollerOptions } from "../../lib/contract-events";
import {
  connectWallet,
  disconnectWallet as disconnectWalletModule,
  getConnectedTestnetWalletAdapter,
} from "../../lib/wallet";
import { loadTestnetXlmBalance } from "../../lib/stellar-account";
import {
  PUBLIC_TESTNET_CONFIG,
  PUBLIC_TESTNET_VERIFICATION_EVENT_ID,
} from "../../lib/seed";
import {
  CommitPassProvider,
  useCommitPass,
} from "../CommitPassProvider";

vi.mock("../../lib/wallet", () => ({
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  getConnectedTestnetWalletAdapter: vi.fn(),
  signConnectedTestnetTransaction: vi.fn(),
}));

const contractMocks = vi.hoisted(() => ({
  createEvent: vi.fn(),
  getEvent: vi.fn(),
  reserve: vi.fn(),
  getReservation: vi.fn(),
  voucherMessage: vi.fn(),
  claimCheckInRefund: vi.fn(),
}));

vi.mock("../../lib/contract", () => ({
  createSecureEventSalt: vi.fn(() => "a".repeat(64)),
  createRefundableRsvpAdapter: vi.fn(() => ({
    getEvent: contractMocks.getEvent,
    createEvent: contractMocks.createEvent,
    reserve: contractMocks.reserve,
    getReservation: contractMocks.getReservation,
    voucherMessage: contractMocks.voucherMessage,
    claimCheckInRefund: contractMocks.claimCheckInRefund,
  })),
}));

const pollerMocks = vi.hoisted(() => ({
  options: undefined as unknown,
  start: vi.fn(),
  stop: vi.fn(),
  getCursor: vi.fn(),
}));

vi.mock("../../lib/contract-events", () => ({
  createContractEventPoller: vi.fn((options) => {
    pollerMocks.options = options;
    return {
      start: pollerMocks.start,
      stop: pollerMocks.stop,
      getCursor: pollerMocks.getCursor,
    };
  }),
}));

vi.mock("../../lib/stellar-account", () => ({
  loadTestnetXlmBalance: vi.fn(),
  submitTestnetXlmPayment: vi.fn(),
}));

const ACCOUNT =
  "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";
const OTHER_ACCOUNT =
  "GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H";

function contractEvent(
  id = PUBLIC_TESTNET_VERIFICATION_EVENT_ID,
  organizer = ACCOUNT,
  scannerPublicKey = "d".repeat(64),
) {
  return {
    id,
    eventSalt: "a".repeat(64),
    organizer,
    metadataHash: "c".repeat(64),
    startAt: 1_900_000_000,
    checkInDeadline: 1_900_000_600,
    endAt: 1_900_001_200,
    token:
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    depositAmount: 10_000n,
    capacity: 1,
    seatsReserved: 0,
    outstandingDeposits: 0,
    noShowBeneficiary: organizer,
    cancellationPolicy: "FullRefund" as const,
    scannerPublicKey,
    status: "Active" as const,
    createdAt: 1_800_000_000,
  };
}

function WalletHarness() {
  const {
    walletAddress,
    walletMode,
    testnetBalance,
    connectDemoWallet,
    connectLiveWallet,
    disconnectWallet,
    createLiveContractProof,
    reserveLiveProofEvent,
    claimLiveProofRefund,
    refreshLiveContractRead,
    liveContractProof,
    liveContractLifecycle,
    scannerPublicKey,
  } = useCommitPass();

  return (
    <>
      <output data-testid="wallet-state">
        {walletAddress ?? "none"}|{walletMode ?? "none"}|
        {testnetBalance.status}
        {testnetBalance.status === "ready"
          ? `|${testnetBalance.amount}`
          : ""}
      </output>
      <output data-testid="proof-state">
        {liveContractProof.transaction?.status ?? "idle"}|
        {liveContractProof.targetEventId}|
        {liveContractProof.event?.id ?? "none"}
      </output>
      <output data-testid="proof-read-state">
        {liveContractProof.readStatus}|
        {liveContractProof.readError ?? "none"}
      </output>
      <output data-testid="scanner-key">
        {scannerPublicKey ?? "initializing"}
      </output>
      <output data-testid="lifecycle-state">
        {liveContractLifecycle.reservation?.status ?? "unreserved"}|
        {liveContractLifecycle.scannerReady ? "scanner-ready" : "scanner-off"}|
        {liveContractLifecycle.transaction?.status ?? "idle"}
      </output>
      <button type="button" onClick={() => void connectLiveWallet()}>
        Connect
      </button>
      <button type="button" onClick={connectDemoWallet}>
        Demo
      </button>
      <button type="button" onClick={() => void disconnectWallet()}>
        Disconnect
      </button>
      <button type="button" onClick={() => void createLiveContractProof()}>
        Create proof
      </button>
      <button type="button" onClick={() => void reserveLiveProofEvent()}>
        Reserve proof
      </button>
      <button type="button" onClick={() => void claimLiveProofRefund()}>
        Claim proof
      </button>
      <button type="button" onClick={() => void refreshLiveContractRead()}>
        Refresh proof
      </button>
    </>
  );
}

describe("CommitPassProvider wallet lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectWallet).mockResolvedValue({
      address: ACCOUNT,
      walletName: "Freighter",
    });
    vi.mocked(loadTestnetXlmBalance).mockResolvedValue("12.345");
    vi.mocked(disconnectWalletModule).mockResolvedValue();
    vi.mocked(getConnectedTestnetWalletAdapter).mockReturnValue(
      {} as ReturnType<typeof getConnectedTestnetWalletAdapter>,
    );
    contractMocks.getEvent.mockResolvedValue(contractEvent());
    pollerMocks.options = undefined;
  });

  it("loads the Testnet balance after connection and delegates disconnect", async () => {
    const user = userEvent.setup();
    render(
      <CommitPassProvider>
        <WalletHarness />
      </CommitPassProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(screen.getByTestId("wallet-state")).toHaveTextContent(
        `${ACCOUNT}|live|ready|12.345`,
      ),
    );
    expect(loadTestnetXlmBalance).toHaveBeenCalledWith(ACCOUNT);

    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() =>
      expect(screen.getByTestId("wallet-state")).toHaveTextContent(
        "none|none|idle",
      ),
    );
    expect(disconnectWalletModule).toHaveBeenCalledOnce();
  });

  it("ignores a live connection that resolves after choosing the demo wallet", async () => {
    const user = userEvent.setup();
    let resolveConnection:
      | ((value: Awaited<ReturnType<typeof connectWallet>>) => void)
      | undefined;
    vi.mocked(connectWallet).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConnection = resolve;
        }),
    );
    render(
      <CommitPassProvider>
        <WalletHarness />
      </CommitPassProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(connectWallet).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Demo" }));
    expect(screen.getByTestId("wallet-state")).toHaveTextContent(
      "|demo|idle",
    );
    resolveConnection?.({
      address: ACCOUNT,
      walletName: "Freighter",
    });

    await waitFor(() =>
      expect(disconnectWalletModule).toHaveBeenCalledOnce(),
    );
    expect(screen.getByTestId("wallet-state")).toHaveTextContent(
      "|demo|idle",
    );
    expect(loadTestnetXlmBalance).not.toHaveBeenCalled();
  });

  it("ignores a live connection that resolves after disconnect", async () => {
    const user = userEvent.setup();
    let resolveConnection:
      | ((value: Awaited<ReturnType<typeof connectWallet>>) => void)
      | undefined;
    vi.mocked(connectWallet).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConnection = resolve;
        }),
    );
    render(
      <CommitPassProvider>
        <WalletHarness />
      </CommitPassProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(connectWallet).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByTestId("wallet-state")).toHaveTextContent(
      "none|none|idle",
    );
    resolveConnection?.({
      address: ACCOUNT,
      walletName: "Freighter",
    });

    await waitFor(() =>
      expect(disconnectWalletModule).toHaveBeenCalledOnce(),
    );
    expect(screen.getByTestId("wallet-state")).toHaveTextContent(
      "none|none|idle",
    );
    expect(loadTestnetXlmBalance).not.toHaveBeenCalled();
  });

  it("reconciles emitted cancellation and event-refund names with the connected attendee reservation", async () => {
    const user = userEvent.setup();
    render(
      <CommitPassProvider>
        <WalletHarness />
      </CommitPassProvider>,
    );

    await waitFor(() => expect(pollerMocks.start).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(screen.getByTestId("wallet-state")).toHaveTextContent(
        `${ACCOUNT}|live|ready|12.345`,
      ),
    );
    await waitFor(() => expect(pollerMocks.start).toHaveBeenCalledTimes(2));

    const pollerOptions = pollerMocks.options as ContractEventPollerOptions;
    const attendeeRefunded = {
      status: "AttendeeRefunded" as const,
      reservedAt: 1_899_999_900,
      settledAt: 1_900_000_001,
    };
    contractMocks.getEvent.mockClear();
    contractMocks.getReservation.mockResolvedValueOnce(attendeeRefunded);

    await act(async () => {
      await pollerOptions.onEvents([
        {
          id: "attendee-cancelled-event",
          ledger: 502,
          txHash: "3".repeat(64),
          name: "attendee_cancelled",
          eventId: PUBLIC_TESTNET_VERIFICATION_EVENT_ID,
          account: ACCOUNT,
          payload: {},
          cursor: "attendee-cancelled-cursor",
        },
      ]);
    });

    expect(contractMocks.getEvent).toHaveBeenCalledWith(
      PUBLIC_TESTNET_VERIFICATION_EVENT_ID,
    );
    expect(contractMocks.getReservation).toHaveBeenCalledWith(
      PUBLIC_TESTNET_VERIFICATION_EVENT_ID,
      ACCOUNT,
    );
    expect(screen.getByTestId("lifecycle-state")).toHaveTextContent(
      "AttendeeRefunded|scanner-off|idle",
    );

    const eventRefunded = {
      ...attendeeRefunded,
      status: "EventRefunded" as const,
    };
    contractMocks.getEvent.mockClear();
    contractMocks.getReservation.mockClear();
    contractMocks.getReservation.mockResolvedValueOnce(eventRefunded);

    await act(async () => {
      await pollerOptions.onEvents([
        {
          id: "event-refund-event",
          ledger: 503,
          txHash: "4".repeat(64),
          name: "event_refund",
          eventId: PUBLIC_TESTNET_VERIFICATION_EVENT_ID,
          account: ACCOUNT,
          payload: {},
          cursor: "event-refund-cursor",
        },
      ]);
    });

    expect(contractMocks.getEvent).toHaveBeenCalledWith(
      PUBLIC_TESTNET_VERIFICATION_EVENT_ID,
    );
    expect(contractMocks.getReservation).toHaveBeenCalledWith(
      PUBLIC_TESTNET_VERIFICATION_EVENT_ID,
      ACCOUNT,
    );
    expect(screen.getByTestId("lifecycle-state")).toHaveTextContent(
      "EventRefunded|scanner-off|idle",
    );
  });

  it("propagates an event-driven read failure so the same reservation signal can be retried", async () => {
    const user = userEvent.setup();
    render(
      <CommitPassProvider>
        <WalletHarness />
      </CommitPassProvider>,
    );

    await waitFor(() => expect(pollerMocks.start).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(screen.getByTestId("wallet-state")).toHaveTextContent(
        `${ACCOUNT}|live|ready|12.345`,
      ),
    );
    await waitFor(() => expect(pollerMocks.start).toHaveBeenCalledTimes(2));

    const pollerOptions = pollerMocks.options as ContractEventPollerOptions;
    const reserved = {
      status: "Reserved" as const,
      reservedAt: 1_899_999_900,
      settledAt: null,
    };
    const readFailure = new Error("Reservation RPC read failed.");
    contractMocks.getEvent.mockClear();
    contractMocks.getReservation
      .mockRejectedValueOnce(readFailure)
      .mockResolvedValueOnce(reserved);
    const reservationEvent = {
      id: "reservation-retry-event",
      ledger: 504,
      txHash: "5".repeat(64),
      name: "reserved",
      eventId: PUBLIC_TESTNET_VERIFICATION_EVENT_ID,
      account: ACCOUNT,
      payload: {},
      cursor: "reservation-retry-cursor",
    };

    await act(async () => {
      await expect(
        pollerOptions.onEvents([reservationEvent]),
      ).rejects.toThrow(readFailure);
    });
    expect(screen.getByTestId("proof-read-state")).toHaveTextContent(
      "error|Reservation RPC read failed.",
    );

    await act(async () => {
      await pollerOptions.onEvents([reservationEvent]);
    });
    expect(contractMocks.getEvent).toHaveBeenCalledTimes(2);
    expect(contractMocks.getReservation).toHaveBeenCalledTimes(2);
    expect(contractMocks.getReservation).toHaveBeenLastCalledWith(
      PUBLIC_TESTNET_VERIFICATION_EVENT_ID,
      ACCOUNT,
    );
    expect(screen.getByTestId("proof-read-state")).toHaveTextContent(
      "ready|none",
    );
    expect(screen.getByTestId("lifecycle-state")).toHaveTextContent(
      "Reserved|scanner-off|idle",
    );

    contractMocks.getEvent.mockRejectedValueOnce(
      new Error("Manual event refresh failed."),
    );
    await user.click(screen.getByRole("button", { name: "Refresh proof" }));
    await waitFor(() =>
      expect(screen.getByTestId("proof-read-state")).toHaveTextContent(
        "error|Manual event refresh failed.",
      ),
    );
  });

  it("creates a fresh proof event, tracks its lifecycle, and reconciles only that event", async () => {
    const user = userEvent.setup();
    const proofEventId = "e".repeat(64);
    let submittedScannerKey = "";
    contractMocks.createEvent.mockImplementation(
      async (
        input: {
          organizer: string;
          scannerPublicKey: string;
          token: string;
          depositAmount: bigint;
          capacity: number;
          startAt: number;
          checkInDeadline: number;
          endAt: number;
        },
        options: {
          onStatus?: (status: {
            phase:
              | "simulating"
              | "awaiting-signature"
              | "submitted"
              | "pending"
              | "confirmed";
            message: string;
            hash?: string;
            updatedAt: number;
          }) => void;
        },
      ) => {
        submittedScannerKey = input.scannerPublicKey;
        for (const phase of [
          "simulating",
          "awaiting-signature",
          "submitted",
          "pending",
          "confirmed",
        ] as const) {
          options.onStatus?.({
            phase,
            message: phase,
            hash: phase === "simulating" ? undefined : "f".repeat(64),
            updatedAt: Date.now(),
          });
        }
        return {
          result: contractEvent(
            proofEventId,
            ACCOUNT,
            input.scannerPublicKey,
          ),
          hash: "f".repeat(64),
        };
      },
    );

    render(
      <CommitPassProvider>
        <WalletHarness />
      </CommitPassProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("scanner-key")).not.toHaveTextContent(
        "initializing",
      ),
    );
    const demoScannerKey = screen.getByTestId("scanner-key").textContent;
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(screen.getByTestId("wallet-state")).toHaveTextContent(
        `${ACCOUNT}|live|ready|12.345`,
      ),
    );
    contractMocks.getEvent.mockClear();

    await user.click(screen.getByRole("button", { name: "Create proof" }));
    await waitFor(() =>
      expect(screen.getByTestId("proof-state")).toHaveTextContent(
        `confirmed|${proofEventId}|${proofEventId}`,
      ),
    );

    expect(createRefundableRsvpAdapter).toHaveBeenCalledWith(
      PUBLIC_TESTNET_CONFIG,
      expect.anything(),
    );
    expect(contractMocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizer: ACCOUNT,
        noShowBeneficiary: ACCOUNT,
        token: PUBLIC_TESTNET_CONFIG.xlmSacId,
        depositAmount: 10_000n,
        capacity: 1,
      }),
      expect.objectContaining({ timeoutInSeconds: 60 }),
    );
    const submitted = contractMocks.createEvent.mock.calls.at(-1)?.[0] as {
      startAt: number;
      checkInDeadline: number;
      endAt: number;
    };
    expect(submitted.startAt).toBeLessThan(submitted.checkInDeadline);
    expect(submitted.checkInDeadline).toBeLessThan(submitted.endAt);
    expect(submittedScannerKey).toMatch(/^[\da-f]{64}$/);
    expect(submittedScannerKey).not.toBe(demoScannerKey);

    const pollerOptions = pollerMocks.options as ContractEventPollerOptions;
    await act(async () => {
      await pollerOptions.onEvents([
        {
          id: "foreign-event",
          ledger: 500,
          txHash: "1".repeat(64),
          name: "event_created",
          eventId: "9".repeat(64),
          account: OTHER_ACCOUNT,
          payload: {},
          cursor: "foreign-cursor",
        },
      ]);
    });
    expect(contractMocks.getEvent).not.toHaveBeenCalled();

    contractMocks.getEvent.mockResolvedValue(
      contractEvent(proofEventId, ACCOUNT, submittedScannerKey),
    );
    await act(async () => {
      await pollerOptions.onEvents([
        {
          id: "own-event",
          ledger: 501,
          txHash: "2".repeat(64),
          name: "event_created",
          eventId: proofEventId,
          account: ACCOUNT,
          payload: {},
          cursor: "own-cursor",
        },
      ]);
    });
    expect(contractMocks.getEvent).toHaveBeenCalledWith(proofEventId);

    contractMocks.getEvent.mockClear();
    await user.click(screen.getByRole("button", { name: "Refresh proof" }));
    await waitFor(() =>
      expect(contractMocks.getEvent).toHaveBeenCalledWith(proofEventId),
    );

    const reserved = {
      status: "Reserved" as const,
      reservedAt: 1_899_999_900,
      settledAt: null,
    };
    const checkedIn = {
      status: "CheckedIn" as const,
      reservedAt: reserved.reservedAt,
      settledAt: 1_900_000_001,
    };
    contractMocks.reserve.mockImplementation(
      async (
        _eventId: string,
        _attendee: string,
        options: {
          onStatus?: (status: {
            phase: "awaiting-signature" | "confirmed";
            message: string;
            hash?: string;
            updatedAt: number;
          }) => void;
        },
      ) => {
        options.onStatus?.({
          phase: "awaiting-signature",
          message: "Approve the reservation.",
          updatedAt: Date.now(),
        });
        options.onStatus?.({
          phase: "confirmed",
          message: "Reservation confirmed.",
          hash: "3".repeat(64),
          updatedAt: Date.now(),
        });
        return { result: reserved, hash: "3".repeat(64) };
      },
    );
    contractMocks.getReservation
      .mockResolvedValueOnce(reserved)
      .mockResolvedValueOnce(checkedIn);
    contractMocks.voucherMessage.mockResolvedValue(
      new Uint8Array(32).fill(7),
    );
    contractMocks.claimCheckInRefund.mockImplementation(
      async (
        _input: unknown,
        options: {
          onStatus?: (status: {
            phase: "awaiting-signature" | "confirmed";
            message: string;
            hash?: string;
            updatedAt: number;
          }) => void;
        },
      ) => {
        options.onStatus?.({
          phase: "awaiting-signature",
          message: "Approve the refund.",
          updatedAt: Date.now(),
        });
        options.onStatus?.({
          phase: "confirmed",
          message: "Refund confirmed.",
          hash: "4".repeat(64),
          updatedAt: Date.now(),
        });
        return { result: checkedIn, hash: "4".repeat(64) };
      },
    );

    await user.click(screen.getByRole("button", { name: "Reserve proof" }));
    await waitFor(() =>
      expect(screen.getByTestId("lifecycle-state")).toHaveTextContent(
        "Reserved|scanner-ready|confirmed",
      ),
    );
    expect(contractMocks.reserve).toHaveBeenCalledWith(
      proofEventId,
      ACCOUNT,
      expect.objectContaining({ timeoutInSeconds: 60 }),
    );

    const dateNow = vi
      .spyOn(Date, "now")
      .mockReturnValue(1_900_000_001_000);
    await user.click(screen.getByRole("button", { name: "Claim proof" }));
    await waitFor(() =>
      expect(screen.getByTestId("lifecycle-state")).toHaveTextContent(
        "CheckedIn|scanner-off|confirmed",
      ),
    );
    expect(contractMocks.voucherMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: proofEventId,
        attendee: ACCOUNT,
        checkedInAt: 1_900_000_001,
      }),
    );
    expect(contractMocks.claimCheckInRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: proofEventId,
        attendee: ACCOUNT,
        signature: expect.stringMatching(/^[\da-f]{128}$/),
      }),
      expect.objectContaining({ timeoutInSeconds: 60 }),
    );
    dateNow.mockRestore();
  });
});
