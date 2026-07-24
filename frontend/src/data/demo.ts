export type ReservationStatus =
  | "unreserved"
  | "reserved"
  | "voucher-ready"
  | "refunded";

export type TransactionState = {
  kind: "reserve" | "refund" | "create-event";
  mode: "demo" | "contract";
  status: "signing" | "submitting" | "confirmed" | "failed";
  hash?: string;
  message: string;
} | null;

export type ArrivalStatus = "checked-in" | "voucher-sent" | "reserved";

export type Arrival = {
  name: string;
  wallet: string;
  status: ArrivalStatus;
};

export const DEMO_WALLET = DEMO_ATTENDEE_ADDRESS;

export const DEMO_EVENT = {
  id: "stellar-builders-night",
  contractEventId: SEED_EVENT_ID,
  name: "Stellar Builders Night",
  date: "Wed, 12 Aug · 6:30 PM",
  dateLong: "12 Aug 2026, 6:30 PM",
  venue: "Bangalore International Centre",
  organizer: "Stellar Bengaluru",
  organizerWallet: "GDRQ…4M8V",
  description:
    "An evening of practical Soroban demos, project feedback, and people shipping on Stellar.",
  capacity: 60,
  reserved: 42,
  checkedIn: 27,
  deposit: 2,
  asset: "XLM",
  rsvpCloses: "11 Aug, 8:00 PM",
  checkInWindow: "12 Aug, 6:00–7:15 PM",
  beneficiary: "Stellar Bengaluru Community Fund",
};

export const INITIAL_ARRIVALS: Arrival[] = [
  { name: "Meera", wallet: "GBL7…9D1A", status: "checked-in" },
  { name: "Aarav", wallet: "GD3K…2P9Q", status: "voucher-sent" },
  { name: "Riya", wallet: "GCF2…6K8M", status: "reserved" },
  { name: "Kabir", wallet: "GA91…4J3R", status: "reserved" },
];

export const shortAddress = (address: string) =>
  address.length > 12
    ? `${address.slice(0, 5)}…${address.slice(-4)}`
    : address;
import {
  DEMO_ATTENDEE_ADDRESS,
  SEED_EVENT_ID,
} from "../lib/seed";
