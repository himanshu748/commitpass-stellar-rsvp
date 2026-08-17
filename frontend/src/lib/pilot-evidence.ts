import type { PilotMetrics } from "./pilot-metrics";
import {
  PUBLIC_TESTNET_CONTRACT_DEPLOYMENT_LEDGER,
  PUBLIC_TESTNET_CONTRACT_ID,
} from "./seed";

export const PILOT_EVIDENCE_SCHEMA = "commitpass.pilot-evidence" as const;
export const PILOT_EVIDENCE_VERSION = 1 as const;

export interface PilotEvidenceSource {
  metrics: PilotMetrics;
  complete: boolean;
  pages: number;
}

export interface PilotEvidenceReport {
  schema: typeof PILOT_EVIDENCE_SCHEMA;
  version: typeof PILOT_EVIDENCE_VERSION;
  generatedAt: string;
  network: "Stellar Testnet";
  contractId: string;
  deploymentLedger: number;
  history: {
    complete: boolean;
    pages: number;
    firstLedger?: number;
    lastLedger?: number;
  };
  summary: Omit<PilotMetrics, "proof" | "firstLedger" | "lastLedger">;
  walletProof: PilotMetrics["proof"];
}

/**
 * Produces a portable reviewer report using public ledger data only. It never
 * includes feedback comments, emails, private keys or browser storage.
 */
export function createPilotEvidenceReport(
  source: PilotEvidenceSource,
  generatedAt: Date = new Date(),
): PilotEvidenceReport {
  if (!Number.isSafeInteger(source.pages) || source.pages < 1) {
    throw new RangeError("Pilot history pages must be a positive integer.");
  }
  if (!Number.isFinite(generatedAt.getTime())) {
    throw new TypeError("Pilot evidence timestamp must be a valid date.");
  }

  const { firstLedger, lastLedger, proof, ...summary } = source.metrics;
  return {
    schema: PILOT_EVIDENCE_SCHEMA,
    version: PILOT_EVIDENCE_VERSION,
    generatedAt: generatedAt.toISOString(),
    network: "Stellar Testnet",
    contractId: PUBLIC_TESTNET_CONTRACT_ID,
    deploymentLedger: PUBLIC_TESTNET_CONTRACT_DEPLOYMENT_LEDGER,
    history: {
      complete: source.complete,
      pages: source.pages,
      ...(firstLedger === undefined ? {} : { firstLedger }),
      ...(lastLedger === undefined ? {} : { lastLedger }),
    },
    summary,
    walletProof: proof.map((item) => ({ ...item })),
  };
}

export function serializePilotEvidence(
  source: PilotEvidenceSource,
  generatedAt: Date = new Date(),
): string {
  return `${JSON.stringify(createPilotEvidenceReport(source, generatedAt), null, 2)}\n`;
}
