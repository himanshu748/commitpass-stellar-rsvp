import {
  pollContractEvents,
  type CommitPassContractEvent,
  type ContractEventRpc,
  type PollContractEventsOptions,
  type PollContractEventsResult,
} from "./contract-events";

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 100;

type PollPage = (
  options: PollContractEventsOptions,
) => Promise<PollContractEventsResult>;

export interface LoadPilotEventHistoryOptions {
  rpc: ContractEventRpc;
  contractId: string;
  startLedger: number;
  pageSize?: number;
  maxPages?: number;
  pollPage?: PollPage;
}

export interface PilotEventHistory {
  events: CommitPassContractEvent[];
  cursor: string;
  pages: number;
  /** False means the safety page limit or a stalled cursor truncated history. */
  complete: boolean;
}

/**
 * Loads historical CommitPass events in bounded pages for traction reporting.
 * This is intentionally separate from the live poller, which follows only new
 * activity and keeps an in-memory cursor.
 */
export async function loadPilotEventHistory(
  options: LoadPilotEventHistoryOptions,
): Promise<PilotEventHistory> {
  const pageSize = positiveInteger(
    options.pageSize ?? DEFAULT_PAGE_SIZE,
    "pageSize",
  );
  const maxPages = positiveInteger(
    options.maxPages ?? DEFAULT_MAX_PAGES,
    "maxPages",
  );
  const pollPage = options.pollPage ?? pollContractEvents;
  const seenEventIds = new Set<string>();
  const events: CommitPassContractEvent[] = [];
  let cursor: string | undefined;
  let pages = 0;
  let complete = false;

  while (pages < maxPages) {
    const previousCursor = cursor;
    const page = await pollPage({
      rpc: options.rpc,
      contractId: options.contractId,
      ...(cursor ? { cursor } : { startLedger: options.startLedger }),
      limit: pageSize,
      seenEventIds,
    });
    pages += 1;
    cursor = page.cursor;

    for (const event of page.events) {
      if (seenEventIds.has(event.id)) {
        continue;
      }
      seenEventIds.add(event.id);
      events.push(event);
    }

    if (page.receivedEventCount < pageSize) {
      complete = true;
      break;
    }
    if (previousCursor === cursor) {
      break;
    }
  }

  if (!cursor) {
    throw new Error("Stellar RPC did not return a pilot event cursor.");
  }
  return { events, cursor, pages, complete };
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
  return value;
}
