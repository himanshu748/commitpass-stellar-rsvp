import {
  asHex32,
  asHex64,
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToUtf8,
  concatBytes,
  hexToBytes,
  lengthPrefixed,
  secureRandomBytes,
  sha256,
  uint64Bytes,
  utf8ToBytes,
} from "./bytes";
import {
  CommitPassError,
  isHex32,
  isHex64,
  isStellarAddress,
  isUnixSeconds,
  type AttendeePass,
  type CheckInVoucher,
  type Hex32,
  type Hex64,
  type StellarAddress,
  type UnixSeconds,
} from "./domain";
import {
  verifyScannerSignature,
  type ScannerSigner,
} from "./scanner-crypto";

const ATTENDEE_PASS_PREFIX = "commitpass:pass:v1:";
const SIGNED_VOUCHER_PREFIX = "commitpass:voucher:v1:";
const MAX_QR_PAYLOAD_LENGTH = 4_096;
const CHECK_IN_DOMAIN_TEXT = "COMMITPASS_CHECKIN_V1";

export const CHECK_IN_DOMAIN_BYTES = (() => {
  const text = utf8ToBytes(CHECK_IN_DOMAIN_TEXT);
  const domain = new Uint8Array(32);
  domain.set(text);
  return domain;
})();

export const CHECK_IN_DOMAIN_HEX: Hex32 = asHex32(CHECK_IN_DOMAIN_BYTES);

export interface VoucherSigningContext {
  networkId: Hex32;
  contractId: StellarAddress;
}

export type VoucherMessageEncoding =
  | "commitpass-intent-v1"
  | "soroban-xdr";

export interface SignedCheckInVoucher {
  kind: "commitpass-check-in-voucher";
  version: 1;
  encoding: VoucherMessageEncoding;
  context: VoucherSigningContext;
  voucher: CheckInVoucher;
  signature: Hex64;
}

export type VoucherMessageProvider = (
  voucher: CheckInVoucher,
) => Promise<Uint8Array>;

export type VoucherVerificationFailure =
  | "VoucherMismatch"
  | "CheckInNotOpen"
  | "CheckInClosed"
  | "InvalidVoucherTime"
  | "VoucherExpired"
  | "InvalidVoucherSignature"
  | "InvalidVoucher";

export type VoucherVerificationResult =
  | { ok: true; voucher: CheckInVoucher }
  | { ok: false; reason: VoucherVerificationFailure };

export function createAttendeePass(input: {
  eventId: Hex32;
  attendee: StellarAddress;
  issuedAt: UnixSeconds;
  randomBytes?: (length: number) => Uint8Array;
}): AttendeePass {
  const pass: AttendeePass = {
    kind: "commitpass-attendee-pass",
    version: 1,
    eventId: input.eventId.toLowerCase(),
    attendee: input.attendee,
    nonce: asHex32((input.randomBytes ?? secureRandomBytes)(32)),
    issuedAt: input.issuedAt,
  };
  if (!isAttendeePass(pass)) {
    throw new CommitPassError(
      "InvalidAttendeePass",
      "The attendee pass fields are invalid.",
    );
  }
  return pass;
}

export function encodeAttendeePass(pass: AttendeePass): string {
  if (!isAttendeePass(pass)) {
    throw new CommitPassError(
      "InvalidAttendeePass",
      "Refusing to encode an invalid attendee pass.",
    );
  }
  return `${ATTENDEE_PASS_PREFIX}${encodeJson(pass)}`;
}

export function decodeAttendeePass(encoded: string): AttendeePass {
  const parsed = decodePrefixedJson(encoded, ATTENDEE_PASS_PREFIX);
  if (!isAttendeePass(parsed)) {
    throw new CommitPassError(
      "InvalidAttendeePass",
      "The scanned attendee pass is malformed or unsupported.",
    );
  }
  return parsed;
}

export function createCheckInVoucher(input: {
  pass: AttendeePass;
  checkedInAt: UnixSeconds;
  checkInDeadline: UnixSeconds;
  ttlSeconds?: number;
}): CheckInVoucher {
  if (!isAttendeePass(input.pass)) {
    throw new CommitPassError(
      "InvalidAttendeePass",
      "Cannot issue a voucher for an invalid attendee pass.",
    );
  }
  const ttlSeconds = input.ttlSeconds ?? 60;
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new RangeError("Voucher TTL must be a positive number of seconds.");
  }
  if (input.checkedInAt > input.checkInDeadline) {
    throw new CommitPassError(
      "InvalidVoucher",
      "Check-in has already closed for this event.",
    );
  }
  return {
    eventId: input.pass.eventId,
    attendee: input.pass.attendee,
    nonce: input.pass.nonce,
    checkedInAt: input.checkedInAt,
    expiresAt: Math.min(
      input.checkedInAt + ttlSeconds,
      input.checkInDeadline,
    ),
  };
}

/**
 * Returns a deterministic, domain/network/contract/event/attendee/nonce/time
 * bound message for local demo verification.
 *
 * This is deliberately labelled `commitpass-intent-v1`: it models the same
 * anti-replay domains as the contract but is not Soroban contracttype XDR. For
 * real claims, use `voucher_message` through the generated contract binding and
 * pass those exact bytes to `signCheckInVoucher`.
 */
export function encodeIntentBoundVoucherMessage(
  context: VoucherSigningContext,
  voucher: CheckInVoucher,
): Uint8Array {
  if (!isVoucherSigningContext(context) || !isCheckInVoucher(voucher)) {
    throw new CommitPassError(
      "InvalidVoucher",
      "Voucher signing input is malformed.",
    );
  }
  return concatBytes(
    utf8ToBytes("COMMITPASS_INTENT_V1"),
    CHECK_IN_DOMAIN_BYTES,
    hexToBytes(context.networkId, 32),
    lengthPrefixed(utf8ToBytes(context.contractId)),
    hexToBytes(voucher.eventId, 32),
    lengthPrefixed(utf8ToBytes(voucher.attendee)),
    hexToBytes(voucher.nonce, 32),
    uint64Bytes(BigInt(voucher.checkedInAt)),
    uint64Bytes(BigInt(voucher.expiresAt)),
  );
}

export function intentVoucherMessageProvider(
  context: VoucherSigningContext,
): VoucherMessageProvider {
  return async (voucher) => encodeIntentBoundVoucherMessage(context, voucher);
}

export async function networkIdFromPassphrase(
  networkPassphrase: string,
): Promise<Hex32> {
  if (!networkPassphrase.trim()) {
    throw new TypeError("Network passphrase cannot be empty.");
  }
  return asHex32(await sha256(utf8ToBytes(networkPassphrase)));
}

export async function signCheckInVoucher(input: {
  voucher: CheckInVoucher;
  context: VoucherSigningContext;
  signer: ScannerSigner;
  messageProvider: VoucherMessageProvider;
  encoding: VoucherMessageEncoding;
}): Promise<SignedCheckInVoucher> {
  if (
    !isCheckInVoucher(input.voucher) ||
    !isVoucherSigningContext(input.context)
  ) {
    throw new CommitPassError(
      "InvalidVoucher",
      "Voucher signing input is malformed.",
    );
  }
  const message = await input.messageProvider(input.voucher);
  const signature = await input.signer.sign(message);
  return {
    kind: "commitpass-check-in-voucher",
    version: 1,
    encoding: input.encoding,
    context: input.context,
    voucher: input.voucher,
    signature: asHex64(signature),
  };
}

export async function verifySignedCheckInVoucher(input: {
  signedVoucher: SignedCheckInVoucher;
  expectedContext: VoucherSigningContext;
  expectedEventId: Hex32;
  expectedAttendee: StellarAddress;
  scannerPublicKey: Uint8Array;
  eventStartAt: UnixSeconds;
  checkInDeadline: UnixSeconds;
  now: UnixSeconds;
  messageProvider: VoucherMessageProvider;
}): Promise<VoucherVerificationResult> {
  const envelope = input.signedVoucher;
  if (
    !isSignedCheckInVoucher(envelope) ||
    !isVoucherSigningContext(input.expectedContext)
  ) {
    return { ok: false, reason: "InvalidVoucher" };
  }
  const voucher = envelope.voucher;
  if (
    envelope.context.networkId.toLowerCase() !==
      input.expectedContext.networkId.toLowerCase() ||
    envelope.context.contractId !== input.expectedContext.contractId ||
    voucher.eventId.toLowerCase() !== input.expectedEventId.toLowerCase() ||
    voucher.attendee !== input.expectedAttendee
  ) {
    return { ok: false, reason: "VoucherMismatch" };
  }
  if (input.now < input.eventStartAt) {
    return { ok: false, reason: "CheckInNotOpen" };
  }
  if (input.now > input.checkInDeadline) {
    return { ok: false, reason: "CheckInClosed" };
  }
  if (
    voucher.checkedInAt < input.eventStartAt ||
    voucher.checkedInAt > input.now ||
    voucher.checkedInAt > input.checkInDeadline ||
    voucher.expiresAt < voucher.checkedInAt ||
    voucher.expiresAt > input.checkInDeadline
  ) {
    return { ok: false, reason: "InvalidVoucherTime" };
  }
  if (input.now > voucher.expiresAt) {
    return { ok: false, reason: "VoucherExpired" };
  }
  const message = await input.messageProvider(voucher);
  const signatureIsValid = await verifyScannerSignature(
    hexToBytes(envelope.signature, 64),
    message,
    input.scannerPublicKey,
  );
  return signatureIsValid
    ? { ok: true, voucher }
    : { ok: false, reason: "InvalidVoucherSignature" };
}

export function encodeSignedCheckInVoucher(
  signedVoucher: SignedCheckInVoucher,
): string {
  if (!isSignedCheckInVoucher(signedVoucher)) {
    throw new CommitPassError(
      "InvalidVoucher",
      "Refusing to encode an invalid signed voucher.",
    );
  }
  return `${SIGNED_VOUCHER_PREFIX}${encodeJson(signedVoucher)}`;
}

export function decodeSignedCheckInVoucher(
  encoded: string,
): SignedCheckInVoucher {
  const parsed = decodePrefixedJson(encoded, SIGNED_VOUCHER_PREFIX);
  if (!isSignedCheckInVoucher(parsed)) {
    throw new CommitPassError(
      "InvalidVoucher",
      "The signed voucher is malformed or unsupported.",
    );
  }
  return parsed;
}

export function isAttendeePass(value: unknown): value is AttendeePass {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.kind === "commitpass-attendee-pass" &&
    value.version === 1 &&
    isHex32(value.eventId) &&
    isStellarAddress(value.attendee) &&
    isHex32(value.nonce) &&
    isUnixSeconds(value.issuedAt)
  );
}

export function isCheckInVoucher(value: unknown): value is CheckInVoucher {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isHex32(value.eventId) &&
    isStellarAddress(value.attendee) &&
    isHex32(value.nonce) &&
    isUnixSeconds(value.checkedInAt) &&
    isUnixSeconds(value.expiresAt)
  );
}

export function isSignedCheckInVoucher(
  value: unknown,
): value is SignedCheckInVoucher {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.kind === "commitpass-check-in-voucher" &&
    value.version === 1 &&
    (value.encoding === "commitpass-intent-v1" ||
      value.encoding === "soroban-xdr") &&
    isVoucherSigningContext(value.context) &&
    isCheckInVoucher(value.voucher) &&
    isHex64(value.signature)
  );
}

function isVoucherSigningContext(
  value: unknown,
): value is VoucherSigningContext {
  if (!isRecord(value)) {
    return false;
  }
  return isHex32(value.networkId) && isStellarAddress(value.contractId);
}

function encodeJson(value: unknown): string {
  return bytesToBase64Url(utf8ToBytes(JSON.stringify(value)));
}

function decodePrefixedJson(value: string, prefix: string): unknown {
  if (
    value.length > MAX_QR_PAYLOAD_LENGTH ||
    !value.startsWith(prefix)
  ) {
    return undefined;
  }
  try {
    return JSON.parse(
      bytesToUtf8(base64UrlToBytes(value.slice(prefix.length))),
    ) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
