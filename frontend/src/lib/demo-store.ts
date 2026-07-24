import { hexToBytes } from "./bytes";
import {
  CommitPassError,
  contractError,
  isHex32,
  isStellarAddress,
  isUnixSeconds,
  reservationKey,
  voucherNonceKey,
  type CheckInVoucher,
  type CommitPassEvent,
  type Hex32,
  type Reservation,
  type StellarAddress,
  type UnixSeconds,
} from "./domain";
import {
  jsonStorageCodec,
  type NamespacedStorage,
  type StorageCodec,
} from "./storage";
import {
  verifySignedCheckInVoucher,
  isSignedCheckInVoucher,
  type SignedCheckInVoucher,
  type VoucherMessageProvider,
  type VoucherSigningContext,
} from "./voucher";

export const DEMO_STATE_SCHEMA_VERSION = 1;
export const DEMO_STARTING_BALANCE = 1_000_000_000n;

export type DemoAction =
  | "reserve"
  | "check-in-refund"
  | "cancel-reservation"
  | "cancel-event"
  | "event-refund"
  | "no-show"
  | "update-scanner-key";

export interface DemoReceipt {
  id: string;
  action: DemoAction;
  eventId: Hex32;
  attendee: StellarAddress | null;
  ledgerTimestamp: UnixSeconds;
  amount: bigint;
  beneficiary: StellarAddress | null;
  status: "confirmed";
}

export interface DemoState {
  schemaVersion: 1;
  events: Record<Hex32, CommitPassEvent>;
  reservations: Record<string, Reservation>;
  usedVoucherNonces: Record<string, true>;
  balances: Record<StellarAddress, bigint>;
  escrowByEvent: Record<Hex32, bigint>;
  receipts: DemoReceipt[];
  transactionSequence: number;
}

export interface DemoStoreOptions {
  initialState: DemoState;
  now?: () => UnixSeconds;
  storage?: NamespacedStorage;
  storageKey?: string;
  voucherContext: VoucherSigningContext;
  voucherMessageProvider: VoucherMessageProvider;
}

export interface CheckInRefundInput {
  eventId: Hex32;
  attendee: StellarAddress;
  signedVoucher: SignedCheckInVoucher;
}

const DEMO_STATE_CODEC: StorageCodec<DemoState> =
  jsonStorageCodec(isDemoState);

export class DemoCommitPassStore {
  private state: DemoState;
  private readonly listeners = new Set<() => void>();
  private readonly now: () => UnixSeconds;
  private readonly storage?: NamespacedStorage;
  private readonly storageKey: string;
  private readonly voucherContext: VoucherSigningContext;
  private readonly voucherMessageProvider: VoucherMessageProvider;

  readonly storageIssue: Error | null;

  constructor(options: DemoStoreOptions) {
    if (!isDemoState(options.initialState)) {
      throw new TypeError("Initial demo state is invalid.");
    }
    this.now = options.now ?? (() => Math.floor(Date.now() / 1_000));
    this.storage = options.storage;
    this.storageKey = options.storageKey ?? "demo-state";
    this.voucherContext = options.voucherContext;
    this.voucherMessageProvider = options.voucherMessageProvider;

    const stored = this.storage?.read(this.storageKey, DEMO_STATE_CODEC);
    if (stored?.status === "valid") {
      this.state = cloneState(stored.value);
      this.storageIssue = null;
    } else {
      this.state = cloneState(options.initialState);
      this.storageIssue =
        stored?.status === "invalid" ? stored.error : null;
      if (stored?.status === "invalid") {
        this.storage?.remove(this.storageKey);
      }
      this.persist(this.state);
    }
  }

  getSnapshot = (): DemoState => cloneState(this.state);

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getEvent(eventId: Hex32): CommitPassEvent | undefined {
    const event = this.state.events[eventId.toLowerCase()];
    return event ? structuredClone(event) : undefined;
  }

  getReservation(
    eventId: Hex32,
    attendee: StellarAddress,
  ): Reservation | undefined {
    const reservation =
      this.state.reservations[reservationKey(eventId, attendee)];
    return reservation ? structuredClone(reservation) : undefined;
  }

  isNonceUsed(eventId: Hex32, nonce: Hex32): boolean {
    return Boolean(
      this.state.usedVoucherNonces[voucherNonceKey(eventId, nonce)],
    );
  }

  balanceOf(address: StellarAddress): bigint {
    return this.state.balances[address] ?? DEMO_STARTING_BALANCE;
  }

  reserve(eventId: Hex32, attendee: StellarAddress): DemoReceipt {
    const next = cloneState(this.state);
    const event = requireEvent(next, eventId);
    requireActive(event);
    const now = this.now();
    if (now >= event.startAt) {
      throw contractError("ReservationClosed");
    }
    const key = reservationKey(event.id, attendee);
    if (next.reservations[key]) {
      throw contractError("AlreadyReserved");
    }
    if (event.seatsReserved >= event.capacity) {
      throw contractError("CapacityReached");
    }
    requireAddress(attendee);
    ensureBalance(next, attendee);
    if (next.balances[attendee] < event.depositAmount) {
      throw new CommitPassError(
        "InsufficientBalance",
        "The demo wallet does not have enough XLM for this deposit.",
      );
    }

    next.balances[attendee] -= event.depositAmount;
    next.escrowByEvent[event.id] =
      (next.escrowByEvent[event.id] ?? 0n) + event.depositAmount;
    event.seatsReserved += 1;
    event.outstandingDeposits += 1;
    next.reservations[key] = {
      eventId: event.id,
      attendee,
      status: "Reserved",
      reservedAt: now,
      settledAt: null,
    };
    const receipt = appendReceipt(next, {
      action: "reserve",
      eventId: event.id,
      attendee,
      ledgerTimestamp: now,
      amount: event.depositAmount,
      beneficiary: null,
    });
    this.commit(next);
    return receipt;
  }

  cancelReservation(
    eventId: Hex32,
    attendee: StellarAddress,
  ): DemoReceipt {
    const next = cloneState(this.state);
    const event = requireEvent(next, eventId);
    requireActive(event);
    const now = this.now();
    if (now >= event.startAt) {
      throw contractError("CancellationClosed");
    }
    const reservation = requireReserved(next, event.id, attendee);

    event.seatsReserved = checkedSubtract(event.seatsReserved, 1);
    event.outstandingDeposits = checkedSubtract(
      event.outstandingDeposits,
      1,
    );
    debitEscrow(next, event);
    let beneficiary: StellarAddress;
    if (event.cancellationPolicy === "FullRefund") {
      reservation.status = "AttendeeRefunded";
      credit(next, attendee, event.depositAmount);
      beneficiary = attendee;
    } else {
      reservation.status = "AttendeeForfeited";
      credit(next, event.noShowBeneficiary, event.depositAmount);
      beneficiary = event.noShowBeneficiary;
    }
    reservation.settledAt = now;
    const receipt = appendReceipt(next, {
      action: "cancel-reservation",
      eventId: event.id,
      attendee,
      ledgerTimestamp: now,
      amount: event.depositAmount,
      beneficiary,
    });
    this.commit(next);
    return receipt;
  }

  cancelEvent(
    eventId: Hex32,
    organizer: StellarAddress,
  ): DemoReceipt {
    const next = cloneState(this.state);
    const event = requireEvent(next, eventId);
    requireActive(event);
    if (organizer !== event.organizer) {
      throw contractError("Unauthorized");
    }
    const now = this.now();
    if (now > event.checkInDeadline) {
      throw contractError("EventCancellationClosed");
    }
    event.status = "Cancelled";
    const receipt = appendReceipt(next, {
      action: "cancel-event",
      eventId: event.id,
      attendee: null,
      ledgerTimestamp: now,
      amount: 0n,
      beneficiary: null,
    });
    this.commit(next);
    return receipt;
  }

  claimEventRefund(
    eventId: Hex32,
    attendee: StellarAddress,
  ): DemoReceipt {
    const next = cloneState(this.state);
    const event = requireEvent(next, eventId);
    if (event.status !== "Cancelled") {
      throw contractError("EventNotCancelled");
    }
    const reservation = requireReserved(next, event.id, attendee);
    const now = this.now();

    reservation.status = "EventRefunded";
    reservation.settledAt = now;
    event.outstandingDeposits = checkedSubtract(
      event.outstandingDeposits,
      1,
    );
    event.seatsReserved = checkedSubtract(event.seatsReserved, 1);
    debitEscrow(next, event);
    credit(next, attendee, event.depositAmount);
    const receipt = appendReceipt(next, {
      action: "event-refund",
      eventId: event.id,
      attendee,
      ledgerTimestamp: now,
      amount: event.depositAmount,
      beneficiary: attendee,
    });
    this.commit(next);
    return receipt;
  }

  sweepNoShow(
    eventId: Hex32,
    attendee: StellarAddress,
  ): DemoReceipt {
    const next = cloneState(this.state);
    const event = requireEvent(next, eventId);
    requireActive(event);
    const now = this.now();
    if (now < event.endAt) {
      throw contractError("EventNotEnded");
    }
    const reservation = requireReserved(next, event.id, attendee);

    reservation.status = "NoShow";
    reservation.settledAt = now;
    event.outstandingDeposits = checkedSubtract(
      event.outstandingDeposits,
      1,
    );
    debitEscrow(next, event);
    credit(next, event.noShowBeneficiary, event.depositAmount);
    const receipt = appendReceipt(next, {
      action: "no-show",
      eventId: event.id,
      attendee,
      ledgerTimestamp: now,
      amount: event.depositAmount,
      beneficiary: event.noShowBeneficiary,
    });
    this.commit(next);
    return receipt;
  }

  updateScannerKey(
    eventId: Hex32,
    organizer: StellarAddress,
    scannerPublicKey: Hex32,
  ): DemoReceipt {
    const next = cloneState(this.state);
    const event = requireEvent(next, eventId);
    requireActive(event);
    if (organizer !== event.organizer) {
      throw contractError("Unauthorized");
    }
    const now = this.now();
    if (now >= event.startAt) {
      throw contractError("ScannerKeyFrozen");
    }
    if (
      !isHex32(scannerPublicKey) ||
      /^0{64}$/.test(scannerPublicKey)
    ) {
      throw contractError("InvalidScannerKey");
    }
    event.scannerPublicKey = scannerPublicKey.toLowerCase();
    const receipt = appendReceipt(next, {
      action: "update-scanner-key",
      eventId: event.id,
      attendee: null,
      ledgerTimestamp: now,
      amount: 0n,
      beneficiary: null,
    });
    this.commit(next);
    return receipt;
  }

  async claimCheckInRefund(input: CheckInRefundInput): Promise<DemoReceipt> {
    // Validate before crypto work, then validate again after awaiting to prevent
    // two concurrent claims from racing the one-time nonce.
    this.requireCheckInClaim(this.state, input);
    const event = requireEvent(this.state, input.eventId);
    const now = this.now();
    const verification = await verifySignedCheckInVoucher({
      signedVoucher: input.signedVoucher,
      expectedContext: this.voucherContext,
      expectedEventId: event.id,
      expectedAttendee: input.attendee,
      scannerPublicKey: hexToBytes(event.scannerPublicKey, 32),
      eventStartAt: event.startAt,
      checkInDeadline: event.checkInDeadline,
      now,
      messageProvider: this.voucherMessageProvider,
    });
    if (!verification.ok) {
      if (verification.reason === "InvalidVoucherSignature") {
        throw new CommitPassError(
          "InvalidVoucherSignature",
          "The scanner signature is invalid.",
        );
      }
      if (verification.reason === "InvalidVoucher") {
        throw new CommitPassError(
          "InvalidVoucher",
          "The voucher is malformed.",
        );
      }
      throw contractError(verification.reason);
    }

    const next = cloneState(this.state);
    const currentEvent = this.requireCheckInClaim(next, input);
    const reservation = requireReserved(
      next,
      currentEvent.id,
      input.attendee,
    );
    const settledAt = this.now();
    if (settledAt > verification.voucher.expiresAt) {
      throw contractError("VoucherExpired");
    }

    reservation.status = "CheckedIn";
    reservation.settledAt = settledAt;
    currentEvent.outstandingDeposits = checkedSubtract(
      currentEvent.outstandingDeposits,
      1,
    );
    const nonceKey = voucherNonceKey(
      currentEvent.id,
      verification.voucher.nonce,
    );
    next.usedVoucherNonces[nonceKey] = true;
    debitEscrow(next, currentEvent);
    credit(next, input.attendee, currentEvent.depositAmount);
    const receipt = appendReceipt(next, {
      action: "check-in-refund",
      eventId: currentEvent.id,
      attendee: input.attendee,
      ledgerTimestamp: settledAt,
      amount: currentEvent.depositAmount,
      beneficiary: input.attendee,
    });
    this.commit(next);
    return receipt;
  }

  reset(nextState: DemoState): void {
    if (!isDemoState(nextState)) {
      throw new TypeError("Replacement demo state is invalid.");
    }
    this.commit(cloneState(nextState));
  }

  private requireCheckInClaim(
    state: DemoState,
    input: CheckInRefundInput,
  ): CommitPassEvent {
    const event = requireEvent(state, input.eventId);
    requireActive(event);
    if (!isSignedCheckInVoucher(input.signedVoucher)) {
      throw new CommitPassError(
        "InvalidVoucher",
        "The voucher is malformed.",
      );
    }
    const voucher: CheckInVoucher = input.signedVoucher.voucher;
    if (
      voucher.eventId.toLowerCase() !== event.id ||
      voucher.attendee !== input.attendee
    ) {
      throw contractError("VoucherMismatch");
    }
    if (
      state.usedVoucherNonces[
        voucherNonceKey(event.id, voucher.nonce)
      ]
    ) {
      throw contractError("VoucherAlreadyUsed");
    }
    const now = this.now();
    if (now < event.startAt) {
      throw contractError("CheckInNotOpen");
    }
    if (now > event.checkInDeadline) {
      throw contractError("CheckInClosed");
    }
    if (
      voucher.checkedInAt < event.startAt ||
      voucher.checkedInAt > now ||
      voucher.checkedInAt > event.checkInDeadline ||
      voucher.expiresAt < voucher.checkedInAt ||
      voucher.expiresAt > event.checkInDeadline
    ) {
      throw contractError("InvalidVoucherTime");
    }
    if (now > voucher.expiresAt) {
      throw contractError("VoucherExpired");
    }
    requireReserved(state, event.id, input.attendee);
    return event;
  }

  private commit(next: DemoState): void {
    this.persist(next);
    this.state = next;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private persist(state: DemoState): void {
    this.storage?.write(this.storageKey, state, DEMO_STATE_CODEC);
  }
}

export function createDemoState(
  events: readonly CommitPassEvent[],
  balances: Readonly<Record<StellarAddress, bigint>> = {},
): DemoState {
  const eventRecord: Record<Hex32, CommitPassEvent> = {};
  const escrowByEvent: Record<Hex32, bigint> = {};
  for (const sourceEvent of events) {
    const event = structuredClone(sourceEvent);
    event.id = event.id.toLowerCase();
    eventRecord[event.id] = event;
    escrowByEvent[event.id] =
      event.depositAmount * BigInt(event.outstandingDeposits);
  }
  const state: DemoState = {
    schemaVersion: DEMO_STATE_SCHEMA_VERSION,
    events: eventRecord,
    reservations: {},
    usedVoucherNonces: {},
    balances: { ...balances },
    escrowByEvent,
    receipts: [],
    transactionSequence: 0,
  };
  if (!isDemoState(state)) {
    throw new TypeError("Could not create a valid demo state.");
  }
  return state;
}

export function isDemoState(value: unknown): value is DemoState {
  if (!isRecord(value)) {
    return false;
  }
  if (
    value.schemaVersion !== DEMO_STATE_SCHEMA_VERSION ||
    !isRecord(value.events) ||
    !isRecord(value.reservations) ||
    !isTrueRecord(value.usedVoucherNonces) ||
    !isBigIntRecord(value.balances) ||
    !isBigIntRecord(value.escrowByEvent) ||
    !Array.isArray(value.receipts) ||
    !Number.isSafeInteger(value.transactionSequence) ||
    (value.transactionSequence as number) < 0
  ) {
    return false;
  }
  return (
    Object.entries(value.events).every(
      ([key, event]) => isCommitPassEvent(event) && event.id === key,
    ) &&
    Object.entries(value.reservations).every(
      ([key, reservation]) =>
        isReservation(reservation) &&
        reservationKey(reservation.eventId, reservation.attendee) === key,
    ) &&
    value.receipts.every(isDemoReceipt)
  );
}

function requireEvent(state: DemoState, eventId: Hex32): CommitPassEvent {
  const event = state.events[eventId.toLowerCase()];
  if (!event) {
    throw contractError("EventNotFound");
  }
  return event;
}

function requireActive(event: CommitPassEvent): void {
  if (event.status !== "Active") {
    throw contractError("EventNotActive");
  }
}

function requireReserved(
  state: DemoState,
  eventId: Hex32,
  attendee: StellarAddress,
): Reservation {
  const reservation = state.reservations[reservationKey(eventId, attendee)];
  if (!reservation) {
    throw contractError("ReservationNotFound");
  }
  if (reservation.status !== "Reserved") {
    throw contractError("InvalidReservationStatus");
  }
  return reservation;
}

function requireAddress(address: StellarAddress): void {
  if (!isStellarAddress(address)) {
    throw new TypeError("Expected a valid Stellar address.");
  }
}

function checkedSubtract(value: number, amount: number): number {
  const result = value - amount;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw contractError("ArithmeticOverflow");
  }
  return result;
}

function ensureBalance(state: DemoState, address: StellarAddress): void {
  if (state.balances[address] === undefined) {
    state.balances[address] = DEMO_STARTING_BALANCE;
  }
}

function credit(
  state: DemoState,
  address: StellarAddress,
  amount: bigint,
): void {
  ensureBalance(state, address);
  state.balances[address] += amount;
}

function debitEscrow(state: DemoState, event: CommitPassEvent): void {
  const escrow = state.escrowByEvent[event.id] ?? 0n;
  if (escrow < event.depositAmount) {
    throw contractError("ArithmeticOverflow");
  }
  state.escrowByEvent[event.id] = escrow - event.depositAmount;
}

function appendReceipt(
  state: DemoState,
  input: Omit<DemoReceipt, "id" | "status">,
): DemoReceipt {
  state.transactionSequence += 1;
  const receipt: DemoReceipt = {
    ...input,
    id: `demo-tx-${state.transactionSequence.toString().padStart(6, "0")}`,
    status: "confirmed",
  };
  state.receipts.push(receipt);
  return structuredClone(receipt);
}

function cloneState(state: DemoState): DemoState {
  return structuredClone(state);
}

function isCommitPassEvent(value: unknown): value is CommitPassEvent {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isHex32(value.id) &&
    isHex32(value.eventSalt) &&
    isStellarAddress(value.organizer) &&
    isHex32(value.metadataHash) &&
    isUnixSeconds(value.startAt) &&
    isUnixSeconds(value.checkInDeadline) &&
    isUnixSeconds(value.endAt) &&
    isStellarAddress(value.token) &&
    value.tokenCode === "XLM" &&
    value.tokenDecimals === 7 &&
    typeof value.depositAmount === "bigint" &&
    value.depositAmount > 0n &&
    isNonNegativeInteger(value.capacity) &&
    value.capacity > 0 &&
    isNonNegativeInteger(value.seatsReserved) &&
    value.seatsReserved <= value.capacity &&
    isNonNegativeInteger(value.outstandingDeposits) &&
    isStellarAddress(value.noShowBeneficiary) &&
    (value.cancellationPolicy === "FullRefund" ||
      value.cancellationPolicy === "ForfeitDeposit") &&
    isHex32(value.scannerPublicKey) &&
    !/^0{64}$/.test(value.scannerPublicKey) &&
    (value.status === "Active" || value.status === "Cancelled") &&
    isUnixSeconds(value.createdAt) &&
    isEventMetadata(value.metadata)
  );
}

function isReservation(value: unknown): value is Reservation {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isHex32(value.eventId) &&
    isStellarAddress(value.attendee) &&
    [
      "Reserved",
      "CheckedIn",
      "AttendeeRefunded",
      "AttendeeForfeited",
      "EventRefunded",
      "NoShow",
    ].includes(String(value.status)) &&
    isUnixSeconds(value.reservedAt) &&
    (value.settledAt === null || isUnixSeconds(value.settledAt))
  );
}

function isDemoReceipt(value: unknown): value is DemoReceipt {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    [
      "reserve",
      "check-in-refund",
      "cancel-reservation",
      "cancel-event",
      "event-refund",
      "no-show",
      "update-scanner-key",
    ].includes(String(value.action)) &&
    isHex32(value.eventId) &&
    (value.attendee === null || isStellarAddress(value.attendee)) &&
    isUnixSeconds(value.ledgerTimestamp) &&
    typeof value.amount === "bigint" &&
    value.amount >= 0n &&
    (value.beneficiary === null ||
      isStellarAddress(value.beneficiary)) &&
    value.status === "confirmed"
  );
}

function isEventMetadata(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    typeof value.organizerName === "string" &&
    typeof value.venueName === "string" &&
    typeof value.venueCity === "string" &&
    typeof value.timezone === "string" &&
    (value.imagePath === undefined || typeof value.imagePath === "string")
  );
}

function isTrueRecord(value: unknown): value is Record<string, true> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => entry === true)
  );
}

function isBigIntRecord(value: unknown): value is Record<string, bigint> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (entry) => typeof entry === "bigint" && entry >= 0n,
    )
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
