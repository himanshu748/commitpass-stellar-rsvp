import { describe, expect, it } from "vitest";

import type { CommitPassContractEvent } from "../contract-events";
import { buildPilotMetrics } from "../pilot-metrics";

function event(
  overrides: Partial<CommitPassContractEvent> &
    Pick<CommitPassContractEvent, "id" | "ledger" | "name" | "txHash">,
): CommitPassContractEvent {
  return {
    cursor: "cursor-1",
    payload: {},
    ...overrides,
  };
}

describe("buildPilotMetrics", () => {
  it("counts unique reserving wallets and produces auditable goal progress", () => {
    const metrics = buildPilotMetrics([
      event({
        id: "created-1",
        ledger: 100,
        name: "event_created",
        txHash: "tx-create",
        eventId: "event-a",
        account: "GORGANIZER",
      }),
      event({
        id: "reserve-1",
        ledger: 101,
        name: "reserved",
        txHash: "tx-reserve-a",
        eventId: "event-a",
        account: "GATTENDEE_A",
      }),
      event({
        id: "reserve-2",
        ledger: 102,
        name: "reserved",
        txHash: "tx-reserve-b",
        eventId: "event-a",
        account: "GATTENDEE_B",
      }),
      event({
        id: "reserve-3",
        ledger: 103,
        name: "reserved",
        txHash: "tx-reserve-a-again",
        eventId: "event-b",
        account: "GATTENDEE_A",
      }),
      event({
        id: "check-in-1",
        ledger: 104,
        name: "checked_in",
        txHash: "tx-refund-a",
        eventId: "event-a",
        account: "GATTENDEE_A",
      }),
    ]);

    expect(metrics).toEqual({
      uniqueReservingWallets: 2,
      uniqueOrganizers: 1,
      reservations: 3,
      checkInRefunds: 1,
      activeEvents: 2,
      firstLedger: 100,
      lastLedger: 104,
      green: { target: 10, achieved: 2, percentage: 20 },
      blue: { target: 50, achieved: 2, percentage: 4 },
      proof: [
        { wallet: "GATTENDEE_A", txHash: "tx-reserve-a", ledger: 101 },
        { wallet: "GATTENDEE_B", txHash: "tx-reserve-b", ledger: 102 },
      ],
    });
  });

  it("deduplicates RPC events and ignores malformed interaction signals", () => {
    const metrics = buildPilotMetrics([
      event({
        id: "reserve-1",
        ledger: 201,
        name: "reserved",
        txHash: "tx-reserve",
        account: "GATTENDEE",
      }),
      event({
        id: "reserve-1",
        ledger: 201,
        name: "reserved",
        txHash: "tx-reserve",
        account: "GATTENDEE",
      }),
      event({
        id: "reserve-without-account",
        ledger: 202,
        name: "reserved",
        txHash: "tx-invalid",
      }),
      event({
        id: "unknown",
        ledger: 203,
        name: "something_else",
        txHash: "tx-unknown",
        account: "GNOTAUSER",
      }),
    ]);

    expect(metrics.uniqueReservingWallets).toBe(1);
    expect(metrics.reservations).toBe(1);
    expect(metrics.proof).toEqual([
      { wallet: "GATTENDEE", txHash: "tx-reserve", ledger: 201 },
    ]);
  });

  it("caps goal progress when the cohort exceeds a belt target", () => {
    const events = Array.from({ length: 12 }, (_, index) =>
      event({
        id: `reserve-${index}`,
        ledger: 300 + index,
        name: "reserved",
        txHash: `tx-${index}`,
        account: `GATTENDEE_${index}`,
      }),
    );

    const metrics = buildPilotMetrics(events);

    expect(metrics.green).toEqual({
      target: 10,
      achieved: 12,
      percentage: 100,
    });
    expect(metrics.blue.percentage).toBe(24);
  });
});
