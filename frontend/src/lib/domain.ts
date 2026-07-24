export const CANCELLATION_POLICIES = [
  "FullRefund",
  "ForfeitDeposit",
] as const;

export type CancellationPolicy = (typeof CANCELLATION_POLICIES)[number];

export const EVENT_STATUSES = ["Active", "Cancelled"] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export const RESERVATION_STATUSES = [
  "Reserved",
  "CheckedIn",
  "AttendeeRefunded",
  "AttendeeForfeited",
  "EventRefunded",
  "NoShow",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export type Hex32 = string;
export type Hex64 = string;
export type StellarAddress = string;
export type UnixSeconds = number;

export interface EventMetadata {
  title: string;
  summary: string;
  organizerName: string;
  venueName: string;
  venueCity: string;
  timezone: string;
  imagePath?: string;
}

/**
 * Frontend representation of `RsvpEvent` plus its caller-supplied event ID and
 * off-chain metadata. Amounts remain bigint so token base units never pass
 * through floating point.
 */
export interface CommitPassEvent {
  id: Hex32;
  eventSalt: Hex32;
  organizer: StellarAddress;
  metadataHash: Hex32;
  startAt: UnixSeconds;
  checkInDeadline: UnixSeconds;
  endAt: UnixSeconds;
  token: StellarAddress;
  tokenCode: "XLM";
  tokenDecimals: 7;
  depositAmount: bigint;
  capacity: number;
  seatsReserved: number;
  outstandingDeposits: number;
  noShowBeneficiary: StellarAddress;
  cancellationPolicy: CancellationPolicy;
  scannerPublicKey: Hex32;
  status: EventStatus;
  createdAt: UnixSeconds;
  metadata: EventMetadata;
}

export interface Reservation {
  eventId: Hex32;
  attendee: StellarAddress;
  status: ReservationStatus;
  reservedAt: UnixSeconds;
  settledAt: UnixSeconds | null;
}

export interface CheckInVoucher {
  eventId: Hex32;
  attendee: StellarAddress;
  nonce: Hex32;
  checkedInAt: UnixSeconds;
  expiresAt: UnixSeconds;
}

export interface AttendeePass {
  kind: "commitpass-attendee-pass";
  version: 1;
  eventId: Hex32;
  attendee: StellarAddress;
  nonce: Hex32;
  issuedAt: UnixSeconds;
}

export type EventPhase =
  | "upcoming"
  | "check-in"
  | "settlement-gap"
  | "ended"
  | "cancelled";

export function deriveEventPhase(
  event: Pick<
    CommitPassEvent,
    "status" | "startAt" | "checkInDeadline" | "endAt"
  >,
  now: UnixSeconds,
): EventPhase {
  if (event.status === "Cancelled") {
    return "cancelled";
  }
  if (now < event.startAt) {
    return "upcoming";
  }
  if (now <= event.checkInDeadline) {
    return "check-in";
  }
  if (now < event.endAt) {
    return "settlement-gap";
  }
  return "ended";
}

export function reservationKey(
  eventId: Hex32,
  attendee: StellarAddress,
): string {
  return `${eventId}:${attendee}`;
}

export function voucherNonceKey(eventId: Hex32, nonce: Hex32): string {
  return `${eventId}:${nonce}`;
}

export const CONTRACT_ERROR_NAMES = [
  "EventAlreadyExists",
  "EventNotFound",
  "ReservationNotFound",
  "InvalidSchedule",
  "InvalidDeposit",
  "InvalidCapacity",
  "Unauthorized",
  "EventNotActive",
  "ReservationClosed",
  "CapacityReached",
  "AlreadyReserved",
  "InvalidReservationStatus",
  "CheckInNotOpen",
  "CheckInClosed",
  "CancellationClosed",
  "EventNotCancelled",
  "EventNotEnded",
  "EventCancellationClosed",
  "ArithmeticOverflow",
  "InvalidScannerKey",
  "ScannerKeyFrozen",
  "VoucherMismatch",
  "VoucherAlreadyUsed",
  "InvalidVoucherTime",
  "VoucherExpired",
  "InvalidEventSalt",
  "UnsupportedToken",
] as const;

export type ContractErrorName = (typeof CONTRACT_ERROR_NAMES)[number];

export const CONTRACT_ERROR_BY_CODE: Readonly<Record<number, ContractErrorName>> =
  {
    1: "EventAlreadyExists",
    2: "EventNotFound",
    3: "ReservationNotFound",
    4: "InvalidSchedule",
    5: "InvalidDeposit",
    6: "InvalidCapacity",
    7: "Unauthorized",
    8: "EventNotActive",
    9: "ReservationClosed",
    10: "CapacityReached",
    11: "AlreadyReserved",
    12: "InvalidReservationStatus",
    13: "CheckInNotOpen",
    14: "CheckInClosed",
    15: "CancellationClosed",
    16: "EventNotCancelled",
    17: "EventNotEnded",
    18: "EventCancellationClosed",
    19: "ArithmeticOverflow",
    20: "InvalidScannerKey",
    21: "ScannerKeyFrozen",
    22: "VoucherMismatch",
    23: "VoucherAlreadyUsed",
    24: "InvalidVoucherTime",
    25: "VoucherExpired",
    26: "InvalidEventSalt",
    27: "UnsupportedToken",
  };

export const CONTRACT_ERROR_CODE: Readonly<Record<ContractErrorName, number>> =
  Object.fromEntries(
    Object.entries(CONTRACT_ERROR_BY_CODE).map(([code, name]) => [
      name,
      Number(code),
    ]),
  ) as Record<ContractErrorName, number>;

export type LocalDomainErrorName =
  | "InsufficientBalance"
  | "InvalidAttendeePass"
  | "InvalidVoucher"
  | "InvalidVoucherSignature"
  | "NetworkMismatch"
  | "RealContractDisabled"
  | "StorageCorrupted";

export type DomainErrorName = ContractErrorName | LocalDomainErrorName;

export class CommitPassError extends Error {
  readonly code?: number;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    readonly name: DomainErrorName,
    message: string,
    options: {
      code?: number;
      cause?: unknown;
      details?: Readonly<Record<string, unknown>>;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.code = options.code;
    this.details = options.details;
  }
}

export function contractError(
  name: ContractErrorName,
  message: string = name,
  details?: Readonly<Record<string, unknown>>,
): CommitPassError {
  return new CommitPassError(name, message, {
    code: CONTRACT_ERROR_CODE[name],
    details,
  });
}

export function isContractErrorName(value: unknown): value is ContractErrorName {
  return (
    typeof value === "string" &&
    (CONTRACT_ERROR_NAMES as readonly string[]).includes(value)
  );
}

export function isTerminalReservationStatus(
  status: ReservationStatus,
): boolean {
  return status !== "Reserved";
}

export function formatTokenAmount(
  amount: bigint,
  decimals = 7,
  maximumFractionDigits = decimals,
): string {
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = (absolute % scale)
    .toString()
    .padStart(decimals, "0")
    .slice(0, maximumFractionDigits)
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${
    fraction ? `.${fraction}` : ""
  }`;
}

export function isUnixSeconds(value: unknown): value is UnixSeconds {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

export function isStellarAddress(value: unknown): value is StellarAddress {
  if (typeof value !== "string") return false;
  if (value.startsWith("G")) {
    return StrKey.isValidEd25519PublicKey(value);
  }
  if (value.startsWith("C")) {
    return StrKey.isValidContract(value);
  }
  if (value.startsWith("M")) {
    return StrKey.isValidMed25519PublicKey(value);
  }
  return false;
}

export function isHex32(value: unknown): value is Hex32 {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

export function isHex64(value: unknown): value is Hex64 {
  return typeof value === "string" && /^[0-9a-f]{128}$/i.test(value);
}
import { StrKey } from "@stellar/stellar-sdk";
