import { describe, expect, it, vi } from "vitest";

import type {
  CommitPassContractEvent,
  ContractEventRpc,
  PollContractEventsOptions,
  PollContractEventsResult,
} from "../contract-events";
import { loadPilotEventHistory } from "../pilot-event-history";

const rpc: ContractEventRpc = {
  getLatestLedger: vi.fn(async () => ({ sequence: 1 })),
  getEvents: vi.fn(),
};

function decodedEvent(id: string, ledger: number): CommitPassContractEvent {
  return {
    id,
    ledger,
    txHash: `tx-${id}`,
    name: "reserved",
    account: `G${id}`,
    payload: {},
    cursor: `cursor-${ledger}`,
  };
}

describe("loadPilotEventHistory", () => {
  it("follows RPC cursors until the first partial page", async () => {
    const pollPage = vi
      .fn<
        (options: PollContractEventsOptions) =>
          Promise<PollContractEventsResult>
      >()
      .mockResolvedValueOnce({
        events: [decodedEvent("one", 100), decodedEvent("two", 101)],
        cursor: "cursor-1",
        receivedEventCount: 2,
      })
      .mockResolvedValueOnce({
        events: [decodedEvent("three", 102)],
        cursor: "cursor-2",
        receivedEventCount: 1,
      });

    const result = await loadPilotEventHistory({
      rpc,
      contractId: "CCOMMITPASS",
      startLedger: 50,
      pageSize: 2,
      pollPage,
    });

    expect(pollPage.mock.calls[0]?.[0]).toMatchObject({
      contractId: "CCOMMITPASS",
      startLedger: 50,
      limit: 2,
    });
    expect(pollPage.mock.calls[1]?.[0]).toMatchObject({
      contractId: "CCOMMITPASS",
      cursor: "cursor-1",
      limit: 2,
    });
    expect(result).toEqual({
      events: [
        decodedEvent("one", 100),
        decodedEvent("two", 101),
        decodedEvent("three", 102),
      ],
      cursor: "cursor-2",
      pages: 2,
      complete: true,
    });
  });

  it("deduplicates overlapping pages and reports a bounded partial history", async () => {
    const repeated = decodedEvent("same", 200);
    const pollPage = vi
      .fn<
        (options: PollContractEventsOptions) =>
          Promise<PollContractEventsResult>
      >()
      .mockResolvedValueOnce({
        events: [repeated, decodedEvent("first", 201)],
        cursor: "cursor-1",
        receivedEventCount: 2,
      })
      .mockResolvedValueOnce({
        events: [repeated, decodedEvent("second", 202)],
        cursor: "cursor-2",
        receivedEventCount: 2,
      });

    const result = await loadPilotEventHistory({
      rpc,
      contractId: "CCOMMITPASS",
      startLedger: 50,
      pageSize: 2,
      maxPages: 2,
      pollPage,
    });

    expect(result.events.map((event) => event.id)).toEqual([
      "same",
      "first",
      "second",
    ]);
    expect(result.pages).toBe(2);
    expect(result.complete).toBe(false);
  });
});
