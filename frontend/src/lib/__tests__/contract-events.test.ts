import {
  Address,
  Contract,
  nativeToScVal,
  rpc as StellarRpc,
  xdr,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  createContractEventPoller,
  pollContractEvents,
  type CommitPassContractEvent,
  type ContractEventRpc,
  type ContractEventTimers,
} from "../contract-events";
import {
  DEMO_ORGANIZER_ADDRESS,
  PUBLIC_TESTNET_CONTRACT_ID,
  XLM_TESTNET_SAC_ID,
} from "../seed";

const EVENT_ID_BYTES = new Uint8Array(32).fill(0xab);

function applicationEvent(
  id: string,
  overrides: Partial<StellarRpc.Api.EventResponse> = {},
): StellarRpc.Api.EventResponse {
  return {
    id,
    type: "contract",
    ledger: 12_345,
    ledgerClosedAt: "2026-07-24T12:34:56Z",
    transactionIndex: 2,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: `tx-${id}`,
    contractId: new Contract(PUBLIC_TESTNET_CONTRACT_ID),
    topic: [
      xdr.ScVal.scvSymbol("rsvp"),
      xdr.ScVal.scvSymbol("reserved"),
      nativeToScVal(EVENT_ID_BYTES),
      new Address(DEMO_ORGANIZER_ADDRESS).toScVal(),
    ],
    value: nativeToScVal({ amount: 20n }),
    ...overrides,
  };
}

function page(
  events: StellarRpc.Api.EventResponse[],
  cursor: string,
): Awaited<ReturnType<ContractEventRpc["getEvents"]>> {
  return { events, cursor };
}

class ManualTimers implements ContractEventTimers {
  private nextId = 1;
  private readonly callbacks = new Map<number, () => void>();

  setTimeout(callback: () => void): number {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.set(id, callback);
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.callbacks.delete(handle as number);
  }

  runNext(): boolean {
    const next = this.callbacks.entries().next().value;
    if (!next) {
      return false;
    }
    const [id, callback] = next;
    this.callbacks.delete(id);
    callback();
    return true;
  }

  get size(): number {
    return this.callbacks.size;
  }
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
}

describe("CommitPass contract event polling", () => {
  it("requests only this contract and decodes only rsvp application events", async () => {
    const matching = applicationEvent("event-1");
    const rpc: ContractEventRpc = {
      getLatestLedger: vi.fn(async () => ({ sequence: 10_000 })),
      getEvents: vi.fn(async () =>
        page(
          [
            matching,
            applicationEvent("system-event", { type: "system" }),
            applicationEvent("failed-event", {
              inSuccessfulContractCall: false,
            }),
            applicationEvent("other-contract", {
              contractId: new Contract(XLM_TESTNET_SAC_ID),
            }),
            applicationEvent("other-prefix", {
              topic: [
                xdr.ScVal.scvSymbol("token"),
                xdr.ScVal.scvSymbol("reserved"),
              ],
            }),
          ],
          "cursor-1",
        ),
      ),
    };

    const result = await pollContractEvents({
      rpc,
      contractId: PUBLIC_TESTNET_CONTRACT_ID,
      lookbackLedgers: 25,
    });

    expect(rpc.getLatestLedger).toHaveBeenCalledOnce();
    expect(rpc.getEvents).toHaveBeenCalledWith({
      filters: [
        {
          type: "contract",
          contractIds: [PUBLIC_TESTNET_CONTRACT_ID],
        },
      ],
      startLedger: 9_976,
    });
    expect(result.cursor).toBe("cursor-1");
    expect(result.receivedEventCount).toBe(5);
    expect(result.events).toEqual([
      {
        id: "event-1",
        ledger: 12_345,
        ledgerClosedAt: "2026-07-24T12:34:56Z",
        txHash: "tx-event-1",
        name: "reserved",
        eventId: "ab".repeat(32),
        account: DEMO_ORGANIZER_ADDRESS,
        payload: { amount: 20n },
        cursor: "cursor-1",
      },
    ]);
  });

  it("deduplicates event ids and reuses each successful page cursor", async () => {
    const first = applicationEvent("event-1");
    const second = applicationEvent("event-2");
    const getEvents = vi
      .fn<ContractEventRpc["getEvents"]>()
      .mockResolvedValueOnce(page([first, first], "cursor-1"))
      .mockResolvedValueOnce(page([first, second], "cursor-2"));
    const rpc: ContractEventRpc = {
      getLatestLedger: vi.fn(async () => ({ sequence: 1 })),
      getEvents,
    };
    const timers = new ManualTimers();
    const onEvents = vi.fn();
    const poller = createContractEventPoller({
      rpc,
      contractId: PUBLIC_TESTNET_CONTRACT_ID,
      startLedger: 100,
      intervalMs: 250,
      timers,
      onEvents,
    });

    poller.start();
    await flushAsyncWork();

    expect(getEvents.mock.calls[0]?.[0]).toMatchObject({
      startLedger: 100,
    });
    expect(
      onEvents.mock.calls[0]?.[0].map(
        (event: CommitPassContractEvent) => event.id,
      ),
    ).toEqual(["event-1"]);
    expect(poller.getCursor()).toBe("cursor-1");
    expect(timers.size).toBe(1);

    expect(timers.runNext()).toBe(true);
    await flushAsyncWork();

    expect(getEvents.mock.calls[1]?.[0]).toEqual({
      filters: [
        {
          type: "contract",
          contractIds: [PUBLIC_TESTNET_CONTRACT_ID],
        },
      ],
      cursor: "cursor-1",
    });
    expect(
      onEvents.mock.calls[1]?.[0].map(
        (event: CommitPassContractEvent) => event.id,
      ),
    ).toEqual(["event-2"]);
    expect(poller.getCursor()).toBe("cursor-2");

    poller.stop();
    expect(timers.size).toBe(0);
    expect(timers.runNext()).toBe(false);
  });

  it("reports errors, retries from the same cursor, and stops cleanly", async () => {
    const retryError = new Error("RPC temporarily unavailable");
    const getEvents = vi
      .fn<ContractEventRpc["getEvents"]>()
      .mockRejectedValueOnce(retryError)
      .mockResolvedValueOnce(page([applicationEvent("event-1")], "cursor-1"));
    const rpc: ContractEventRpc = {
      getLatestLedger: vi.fn(async () => ({ sequence: 1 })),
      getEvents,
    };
    const timers = new ManualTimers();
    const onEvents = vi.fn();
    const onError = vi.fn();
    const onPoll = vi.fn();
    const poller = createContractEventPoller({
      rpc,
      contractId: PUBLIC_TESTNET_CONTRACT_ID,
      initialCursor: "cursor-0",
      intervalMs: 400,
      timers,
      onEvents,
      onError,
      onPoll,
    });

    poller.start();
    await flushAsyncWork();

    expect(onError).toHaveBeenCalledWith(retryError, {
      attempt: 1,
      delayMs: 400,
      cursor: "cursor-0",
    });
    expect(poller.getCursor()).toBe("cursor-0");
    expect(timers.runNext()).toBe(true);
    await flushAsyncWork();

    expect(getEvents.mock.calls[0]?.[0]).toMatchObject({
      cursor: "cursor-0",
    });
    expect(getEvents.mock.calls[1]?.[0]).toMatchObject({
      cursor: "cursor-0",
    });
    expect(onEvents).toHaveBeenCalledOnce();
    expect(onPoll).toHaveBeenCalledWith({
      cursor: "cursor-1",
      eventCount: 1,
    });
    expect(poller.getCursor()).toBe("cursor-1");

    poller.stop();
    expect(timers.size).toBe(0);
  });

  it("keeps the prior cursor and retries the same event when onEvents rejects", async () => {
    const event = applicationEvent("event-retried");
    const getEvents = vi.fn<ContractEventRpc["getEvents"]>(async () =>
      page([event], "cursor-after-event"),
    );
    const handlerError = new Error("Authoritative read failed");
    const onEvents = vi
      .fn()
      .mockRejectedValueOnce(handlerError)
      .mockResolvedValueOnce(undefined);
    const onError = vi.fn();
    const onPoll = vi.fn();
    const timers = new ManualTimers();
    const poller = createContractEventPoller({
      rpc: {
        getLatestLedger: vi.fn(async () => ({ sequence: 1 })),
        getEvents,
      },
      contractId: PUBLIC_TESTNET_CONTRACT_ID,
      initialCursor: "cursor-before-event",
      intervalMs: 400,
      timers,
      onEvents,
      onError,
      onPoll,
    });

    poller.start();
    await flushAsyncWork();

    expect(onEvents).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(handlerError, {
      attempt: 1,
      delayMs: 400,
      cursor: "cursor-before-event",
    });
    expect(onPoll).not.toHaveBeenCalled();
    expect(poller.getCursor()).toBe("cursor-before-event");

    expect(timers.runNext()).toBe(true);
    await flushAsyncWork();

    expect(getEvents).toHaveBeenCalledTimes(2);
    expect(getEvents.mock.calls[0]?.[0]).toMatchObject({
      cursor: "cursor-before-event",
    });
    expect(getEvents.mock.calls[1]?.[0]).toMatchObject({
      cursor: "cursor-before-event",
    });
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(
      onEvents.mock.calls[0]?.[0].map(
        (decoded: CommitPassContractEvent) => decoded.id,
      ),
    ).toEqual(["event-retried"]);
    expect(onEvents.mock.calls[1]?.[0]).toEqual(onEvents.mock.calls[0]?.[0]);
    expect(poller.getCursor()).toBe("cursor-after-event");
    expect(onPoll).toHaveBeenCalledWith({
      cursor: "cursor-after-event",
      eventCount: 1,
    });

    poller.stop();
  });

  it("reports recovery after an error even when the next page is empty", async () => {
    const getEvents = vi
      .fn<ContractEventRpc["getEvents"]>()
      .mockRejectedValueOnce(new Error("RPC temporarily unavailable"))
      .mockResolvedValueOnce(page([], "cursor-recovered"));
    const timers = new ManualTimers();
    const onEvents = vi.fn();
    const onPoll = vi.fn();
    const poller = createContractEventPoller({
      rpc: {
        getLatestLedger: vi.fn(async () => ({ sequence: 1 })),
        getEvents,
      },
      contractId: PUBLIC_TESTNET_CONTRACT_ID,
      initialCursor: "cursor-before-error",
      intervalMs: 400,
      timers,
      onEvents,
      onPoll,
    });

    poller.start();
    await flushAsyncWork();
    expect(timers.runNext()).toBe(true);
    await flushAsyncWork();

    expect(onEvents).not.toHaveBeenCalled();
    expect(onPoll).toHaveBeenCalledWith({
      cursor: "cursor-recovered",
      eventCount: 0,
    });
    expect(poller.getCursor()).toBe("cursor-recovered");
  });

  it("honors AbortSignal and ignores an RPC result that arrives after stop", async () => {
    let resolvePage:
      | ((
          value: Awaited<ReturnType<ContractEventRpc["getEvents"]>>,
        ) => void)
      | undefined;
    const pendingPage = new Promise<
      Awaited<ReturnType<ContractEventRpc["getEvents"]>>
    >((resolve) => {
      resolvePage = resolve;
    });
    const rpc: ContractEventRpc = {
      getLatestLedger: vi.fn(async () => ({ sequence: 1 })),
      getEvents: vi.fn(() => pendingPage),
    };
    const controller = new AbortController();
    const timers = new ManualTimers();
    const onEvents = vi.fn();
    const poller = createContractEventPoller({
      rpc,
      contractId: PUBLIC_TESTNET_CONTRACT_ID,
      initialCursor: "cursor-0",
      signal: controller.signal,
      timers,
      onEvents,
    });

    poller.start();
    controller.abort();
    resolvePage?.(page([applicationEvent("late-event")], "cursor-late"));
    await flushAsyncWork();

    expect(onEvents).not.toHaveBeenCalled();
    expect(poller.getCursor()).toBe("cursor-0");
    expect(timers.size).toBe(0);
  });
});
