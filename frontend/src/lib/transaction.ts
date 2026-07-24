import {
  CommitPassError,
  CONTRACT_ERROR_BY_CODE,
  isContractErrorName,
  type ContractErrorName,
} from "./domain";

export type TransactionPhase =
  | "idle"
  | "simulating"
  | "awaiting-signature"
  | "submitted"
  | "pending"
  | "confirmed"
  | "failed";

export type TransactionErrorCategory =
  | "contract"
  | "insufficient-balance"
  | "wallet-rejected"
  | "wallet"
  | "network"
  | "rpc"
  | "simulation"
  | "signature"
  | "configuration"
  | "unknown";

export interface NormalizedTransactionError {
  category: TransactionErrorCategory;
  message: string;
  retryable: boolean;
  contractError?: ContractErrorName;
  contractCode?: number;
  cause: unknown;
}

export interface TransactionStatus {
  phase: TransactionPhase;
  message: string;
  hash?: string;
  error?: NormalizedTransactionError;
  updatedAt: number;
}

export type TransactionStatusListener = (
  status: TransactionStatus,
) => void;

export class TransactionTracker {
  private status: TransactionStatus = {
    phase: "idle",
    message: "",
    updatedAt: Date.now(),
  };

  private readonly listeners = new Set<TransactionStatusListener>();

  getSnapshot = (): TransactionStatus => ({ ...this.status });

  subscribe = (listener: TransactionStatusListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(
    phase: Exclude<TransactionPhase, "failed">,
    input: { message?: string; hash?: string } = {},
  ): TransactionStatus {
    return this.set({
      phase,
      message: input.message ?? defaultStatusMessage(phase),
      hash: input.hash ?? this.status.hash,
      updatedAt: Date.now(),
    });
  }

  fail(error: unknown): TransactionStatus {
    const normalized = normalizeTransactionError(error);
    return this.set({
      phase: "failed",
      message: normalized.message,
      hash: this.status.hash,
      error: normalized,
      updatedAt: Date.now(),
    });
  }

  reset(): TransactionStatus {
    return this.set({
      phase: "idle",
      message: "",
      updatedAt: Date.now(),
    });
  }

  private set(status: TransactionStatus): TransactionStatus {
    this.status = status;
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
    return snapshot;
  }
}

export function normalizeTransactionError(
  cause: unknown,
): NormalizedTransactionError {
  if (cause instanceof CommitPassError) {
    if (isContractErrorName(cause.name)) {
      return {
        category: "contract",
        message: humanizeContractError(cause.name),
        retryable: isRetryableContractError(cause.name),
        contractError: cause.name,
        contractCode: cause.code,
        cause,
      };
    }
    const category =
      cause.name === "InsufficientBalance"
        ? "insufficient-balance"
        : cause.name === "InvalidVoucherSignature"
        ? "signature"
        : cause.name === "NetworkMismatch"
          ? "configuration"
          : "unknown";
    return {
      category,
      message: cause.message,
      retryable: cause.name === "InsufficientBalance",
      cause,
    };
  }

  const record = asRecord(cause);
  const message = extractMessage(cause);
  const explicitCode =
    typeof record?.code === "number" ? record.code : undefined;
  const contractCode =
    parseContractCode(message) ??
    (explicitCode && CONTRACT_ERROR_BY_CODE[explicitCode]
      ? explicitCode
      : undefined);
  if (contractCode) {
    const contractError = CONTRACT_ERROR_BY_CODE[contractCode];
    return {
      category: "contract",
      message: humanizeContractError(contractError),
      retryable: isRetryableContractError(contractError),
      contractError,
      contractCode,
      cause,
    };
  }

  const namedContractError = findContractErrorName(message);
  if (namedContractError) {
    return {
      category: "contract",
      message: humanizeContractError(namedContractError),
      retryable: isRetryableContractError(namedContractError),
      contractError: namedContractError,
      cause,
    };
  }

  const lower = message.toLowerCase();
  if (
    /insufficient|underfunded|op_underfunded|low reserve|not enough (?:xlm|balance|funds)/.test(
      lower,
    )
  ) {
    return {
      category: "insufficient-balance",
      message:
        "This Testnet account does not have enough available XLM for the network fee.",
      retryable: true,
      cause,
    };
  }
  if (
    /reject|declin|denied|cancelled by user|canceled by user|closed the modal/.test(
      lower,
    )
  ) {
    return {
      category: "wallet-rejected",
      message: "The wallet request was cancelled.",
      retryable: true,
      cause,
    };
  }
  if (/ed25519|signature|crypto error|invalid signature/.test(lower)) {
    return {
      category: "signature",
      message: "The scanner or wallet signature could not be verified.",
      retryable: false,
      cause,
    };
  }
  if (/simulation|simulate|restore preamble|archived state/.test(lower)) {
    return {
      category: "simulation",
      message,
      retryable: /archived|restore|timeout/.test(lower),
      cause,
    };
  }
  if (/rpc|json-rpc|soroban server|transaction still pending/.test(lower)) {
    return {
      category: "rpc",
      message,
      retryable: true,
      cause,
    };
  }
  if (/network|fetch|timeout|offline|failed to connect/.test(lower)) {
    return {
      category: "network",
      message,
      retryable: true,
      cause,
    };
  }
  if (/wallet|freighter|albedo|rabet|lobstr|signer/.test(lower)) {
    return {
      category: "wallet",
      message,
      retryable: true,
      cause,
    };
  }

  return {
    category: "unknown",
    message,
    retryable: false,
    cause,
  };
}

export function humanizeContractError(error: ContractErrorName): string {
  const messages: Record<ContractErrorName, string> = {
    EventAlreadyExists: "This event ID is already registered.",
    EventNotFound: "The event could not be found.",
    ReservationNotFound: "No reservation exists for this wallet.",
    InvalidSchedule: "The event schedule is invalid.",
    InvalidDeposit: "The deposit must be greater than zero.",
    InvalidCapacity: "Event capacity must be at least one.",
    Unauthorized: "This wallet is not authorized for that action.",
    EventNotActive: "The event is no longer active.",
    ReservationClosed: "Reservations are closed.",
    CapacityReached: "The event has reached capacity.",
    AlreadyReserved: "This wallet already has a reservation record.",
    InvalidReservationStatus: "This reservation has already been settled.",
    CheckInNotOpen: "Check-in has not opened yet.",
    CheckInClosed: "The check-in window has closed.",
    CancellationClosed: "Attendee cancellation is closed.",
    EventNotCancelled: "The event has not been cancelled.",
    EventNotEnded: "No-show settlement is not open yet.",
    EventCancellationClosed: "The event cancellation window has closed.",
    ArithmeticOverflow: "The contract accounting state is inconsistent.",
    InvalidScannerKey: "The scanner public key is invalid.",
    ScannerKeyFrozen: "The scanner key is frozen for this event.",
    VoucherMismatch: "The voucher does not match this event and wallet.",
    VoucherAlreadyUsed: "This one-time voucher has already been used.",
    InvalidVoucherTime: "The voucher timestamps are invalid.",
    VoucherExpired: "The check-in voucher has expired.",
    InvalidEventSalt: "The event salt must be a non-zero random value.",
    UnsupportedToken:
      "This contract deployment only accepts its pinned XLM token.",
  };
  return messages[error];
}

function parseContractCode(message: string): number | undefined {
  const match =
    /(?:error\s*\(\s*contract\s*,\s*#|contract(?:error)?[^#\d]*#?)(\d{1,3})/i.exec(
      message,
    ) ?? /RsvpError\s*\(\s*(\d{1,3})\s*\)/i.exec(message);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  return CONTRACT_ERROR_BY_CODE[value] ? value : undefined;
}

function findContractErrorName(
  message: string,
): ContractErrorName | undefined {
  return Object.values(CONTRACT_ERROR_BY_CODE).find((name) =>
    message.includes(name),
  );
}

function extractMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  const record = asRecord(error);
  if (typeof record?.message === "string" && record.message) {
    return record.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  return "The transaction could not be completed.";
}

function isRetryableContractError(error: ContractErrorName): boolean {
  return (
    error === "VoucherExpired" ||
    error === "InvalidVoucherTime" ||
    error === "EventNotFound" ||
    error === "ReservationNotFound"
  );
}

function defaultStatusMessage(
  phase: Exclude<TransactionPhase, "failed">,
): string {
  const messages: Record<Exclude<TransactionPhase, "failed">, string> = {
    idle: "",
    simulating: "Preparing transaction…",
    "awaiting-signature": "Confirm in your wallet…",
    submitted: "Transaction submitted.",
    pending: "Waiting for ledger confirmation…",
    confirmed: "Transaction confirmed.",
  };
  return messages[phase];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
