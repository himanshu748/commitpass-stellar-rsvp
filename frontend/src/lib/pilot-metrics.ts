import type { CommitPassContractEvent } from "./contract-events";

const GREEN_USER_TARGET = 10;
const BLUE_USER_TARGET = 50;

const PILOT_EVENT_NAMES = new Set([
  "event_created",
  "reserved",
  "checked_in",
  "attendee_cancelled",
  "event_cancelled",
  "event_refund",
  "no_show",
]);

export interface PilotGoalProgress {
  target: number;
  achieved: number;
  percentage: number;
}

export interface PilotWalletProof {
  wallet: string;
  txHash: string;
  ledger: number;
}

export interface PilotMetrics {
  uniqueReservingWallets: number;
  uniqueOrganizers: number;
  reservations: number;
  checkInRefunds: number;
  activeEvents: number;
  firstLedger?: number;
  lastLedger?: number;
  green: PilotGoalProgress;
  blue: PilotGoalProgress;
  proof: PilotWalletProof[];
}

/**
 * Builds reviewer-auditable pilot counts from successful contract events.
 * Wallet proof retains only the first reservation transaction per account so
 * repeated use improves activity totals without inflating user traction.
 */
export function buildPilotMetrics(
  events: readonly CommitPassContractEvent[],
): PilotMetrics {
  const orderedEvents = deduplicatedEvents(events).sort(
    (left, right) => left.ledger - right.ledger || left.id.localeCompare(right.id),
  );
  const pilotEvents = orderedEvents.filter((event) =>
    PILOT_EVENT_NAMES.has(event.name),
  );
  const organizers = new Set<string>();
  const eventIds = new Set<string>();
  const reservationProof = new Map<string, PilotWalletProof>();
  let reservations = 0;
  let checkInRefunds = 0;

  for (const event of pilotEvents) {
    if (event.eventId) {
      eventIds.add(event.eventId);
    }
    if (event.name === "event_created" && event.account) {
      organizers.add(event.account);
    }
    if (event.name === "reserved" && event.account) {
      reservations += 1;
      if (!reservationProof.has(event.account)) {
        reservationProof.set(event.account, {
          wallet: event.account,
          txHash: event.txHash,
          ledger: event.ledger,
        });
      }
    }
    if (event.name === "checked_in" && event.account) {
      checkInRefunds += 1;
    }
  }

  const uniqueReservingWallets = reservationProof.size;
  return {
    uniqueReservingWallets,
    uniqueOrganizers: organizers.size,
    reservations,
    checkInRefunds,
    activeEvents: eventIds.size,
    ...(pilotEvents.length > 0
      ? {
          firstLedger: pilotEvents[0].ledger,
          lastLedger: pilotEvents[pilotEvents.length - 1].ledger,
        }
      : {}),
    green: goalProgress(uniqueReservingWallets, GREEN_USER_TARGET),
    blue: goalProgress(uniqueReservingWallets, BLUE_USER_TARGET),
    proof: [...reservationProof.values()],
  };
}

function deduplicatedEvents(
  events: readonly CommitPassContractEvent[],
): CommitPassContractEvent[] {
  const byId = new Map<string, CommitPassContractEvent>();
  for (const event of events) {
    if (!byId.has(event.id)) {
      byId.set(event.id, event);
    }
  }
  return [...byId.values()];
}

function goalProgress(achieved: number, target: number): PilotGoalProgress {
  return {
    target,
    achieved,
    percentage: Math.min(100, Math.floor((achieved / target) * 100)),
  };
}
