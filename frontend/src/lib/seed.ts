import type { ContractRuntimeConfig } from "./config";
import type { CommitPassEvent, ReservationStatus } from "./domain";

export const STELLAR_TESTNET_PASSPHRASE =
  "Test SDF Network ; September 2015";

export const DEMO_CONTRACT_ID =
  "CAEQSCIJBEEQSCIJBEEQSCIJBEEQSCIJBEEQSCIJBEEQSCIJBEEQTD2L";

export const XLM_TESTNET_SAC_ID =
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

export const PUBLIC_TESTNET_RPC_URL =
  "https://soroban-testnet.stellar.org";

export const PUBLIC_TESTNET_CONTRACT_ID =
  "CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN";

export const PUBLIC_TESTNET_VERIFICATION_EVENT_ID =
  "287273b2c9e628b24d70322796f89a989a557095b78ce275c7c019f0619be51f";

export const PUBLIC_TESTNET_EVENT_CREATION_TX =
  "f7e218954d1e4a75f5c6bbc8e6029b313592d37ab5301b7b7fa44c3e534ac83e";

export const PUBLIC_TESTNET_CONFIG: ContractRuntimeConfig = {
  mode: "contract",
  network: "testnet",
  networkPassphrase: STELLAR_TESTNET_PASSPHRASE,
  rpcUrl: PUBLIC_TESTNET_RPC_URL,
  contractId: PUBLIC_TESTNET_CONTRACT_ID,
  xlmSacId: XLM_TESTNET_SAC_ID,
};

export const DEMO_ORGANIZER_ADDRESS =
  "GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H";

export const DEMO_BENEFICIARY_ADDRESS =
  "GABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEJXA";

export const DEMO_ATTENDEE_ADDRESS =
  "GABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQHGPC";

export const SEED_EVENT_ID =
  "8f94ad9b3e2797d583864366de79db48f43ae62c6bff7a59e7f95c09ab3ae9fd";

export const SEED_EVENT: Readonly<CommitPassEvent> = {
  id: SEED_EVENT_ID,
  eventSalt:
    "74f36b0176a197db60fcf532fca7371b3fed64cf3743d00364c810bb0ce65d94",
  organizer: DEMO_ORGANIZER_ADDRESS,
  metadataHash:
    "469dd415db5feb127d30d58a537330965693d25208067b4d67b0532fbb2f7e19",
  // Wed 12 Aug 2026, 18:30 Asia/Kolkata.
  startAt: 1_786_539_600,
  checkInDeadline: 1_786_546_800,
  endAt: 1_786_550_400,
  token: XLM_TESTNET_SAC_ID,
  tokenCode: "XLM",
  tokenDecimals: 7,
  depositAmount: 20_000_000n,
  capacity: 60,
  seatsReserved: 42,
  outstandingDeposits: 42,
  noShowBeneficiary: DEMO_BENEFICIARY_ADDRESS,
  cancellationPolicy: "FullRefund",
  // Public key corresponding to the Rust contract fixture's scanner key. The
  // private half is intentionally not shipped in the frontend.
  scannerPublicKey:
    "197f6b23e16c8532c6abc838facd5ea789be0c76b2920334039bfa8b3d368d61",
  status: "Active",
  createdAt: 1_782_901_800,
  metadata: {
    title: "Stellar Builders Night",
    summary: "A tiny refundable deposit keeps your free spot real.",
    organizerName: "Stellar Bengaluru",
    venueName: "Bangalore International Centre",
    venueCity: "Bengaluru",
    timezone: "Asia/Kolkata",
    imagePath: "/commitpass-event-art.png",
  },
};

export interface SeedArrival {
  attendee: string;
  displayName: string;
  status: ReservationStatus | "AwaitingScan";
  checkedInAt: number | null;
}

export const SEED_ARRIVALS: readonly SeedArrival[] = [
  {
    attendee:
      "GACAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAJJHP",
    displayName: "Maya S.",
    status: "CheckedIn",
    checkedInAt: SEED_EVENT.startAt + 92,
  },
  {
    attendee: DEMO_ATTENDEE_ADDRESS,
    displayName: "Arjun K.",
    status: "AwaitingScan",
    checkedInAt: null,
  },
  {
    attendee: DEMO_BENEFICIARY_ADDRESS,
    displayName: "Neha R.",
    status: "Reserved",
    checkedInAt: null,
  },
];
