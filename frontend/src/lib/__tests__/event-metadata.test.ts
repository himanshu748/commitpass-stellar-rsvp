import { describe, expect, it } from "vitest";

import {
  EventDraftValidationError,
  canonicalEventMetadataBytes,
  canonicalEventMetadataJson,
  eventMetadataHash,
  eventScheduleUnixSeconds,
  eventXlmDepositStroops,
  validateEventDraft,
  type EventDraftInput,
} from "../event-metadata";
import { DEMO_BENEFICIARY_ADDRESS } from "../seed";

const VALID_INPUT: EventDraftInput = {
  name: "  Stellar   Builders Night  ",
  summary: "  A small refundable deposit keeps a free seat real.  ",
  organizerName: "  Stellar Bengaluru  ",
  venue: {
    name: "  Bangalore International Centre  ",
    city: "  Bengaluru  ",
    address: "  7 Domlur Road  ",
  },
  schedule: {
    timezone: "Asia/Kolkata",
    startAt: "2026-08-21T18:30:00+05:30",
    checkInDeadline: "2026-08-21T20:00:00+05:30",
    endAt: "2026-08-21T21:00:00+05:30",
  },
  capacity: 60,
  deposit: {
    asset: "XLM",
    amount: "2.0000000",
  },
  noShowBeneficiary: DEMO_BENEFICIARY_ADDRESS,
};

const EXPECTED_METADATA_JSON =
  `{"beneficiary":"${DEMO_BENEFICIARY_ADDRESS}","capacity":60,` +
  '"deposit":{"amountStroops":"20000000","asset":"XLM"},' +
  '"name":"Stellar Builders Night","organizerName":"Stellar Bengaluru",' +
  '"schedule":{"checkInDeadline":"2026-08-21T14:30:00.000Z",' +
  '"endAt":"2026-08-21T15:30:00.000Z",' +
  '"startAt":"2026-08-21T13:00:00.000Z","timezone":"Asia/Kolkata"},' +
  '"schema":"commitpass.event-metadata","summary":' +
  '"A small refundable deposit keeps a free seat real.",' +
  '"venue":{"address":"7 Domlur Road","city":"Bengaluru",' +
  '"name":"Bangalore International Centre"},"version":1}';

describe("event draft validation", () => {
  it("normalizes a production draft without losing contract precision", () => {
    const draft = validateEventDraft(VALID_INPUT);

    expect(draft).toEqual({
      schema: "commitpass.event-draft",
      version: 1,
      name: "Stellar Builders Night",
      summary: "A small refundable deposit keeps a free seat real.",
      organizerName: "Stellar Bengaluru",
      venue: {
        name: "Bangalore International Centre",
        city: "Bengaluru",
        address: "7 Domlur Road",
      },
      schedule: {
        timezone: "Asia/Kolkata",
        startAt: "2026-08-21T13:00:00.000Z",
        checkInDeadline: "2026-08-21T14:30:00.000Z",
        endAt: "2026-08-21T15:30:00.000Z",
      },
      capacity: 60,
      deposit: { asset: "XLM", amount: "2" },
      noShowBeneficiary: DEMO_BENEFICIARY_ADDRESS,
    });
    expect(eventXlmDepositStroops(draft)).toBe(20_000_000n);
    expect(eventScheduleUnixSeconds(draft)).toEqual({
      startAt: 1_787_317_200,
      checkInDeadline: 1_787_322_600,
      endAt: 1_787_326_200,
    });
  });

  it.each([
    ["name", { name: "   " }, "name"],
    ["venue", { venue: { ...VALID_INPUT.venue, name: "" } }, "venue.name"],
    [
      "timezone",
      { schedule: { ...VALID_INPUT.schedule, timezone: "Mars/Olympus" } },
      "schedule.timezone",
    ],
    [
      "offset-free schedule",
      { schedule: { ...VALID_INPUT.schedule, startAt: "2026-08-21T18:30" } },
      "schedule.startAt",
    ],
    [
      "schedule order",
      {
        schedule: {
          ...VALID_INPUT.schedule,
          checkInDeadline: "2026-08-21T17:30:00+05:30",
        },
      },
      "schedule.checkInDeadline",
    ],
    ["capacity", { capacity: 0 }, "capacity"],
    [
      "XLM deposit",
      { deposit: { asset: "XLM", amount: "0" } },
      "deposit.amount",
    ],
    [
      "stroop precision",
      { deposit: { asset: "XLM", amount: "0.00000001" } },
      "deposit.amount",
    ],
    ["beneficiary", { noShowBeneficiary: "not-an-address" }, "noShowBeneficiary"],
  ])("rejects an invalid %s", (_label, override, issuePath) => {
    const input = {
      ...VALID_INPUT,
      ...override,
    };

    try {
      validateEventDraft(input);
      expect.unreachable("Expected draft validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(EventDraftValidationError);
      expect((error as EventDraftValidationError).issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: issuePath })]),
      );
    }
  });
});

describe("canonical event metadata", () => {
  it("produces one stable UTF-8 document for the on-chain hash", () => {
    const draft = validateEventDraft(VALID_INPUT);

    expect(canonicalEventMetadataJson(draft)).toBe(EXPECTED_METADATA_JSON);
    expect(canonicalEventMetadataBytes(draft)).toEqual(
      new TextEncoder().encode(EXPECTED_METADATA_JSON),
    );
  });

  it("hashes the canonical document with SHA-256", async () => {
    const draft = validateEventDraft(VALID_INPUT);

    await expect(eventMetadataHash(draft)).resolves.toBe(
      "5f49084ddc84d4e5d6bda0117091233585288d708fe06816c395ea047cd2dccc",
    );
  });
});
