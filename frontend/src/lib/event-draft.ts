import {
  EVENT_DRAFT_SCHEMA,
  EVENT_DRAFT_VERSION,
  EventDraftValidationError,
  validateEventDraft,
  type EventDraft,
} from "./event-metadata";
import {
  StorageValidationError,
  type StorageCodec,
} from "./storage";

export const MAX_SERIALIZED_EVENT_DRAFT_BYTES = 16_384;

const TOP_LEVEL_KEYS = [
  "capacity",
  "deposit",
  "name",
  "noShowBeneficiary",
  "organizerName",
  "schedule",
  "schema",
  "summary",
  "venue",
  "version",
] as const;
const VENUE_KEYS = ["address", "city", "name"] as const;
const SCHEDULE_KEYS = [
  "checkInDeadline",
  "endAt",
  "startAt",
  "timezone",
] as const;
const DEPOSIT_KEYS = ["amount", "asset"] as const;

export function serializeEventDraft(draftInput: EventDraft): string {
  const draft = validateEventDraft(draftInput);
  return JSON.stringify({
    schema: EVENT_DRAFT_SCHEMA,
    version: EVENT_DRAFT_VERSION,
    name: draft.name,
    summary: draft.summary,
    organizerName: draft.organizerName,
    venue: {
      name: draft.venue.name,
      city: draft.venue.city,
      ...(draft.venue.address ? { address: draft.venue.address } : {}),
    },
    schedule: {
      timezone: draft.schedule.timezone,
      startAt: draft.schedule.startAt,
      checkInDeadline: draft.schedule.checkInDeadline,
      endAt: draft.schedule.endAt,
    },
    capacity: draft.capacity,
    deposit: {
      asset: "XLM",
      amount: draft.deposit.amount,
    },
    noShowBeneficiary: draft.noShowBeneficiary,
  });
}

export function deserializeEventDraft(serialized: string): EventDraft {
  if (
    typeof serialized !== "string" ||
    new TextEncoder().encode(serialized).byteLength >
      MAX_SERIALIZED_EVENT_DRAFT_BYTES
  ) {
    throw new StorageValidationError(
      "Stored event draft exceeded the safe size limit.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (cause) {
    throw new StorageValidationError("Stored event draft was not valid JSON.", undefined, {
      cause,
    });
  }

  try {
    assertPersistedShape(parsed);
    return validateEventDraft(parsed);
  } catch (cause) {
    if (cause instanceof StorageValidationError) {
      throw cause;
    }
    if (cause instanceof EventDraftValidationError) {
      throw new StorageValidationError(
        "Stored event draft did not match the expected schema.",
        undefined,
        { cause },
      );
    }
    throw new StorageValidationError(
      "Stored event draft could not be validated safely.",
      undefined,
      { cause },
    );
  }
}

export const EVENT_DRAFT_STORAGE_CODEC: StorageCodec<EventDraft> = {
  encode: serializeEventDraft,
  decode: deserializeEventDraft,
};

function assertPersistedShape(value: unknown): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new StorageValidationError("Stored event draft must be an object.");
  }
  assertOnlyKeys(value, TOP_LEVEL_KEYS, "event draft");
  if (
    value.schema !== EVENT_DRAFT_SCHEMA ||
    value.version !== EVENT_DRAFT_VERSION
  ) {
    throw new StorageValidationError(
      "Stored event draft uses an unsupported schema version.",
    );
  }
  if (!isPlainRecord(value.venue)) {
    throw new StorageValidationError("Stored event venue must be an object.");
  }
  assertOnlyKeys(value.venue, VENUE_KEYS, "event venue");
  if (!isPlainRecord(value.schedule)) {
    throw new StorageValidationError("Stored event schedule must be an object.");
  }
  assertOnlyKeys(value.schedule, SCHEDULE_KEYS, "event schedule");
  if (!isPlainRecord(value.deposit)) {
    throw new StorageValidationError("Stored event deposit must be an object.");
  }
  assertOnlyKeys(value.deposit, DEPOSIT_KEYS, "event deposit");
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new StorageValidationError(
      `Stored ${label} contained unsupported fields.`,
    );
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}
