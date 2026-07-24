import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export const RsvpError = {
  1: {message:"EventAlreadyExists"},
  2: {message:"EventNotFound"},
  3: {message:"ReservationNotFound"},
  4: {message:"InvalidSchedule"},
  5: {message:"InvalidDeposit"},
  6: {message:"InvalidCapacity"},
  7: {message:"Unauthorized"},
  8: {message:"EventNotActive"},
  9: {message:"ReservationClosed"},
  10: {message:"CapacityReached"},
  11: {message:"AlreadyReserved"},
  12: {message:"InvalidReservationStatus"},
  13: {message:"CheckInNotOpen"},
  14: {message:"CheckInClosed"},
  15: {message:"CancellationClosed"},
  16: {message:"EventNotCancelled"},
  17: {message:"EventNotEnded"},
  18: {message:"EventCancellationClosed"},
  19: {message:"ArithmeticOverflow"},
  20: {message:"InvalidScannerKey"},
  21: {message:"ScannerKeyFrozen"},
  22: {message:"VoucherMismatch"},
  23: {message:"VoucherAlreadyUsed"},
  24: {message:"InvalidVoucherTime"},
  25: {message:"VoucherExpired"},
  26: {message:"InvalidEventSalt"},
  27: {message:"UnsupportedToken"}
}


export interface RsvpEvent {
  cancellation_policy: CancellationPolicy;
  capacity: u32;
  check_in_deadline: u64;
  created_at: u64;
  deposit_amount: i128;
  end_at: u64;
  event_id: Buffer;
  event_salt: Buffer;
  metadata_hash: Buffer;
  no_show_beneficiary: string;
  organizer: string;
  /**
 * Deposits that remain in contract custody and have not reached a terminal state.
 */
outstanding_deposits: u32;
  scanner_public_key: Buffer;
  /**
 * Seats still associated with non-cancelled reservations.
 */
seats_reserved: u32;
  start_at: u64;
  status: EventStatus;
  token: string;
}


/**
 * Immutable configuration supplied when an event is created.
 * 
 * Reservations close at `start_at`. Check-in is open from `start_at` through
 * `check_in_deadline`, inclusive. Unchecked deposits become sweepable at `end_at`.
 */
export interface EventConfig {
  cancellation_policy: CancellationPolicy;
  capacity: u32;
  check_in_deadline: u64;
  deposit_amount: i128;
  end_at: u64;
  /**
 * Organizer-generated, cryptographically random salt unique to this event.
 */
event_salt: Buffer;
  metadata_hash: Buffer;
  no_show_beneficiary: Option<string>;
  /**
 * Event-scoped Ed25519 public key used by the venue scanner.
 */
scanner_public_key: Buffer;
  start_at: u64;
  token: string;
}

export type EventStatus = {tag: "Active", values: void} | {tag: "Cancelled", values: void};


export interface Reservation {
  reserved_at: u64;
  settled_at: Option<u64>;
  status: ReservationStatus;
}




/**
 * Organizer-attested proof that one attendee was physically checked in.
 * 
 * The contract adds its own fixed domain, network ID, and contract address before canonical XDR
 * serialization, so a signature cannot be replayed across deployments or Stellar networks.
 */
export interface CheckInVoucher {
  attendee: string;
  checked_in_at: u64;
  event_id: Buffer;
  expires_at: u64;
  nonce: Buffer;
}


export type ReservationStatus = {tag: "Reserved", values: void} | {tag: "CheckedIn", values: void} | {tag: "AttendeeRefunded", values: void} | {tag: "AttendeeForfeited", values: void} | {tag: "EventRefunded", values: void} | {tag: "NoShow", values: void};



/**
 * Whether an attendee who cancels before the event starts receives their deposit.
 */
export type CancellationPolicy = {tag: "FullRefund", values: void} | {tag: "ForfeitDeposit", values: void};




export interface Client {
  /**
   * Construct and simulate a reserve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Reserve a seat before the event starts and atomically place one deposit in custody.
   */
  reserve: ({event_id, attendee}: {event_id: Buffer, attendee: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Reservation>>>

  /**
   * Construct and simulate a get_event transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_event: ({event_id}: {event_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<RsvpEvent>>>

  /**
   * Construct and simulate a has_event transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  has_event: ({event_id}: {event_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a cancel_event transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel the event no later than the check-in deadline. Outstanding attendees claim their
   * own refunds separately, keeping this operation bounded regardless of event capacity.
   */
  cancel_event: ({event_id, organizer}: {event_id: Buffer, organizer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<RsvpEvent>>>

  /**
   * Construct and simulate a create_event transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create an event under its contract-derived ID. The organizer authorizes the exact config.
   */
  create_event: ({organizer, config}: {organizer: string, config: EventConfig}, options?: MethodOptions) => Promise<AssembledTransaction<Result<RsvpEvent>>>

  /**
   * Construct and simulate a is_nonce_used transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_nonce_used: ({event_id, nonce}: {event_id: Buffer, nonce: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a sweep_no_show transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Permissionlessly settle one unchecked reservation after the event ends. The caller cannot
   * redirect funds: the immutable event beneficiary always receives the deposit.
   */
  sweep_no_show: ({event_id, attendee}: {event_id: Buffer, attendee: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Reservation>>>

  /**
   * Construct and simulate a derive_event_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Derive the event ID for this organizer, exact immutable config, network, and deployment.
   */
  derive_event_id: ({organizer, config}: {organizer: string, config: EventConfig}, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a get_reservation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_reservation: ({event_id, attendee}: {event_id: Buffer, attendee: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Reservation>>>

  /**
   * Construct and simulate a has_reservation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  has_reservation: ({event_id, attendee}: {event_id: Buffer, attendee: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a voucher_message transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the exact canonical XDR bytes a scanner signs for this deployment and network.
   */
  voucher_message: ({voucher}: {voucher: CheckInVoucher}, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a get_deposit_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the sole token accepted by every event in this deployment.
   */
  get_deposit_token: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a cancel_reservation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel an RSVP before the event starts. The event's immutable policy determines whether
   * the deposit returns to the attendee or is paid to the no-show beneficiary.
   */
  cancel_reservation: ({event_id, attendee}: {event_id: Buffer, attendee: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Reservation>>>

  /**
   * Construct and simulate a claim_event_refund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Claim one deposit after an organizer cancellation. Only the attendee can authorize the
   * claim, and terminal reservations cannot claim twice.
   */
  claim_event_refund: ({event_id, attendee}: {event_id: Buffer, attendee: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Reservation>>>

  /**
   * Construct and simulate a update_scanner_key transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Rotate the event-scoped scanner key before check-in starts. The key is frozen at
   * `start_at`, preventing a late organizer key swap from invalidating issued vouchers.
   */
  update_scanner_key: ({event_id, organizer, scanner_public_key}: {event_id: Buffer, organizer: string, scanner_public_key: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<RsvpEvent>>>

  /**
   * Construct and simulate a claim_check_in_refund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verify an attendee-bound scanner voucher and atomically return the full deposit.
   * 
   * Invalid Ed25519 signatures fail the invocation at the host level. The attendee still has
   * to authorize this call, and the voucher nonce is persisted before the token transfer.
   */
  claim_check_in_refund: ({event_id, attendee, voucher, signature}: {event_id: Buffer, attendee: string, voucher: CheckInVoucher, signature: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Reservation>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {deposit_token}: {deposit_token: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({deposit_token}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAACVJzdnBFcnJvcgAAAAAAABsAAAAAAAAAEkV2ZW50QWxyZWFkeUV4aXN0cwAAAAAAAQAAAAAAAAANRXZlbnROb3RGb3VuZAAAAAAAAAIAAAAAAAAAE1Jlc2VydmF0aW9uTm90Rm91bmQAAAAAAwAAAAAAAAAPSW52YWxpZFNjaGVkdWxlAAAAAAQAAAAAAAAADkludmFsaWREZXBvc2l0AAAAAAAFAAAAAAAAAA9JbnZhbGlkQ2FwYWNpdHkAAAAABgAAAAAAAAAMVW5hdXRob3JpemVkAAAABwAAAAAAAAAORXZlbnROb3RBY3RpdmUAAAAAAAgAAAAAAAAAEVJlc2VydmF0aW9uQ2xvc2VkAAAAAAAACQAAAAAAAAAPQ2FwYWNpdHlSZWFjaGVkAAAAAAoAAAAAAAAAD0FscmVhZHlSZXNlcnZlZAAAAAALAAAAAAAAABhJbnZhbGlkUmVzZXJ2YXRpb25TdGF0dXMAAAAMAAAAAAAAAA5DaGVja0luTm90T3BlbgAAAAAADQAAAAAAAAANQ2hlY2tJbkNsb3NlZAAAAAAAAA4AAAAAAAAAEkNhbmNlbGxhdGlvbkNsb3NlZAAAAAAADwAAAAAAAAARRXZlbnROb3RDYW5jZWxsZWQAAAAAAAAQAAAAAAAAAA1FdmVudE5vdEVuZGVkAAAAAAAAEQAAAAAAAAAXRXZlbnRDYW5jZWxsYXRpb25DbG9zZWQAAAAAEgAAAAAAAAASQXJpdGhtZXRpY092ZXJmbG93AAAAAAATAAAAAAAAABFJbnZhbGlkU2Nhbm5lcktleQAAAAAAABQAAAAAAAAAEFNjYW5uZXJLZXlGcm96ZW4AAAAVAAAAAAAAAA9Wb3VjaGVyTWlzbWF0Y2gAAAAAFgAAAAAAAAASVm91Y2hlckFscmVhZHlVc2VkAAAAAAAXAAAAAAAAABJJbnZhbGlkVm91Y2hlclRpbWUAAAAAABgAAAAAAAAADlZvdWNoZXJFeHBpcmVkAAAAAAAZAAAAAAAAABBJbnZhbGlkRXZlbnRTYWx0AAAAGgAAAAAAAAAQVW5zdXBwb3J0ZWRUb2tlbgAAABs=",
        "AAAAAQAAAAAAAAAAAAAACVJzdnBFdmVudAAAAAAAABEAAAAAAAAAE2NhbmNlbGxhdGlvbl9wb2xpY3kAAAAH0AAAABJDYW5jZWxsYXRpb25Qb2xpY3kAAAAAAAAAAAAIY2FwYWNpdHkAAAAEAAAAAAAAABFjaGVja19pbl9kZWFkbGluZQAAAAAAAAYAAAAAAAAACmNyZWF0ZWRfYXQAAAAAAAYAAAAAAAAADmRlcG9zaXRfYW1vdW50AAAAAAALAAAAAAAAAAZlbmRfYXQAAAAAAAYAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAAAAAAACmV2ZW50X3NhbHQAAAAAA+4AAAAgAAAAAAAAAA1tZXRhZGF0YV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAE25vX3Nob3dfYmVuZWZpY2lhcnkAAAAAEwAAAAAAAAAJb3JnYW5pemVyAAAAAAAAEwAAAE9EZXBvc2l0cyB0aGF0IHJlbWFpbiBpbiBjb250cmFjdCBjdXN0b2R5IGFuZCBoYXZlIG5vdCByZWFjaGVkIGEgdGVybWluYWwgc3RhdGUuAAAAABRvdXRzdGFuZGluZ19kZXBvc2l0cwAAAAQAAAAAAAAAEnNjYW5uZXJfcHVibGljX2tleQAAAAAD7gAAACAAAAA3U2VhdHMgc3RpbGwgYXNzb2NpYXRlZCB3aXRoIG5vbi1jYW5jZWxsZWQgcmVzZXJ2YXRpb25zLgAAAAAOc2VhdHNfcmVzZXJ2ZWQAAAAAAAQAAAAAAAAACHN0YXJ0X2F0AAAABgAAAAAAAAAGc3RhdHVzAAAAAAfQAAAAC0V2ZW50U3RhdHVzAAAAAAAAAAAFdG9rZW4AAAAAAAAT",
        "AAAAAQAAANdJbW11dGFibGUgY29uZmlndXJhdGlvbiBzdXBwbGllZCB3aGVuIGFuIGV2ZW50IGlzIGNyZWF0ZWQuCgpSZXNlcnZhdGlvbnMgY2xvc2UgYXQgYHN0YXJ0X2F0YC4gQ2hlY2staW4gaXMgb3BlbiBmcm9tIGBzdGFydF9hdGAgdGhyb3VnaApgY2hlY2tfaW5fZGVhZGxpbmVgLCBpbmNsdXNpdmUuIFVuY2hlY2tlZCBkZXBvc2l0cyBiZWNvbWUgc3dlZXBhYmxlIGF0IGBlbmRfYXRgLgAAAAAAAAAAC0V2ZW50Q29uZmlnAAAAAAsAAAAAAAAAE2NhbmNlbGxhdGlvbl9wb2xpY3kAAAAH0AAAABJDYW5jZWxsYXRpb25Qb2xpY3kAAAAAAAAAAAAIY2FwYWNpdHkAAAAEAAAAAAAAABFjaGVja19pbl9kZWFkbGluZQAAAAAAAAYAAAAAAAAADmRlcG9zaXRfYW1vdW50AAAAAAALAAAAAAAAAAZlbmRfYXQAAAAAAAYAAABIT3JnYW5pemVyLWdlbmVyYXRlZCwgY3J5cHRvZ3JhcGhpY2FsbHkgcmFuZG9tIHNhbHQgdW5pcXVlIHRvIHRoaXMgZXZlbnQuAAAACmV2ZW50X3NhbHQAAAAAA+4AAAAgAAAAAAAAAA1tZXRhZGF0YV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAE25vX3Nob3dfYmVuZWZpY2lhcnkAAAAD6AAAABMAAAA6RXZlbnQtc2NvcGVkIEVkMjU1MTkgcHVibGljIGtleSB1c2VkIGJ5IHRoZSB2ZW51ZSBzY2FubmVyLgAAAAAAEnNjYW5uZXJfcHVibGljX2tleQAAAAAD7gAAACAAAAAAAAAACHN0YXJ0X2F0AAAABgAAAAAAAAAFdG9rZW4AAAAAAAAT",
        "AAAAAgAAAAAAAAAAAAAAC0V2ZW50U3RhdHVzAAAAAAIAAAAAAAAAAAAAAAZBY3RpdmUAAAAAAAAAAAAAAAAACUNhbmNlbGxlZAAAAA==",
        "AAAAAQAAAAAAAAAAAAAAC1Jlc2VydmF0aW9uAAAAAAMAAAAAAAAAC3Jlc2VydmVkX2F0AAAAAAYAAAAAAAAACnNldHRsZWRfYXQAAAAAA+gAAAAGAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAARUmVzZXJ2YXRpb25TdGF0dXMAAAA=",
        "AAAABQAAAAAAAAAAAAAAC05vU2hvd1N3ZXB0AAAAAAIAAAAEcnN2cAAAAAdub19zaG93AAAAAAQAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAABAAAAAAAAAAhhdHRlbmRlZQAAABMAAAABAAAAAAAAAAtiZW5lZmljaWFyeQAAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADEV2ZW50Q3JlYXRlZAAAAAIAAAAEcnN2cAAAAA1ldmVudF9jcmVhdGVkAAAAAAAADQAAAAAAAAAIZXZlbnRfaWQAAAPuAAAAIAAAAAEAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAABAAAAAAAAAApldmVudF9zYWx0AAAAAAPuAAAAIAAAAAAAAAAAAAAADW1ldGFkYXRhX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAAAAAADmRlcG9zaXRfYW1vdW50AAAAAAALAAAAAAAAAAAAAAAIY2FwYWNpdHkAAAAEAAAAAAAAAAAAAAAIc3RhcnRfYXQAAAAGAAAAAAAAAAAAAAARY2hlY2tfaW5fZGVhZGxpbmUAAAAAAAAGAAAAAAAAAAAAAAAGZW5kX2F0AAAAAAAGAAAAAAAAAAAAAAATbm9fc2hvd19iZW5lZmljaWFyeQAAAAATAAAAAAAAAAAAAAATY2FuY2VsbGF0aW9uX3BvbGljeQAAAAfQAAAAEkNhbmNlbGxhdGlvblBvbGljeQAAAAAAAAAAAAAAAAASc2Nhbm5lcl9wdWJsaWNfa2V5AAAAAAPuAAAAIAAAAAAAAAAC",
        "AAAAAQAAAP1Pcmdhbml6ZXItYXR0ZXN0ZWQgcHJvb2YgdGhhdCBvbmUgYXR0ZW5kZWUgd2FzIHBoeXNpY2FsbHkgY2hlY2tlZCBpbi4KClRoZSBjb250cmFjdCBhZGRzIGl0cyBvd24gZml4ZWQgZG9tYWluLCBuZXR3b3JrIElELCBhbmQgY29udHJhY3QgYWRkcmVzcyBiZWZvcmUgY2Fub25pY2FsIFhEUgpzZXJpYWxpemF0aW9uLCBzbyBhIHNpZ25hdHVyZSBjYW5ub3QgYmUgcmVwbGF5ZWQgYWNyb3NzIGRlcGxveW1lbnRzIG9yIFN0ZWxsYXIgbmV0d29ya3MuAAAAAAAAAAAAAA5DaGVja0luVm91Y2hlcgAAAAAABQAAAAAAAAAIYXR0ZW5kZWUAAAATAAAAAAAAAA1jaGVja2VkX2luX2F0AAAAAAAABgAAAAAAAAAIZXZlbnRfaWQAAAPuAAAAIAAAAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAAAAAAAAFbm9uY2UAAAAAAAPuAAAAIA==",
        "AAAAAAAAAFNSZXNlcnZlIGEgc2VhdCBiZWZvcmUgdGhlIGV2ZW50IHN0YXJ0cyBhbmQgYXRvbWljYWxseSBwbGFjZSBvbmUgZGVwb3NpdCBpbiBjdXN0b2R5LgAAAAAHcmVzZXJ2ZQAAAAACAAAAAAAAAAhldmVudF9pZAAAA+4AAAAgAAAAAAAAAAhhdHRlbmRlZQAAABMAAAABAAAD6QAAB9AAAAALUmVzZXJ2YXRpb24AAAAH0AAAAAlSc3ZwRXJyb3IAAAA=",
        "AAAABQAAAAAAAAAAAAAADkV2ZW50Q2FuY2VsbGVkAAAAAAACAAAABHJzdnAAAAAPZXZlbnRfY2FuY2VsbGVkAAAAAAMAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAABAAAAAAAAAAlvcmdhbml6ZXIAAAAAAAATAAAAAQAAAAAAAAAXcmVmdW5kYWJsZV9yZXNlcnZhdGlvbnMAAAAABAAAAAAAAAAC",
        "AAAAAAAAAAAAAAAJZ2V0X2V2ZW50AAAAAAAAAQAAAAAAAAAIZXZlbnRfaWQAAAPuAAAAIAAAAAEAAAPpAAAH0AAAAAlSc3ZwRXZlbnQAAAAAAAfQAAAACVJzdnBFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAAJaGFzX2V2ZW50AAAAAAAAAQAAAAAAAAAIZXZlbnRfaWQAAAPuAAAAIAAAAAEAAAAB",
        "AAAAAgAAAAAAAAAAAAAAEVJlc2VydmF0aW9uU3RhdHVzAAAAAAAABgAAAAAAAAAAAAAACFJlc2VydmVkAAAAAAAAAAAAAAAJQ2hlY2tlZEluAAAAAAAAAAAAAAAAAAAQQXR0ZW5kZWVSZWZ1bmRlZAAAAAAAAAAAAAAAEUF0dGVuZGVlRm9yZmVpdGVkAAAAAAAAAAAAAAAAAAANRXZlbnRSZWZ1bmRlZAAAAAAAAAAAAAAAAAAABk5vU2hvdwAA",
        "AAAABQAAAAAAAAAAAAAAEUF0dGVuZGVlQ2hlY2tlZEluAAAAAAAAAgAAAARyc3ZwAAAACmNoZWNrZWRfaW4AAAAAAAUAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAABAAAAAAAAAAhhdHRlbmRlZQAAABMAAAABAAAAAAAAAAVub25jZQAAAAAAA+4AAAAgAAAAAAAAAAAAAAANY2hlY2tlZF9pbl9hdAAAAAAAAAYAAAAAAAAAAAAAAA1yZWZ1bmRfYW1vdW50AAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAEVNjYW5uZXJLZXlVcGRhdGVkAAAAAAAAAgAAAARyc3ZwAAAAD3NjYW5uZXJfdXBkYXRlZAAAAAADAAAAAAAAAAhldmVudF9pZAAAA+4AAAAgAAAAAQAAAAAAAAAJb3JnYW5pemVyAAAAAAAAEwAAAAEAAAAAAAAAEnNjYW5uZXJfcHVibGljX2tleQAAAAAD7gAAACAAAAAAAAAAAg==",
        "AAAAAgAAAE9XaGV0aGVyIGFuIGF0dGVuZGVlIHdobyBjYW5jZWxzIGJlZm9yZSB0aGUgZXZlbnQgc3RhcnRzIHJlY2VpdmVzIHRoZWlyIGRlcG9zaXQuAAAAAAAAAAASQ2FuY2VsbGF0aW9uUG9saWN5AAAAAAACAAAAAAAAAAAAAAAKRnVsbFJlZnVuZAAAAAAAAAAAAAAAAAAORm9yZmVpdERlcG9zaXQAAA==",
        "AAAABQAAAAAAAAAAAAAAEkV2ZW50UmVmdW5kQ2xhaW1lZAAAAAAAAgAAAARyc3ZwAAAADGV2ZW50X3JlZnVuZAAAAAMAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAABAAAAAAAAAAhhdHRlbmRlZQAAABMAAAABAAAAAAAAAA1yZWZ1bmRfYW1vdW50AAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAElJlc2VydmF0aW9uQ3JlYXRlZAAAAAAAAgAAAARyc3ZwAAAACHJlc2VydmVkAAAABAAAAAAAAAAIZXZlbnRfaWQAAAPuAAAAIAAAAAEAAAAAAAAACGF0dGVuZGVlAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAADnNlYXRzX3Jlc2VydmVkAAAAAAAEAAAAAAAAAAI=",
        "AAAAAAAAAKxDYW5jZWwgdGhlIGV2ZW50IG5vIGxhdGVyIHRoYW4gdGhlIGNoZWNrLWluIGRlYWRsaW5lLiBPdXRzdGFuZGluZyBhdHRlbmRlZXMgY2xhaW0gdGhlaXIKb3duIHJlZnVuZHMgc2VwYXJhdGVseSwga2VlcGluZyB0aGlzIG9wZXJhdGlvbiBib3VuZGVkIHJlZ2FyZGxlc3Mgb2YgZXZlbnQgY2FwYWNpdHkuAAAADGNhbmNlbF9ldmVudAAAAAIAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAABAAAD6QAAB9AAAAAJUnN2cEV2ZW50AAAAAAAH0AAAAAlSc3ZwRXJyb3IAAAA=",
        "AAAAAAAAAFlDcmVhdGUgYW4gZXZlbnQgdW5kZXIgaXRzIGNvbnRyYWN0LWRlcml2ZWQgSUQuIFRoZSBvcmdhbml6ZXIgYXV0aG9yaXplcyB0aGUgZXhhY3QgY29uZmlnLgAAAAAAAAxjcmVhdGVfZXZlbnQAAAACAAAAAAAAAAlvcmdhbml6ZXIAAAAAAAATAAAAAAAAAAZjb25maWcAAAAAB9AAAAALRXZlbnRDb25maWcAAAAAAQAAA+kAAAfQAAAACVJzdnBFdmVudAAAAAAAB9AAAAAJUnN2cEVycm9yAAAA",
        "AAAAAAAAAFdQaW4gdGhlIHNvbGUgYWNjZXB0ZWQgZGVwb3NpdCB0b2tlbiBhdG9taWNhbGx5IHdoZW4gdGhpcyBjb250cmFjdCBpbnN0YW5jZSBpcyBkZXBsb3llZC4AAAAADV9fY29uc3RydWN0b3IAAAAAAAABAAAAAAAAAA1kZXBvc2l0X3Rva2VuAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAANaXNfbm9uY2VfdXNlZAAAAAAAAAIAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAAAAAAABW5vbmNlAAAAAAAD7gAAACAAAAABAAAAAQ==",
        "AAAAAAAAAKZQZXJtaXNzaW9ubGVzc2x5IHNldHRsZSBvbmUgdW5jaGVja2VkIHJlc2VydmF0aW9uIGFmdGVyIHRoZSBldmVudCBlbmRzLiBUaGUgY2FsbGVyIGNhbm5vdApyZWRpcmVjdCBmdW5kczogdGhlIGltbXV0YWJsZSBldmVudCBiZW5lZmljaWFyeSBhbHdheXMgcmVjZWl2ZXMgdGhlIGRlcG9zaXQuAAAAAAANc3dlZXBfbm9fc2hvdwAAAAAAAAIAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAAAAAAACGF0dGVuZGVlAAAAEwAAAAEAAAPpAAAH0AAAAAtSZXNlcnZhdGlvbgAAAAfQAAAACVJzdnBFcnJvcgAAAA==",
        "AAAABQAAAAAAAAAAAAAAFFJlc2VydmF0aW9uQ2FuY2VsbGVkAAAAAgAAAARyc3ZwAAAAEmF0dGVuZGVlX2NhbmNlbGxlZAAAAAAABAAAAAAAAAAIZXZlbnRfaWQAAAPuAAAAIAAAAAEAAAAAAAAACGF0dGVuZGVlAAAAEwAAAAEAAAAAAAAAD2F0dGVuZGVlX3JlZnVuZAAAAAALAAAAAAAAAAAAAAATYmVuZWZpY2lhcnlfcGF5bWVudAAAAAALAAAAAAAAAAI=",
        "AAAAAAAAAFhEZXJpdmUgdGhlIGV2ZW50IElEIGZvciB0aGlzIG9yZ2FuaXplciwgZXhhY3QgaW1tdXRhYmxlIGNvbmZpZywgbmV0d29yaywgYW5kIGRlcGxveW1lbnQuAAAAD2Rlcml2ZV9ldmVudF9pZAAAAAACAAAAAAAAAAlvcmdhbml6ZXIAAAAAAAATAAAAAAAAAAZjb25maWcAAAAAB9AAAAALRXZlbnRDb25maWcAAAAAAQAAA+4AAAAg",
        "AAAAAAAAAAAAAAAPZ2V0X3Jlc2VydmF0aW9uAAAAAAIAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAAAAAAACGF0dGVuZGVlAAAAEwAAAAEAAAPpAAAH0AAAAAtSZXNlcnZhdGlvbgAAAAfQAAAACVJzdnBFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAAPaGFzX3Jlc2VydmF0aW9uAAAAAAIAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAAAAAAACGF0dGVuZGVlAAAAEwAAAAEAAAAB",
        "AAAAAAAAAFVSZXR1cm4gdGhlIGV4YWN0IGNhbm9uaWNhbCBYRFIgYnl0ZXMgYSBzY2FubmVyIHNpZ25zIGZvciB0aGlzIGRlcGxveW1lbnQgYW5kIG5ldHdvcmsuAAAAAAAAD3ZvdWNoZXJfbWVzc2FnZQAAAAABAAAAAAAAAAd2b3VjaGVyAAAAB9AAAAAOQ2hlY2tJblZvdWNoZXIAAAAAAAEAAAAO",
        "AAAAAAAAAEFSZXR1cm4gdGhlIHNvbGUgdG9rZW4gYWNjZXB0ZWQgYnkgZXZlcnkgZXZlbnQgaW4gdGhpcyBkZXBsb3ltZW50LgAAAAAAABFnZXRfZGVwb3NpdF90b2tlbgAAAAAAAAAAAAABAAAAEw==",
        "AAAAAAAAAKJDYW5jZWwgYW4gUlNWUCBiZWZvcmUgdGhlIGV2ZW50IHN0YXJ0cy4gVGhlIGV2ZW50J3MgaW1tdXRhYmxlIHBvbGljeSBkZXRlcm1pbmVzIHdoZXRoZXIKdGhlIGRlcG9zaXQgcmV0dXJucyB0byB0aGUgYXR0ZW5kZWUgb3IgaXMgcGFpZCB0byB0aGUgbm8tc2hvdyBiZW5lZmljaWFyeS4AAAAAABJjYW5jZWxfcmVzZXJ2YXRpb24AAAAAAAIAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAAAAAAACGF0dGVuZGVlAAAAEwAAAAEAAAPpAAAH0AAAAAtSZXNlcnZhdGlvbgAAAAfQAAAACVJzdnBFcnJvcgAAAA==",
        "AAAAAAAAAItDbGFpbSBvbmUgZGVwb3NpdCBhZnRlciBhbiBvcmdhbml6ZXIgY2FuY2VsbGF0aW9uLiBPbmx5IHRoZSBhdHRlbmRlZSBjYW4gYXV0aG9yaXplIHRoZQpjbGFpbSwgYW5kIHRlcm1pbmFsIHJlc2VydmF0aW9ucyBjYW5ub3QgY2xhaW0gdHdpY2UuAAAAABJjbGFpbV9ldmVudF9yZWZ1bmQAAAAAAAIAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAAAAAAACGF0dGVuZGVlAAAAEwAAAAEAAAPpAAAH0AAAAAtSZXNlcnZhdGlvbgAAAAfQAAAACVJzdnBFcnJvcgAAAA==",
        "AAAAAAAAAKRSb3RhdGUgdGhlIGV2ZW50LXNjb3BlZCBzY2FubmVyIGtleSBiZWZvcmUgY2hlY2staW4gc3RhcnRzLiBUaGUga2V5IGlzIGZyb3plbiBhdApgc3RhcnRfYXRgLCBwcmV2ZW50aW5nIGEgbGF0ZSBvcmdhbml6ZXIga2V5IHN3YXAgZnJvbSBpbnZhbGlkYXRpbmcgaXNzdWVkIHZvdWNoZXJzLgAAABJ1cGRhdGVfc2Nhbm5lcl9rZXkAAAAAAAMAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAAAAAAAEnNjYW5uZXJfcHVibGljX2tleQAAAAAD7gAAACAAAAABAAAD6QAAB9AAAAAJUnN2cEV2ZW50AAAAAAAH0AAAAAlSc3ZwRXJyb3IAAAA=",
        "AAAAAAAAAQBWZXJpZnkgYW4gYXR0ZW5kZWUtYm91bmQgc2Nhbm5lciB2b3VjaGVyIGFuZCBhdG9taWNhbGx5IHJldHVybiB0aGUgZnVsbCBkZXBvc2l0LgoKSW52YWxpZCBFZDI1NTE5IHNpZ25hdHVyZXMgZmFpbCB0aGUgaW52b2NhdGlvbiBhdCB0aGUgaG9zdCBsZXZlbC4gVGhlIGF0dGVuZGVlIHN0aWxsIGhhcwp0byBhdXRob3JpemUgdGhpcyBjYWxsLCBhbmQgdGhlIHZvdWNoZXIgbm9uY2UgaXMgcGVyc2lzdGVkIGJlZm9yZSB0aGUgdG9rZW4gdHJhbnNmZXIuAAAAFWNsYWltX2NoZWNrX2luX3JlZnVuZAAAAAAAAAQAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAAAAAAACGF0dGVuZGVlAAAAEwAAAAAAAAAHdm91Y2hlcgAAAAfQAAAADkNoZWNrSW5Wb3VjaGVyAAAAAAAAAAAACXNpZ25hdHVyZQAAAAAAA+4AAABAAAAAAQAAA+kAAAfQAAAAC1Jlc2VydmF0aW9uAAAAB9AAAAAJUnN2cEVycm9yAAAA" ]),
      options
    )
  }
  public readonly fromJSON = {
    reserve: this.txFromJSON<Result<Reservation>>,
        get_event: this.txFromJSON<Result<RsvpEvent>>,
        has_event: this.txFromJSON<boolean>,
        cancel_event: this.txFromJSON<Result<RsvpEvent>>,
        create_event: this.txFromJSON<Result<RsvpEvent>>,
        is_nonce_used: this.txFromJSON<boolean>,
        sweep_no_show: this.txFromJSON<Result<Reservation>>,
        derive_event_id: this.txFromJSON<Buffer>,
        get_reservation: this.txFromJSON<Result<Reservation>>,
        has_reservation: this.txFromJSON<boolean>,
        voucher_message: this.txFromJSON<Buffer>,
        get_deposit_token: this.txFromJSON<string>,
        cancel_reservation: this.txFromJSON<Result<Reservation>>,
        claim_event_refund: this.txFromJSON<Result<Reservation>>,
        update_scanner_key: this.txFromJSON<Result<RsvpEvent>>,
        claim_check_in_refund: this.txFromJSON<Result<Reservation>>
  }
}