import { describe, expect, it } from "vitest";

import {
  EVENT_DRAFT_STORAGE_CODEC,
  MAX_SERIALIZED_EVENT_DRAFT_BYTES,
  deserializeEventDraft,
  serializeEventDraft,
} from "../event-draft";
import {
  EventDraftValidationError,
  validateEventDraft,
  type EventDraft,
  type EventDraftInput,
} from "../event-metadata";
import { DEMO_BENEFICIARY_ADDRESS } from "../seed";
import { StorageValidationError } from "../storage";

const VALID_INPUT: EventDraftInput = {
  name: "Stellar Builders Night",
  summary: "A small refundable deposit keeps a free seat real.",
  organizerName: "Stellar Bengaluru",
  venue: {
    name: "Bangalore International Centre",
    city: "Bengaluru",
  },
  schedule: {
    timezone: "Asia/Kolkata",
    startAt: "2026-08-21T18:30:00+05:30",
    checkInDeadline: "2026-08-21T20:00:00+05:30",
    endAt: "2026-08-21T21:00:00+05:30",
  },
  capacity: 60,
  deposit: { asset: "XLM", amount: "2" },
  noShowBeneficiary: DEMO_BENEFICIARY_ADDRESS,
};

describe("event draft persistence", () => {
  it("round-trips a validated draft through the versioned storage codec", () => {
    const draft = validateEventDraft(VALID_INPUT);
    const serialized = serializeEventDraft(draft);

    expect(deserializeEventDraft(serialized)).toEqual(draft);
    expect(EVENT_DRAFT_STORAGE_CODEC.encode(draft)).toBe(serialized);
    expect(EVENT_DRAFT_STORAGE_CODEC.decode(serialized)).toEqual(draft);
    expect(serialized).not.toContain("bigint");
  });

  it("validates a draft again before writing it", () => {
    const forged = {
      ...validateEventDraft(VALID_INPUT),
      noShowBeneficiary: "not-an-address",
    } as EventDraft;

    expect(() => serializeEventDraft(forged)).toThrowError(
      EventDraftValidationError,
    );
  });

  it.each([
    "not json",
    "null",
    '{"schema":"commitpass.event-draft","version":99}',
    '{"schema":"commitpass.event-draft","version":1,"__proto__":{}}',
  ])("rejects unsafe or incompatible stored data", (serialized) => {
    expect(() => EVENT_DRAFT_STORAGE_CODEC.decode(serialized)).toThrowError(
      StorageValidationError,
    );
  });

  it("rejects unknown fields and oversized storage payloads", () => {
    const valid = serializeEventDraft(validateEventDraft(VALID_INPUT));
    const withUnknownField = valid.replace(
      '"version":1',
      '"version":1,"scannerSecretKey":"do-not-store"',
    );

    expect(() => deserializeEventDraft(withUnknownField)).toThrowError(
      StorageValidationError,
    );
    expect(() =>
      deserializeEventDraft("x".repeat(MAX_SERIALIZED_EVENT_DRAFT_BYTES + 1)),
    ).toThrowError(StorageValidationError);
  });
});
