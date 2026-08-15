import { describe, expect, it } from "vitest";

import {
  createPilotFeedback,
  pilotFeedbackCodec,
  summarizePilotFeedback,
  upsertPilotFeedback,
} from "../pilot-feedback";
import {
  DEMO_ATTENDEE_ADDRESS,
  DEMO_ORGANIZER_ADDRESS,
  SEED_EVENT_ID,
} from "../seed";

describe("pilot feedback", () => {
  it("validates and normalizes a privacy-conscious response", () => {
    const response = createPilotFeedback(
      {
        eventId: SEED_EVENT_ID,
        role: "attendee",
        rating: 4,
        friction: "wallet",
        reuseIntent: "yes",
        comment: "  Wallet setup took a minute.  ",
        wallet: DEMO_ATTENDEE_ADDRESS,
      },
      { id: "feedback-1", submittedAt: "2026-08-15T08:00:00.000Z" },
    );

    expect(response).toEqual({
      schemaVersion: 1,
      id: "feedback-1",
      eventId: SEED_EVENT_ID,
      role: "attendee",
      rating: 4,
      friction: "wallet",
      reuseIntent: "yes",
      comment: "Wallet setup took a minute.",
      wallet: DEMO_ATTENDEE_ADDRESS,
      submittedAt: "2026-08-15T08:00:00.000Z",
    });
  });

  it("rejects invalid ratings, event IDs and wallet addresses", () => {
    const valid = {
      eventId: SEED_EVENT_ID,
      role: "attendee" as const,
      rating: 5,
      friction: "none" as const,
      reuseIntent: "yes" as const,
    };

    expect(() =>
      createPilotFeedback({ ...valid, rating: 0 }),
    ).toThrow("rating must be an integer from 1 to 5");
    expect(() =>
      createPilotFeedback({ ...valid, eventId: "not-an-event" }),
    ).toThrow("eventId must be a 32-byte hexadecimal value");
    expect(() =>
      createPilotFeedback({ ...valid, wallet: "not-a-wallet" }),
    ).toThrow("wallet must be a valid Stellar address");
  });

  it("updates one wallet response without inflating feedback counts", () => {
    const first = createPilotFeedback(
      {
        eventId: SEED_EVENT_ID,
        role: "attendee",
        rating: 3,
        friction: "reservation",
        reuseIntent: "unsure",
        wallet: DEMO_ATTENDEE_ADDRESS,
      },
      { id: "first", submittedAt: "2026-08-15T08:00:00.000Z" },
    );
    const revised = createPilotFeedback(
      {
        eventId: SEED_EVENT_ID,
        role: "attendee",
        rating: 5,
        friction: "none",
        reuseIntent: "yes",
        wallet: DEMO_ATTENDEE_ADDRESS,
      },
      { id: "revised", submittedAt: "2026-08-15T08:05:00.000Z" },
    );

    expect(upsertPilotFeedback([first], revised)).toEqual([revised]);
  });

  it("round-trips valid storage and summarizes real responses", () => {
    const attendee = createPilotFeedback(
      {
        eventId: SEED_EVENT_ID,
        role: "attendee",
        rating: 5,
        friction: "wallet",
        reuseIntent: "yes",
        wallet: DEMO_ATTENDEE_ADDRESS,
      },
      { id: "attendee", submittedAt: "2026-08-15T08:00:00.000Z" },
    );
    const organizer = createPilotFeedback(
      {
        eventId: SEED_EVENT_ID,
        role: "organizer",
        rating: 3,
        friction: "check-in",
        reuseIntent: "unsure",
        wallet: DEMO_ORGANIZER_ADDRESS,
      },
      { id: "organizer", submittedAt: "2026-08-15T08:10:00.000Z" },
    );
    const encoded = pilotFeedbackCodec.encode([attendee, organizer]);

    expect(pilotFeedbackCodec.decode(encoded)).toEqual([
      attendee,
      organizer,
    ]);
    expect(summarizePilotFeedback([attendee, organizer])).toEqual({
      responses: 2,
      averageRating: 4,
      wouldReuse: 1,
      topFriction: "wallet",
      byRole: { attendee: 1, organizer: 1 },
    });
  });
});
