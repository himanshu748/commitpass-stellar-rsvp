import { describe, expect, it, vi } from "vitest";

import {
  checkContractHealth,
  type ContractHealthDependencies,
} from "../contract-health";

const EXPECTED_TOKEN =
  "CDLZFC3SYJYD3UAG5Q7KPLVFVP7LKJWIFVHUNQYZPXM5D6JVZNOKEVVP";

function healthyDependencies(): ContractHealthDependencies {
  return {
    rpc: {
      getHealth: async () => ({
        status: "healthy",
        latestLedger: 12_345,
      }),
      getLatestLedger: async () => ({ sequence: 12_346 }),
    },
    contract: {
      getDepositToken: async () => EXPECTED_TOKEN,
    },
    expectedDepositToken: EXPECTED_TOKEN,
    timeoutMs: 100,
  };
}

describe("checkContractHealth", () => {
  it("reports healthy when RPC ledger reads succeed and the deposit token matches", async () => {
    const result = await checkContractHealth(healthyDependencies());

    expect(result).toEqual({
      status: "healthy",
      rpc: {
        status: "healthy",
        reportedStatus: "healthy",
        healthLatestLedger: 12_345,
        latestLedger: 12_346,
      },
      contract: {
        status: "healthy",
        expectedDepositToken: EXPECTED_TOKEN,
        actualDepositToken: EXPECTED_TOKEN,
      },
    });
  });

  it("reports degraded when the contract deposit token does not match configuration", async () => {
    const dependencies = healthyDependencies();
    dependencies.contract.getDepositToken = async () =>
      "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

    const result = await checkContractHealth(dependencies);

    expect(result).toEqual({
      status: "degraded",
      rpc: {
        status: "healthy",
        reportedStatus: "healthy",
        healthLatestLedger: 12_345,
        latestLedger: 12_346,
      },
      contract: {
        status: "degraded",
        expectedDepositToken: EXPECTED_TOKEN,
        actualDepositToken:
          "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
        error: "Contract deposit token does not match configuration.",
      },
    });
  });

  it("reports degraded when RPC responds but does not report healthy", async () => {
    const dependencies = healthyDependencies();
    dependencies.rpc.getHealth = async () => ({
      status: "unhealthy",
      latestLedger: 12_345,
    });

    const result = await checkContractHealth(dependencies);

    expect(result).toEqual({
      status: "degraded",
      rpc: {
        status: "degraded",
        reportedStatus: "unhealthy",
        healthLatestLedger: 12_345,
        latestLedger: 12_346,
        error: 'Stellar RPC reported status "unhealthy".',
      },
      contract: {
        status: "healthy",
        expectedDepositToken: EXPECTED_TOKEN,
        actualDepositToken: EXPECTED_TOKEN,
      },
    });
  });

  it("reports unavailable when the latest ledger read exceeds the timeout", async () => {
    vi.useFakeTimers();
    try {
      const dependencies = healthyDependencies();
      dependencies.timeoutMs = 25;
      dependencies.rpc.getLatestLedger = () => new Promise(() => undefined);

      const pendingResult = checkContractHealth(dependencies);
      await vi.advanceTimersByTimeAsync(25);

      await expect(pendingResult).resolves.toEqual({
        status: "unavailable",
        rpc: {
          status: "unavailable",
          reportedStatus: "healthy",
          healthLatestLedger: 12_345,
          error: "Stellar RPC latest ledger check timed out after 25ms.",
        },
        contract: {
          status: "healthy",
          expectedDepositToken: EXPECTED_TOKEN,
          actualDepositToken: EXPECTED_TOKEN,
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports degraded when the health endpoint fails but latest ledger remains readable", async () => {
    const dependencies = healthyDependencies();
    dependencies.rpc.getHealth = async () => {
      throw new Error("rate limited");
    };

    const result = await checkContractHealth(dependencies);

    expect(result).toEqual({
      status: "degraded",
      rpc: {
        status: "degraded",
        latestLedger: 12_346,
        error: "Stellar RPC health check failed: rate limited.",
      },
      contract: {
        status: "healthy",
        expectedDepositToken: EXPECTED_TOKEN,
        actualDepositToken: EXPECTED_TOKEN,
      },
    });
  });

  it("reports unavailable when latest ledger response has no valid sequence", async () => {
    const dependencies = healthyDependencies();
    dependencies.rpc.getLatestLedger = async () => ({ sequence: 0 });

    const result = await checkContractHealth(dependencies);

    expect(result).toEqual({
      status: "unavailable",
      rpc: {
        status: "unavailable",
        reportedStatus: "healthy",
        healthLatestLedger: 12_345,
        error:
          "Stellar RPC latest ledger response did not contain a positive integer sequence.",
      },
      contract: {
        status: "healthy",
        expectedDepositToken: EXPECTED_TOKEN,
        actualDepositToken: EXPECTED_TOKEN,
      },
    });
  });

  it("reports degraded when RPC health omits a valid ledger height", async () => {
    const dependencies = healthyDependencies();
    dependencies.rpc.getHealth = async () => ({
      status: "healthy",
      latestLedger: Number.NaN,
    });

    const result = await checkContractHealth(dependencies);

    expect(result).toEqual({
      status: "degraded",
      rpc: {
        status: "degraded",
        reportedStatus: "healthy",
        latestLedger: 12_346,
        error:
          "Stellar RPC health response did not contain a positive integer latest ledger.",
      },
      contract: {
        status: "healthy",
        expectedDepositToken: EXPECTED_TOKEN,
        actualDepositToken: EXPECTED_TOKEN,
      },
    });
  });

  it("reports degraded when no expected deposit token is configured", async () => {
    const dependencies = healthyDependencies();
    dependencies.expectedDepositToken = "";

    const result = await checkContractHealth(dependencies);

    expect(result).toEqual({
      status: "degraded",
      rpc: {
        status: "healthy",
        reportedStatus: "healthy",
        healthLatestLedger: 12_345,
        latestLedger: 12_346,
      },
      contract: {
        status: "degraded",
        expectedDepositToken: "",
        actualDepositToken: EXPECTED_TOKEN,
        error: "Expected deposit token is not configured.",
      },
    });
  });
});
