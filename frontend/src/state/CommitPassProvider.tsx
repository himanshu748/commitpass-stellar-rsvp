import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEMO_WALLET,
  INITIAL_ARRIVALS,
  type Arrival,
  type ReservationStatus,
  type TransactionState,
} from "../data/demo";
import {
  asHex32,
  sha256,
  utf8ToBytes,
} from "../lib/bytes";
import type { OnChainEvent } from "../lib/contract";
import { CommitPassError } from "../lib/domain";
import { EphemeralScannerSigner } from "../lib/scanner-crypto";
import {
  DEMO_ATTENDEE_ADDRESS,
  DEMO_CONTRACT_ID,
  PUBLIC_TESTNET_CONFIG,
  PUBLIC_TESTNET_VERIFICATION_EVENT_ID,
  SEED_EVENT_ID,
  STELLAR_TESTNET_PASSPHRASE,
} from "../lib/seed";
import {
  normalizeTransactionError,
  type TransactionStatus as CanonicalTransactionStatus,
} from "../lib/transaction";
import {
  createAttendeePass,
  createCheckInVoucher,
  decodeAttendeePass,
  intentVoucherMessageProvider,
  networkIdFromPassphrase,
  signCheckInVoucher,
  verifySignedCheckInVoucher,
} from "../lib/voucher";

type Toast = {
  id: number;
  tone: "success" | "error" | "info";
  title: string;
  message: string;
};

type WalletMode = "demo" | "live" | null;

type TestnetBalanceState =
  | { status: "idle" | "loading"; amount?: undefined; message?: undefined }
  | { status: "ready"; amount: string; message?: undefined }
  | { status: "error"; amount?: undefined; message: string };

type LiveTestnetPaymentState = {
  mode: "contract";
  status: "signing" | "submitting" | "confirmed" | "failed";
  hash?: string;
  message: string;
} | null;

type ContractActivityItem = {
  id: string;
  ledger: number;
  name: string;
  txHash: string;
  eventId?: string;
  account?: string;
};

type LiveContractProofState = {
  targetEventId: string;
  readStatus: "loading" | "ready" | "error";
  event: OnChainEvent | null;
  readError?: string;
  transaction: TransactionState;
  syncStatus: "connecting" | "live" | "error";
  syncMessage: string;
  events: ContractActivityItem[];
};

type LiveProofTarget = {
  eventId: string;
  expectedOrganizer?: string;
};

type CommitPassContextValue = {
  walletAddress: string | null;
  walletName: string | null;
  walletMode: WalletMode;
  testnetBalance: TestnetBalanceState;
  liveTestnetPayment: LiveTestnetPaymentState;
  liveContractProof: LiveContractProofState;
  reservationStatus: ReservationStatus;
  transaction: TransactionState;
  arrivals: Arrival[];
  toasts: Toast[];
  scannerPublicKey: string | null;
  connectDemoWallet: () => void;
  connectLiveWallet: () => Promise<boolean>;
  disconnectWallet: () => Promise<void>;
  refreshTestnetBalance: () => Promise<void>;
  sendTestnetPayment: (
    destination: string,
    amount: string,
  ) => Promise<boolean>;
  createLiveContractProof: () => Promise<boolean>;
  refreshLiveContractRead: () => Promise<void>;
  reserveSpot: () => Promise<void>;
  simulateVoucher: () => Promise<void>;
  claimRefund: () => Promise<void>;
  scanDemoAttendee: (encodedPass: string) => Promise<void>;
  rotateScannerKey: () => Promise<void>;
  dismissToast: (id: number) => void;
  pushToast: (
    tone: Toast["tone"],
    title: string,
    message: string,
  ) => void;
};

const CommitPassContext = createContext<CommitPassContextValue | null>(null);

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const demoHash = (kind: string) =>
  `demo_${kind}_${crypto.randomUUID().replaceAll("-", "")}`;

function transactionStateFromStatus(
  status: CanonicalTransactionStatus,
): TransactionState {
  if (status.phase === "idle") {
    return null;
  }
  return {
    kind: "create-event",
    mode: "contract",
    status: status.phase,
    hash: status.hash,
    message: status.message,
  };
}

export function CommitPassProvider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [walletMode, setWalletMode] = useState<WalletMode>(null);
  const [testnetBalance, setTestnetBalance] =
    useState<TestnetBalanceState>({ status: "idle" });
  const [liveTestnetPayment, setLiveTestnetPayment] =
    useState<LiveTestnetPaymentState>(null);
  const [liveContractProof, setLiveContractProof] =
    useState<LiveContractProofState>({
      targetEventId: PUBLIC_TESTNET_VERIFICATION_EVENT_ID,
      readStatus: "loading",
      event: null,
      transaction: null,
      syncStatus: "connecting",
      syncMessage: "Connecting to Stellar RPC event history…",
      events: [],
    });
  const [reservationStatus, setReservationStatus] =
    useState<ReservationStatus>("unreserved");
  const [transaction, setTransaction] = useState<TransactionState>(null);
  const [arrivals, setArrivals] = useState(INITIAL_ARRIVALS);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [scannerPublicKey, setScannerPublicKey] = useState<string | null>(null);
  const scannerSignerRef = useRef<EphemeralScannerSigner | null>(null);
  const usedScannerNoncesRef = useRef(new Set<string>());
  const balanceRequestIdRef = useRef(0);
  const walletSessionIdRef = useRef(0);
  const liveProofTargetRef = useRef<LiveProofTarget>({
    eventId: PUBLIC_TESTNET_VERIFICATION_EVENT_ID,
  });

  const refreshLiveContractRead = useCallback(async () => {
    const target = liveProofTargetRef.current;
    setLiveContractProof((current) => ({
      ...current,
      targetEventId: target.eventId,
      readStatus: "loading",
      readError: undefined,
    }));
    try {
      const { createRefundableRsvpAdapter } = await import("../lib/contract");
      const adapter = createRefundableRsvpAdapter(PUBLIC_TESTNET_CONFIG);
      const event = await adapter.getEvent(target.eventId);
      if (liveProofTargetRef.current.eventId !== target.eventId) return;
      if (
        target.expectedOrganizer &&
        event.organizer !== target.expectedOrganizer
      ) {
        throw new Error(
          "The contract event organizer does not match the connected proof wallet.",
        );
      }
      setLiveContractProof((current) => ({
        ...current,
        targetEventId: target.eventId,
        readStatus: "ready",
        event,
        readError: undefined,
      }));
    } catch (error) {
      if (liveProofTargetRef.current.eventId !== target.eventId) return;
      const normalized = normalizeTransactionError(error);
      setLiveContractProof((current) => ({
        ...current,
        readStatus: "error",
        readError: normalized.message,
      }));
    }
  }, []);

  useEffect(() => {
    void refreshLiveContractRead();
  }, [refreshLiveContractRead]);

  useEffect(() => {
    const controller = new AbortController();
    let stop: (() => void) | undefined;

    setLiveContractProof((current) => ({
      ...current,
      syncStatus: "connecting",
      syncMessage: "Connecting to Stellar RPC event history…",
    }));

    void import("../lib/contract-events")
      .then(({ createContractEventPoller }) => {
        if (controller.signal.aborted) return;
        const poller = createContractEventPoller({
          rpcUrl: PUBLIC_TESTNET_CONFIG.rpcUrl,
          contractId: PUBLIC_TESTNET_CONFIG.contractId,
          lookbackLedgers: 5_000,
          intervalMs: 5_000,
          signal: controller.signal,
          onEvents: async (events) => {
            if (controller.signal.aborted) return;
            setLiveContractProof((current) => {
              const byId = new Map(
                [...events, ...current.events].map((event) => [
                  event.id,
                  {
                    id: event.id,
                    ledger: event.ledger,
                    name: event.name,
                    txHash: event.txHash,
                    eventId: event.eventId,
                    account: event.account,
                  },
                ]),
              );
              return {
                ...current,
                syncStatus: "live",
                syncMessage: `Live cursor · ${byId.size} recent application event${byId.size === 1 ? "" : "s"} observed.`,
                events: [...byId.values()]
                  .sort((left, right) => right.ledger - left.ledger)
                  .slice(0, 20),
              };
            });

            const target = liveProofTargetRef.current;
            const created = events.find(
              (event) =>
                event.name === "event_created" &&
                event.eventId === target.eventId &&
                (!target.expectedOrganizer ||
                  event.account === target.expectedOrganizer),
            );
            if (!created) return;
            await refreshLiveContractRead();
          },
          onPoll: () => {
            if (controller.signal.aborted) return;
            setLiveContractProof((current) => ({
              ...current,
              syncStatus: "live",
              syncMessage: `Live cursor · ${current.events.length} recent application event${current.events.length === 1 ? "" : "s"} observed.`,
            }));
          },
          onError: (error, retry) => {
            if (controller.signal.aborted) return;
            const normalized = normalizeTransactionError(error);
            setLiveContractProof((current) => ({
              ...current,
              syncStatus: "error",
              syncMessage: `${normalized.message} Retrying (attempt ${retry.attempt}).`,
            }));
          },
        });
        stop = () => poller.stop();
        poller.start();
        setLiveContractProof((current) => ({
          ...current,
          syncStatus: "live",
          syncMessage: "Live cursor · polling contract events every 5 seconds.",
        }));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const normalized = normalizeTransactionError(error);
        setLiveContractProof((current) => ({
          ...current,
          syncStatus: "error",
          syncMessage: normalized.message,
        }));
      });

    return () => {
      controller.abort();
      stop?.();
    };
  }, [refreshLiveContractRead]);

  useEffect(() => {
    let disposed = false;
    void EphemeralScannerSigner.generate().then((signer) => {
      if (disposed) {
        signer.destroy();
        return;
      }
      scannerSignerRef.current = signer;
      setScannerPublicKey(signer.publicKeyHex);
    });
    return () => {
      disposed = true;
      scannerSignerRef.current?.destroy();
      scannerSignerRef.current = null;
    };
  }, []);

  const pushToast = useCallback(
    (tone: Toast["tone"], title: string, message: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((current) => [...current, { id, tone, title, message }]);
      window.setTimeout(
        () =>
          setToasts((current) => current.filter((toast) => toast.id !== id)),
        6000,
      );
    },
    [],
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const loadTestnetBalanceForAddress = useCallback(
    async (address: string, announceFailure = false) => {
      const requestId = ++balanceRequestIdRef.current;
      setTestnetBalance({ status: "loading" });
      try {
        const { loadTestnetXlmBalance } = await import(
          "../lib/stellar-account"
        );
        const amount = await loadTestnetXlmBalance(address);
        if (requestId !== balanceRequestIdRef.current) return;
        setTestnetBalance({ status: "ready", amount });
      } catch (error) {
        if (requestId !== balanceRequestIdRef.current) return;
        const normalized = normalizeTransactionError(error);
        setTestnetBalance({
          status: "error",
          message: normalized.message,
        });
        if (announceFailure) {
          pushToast(
            "error",
            "Balance refresh failed",
            normalized.message,
          );
        }
      }
    },
    [pushToast],
  );

  const connectDemoWallet = useCallback(() => {
    walletSessionIdRef.current += 1;
    balanceRequestIdRef.current += 1;
    void import("../lib/wallet")
      .then((wallet) => wallet.disconnectWallet())
      .catch(() => {
        // The demo identity remains usable even if an extension session cannot
        // be cleaned up; the live connection generation was already invalidated.
      });
    setWalletAddress(DEMO_WALLET);
    setWalletName("Demo wallet");
    setWalletMode("demo");
    setTestnetBalance({ status: "idle" });
    setLiveTestnetPayment(null);
    pushToast(
      "success",
      "Demo wallet ready",
      "You can complete the full flow without spending real funds.",
    );
  }, [pushToast]);

  const connectLiveWallet = useCallback(async () => {
    const sessionId = ++walletSessionIdRef.current;
    try {
      const { connectWallet } = await import("../lib/wallet");
      const connection = await connectWallet();
      if (sessionId !== walletSessionIdRef.current) return false;
      setWalletAddress(connection.address);
      setWalletName(connection.walletName);
      setWalletMode("live");
      setLiveTestnetPayment(null);
      await loadTestnetBalanceForAddress(connection.address);
      if (sessionId !== walletSessionIdRef.current) return false;
      pushToast(
        "success",
        "Testnet wallet connected",
        `${connection.walletName} is connected through StellarWalletsKit. The RSVP demo remains no-funds; live contract and payment proofs require separate wallet approval.`,
      );
      return true;
    } catch (error) {
      if (sessionId !== walletSessionIdRef.current) return false;
      pushToast(
        "error",
        "Wallet connection failed",
        error instanceof Error ? error.message : "No compatible wallet responded.",
      );
      return false;
    }
  }, [loadTestnetBalanceForAddress, pushToast]);

  const disconnectWallet = useCallback(async () => {
    walletSessionIdRef.current += 1;
    balanceRequestIdRef.current += 1;
    setWalletAddress(null);
    setWalletName(null);
    setWalletMode(null);
    setTestnetBalance({ status: "idle" });
    setLiveTestnetPayment(null);

    let disconnectError: unknown;
    try {
      const wallet = await import("../lib/wallet");
      await wallet.disconnectWallet();
    } catch (error) {
      disconnectError = error;
    }
    if (disconnectError) {
      pushToast(
        "error",
        "Wallet session cleanup failed",
        normalizeTransactionError(disconnectError).message,
      );
      return;
    }
    pushToast("info", "Wallet disconnected", "No signing access is retained.");
  }, [pushToast]);

  const refreshTestnetBalance = useCallback(async () => {
    if (walletMode !== "live" || !walletAddress) {
      pushToast(
        "error",
        "Connect a Testnet wallet",
        "A live wallet connection is required to load a Horizon balance.",
      );
      return;
    }
    await loadTestnetBalanceForAddress(walletAddress, true);
  }, [
    loadTestnetBalanceForAddress,
    pushToast,
    walletAddress,
    walletMode,
  ]);

  const sendTestnetPayment = useCallback(
    async (destination: string, amount: string) => {
      if (walletMode !== "live" || !walletAddress) {
        pushToast(
          "error",
          "Connect a Testnet wallet",
          "The no-funds demo wallet cannot sign a live Testnet payment.",
        );
        return false;
      }
      const source = walletAddress;
      const sessionId = walletSessionIdRef.current;
      setLiveTestnetPayment({
        mode: "contract",
        status: "signing",
        message: "Preparing the Testnet payment for wallet review.",
      });
      try {
        const [{ submitTestnetXlmPayment }, wallet] = await Promise.all([
          import("../lib/stellar-account"),
          import("../lib/wallet"),
        ]);
        const result = await submitTestnetXlmPayment({
          source,
          destination,
          amount,
          signTransaction: wallet.signConnectedTestnetTransaction,
          onPhase: (phase) => {
            if (sessionId !== walletSessionIdRef.current) return;
            setLiveTestnetPayment({
              mode: "contract",
              status: phase,
              message:
                phase === "signing"
                  ? "Confirm the destination and amount in your wallet. Nothing is sent until you approve."
                  : "Your signed payment is being submitted to Stellar Testnet.",
            });
          },
        });
        if (sessionId !== walletSessionIdRef.current) return false;
        setLiveTestnetPayment({
          mode: "contract",
          status: "confirmed",
          hash: result.hash,
          message: `Confirmed in Testnet ledger ${result.ledger}.`,
        });
        pushToast(
          "success",
          "Testnet payment confirmed",
          "The live proof transaction is now visible on the public Testnet explorer.",
        );
        await loadTestnetBalanceForAddress(source);
        return true;
      } catch (error) {
        if (sessionId !== walletSessionIdRef.current) return false;
        const normalized = normalizeTransactionError(error);
        setLiveTestnetPayment({
          mode: "contract",
          status: "failed",
          message: normalized.message,
        });
        pushToast(
          "error",
          "Testnet payment not sent",
          normalized.message,
        );
        return false;
      }
    },
    [
      loadTestnetBalanceForAddress,
      pushToast,
      walletAddress,
      walletMode,
    ],
  );

  const createLiveContractProof = useCallback(async () => {
    if (walletMode !== "live" || !walletAddress) {
      pushToast(
        "error",
        "Connect a Testnet wallet",
        "A live Stellar wallet is required for this contract write.",
      );
      return false;
    }
    if (
      testnetBalance.status === "ready" &&
      Number.parseFloat(testnetBalance.amount) <= 0
    ) {
      const error = new CommitPassError(
        "InsufficientBalance",
        "This Testnet account needs XLM for the network fee.",
      );
      const normalized = normalizeTransactionError(error);
      setLiveContractProof((current) => ({
        ...current,
        transaction: {
          kind: "create-event",
          mode: "contract",
          status: "failed",
          message: normalized.message,
        },
      }));
      pushToast("error", "Insufficient Testnet balance", normalized.message);
      return false;
    }

    const sessionId = walletSessionIdRef.current;
    let proofScannerSigner: EphemeralScannerSigner | null = null;
    try {
      const [{ createRefundableRsvpAdapter, createSecureEventSalt }, wallet] =
        await Promise.all([
          import("../lib/contract"),
          import("../lib/wallet"),
        ]);
      proofScannerSigner = await EphemeralScannerSigner.generate();
      const eventSalt = createSecureEventSalt();
      const now = Math.floor(Date.now() / 1_000);
      const metadataHash = asHex32(
        await sha256(
          utf8ToBytes(
            [
              "commitpass-yellow-proof-v1",
              walletAddress,
              eventSalt,
              String(now),
            ].join(":"),
          ),
        ),
      );
      const adapter = createRefundableRsvpAdapter(
        PUBLIC_TESTNET_CONFIG,
        wallet.getConnectedTestnetWalletAdapter(),
      );
      const receipt = await adapter.createEvent(
        {
          eventSalt,
          organizer: walletAddress,
          metadataHash,
          startAt: now + 3_600,
          checkInDeadline: now + 7_200,
          endAt: now + 10_800,
          token: PUBLIC_TESTNET_CONFIG.xlmSacId,
          depositAmount: 1n,
          capacity: 1,
          noShowBeneficiary: walletAddress,
          cancellationPolicy: "FullRefund",
          scannerPublicKey: proofScannerSigner.publicKeyHex,
        },
        {
          timeoutInSeconds: 60,
          onStatus: (status) => {
            if (sessionId !== walletSessionIdRef.current) return;
            setLiveContractProof((current) => ({
              ...current,
              transaction: transactionStateFromStatus(status),
            }));
          },
        },
      );
      if (sessionId !== walletSessionIdRef.current) return false;
      if (receipt.result.organizer !== walletAddress) {
        throw new Error(
          "The confirmed proof event belongs to a different organizer.",
        );
      }
      liveProofTargetRef.current = {
        eventId: receipt.result.id,
        expectedOrganizer: walletAddress,
      };
      setLiveContractProof((current) => ({
        ...current,
        targetEventId: receipt.result.id,
        readStatus: "ready",
        event: receipt.result,
        transaction: {
          kind: "create-event",
          mode: "contract",
          status: "confirmed",
          hash: receipt.hash,
          message:
            "Proof event confirmed. Event polling will reconcile the emitted contract event.",
        },
      }));
      pushToast(
        "success",
        "Contract proof confirmed",
        "The new event record is public on Stellar Testnet; no tokens were transferred.",
      );
      await loadTestnetBalanceForAddress(walletAddress);
      return true;
    } catch (error) {
      if (sessionId !== walletSessionIdRef.current) return false;
      const normalized = normalizeTransactionError(error);
      setLiveContractProof((current) => ({
        ...current,
        transaction: {
          kind: "create-event",
          mode: "contract",
          status: "failed",
          message: normalized.message,
        },
      }));
      pushToast(
        "error",
        normalized.category === "wallet-rejected"
          ? "Wallet request cancelled"
          : normalized.category === "insufficient-balance"
            ? "Insufficient Testnet balance"
            : "Contract proof failed",
        normalized.message,
      );
      return false;
    } finally {
      proofScannerSigner?.destroy();
    }
  }, [
    loadTestnetBalanceForAddress,
    pushToast,
    testnetBalance,
    walletAddress,
    walletMode,
  ]);

  const reserveSpot = useCallback(async () => {
    if (!walletAddress) {
      throw new Error("Connect a wallet before reserving.");
    }
    if (reservationStatus !== "unreserved") return;

    setTransaction({
      kind: "reserve",
      mode: "demo",
      status: "signing",
      message: "Simulating the 2 XLM authorization in the judge sandbox.",
    });
    await delay(450);
    setTransaction({
      kind: "reserve",
      mode: "demo",
      status: "submitting",
      message: "Advancing the local demo through the contract state.",
    });
    await delay(700);
    const hash = demoHash("reserve");
    setReservationStatus("reserved");
    setTransaction({
      kind: "reserve",
      mode: "demo",
      status: "confirmed",
      hash,
      message: "Demo complete: your place is reserved and 2 XLM is shown as locked.",
    });
    pushToast(
      "success",
      "Your spot is reserved",
      "Bring your one-time pass. Check in to receive the full refund.",
    );
  }, [pushToast, reservationStatus, walletAddress]);

  const simulateVoucher = useCallback(async () => {
    if (reservationStatus !== "reserved") {
      throw new Error("Reserve a place before requesting a check-in voucher.");
    }
    const signer = scannerSignerRef.current;
    if (!signer) {
      throw new Error("The ephemeral demo scanner key is still initializing.");
    }
    const now = Math.floor(Date.now() / 1_000);
    const pass = createAttendeePass({
      eventId: SEED_EVENT_ID,
      attendee: walletAddress ?? DEMO_ATTENDEE_ADDRESS,
      issuedAt: now,
    });
    const voucher = createCheckInVoucher({
      pass,
      checkedInAt: now,
      checkInDeadline: now + 15 * 60,
    });
    const context = {
      networkId: await networkIdFromPassphrase(STELLAR_TESTNET_PASSPHRASE),
      contractId: DEMO_CONTRACT_ID,
    };
    const signedVoucher = await signCheckInVoucher({
      voucher,
      context,
      signer,
      messageProvider: intentVoucherMessageProvider(context),
      encoding: "commitpass-intent-v1",
    });
    const verification = await verifySignedCheckInVoucher({
      signedVoucher,
      expectedContext: context,
      expectedEventId: SEED_EVENT_ID,
      expectedAttendee: pass.attendee,
      scannerPublicKey: signer.publicKey,
      eventStartAt: now,
      checkInDeadline: now + 15 * 60,
      now,
      messageProvider: intentVoucherMessageProvider(context),
    });
    if (!verification.ok) {
      throw new Error(`Local voucher verification failed: ${verification.reason}.`);
    }
    await delay(250);
    setReservationStatus("voucher-ready");
    pushToast(
      "success",
      "Demo check-in verified",
      "An ephemeral Ed25519 scanner key signed and verified a wallet-bound, 60-second demo voucher.",
    );
  }, [pushToast, reservationStatus, walletAddress]);

  const claimRefund = useCallback(async () => {
    if (reservationStatus !== "voucher-ready") {
      throw new Error("A valid organizer voucher is required.");
    }
    setTransaction({
      kind: "refund",
      mode: "demo",
      status: "signing",
      message: "Simulating attendee authorization in the judge sandbox.",
    });
    await delay(400);
    setTransaction({
      kind: "refund",
      mode: "demo",
      status: "submitting",
      message: "Verifying the local voucher and advancing the demo state.",
    });
    await delay(700);
    const hash = demoHash("refund");
    setReservationStatus("refunded");
    setTransaction({
      kind: "refund",
      mode: "demo",
      status: "confirmed",
      hash,
      message: "Demo complete: 2 XLM is shown as returned to your wallet.",
    });
    pushToast(
      "success",
      "2 XLM returned",
      "Your attendance was verified and the commitment is complete.",
    );
  }, [pushToast, reservationStatus]);

  const scanDemoAttendee = useCallback(async (encodedPass: string) => {
    const signer = scannerSignerRef.current;
    if (!signer) {
      throw new Error("The ephemeral demo scanner key is still initializing.");
    }
    const pass = decodeAttendeePass(encodedPass.trim());
    if (pass.eventId !== SEED_EVENT_ID) {
      throw new Error("This pass belongs to a different event.");
    }
    if (pass.attendee !== DEMO_ATTENDEE_ADDRESS) {
      throw new Error("This wallet has no seeded reservation in the scanner demo.");
    }
    const now = Math.floor(Date.now() / 1_000);
    if (pass.issuedAt > now + 300 || now - pass.issuedAt > 86_400) {
      throw new Error("This attendee pass is outside the demo validity window.");
    }
    if (usedScannerNoncesRef.current.has(pass.nonce)) {
      throw new Error("This one-time attendee pass has already been scanned.");
    }
    // Reserve synchronously before any awaited work so concurrent scans cannot
    // both pass the replay check. The on-chain contract independently enforces
    // the same event-scoped nonce invariant for real claims.
    usedScannerNoncesRef.current.add(pass.nonce);
    try {
      const voucher = createCheckInVoucher({
        pass,
        checkedInAt: now,
        checkInDeadline: now + 15 * 60,
      });
      const context = {
        networkId: await networkIdFromPassphrase(STELLAR_TESTNET_PASSPHRASE),
        contractId: DEMO_CONTRACT_ID,
      };
      const signedVoucher = await signCheckInVoucher({
        voucher,
        context,
        signer,
        messageProvider: intentVoucherMessageProvider(context),
        encoding: "commitpass-intent-v1",
      });
      const verification = await verifySignedCheckInVoucher({
        signedVoucher,
        expectedContext: context,
        expectedEventId: SEED_EVENT_ID,
        expectedAttendee: DEMO_ATTENDEE_ADDRESS,
        scannerPublicKey: signer.publicKey,
        eventStartAt: now,
        checkInDeadline: now + 15 * 60,
        now,
        messageProvider: intentVoucherMessageProvider(context),
      });
      if (!verification.ok) {
        throw new Error(
          `Local voucher verification failed: ${verification.reason}.`,
        );
      }
    } catch (error) {
      usedScannerNoncesRef.current.delete(pass.nonce);
      throw error;
    }
    setArrivals((current) =>
      current.map((arrival) =>
        arrival.name === "Riya"
          ? { ...arrival, status: "voucher-sent" }
          : arrival,
      ),
    );
    pushToast(
      "success",
      "Demo voucher signed for Riya",
      "The scanned pass was schema-, event-, wallet-, freshness-, and replay-checked before local Ed25519 signing.",
    );
  }, [pushToast]);

  const rotateScannerKey = useCallback(async () => {
    const replacement = await EphemeralScannerSigner.generate();
    const previous = scannerSignerRef.current;
    scannerSignerRef.current = replacement;
    setScannerPublicKey(replacement.publicKeyHex);
    previous?.destroy();
    pushToast(
      "success",
      "Demo scanner key rotated",
      "A new ephemeral Ed25519 keypair is active in memory.",
    );
  }, [pushToast]);

  const value = useMemo(
    () => ({
      walletAddress,
      walletName,
      walletMode,
      testnetBalance,
      liveTestnetPayment,
      liveContractProof,
      reservationStatus,
      transaction,
      arrivals,
      toasts,
      scannerPublicKey,
      connectDemoWallet,
      connectLiveWallet,
      disconnectWallet,
      refreshTestnetBalance,
      sendTestnetPayment,
      createLiveContractProof,
      refreshLiveContractRead,
      reserveSpot,
      simulateVoucher,
      claimRefund,
      scanDemoAttendee,
      rotateScannerKey,
      dismissToast,
      pushToast,
    }),
    [
      arrivals,
      claimRefund,
      connectDemoWallet,
      connectLiveWallet,
      createLiveContractProof,
      disconnectWallet,
      dismissToast,
      liveTestnetPayment,
      liveContractProof,
      pushToast,
      refreshTestnetBalance,
      refreshLiveContractRead,
      reservationStatus,
      rotateScannerKey,
      reserveSpot,
      scanDemoAttendee,
      scannerPublicKey,
      sendTestnetPayment,
      simulateVoucher,
      testnetBalance,
      toasts,
      transaction,
      walletAddress,
      walletMode,
      walletName,
    ],
  );

  return (
    <CommitPassContext.Provider value={value}>
      {children}
    </CommitPassContext.Provider>
  );
}

// The hook intentionally shares this module with its provider so consumers
// cannot import a mismatched context instance.
// eslint-disable-next-line react-refresh/only-export-components
export function useCommitPass() {
  const context = useContext(CommitPassContext);
  if (!context) {
    throw new Error("useCommitPass must be used inside CommitPassProvider");
  }
  return context;
}
