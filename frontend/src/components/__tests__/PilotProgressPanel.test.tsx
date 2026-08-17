import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PilotMetrics } from "../../lib/pilot-metrics";
import {
  PilotProgressPanel,
  type PilotMetricsSnapshot,
} from "../PilotProgressPanel";

const METRICS: PilotMetrics = {
  uniqueReservingWallets: 2,
  uniqueOrganizers: 1,
  reservations: 3,
  checkInRefunds: 1,
  activeEvents: 1,
  firstLedger: 100,
  lastLedger: 120,
  green: { target: 10, achieved: 2, percentage: 20 },
  blue: { target: 50, achieved: 2, percentage: 4 },
  proof: [
    {
      wallet: "GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H",
      txHash:
        "f7e218954d1e4a75f5c6bbc8e6029b313592d37ab5301b7b7fa44c3e534ac83e",
      ledger: 3_774_280,
    },
  ],
};

describe("PilotProgressPanel", () => {
  it("shows deduplicated pilot progress and explorer proof", async () => {
    const user = userEvent.setup();
    const downloadEvidence = vi.fn();
    const snapshot: PilotMetricsSnapshot = {
      metrics: METRICS,
      complete: true,
      pages: 2,
    };
    render(
      <PilotProgressPanel
        downloadEvidence={downloadEvidence}
        loadMetrics={async () => snapshot}
      />,
    );

    expect(await screen.findByText("Verified wallets")).toBeVisible();
    expect(screen.getByText("Reservations").parentElement).toHaveTextContent("3");
    expect(screen.getByText("Check-in refunds").parentElement).toHaveTextContent("1");
    expect(
      screen.getByRole("progressbar", {
        name: "Green pilot: 2 of 10 verified wallets",
      }),
    ).toHaveValue(2);
    expect(screen.getByText("Complete history loaded in 2 pages.")).toBeVisible();
    expect(screen.getByRole("link", { name: /Ledger 3,774,280/ })).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${METRICS.proof[0].txHash}`,
    );
    await user.click(
      screen.getByRole("button", { name: "Download evidence JSON" }),
    );
    expect(downloadEvidence).toHaveBeenCalledWith(snapshot);
    expect(screen.getByText(/Contains public ledger data only/)).toBeVisible();
  });

  it("reports an independent analytics failure without overstating activity", async () => {
    render(
      <PilotProgressPanel
        loadMetrics={async () => {
          throw new Error("RPC history unavailable");
        }}
      />,
    );

    expect(
      await screen.findByText(/Pilot activity is temporarily unavailable/),
    ).toBeVisible();
    expect(screen.queryByText("Verified wallets")).not.toBeInTheDocument();
  });
});
