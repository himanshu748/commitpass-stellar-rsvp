import { asHex32, sha256, utf8ToBytes } from "./bytes";
import {
  isStellarAddress,
  type Hex32,
  type StellarAddress,
  type UnixSeconds,
} from "./domain";

export const EVENT_DRAFT_SCHEMA = "commitpass.event-draft" as const;
export const EVENT_DRAFT_VERSION = 1 as const;
export const EVENT_METADATA_SCHEMA = "commitpass.event-metadata" as const;
export const EVENT_METADATA_VERSION = 1 as const;

const MAX_U32 = 0xffff_ffff;
const MAX_I128 = (1n << 127n) - 1n;
const XLM_SCALE = 10_000_000n;
const OFFSET_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.0{1,3})?)?(Z|[+-]\d{2}:\d{2})$/u;
const XLM_AMOUNT = /^(\d+)(?:\.(\d{1,7}))?$/u;

export interface EventDraftInput {
  name: string;
  summary: string;
  organizerName: string;
  venue: {
    name: string;
    city: string;
    address?: string;
  };
  schedule: {
    timezone: string;
    startAt: string;
    checkInDeadline: string;
    endAt: string;
  };
  capacity: number;
  deposit: {
    asset: "XLM";
    amount: string;
  };
  noShowBeneficiary: StellarAddress;
}

export interface EventDraft {
  readonly schema: typeof EVENT_DRAFT_SCHEMA;
  readonly version: typeof EVENT_DRAFT_VERSION;
  readonly name: string;
  readonly summary: string;
  readonly organizerName: string;
  readonly venue: {
    readonly name: string;
    readonly city: string;
    readonly address?: string;
  };
  readonly schedule: {
    readonly timezone: string;
    readonly startAt: string;
    readonly checkInDeadline: string;
    readonly endAt: string;
  };
  readonly capacity: number;
  readonly deposit: {
    readonly asset: "XLM";
    readonly amount: string;
  };
  readonly noShowBeneficiary: StellarAddress;
}

export interface EventDraftValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class EventDraftValidationError extends Error {
  readonly issues: readonly EventDraftValidationIssue[];

  constructor(issues: readonly EventDraftValidationIssue[]) {
    super("Event draft validation failed.");
    this.name = "EventDraftValidationError";
    this.issues = [...issues];
  }
}

export interface CanonicalEventMetadata {
  readonly schema: typeof EVENT_METADATA_SCHEMA;
  readonly version: typeof EVENT_METADATA_VERSION;
  readonly name: string;
  readonly summary: string;
  readonly organizerName: string;
  readonly venue: {
    readonly name: string;
    readonly city: string;
    readonly address?: string;
  };
  readonly schedule: EventDraft["schedule"];
  readonly capacity: number;
  readonly deposit: {
    readonly asset: "XLM";
    readonly amountStroops: string;
  };
  readonly beneficiary: StellarAddress;
}

export function validateEventDraft(input: unknown): EventDraft {
  const issues: EventDraftValidationIssue[] = [];
  const record = readRecord(input, "$", issues);

  const name = readText(record?.name, "name", 120, issues);
  const summary = readText(record?.summary, "summary", 500, issues);
  const organizerName = readText(
    record?.organizerName,
    "organizerName",
    120,
    issues,
  );

  const venueRecord = readRecord(record?.venue, "venue", issues);
  const venueName = readText(venueRecord?.name, "venue.name", 160, issues);
  const venueCity = readText(venueRecord?.city, "venue.city", 120, issues);
  const venueAddress = readOptionalText(
    venueRecord?.address,
    "venue.address",
    240,
    issues,
  );

  const scheduleRecord = readRecord(record?.schedule, "schedule", issues);
  const timezone = readText(
    scheduleRecord?.timezone,
    "schedule.timezone",
    100,
    issues,
  );
  if (timezone && !isValidTimezone(timezone)) {
    issues.push({
      path: "schedule.timezone",
      message: "Use a valid IANA timezone such as Asia/Kolkata.",
    });
  }
  const startAt = readOffsetInstant(
    scheduleRecord?.startAt,
    "schedule.startAt",
    issues,
  );
  const checkInDeadline = readOffsetInstant(
    scheduleRecord?.checkInDeadline,
    "schedule.checkInDeadline",
    issues,
  );
  const endAt = readOffsetInstant(
    scheduleRecord?.endAt,
    "schedule.endAt",
    issues,
  );

  if (
    startAt &&
    checkInDeadline &&
    Date.parse(checkInDeadline) < Date.parse(startAt)
  ) {
    issues.push({
      path: "schedule.checkInDeadline",
      message: "Check-in cannot close before the event starts.",
    });
  }
  if (
    checkInDeadline &&
    endAt &&
    Date.parse(endAt) <= Date.parse(checkInDeadline)
  ) {
    issues.push({
      path: "schedule.endAt",
      message: "The event must end after check-in closes.",
    });
  }

  const capacity = readCapacity(record?.capacity, issues);
  const depositRecord = readRecord(record?.deposit, "deposit", issues);
  const depositAsset = depositRecord?.asset;
  if (depositAsset !== "XLM") {
    issues.push({
      path: "deposit.asset",
      message: "CommitPass events currently accept XLM deposits only.",
    });
  }
  const deposit = readXlmAmount(depositRecord?.amount, issues);

  const beneficiary = normalizeText(record?.noShowBeneficiary);
  if (!beneficiary || !isStellarAddress(beneficiary)) {
    issues.push({
      path: "noShowBeneficiary",
      message: "Use a valid Stellar account or contract address.",
    });
  }

  if (issues.length > 0) {
    throw new EventDraftValidationError(issues);
  }

  return {
    schema: EVENT_DRAFT_SCHEMA,
    version: EVENT_DRAFT_VERSION,
    name: name!,
    summary: summary!,
    organizerName: organizerName!,
    venue: {
      name: venueName!,
      city: venueCity!,
      ...(venueAddress ? { address: venueAddress } : {}),
    },
    schedule: {
      timezone: timezone!,
      startAt: startAt!,
      checkInDeadline: checkInDeadline!,
      endAt: endAt!,
    },
    capacity: capacity!,
    deposit: {
      asset: "XLM",
      amount: deposit!.amount,
    },
    noShowBeneficiary: beneficiary! as StellarAddress,
  };
}

export function eventXlmDepositStroops(
  draft: Pick<EventDraft, "deposit">,
): bigint {
  const parsed = parseXlmAmount(draft.deposit.amount);
  if (!parsed || parsed.stroops <= 0n || parsed.stroops > MAX_I128) {
    throw new EventDraftValidationError([
      {
        path: "deposit.amount",
        message: "Deposit must be a positive XLM amount with at most 7 decimals.",
      },
    ]);
  }
  return parsed.stroops;
}

export function eventScheduleUnixSeconds(
  draft: Pick<EventDraft, "schedule">,
): {
  startAt: UnixSeconds;
  checkInDeadline: UnixSeconds;
  endAt: UnixSeconds;
} {
  return {
    startAt: Date.parse(draft.schedule.startAt) / 1_000,
    checkInDeadline: Date.parse(draft.schedule.checkInDeadline) / 1_000,
    endAt: Date.parse(draft.schedule.endAt) / 1_000,
  };
}

export function canonicalEventMetadata(
  draftInput: EventDraft,
): CanonicalEventMetadata {
  const draft = validateEventDraft(draftInput);
  return {
    schema: EVENT_METADATA_SCHEMA,
    version: EVENT_METADATA_VERSION,
    name: draft.name,
    summary: draft.summary,
    organizerName: draft.organizerName,
    venue: {
      name: draft.venue.name,
      city: draft.venue.city,
      ...(draft.venue.address ? { address: draft.venue.address } : {}),
    },
    schedule: { ...draft.schedule },
    capacity: draft.capacity,
    deposit: {
      asset: "XLM",
      amountStroops: eventXlmDepositStroops(draft).toString(),
    },
    beneficiary: draft.noShowBeneficiary,
  };
}

export function canonicalEventMetadataJson(draft: EventDraft): string {
  return canonicalJson(canonicalEventMetadata(draft));
}

export function canonicalEventMetadataBytes(draft: EventDraft): Uint8Array {
  return utf8ToBytes(canonicalEventMetadataJson(draft));
}

export async function eventMetadataHash(draft: EventDraft): Promise<Hex32> {
  return asHex32(await sha256(canonicalEventMetadataBytes(draft)));
}

function readRecord(
  value: unknown,
  path: string,
  issues: EventDraftValidationIssue[],
): Record<string, unknown> | undefined {
  if (!isPlainRecord(value)) {
    issues.push({ path, message: "Expected an object." });
    return undefined;
  }
  return value;
}

function readText(
  value: unknown,
  path: string,
  maximumLength: number,
  issues: EventDraftValidationIssue[],
): string | undefined {
  const normalized = normalizeText(value);
  if (!normalized) {
    issues.push({ path, message: "This field is required." });
    return undefined;
  }
  if ([...normalized].length > maximumLength) {
    issues.push({
      path,
      message: `Use ${maximumLength} characters or fewer.`,
    });
    return undefined;
  }
  return normalized;
}

function readOptionalText(
  value: unknown,
  path: string,
  maximumLength: number,
  issues: EventDraftValidationIssue[],
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    issues.push({ path, message: "Expected text." });
    return undefined;
  }
  const normalized = normalizeText(value);
  if (!normalized) {
    return undefined;
  }
  if ([...normalized].length > maximumLength) {
    issues.push({
      path,
      message: `Use ${maximumLength} characters or fewer.`,
    });
    return undefined;
  }
  return normalized;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

function readOffsetInstant(
  value: unknown,
  path: string,
  issues: EventDraftValidationIssue[],
): string | undefined {
  if (typeof value !== "string") {
    issues.push({ path, message: "Use an ISO 8601 date and time with an offset." });
    return undefined;
  }
  const match = OFFSET_INSTANT.exec(value.trim());
  if (!match || !validDateParts(match)) {
    issues.push({
      path,
      message: "Use an ISO 8601 date and time with Z or a numeric UTC offset.",
    });
    return undefined;
  }
  const milliseconds = Date.parse(value.trim());
  if (!Number.isFinite(milliseconds)) {
    issues.push({ path, message: "Use a real calendar date and time." });
    return undefined;
  }
  return new Date(milliseconds).toISOString();
}

function validDateParts(match: RegExpExecArray): boolean {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }
  const offset = match[7];
  if (offset === "Z") return true;
  const offsetHour = Number(offset.slice(1, 3));
  const offsetMinute = Number(offset.slice(4, 6));
  return offsetHour <= 23 && offsetMinute <= 59;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function readCapacity(
  value: unknown,
  issues: EventDraftValidationIssue[],
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_U32
  ) {
    issues.push({
      path: "capacity",
      message: "Capacity must be a positive whole number that fits on-chain.",
    });
    return undefined;
  }
  return value;
}

function readXlmAmount(
  value: unknown,
  issues: EventDraftValidationIssue[],
): { amount: string; stroops: bigint } | undefined {
  const parsed = typeof value === "string" ? parseXlmAmount(value.trim()) : null;
  if (!parsed || parsed.stroops <= 0n || parsed.stroops > MAX_I128) {
    issues.push({
      path: "deposit.amount",
      message: "Deposit must be a positive XLM amount with at most 7 decimals.",
    });
    return undefined;
  }
  return parsed;
}

function parseXlmAmount(
  amount: string,
): { amount: string; stroops: bigint } | null {
  const match = XLM_AMOUNT.exec(amount);
  if (!match || match[1].length > 40) return null;
  const whole = BigInt(match[1]);
  const fraction = match[2] ?? "";
  const stroops = whole * XLM_SCALE + BigInt(fraction.padEnd(7, "0") || "0");
  const canonicalFraction = fraction.replace(/0+$/u, "");
  return {
    amount: `${whole.toString()}${canonicalFraction ? `.${canonicalFraction}` : ""}`,
    stroops,
  };
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value) as string;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot contain a non-finite number.");
    }
    return JSON.stringify(value) as string;
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (!isPlainRecord(value)) {
    throw new TypeError("Canonical JSON supports plain data objects only.");
  }
  const object = value;
  const entries = Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`);
  return `{${entries.join(",")}}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}
