import { isHex32, isStellarAddress } from "./domain";
import { jsonStorageCodec } from "./storage";

const ROLES = ["attendee", "organizer"] as const;
const FRICTIONS = [
  "wallet",
  "reservation",
  "check-in",
  "refund",
  "none",
] as const;
const REUSE_INTENTS = ["yes", "no", "unsure"] as const;

export type PilotFeedbackRole = (typeof ROLES)[number];
export type PilotFeedbackFriction = (typeof FRICTIONS)[number];
export type PilotFeedbackReuseIntent = (typeof REUSE_INTENTS)[number];

export interface PilotFeedbackInput {
  eventId: string;
  role: PilotFeedbackRole;
  rating: number;
  friction: PilotFeedbackFriction;
  reuseIntent: PilotFeedbackReuseIntent;
  comment?: string;
  /** Optional public address used only to deduplicate one response per role. */
  wallet?: string;
}

export interface PilotFeedbackRecord extends PilotFeedbackInput {
  schemaVersion: 1;
  id: string;
  submittedAt: string;
}

export interface PilotFeedbackSummary {
  responses: number;
  averageRating: number | null;
  wouldReuse: number;
  topFriction: Exclude<PilotFeedbackFriction, "none"> | null;
  byRole: Record<PilotFeedbackRole, number>;
}

export const pilotFeedbackCodec = jsonStorageCodec<
  PilotFeedbackRecord[]
>(isPilotFeedbackCollection);

export function createPilotFeedback(
  input: PilotFeedbackInput,
  metadata: { id?: string; submittedAt?: string } = {},
): PilotFeedbackRecord {
  if (!isHex32(input.eventId)) {
    throw new TypeError("eventId must be a 32-byte hexadecimal value.");
  }
  if (!isOneOf(input.role, ROLES)) {
    throw new TypeError("role must be attendee or organizer.");
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new RangeError("rating must be an integer from 1 to 5.");
  }
  if (!isOneOf(input.friction, FRICTIONS)) {
    throw new TypeError("friction is not supported.");
  }
  if (!isOneOf(input.reuseIntent, REUSE_INTENTS)) {
    throw new TypeError("reuseIntent is not supported.");
  }
  const wallet = optionalText(input.wallet);
  if (wallet && !isStellarAddress(wallet)) {
    throw new TypeError("wallet must be a valid Stellar address.");
  }
  const comment = optionalText(input.comment);
  if (comment && comment.length > 500) {
    throw new RangeError("comment must be 500 characters or fewer.");
  }
  const id = optionalText(metadata.id) ?? crypto.randomUUID();
  const submittedAt = metadata.submittedAt ?? new Date().toISOString();
  if (!id) {
    throw new TypeError("feedback id must not be empty.");
  }
  if (!isIsoTimestamp(submittedAt)) {
    throw new TypeError("submittedAt must be a valid ISO timestamp.");
  }

  return {
    schemaVersion: 1,
    id,
    eventId: input.eventId.toLowerCase(),
    role: input.role,
    rating: input.rating,
    friction: input.friction,
    reuseIntent: input.reuseIntent,
    ...(comment ? { comment } : {}),
    ...(wallet ? { wallet } : {}),
    submittedAt,
  };
}

/**
 * Replaces a wallet's earlier response for the same event and role. Anonymous
 * responses are deduplicated by their generated id instead.
 */
export function upsertPilotFeedback(
  records: readonly PilotFeedbackRecord[],
  next: PilotFeedbackRecord,
): PilotFeedbackRecord[] {
  const key = responseKey(next);
  return [...records.filter((record) => responseKey(record) !== key), next];
}

export function summarizePilotFeedback(
  records: readonly PilotFeedbackRecord[],
): PilotFeedbackSummary {
  const byRole: Record<PilotFeedbackRole, number> = {
    attendee: 0,
    organizer: 0,
  };
  const frictionCounts = new Map<
    Exclude<PilotFeedbackFriction, "none">,
    number
  >();
  let ratingTotal = 0;
  let wouldReuse = 0;

  for (const record of records) {
    byRole[record.role] += 1;
    ratingTotal += record.rating;
    if (record.reuseIntent === "yes") {
      wouldReuse += 1;
    }
    if (record.friction !== "none") {
      frictionCounts.set(
        record.friction,
        (frictionCounts.get(record.friction) ?? 0) + 1,
      );
    }
  }

  const rankedFriction = FRICTIONS.filter(
    (friction): friction is Exclude<PilotFeedbackFriction, "none"> =>
      friction !== "none",
  ).sort(
    (left, right) =>
      (frictionCounts.get(right) ?? 0) -
      (frictionCounts.get(left) ?? 0),
  );
  const topFriction = rankedFriction.find(
    (friction) => (frictionCounts.get(friction) ?? 0) > 0,
  );

  return {
    responses: records.length,
    averageRating:
      records.length === 0
        ? null
        : Math.round((ratingTotal / records.length) * 10) / 10,
    wouldReuse,
    topFriction: topFriction ?? null,
    byRole,
  };
}

function responseKey(record: PilotFeedbackRecord): string {
  return record.wallet
    ? `${record.eventId}:${record.role}:${record.wallet}`
    : `anonymous:${record.id}`;
}

function isPilotFeedbackCollection(
  value: unknown,
): value is PilotFeedbackRecord[] {
  return Array.isArray(value) && value.every(isPilotFeedbackRecord);
}

function isPilotFeedbackRecord(value: unknown): value is PilotFeedbackRecord {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    isHex32(value.eventId) &&
    isOneOf(value.role, ROLES) &&
    Number.isInteger(value.rating) &&
    (value.rating as number) >= 1 &&
    (value.rating as number) <= 5 &&
    isOneOf(value.friction, FRICTIONS) &&
    isOneOf(value.reuseIntent, REUSE_INTENTS) &&
    (value.comment === undefined ||
      (typeof value.comment === "string" && value.comment.length <= 500)) &&
    (value.wallet === undefined || isStellarAddress(value.wallet)) &&
    isIsoTimestamp(value.submittedAt)
  );
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
