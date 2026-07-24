import {
  rpc as StellarRpc,
  scValToNative,
  type Contract,
} from "@stellar/stellar-sdk";

import { bytesToHex } from "./bytes";

const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_LOOKBACK_LEDGERS = 5_000;
const DEFAULT_DEDUPE_LIMIT = 2_048;

export interface CommitPassContractEvent {
  id: string;
  ledger: number;
  ledgerClosedAt?: string;
  txHash: string;
  name: string;
  eventId?: string;
  account?: string;
  payload: unknown;
  /**
   * Cursor returned for the RPC page containing this event. Store it only in
   * caller-owned state when persistence is wanted.
   */
  cursor: string;
}

/**
 * The small RPC surface used by the poller. Keeping it structural makes the
 * network client and deterministic test doubles interchangeable.
 */
export interface ContractEventRpc {
  getLatestLedger(): Promise<{ sequence: number }>;
  getEvents(
    request: StellarRpc.Api.GetEventsRequest,
  ): Promise<{
    events: StellarRpc.Api.EventResponse[];
    cursor: string;
  }>;
}

export interface ContractEventTimers {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface PollContractEventsOptions {
  rpc: ContractEventRpc;
  contractId: string;
  cursor?: string;
  startLedger?: number;
  /**
   * Used only when neither `cursor` nor `startLedger` is supplied.
   */
  lookbackLedgers?: number;
  limit?: number;
  seenEventIds?: ReadonlySet<string>;
}

export interface PollContractEventsResult {
  events: CommitPassContractEvent[];
  cursor: string;
}

export interface ContractEventRetry {
  attempt: number;
  delayMs: number;
  cursor?: string;
}

export interface ContractEventPollSuccess {
  cursor: string;
  eventCount: number;
}

interface ContractEventPollerBaseOptions {
  contractId: string;
  initialCursor?: string;
  startLedger?: number;
  /**
   * Used only when neither `initialCursor` nor `startLedger` is supplied.
   */
  lookbackLedgers?: number;
  intervalMs?: number;
  limit?: number;
  dedupeLimit?: number;
  signal?: AbortSignal;
  timers?: ContractEventTimers;
  onEvents(
    events: readonly CommitPassContractEvent[],
  ): void | Promise<void>;
  /**
   * Called after every successful RPC page, including an empty page. This is
   * useful for clearing a transient error indicator without inventing events.
   */
  onPoll?(result: ContractEventPollSuccess): void | Promise<void>;
  /**
   * Called after a failed attempt and before the next retry is scheduled.
   * Throwing from this reporting callback does not stop the retry loop.
   */
  onError?(
    error: unknown,
    retry: ContractEventRetry,
  ): void | Promise<void>;
}

export type ContractEventPollerOptions = ContractEventPollerBaseOptions &
  (
    | {
        rpc: ContractEventRpc;
        rpcUrl?: string;
      }
    | {
        rpc?: undefined;
        rpcUrl: string;
      }
  );

export interface ContractEventPoller {
  /**
   * Starts immediately. Repeated calls while running are no-ops.
   */
  start(): void;
  /**
   * Stops future work and ignores any in-flight RPC result.
   */
  stop(): void;
  /**
   * Returns the in-memory cursor last acknowledged by `onEvents`.
   */
  getCursor(): string | undefined;
}

/**
 * Decodes one successful CommitPass application event.
 *
 * The result is deliberately a sync signal: consumers should re-read
 * authoritative contract state rather than treating event payloads as state.
 */
export function decodeCommitPassContractEvent(
  event: StellarRpc.Api.EventResponse,
  contractId: string,
  cursor: string,
): CommitPassContractEvent | undefined {
  if (
    event.type !== "contract" ||
    !event.inSuccessfulContractCall ||
    contractIdFromEvent(event.contractId) !== contractId
  ) {
    return undefined;
  }

  let topics: unknown[];
  let payload: unknown;
  try {
    topics = event.topic.map((topic) => scValToNative(topic));
    payload = scValToNative(event.value);
  } catch {
    return undefined;
  }

  if (
    topics[0] !== "rsvp" ||
    typeof topics[1] !== "string" ||
    topics[1].length === 0
  ) {
    return undefined;
  }

  const eventId = indexedEventId(topics[2]);
  const account =
    typeof topics[3] === "string" && topics[3].length > 0
      ? topics[3]
      : undefined;

  return {
    id: event.id,
    ledger: event.ledger,
    ...(event.ledgerClosedAt
      ? { ledgerClosedAt: event.ledgerClosedAt }
      : {}),
    txHash: event.txHash,
    name: topics[1],
    ...(eventId ? { eventId } : {}),
    ...(account ? { account } : {}),
    payload,
    cursor,
  };
}

/**
 * Fetches and decodes one RPC page. Callers pass the returned cursor into the
 * next call; no browser or process storage is used.
 */
export async function pollContractEvents(
  options: PollContractEventsOptions,
): Promise<PollContractEventsResult> {
  const contractId = requiredText(options.contractId, "contractId");
  const cursor = optionalOpaqueText(options.cursor);
  const startLedger = optionalPositiveInteger(
    options.startLedger,
    "startLedger",
  );
  if (cursor && startLedger !== undefined) {
    throw new TypeError("cursor and startLedger are mutually exclusive.");
  }

  const limit = optionalPositiveInteger(options.limit, "limit");
  const filters: StellarRpc.Api.EventFilter[] = [
    {
      type: "contract",
      contractIds: [contractId],
    },
  ];

  let request: StellarRpc.Api.GetEventsRequest;
  if (cursor) {
    request = {
      filters,
      cursor,
      ...(limit === undefined ? {} : { limit }),
    };
  } else {
    let effectiveStartLedger = startLedger;
    if (effectiveStartLedger === undefined) {
      const lookbackLedgers =
        optionalPositiveInteger(
          options.lookbackLedgers,
          "lookbackLedgers",
        ) ?? DEFAULT_LOOKBACK_LEDGERS;
      const latest = await options.rpc.getLatestLedger();
      assertPositiveInteger(latest.sequence, "latest ledger sequence");
      effectiveStartLedger = Math.max(
        1,
        latest.sequence - lookbackLedgers + 1,
      );
    }
    request = {
      filters,
      startLedger: effectiveStartLedger,
      ...(limit === undefined ? {} : { limit }),
    };
  }

  const response = await options.rpc.getEvents(request);
  const nextCursor = requiredOpaqueText(
    response.cursor,
    "RPC event cursor",
  );
  const pageIds = new Set<string>();
  const events: CommitPassContractEvent[] = [];

  for (const event of response.events) {
    if (
      !event.id ||
      pageIds.has(event.id) ||
      options.seenEventIds?.has(event.id)
    ) {
      continue;
    }
    const decoded = decodeCommitPassContractEvent(
      event,
      contractId,
      nextCursor,
    );
    if (decoded) {
      pageIds.add(event.id);
      events.push(decoded);
    }
  }

  return {
    events,
    cursor: nextCursor,
  };
}

/**
 * Creates an in-memory cursor poller. `start()` must be called explicitly.
 */
export function createContractEventPoller(
  options: ContractEventPollerOptions,
): ContractEventPoller {
  return new InMemoryContractEventPoller(options);
}

class InMemoryContractEventPoller implements ContractEventPoller {
  private readonly rpc: ContractEventRpc;
  private readonly contractId: string;
  private readonly startLedger: number | undefined;
  private readonly lookbackLedgers: number;
  private readonly intervalMs: number;
  private readonly limit: number | undefined;
  private readonly dedupeLimit: number;
  private readonly signal: AbortSignal | undefined;
  private readonly timers: ContractEventTimers;
  private readonly onEvents: ContractEventPollerBaseOptions["onEvents"];
  private readonly onPoll: ContractEventPollerBaseOptions["onPoll"];
  private readonly onError: ContractEventPollerBaseOptions["onError"];
  private readonly seenEventIds = new Set<string>();
  private cursor: string | undefined;
  private timer: unknown;
  private running = false;
  private generation = 0;
  private retryAttempt = 0;

  constructor(options: ContractEventPollerOptions) {
    this.contractId = requiredText(options.contractId, "contractId");
    this.cursor = optionalOpaqueText(options.initialCursor);
    this.startLedger = optionalPositiveInteger(
      options.startLedger,
      "startLedger",
    );
    if (this.cursor && this.startLedger !== undefined) {
      throw new TypeError(
        "initialCursor and startLedger are mutually exclusive.",
      );
    }
    this.lookbackLedgers =
      optionalPositiveInteger(
        options.lookbackLedgers,
        "lookbackLedgers",
      ) ?? DEFAULT_LOOKBACK_LEDGERS;
    this.intervalMs =
      optionalNonNegativeNumber(options.intervalMs, "intervalMs") ??
      DEFAULT_INTERVAL_MS;
    this.limit = optionalPositiveInteger(options.limit, "limit");
    this.dedupeLimit =
      optionalPositiveInteger(options.dedupeLimit, "dedupeLimit") ??
      DEFAULT_DEDUPE_LIMIT;
    this.signal = options.signal;
    this.timers = options.timers ?? defaultTimers;
    this.onEvents = options.onEvents;
    this.onPoll = options.onPoll;
    this.onError = options.onError;

    if (options.rpc) {
      this.rpc = options.rpc;
    } else {
      this.rpc = new StellarRpc.Server(
        requiredText(options.rpcUrl, "rpcUrl"),
      );
    }
  }

  start(): void {
    if (this.running || this.signal?.aborted) {
      return;
    }

    this.running = true;
    this.generation += 1;
    const generation = this.generation;
    this.signal?.addEventListener("abort", this.handleAbort, {
      once: true,
    });
    void this.tick(generation);
  }

  stop(): void {
    if (!this.running && this.timer === undefined) {
      return;
    }

    this.running = false;
    this.generation += 1;
    if (this.timer !== undefined) {
      this.timers.clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.signal?.removeEventListener("abort", this.handleAbort);
  }

  getCursor(): string | undefined {
    return this.cursor;
  }

  private readonly handleAbort = (): void => {
    this.stop();
  };

  private isActive(generation: number): boolean {
    return this.running && this.generation === generation;
  }

  private async tick(generation: number): Promise<void> {
    try {
      const page = await pollContractEvents({
        rpc: this.rpc,
        contractId: this.contractId,
        ...(this.cursor
          ? { cursor: this.cursor }
          : this.startLedger === undefined
            ? { lookbackLedgers: this.lookbackLedgers }
            : { startLedger: this.startLedger }),
        ...(this.limit === undefined ? {} : { limit: this.limit }),
        seenEventIds: this.seenEventIds,
      });
      if (!this.isActive(generation)) {
        return;
      }

      if (page.events.length > 0) {
        await this.onEvents(page.events);
        if (!this.isActive(generation)) {
          return;
        }
        for (const event of page.events) {
          this.rememberEventId(event.id);
        }
      }

      this.cursor = page.cursor;
      this.retryAttempt = 0;
      if (this.onPoll) {
        try {
          await this.onPoll({
            cursor: page.cursor,
            eventCount: page.events.length,
          });
        } catch {
          // Success reporting must not accidentally disable polling.
        }
      }
      if (!this.isActive(generation)) {
        return;
      }
      this.schedule(generation);
    } catch (error) {
      if (!this.isActive(generation)) {
        return;
      }

      this.retryAttempt += 1;
      if (this.onError) {
        try {
          await this.onError(error, {
            attempt: this.retryAttempt,
            delayMs: this.intervalMs,
            cursor: this.cursor,
          });
        } catch {
          // Error reporting must not accidentally disable polling.
        }
      }
      if (this.isActive(generation)) {
        this.schedule(generation);
      }
    }
  }

  private schedule(generation: number): void {
    if (!this.isActive(generation)) {
      return;
    }
    this.timer = this.timers.setTimeout(() => {
      this.timer = undefined;
      void this.tick(generation);
    }, this.intervalMs);
  }

  private rememberEventId(id: string): void {
    this.seenEventIds.add(id);
    while (this.seenEventIds.size > this.dedupeLimit) {
      const oldest = this.seenEventIds.values().next().value;
      if (oldest === undefined) {
        return;
      }
      this.seenEventIds.delete(oldest);
    }
  }
}

const defaultTimers: ContractEventTimers = {
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

function contractIdFromEvent(contract: Contract | undefined): string | undefined {
  if (!contract) {
    return undefined;
  }
  try {
    return contract.contractId();
  } catch {
    return undefined;
  }
}

function indexedEventId(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return bytesToHex(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  }
  if (value instanceof ArrayBuffer) {
    return bytesToHex(new Uint8Array(value));
  }
  return undefined;
}

function requiredText(value: string, label: string): string {
  const normalized = optionalText(value);
  if (!normalized) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return normalized;
}

function optionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function requiredOpaqueText(value: string, label: string): string {
  const normalized = optionalOpaqueText(value);
  if (!normalized) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return normalized;
}

function optionalOpaqueText(
  value: string | undefined,
): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

function optionalPositiveInteger(
  value: number | undefined,
  label: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  assertPositiveInteger(value, label);
  return value;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

function optionalNonNegativeNumber(
  value: number | undefined,
  label: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number.`);
  }
  return value;
}
