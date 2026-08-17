import { describe, expect, it } from "vitest";

import {
  createPilotEvidenceReport,
  serializePilotEvidence,
} from "../pilot-evidence";
import type { PilotMetrics } from "../pilot-metrics";
import {
  PUBLIC_TESTNET_CONTRACT_DEPLOYMENT_LEDGER,
  PUBLIC_TESTNET_CONTRACT_ID,
} from "../seed";

const METRICS: PilotMetrics = {
  uniqueReservingWallets: 1,
  uniqueOrganizers: 1,
  reservations: 2,
  checkInRefunds: 1,
  activeEvents: 1,
  firstLedger: 3_774_274,
  lastLedger: 3_774_436,
  green: { target: 10, achieved: 1, percentage: 10 },
  blue: { target: 50, achieved: 1, percentage: 2 },
  proof: [
    {
      wallet: "GABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQHGPC",
      txHash:
        "20362567885a7a5a78c43886d2417534924a10bbf74a553893c40a5762af83d3",
      ledger: 3_774_280,
    },
  ],
};

describe("pilot evidence", () => {
  it("exports deterministic public ledger proof and summary totals", () => {
    const generatedAt = new Date("2026-08-17T15:00:00.000Z");
    const report = createPilotEvidenceReport(
      { metrics: METRICS, complete: true, pages: 1 },
      generatedAt,
    );

    expect(report).toMatchObject({
      schema: "commitpass.pilot-evidence",
      version: 1,
      generatedAt: "2026-08-17T15:00:00.000Z",
      network: "Stellar Testnet",
      contractId: PUBLIC_TESTNET_CONTRACT_ID,
      deploymentLedger: PUBLIC_TESTNET_CONTRACT_DEPLOYMENT_LEDGER,
      history: {
        complete: true,
        pages: 1,
        firstLedger: 3_774_274,
        lastLedger: 3_774_436,
      },
      summary: {
        uniqueReservingWallets: 1,
        reservations: 2,
        checkInRefunds: 1,
      },
      walletProof: METRICS.proof,
    });
    expect(report.summary).not.toHaveProperty("proof");
  });

  it("serializes a stable newline-terminated JSON document", () => {
    const serialized = serializePilotEvidence(
      { metrics: METRICS, complete: false, pages: 3 },
      new Date("2026-08-17T15:00:00.000Z"),
    );

    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toMatchObject({
      history: { complete: false, pages: 3 },
      walletProof: [{ ledger: 3_774_280 }],
    });
  });

  it("rejects an invalid history page count", () => {
    expect(() =>
      createPilotEvidenceReport({ metrics: METRICS, complete: true, pages: 0 }),
    ).toThrow("positive integer");
  });
});
