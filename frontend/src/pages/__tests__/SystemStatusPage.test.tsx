import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { ContractHealthResult } from "../../lib/contract-health";
import { PUBLIC_TESTNET_CONTRACT_ID } from "../../lib/seed";
import { SystemStatusPage } from "../SystemStatusPage";

const HEALTHY_RESULT: ContractHealthResult = {
  status: "healthy",
  rpc: {
    status: "healthy",
    reportedStatus: "healthy",
    healthLatestLedger: 123_455,
    latestLedger: 123_456,
  },
  contract: {
    status: "healthy",
    expectedDepositToken:
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    actualDepositToken:
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  },
};

describe("SystemStatusPage", () => {
  it("shows loading first and then read-only RPC and contract evidence", async () => {
    let resolveHealth!: (result: ContractHealthResult) => void;
    const loadHealth = vi.fn(
      () =>
        new Promise<ContractHealthResult>((resolve) => {
          resolveHealth = resolve;
        }),
    );
    render(
      <MemoryRouter>
        <SystemStatusPage loadHealth={loadHealth} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking Stellar Testnet and the deployed contract",
    );
    resolveHealth(HEALTHY_RESULT);

    expect(await screen.findByText("All systems operational")).toBeVisible();
    expect(screen.getByText("123,456")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "View deployed contract" }),
    ).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/contract/${PUBLIC_TESTNET_CONTRACT_ID}`,
    );
    expect(screen.getByText("No wallet signature required")).toBeVisible();
  });

  it("reports a failed check and retries on demand", async () => {
    const user = userEvent.setup();
    const loadHealth = vi
      .fn<() => Promise<ContractHealthResult>>()
      .mockRejectedValueOnce(new Error("Module failed to load"))
      .mockResolvedValueOnce(HEALTHY_RESULT);
    render(
      <MemoryRouter>
        <SystemStatusPage loadHealth={loadHealth} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The status check could not run",
    );
    await user.click(screen.getByRole("button", { name: "Retry status check" }));

    expect(await screen.findByText("All systems operational")).toBeVisible();
    expect(loadHealth).toHaveBeenCalledTimes(2);
  });

  it("keeps the last verified result visible when a refresh fails", async () => {
    const user = userEvent.setup();
    let rejectRefresh!: (error: Error) => void;
    const loadHealth = vi
      .fn<() => Promise<ContractHealthResult>>()
      .mockResolvedValueOnce(HEALTHY_RESULT)
      .mockImplementationOnce(
        () =>
          new Promise<ContractHealthResult>((_resolve, reject) => {
            rejectRefresh = reject;
          }),
      );
    render(
      <MemoryRouter>
        <SystemStatusPage loadHealth={loadHealth} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("All systems operational")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(screen.getByText("All systems operational")).toBeVisible();
    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();

    rejectRefresh(new Error("RPC temporarily unavailable"));

    expect(
      await screen.findByText(
        "The latest refresh failed. Showing the last verified result.",
      ),
    ).toBeVisible();
    expect(screen.getByText("123,456")).toBeVisible();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
  });

  it("does not claim token verification when the contract check is degraded", async () => {
    const degradedResult: ContractHealthResult = {
      ...HEALTHY_RESULT,
      status: "degraded",
      contract: {
        ...HEALTHY_RESULT.contract,
        status: "degraded",
        actualDepositToken:
          "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
        error: "Contract deposit token does not match configuration.",
      },
    };

    render(
      <MemoryRouter>
        <SystemStatusPage loadHealth={async () => degradedResult} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Some checks are degraded")).toBeVisible();
    expect(
      screen.queryByText("Native XLM deposit token verified against configuration."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Contract deposit token does not match configuration."),
    ).toBeVisible();
  });
});
