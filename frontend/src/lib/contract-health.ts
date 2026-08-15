export interface StellarRpcHealthResponse {
  status: string;
  latestLedger: number;
}

export interface StellarLatestLedgerResponse {
  sequence: number;
}

export interface StellarRpcHealthReader {
  getHealth(): Promise<StellarRpcHealthResponse>;
  getLatestLedger(): Promise<StellarLatestLedgerResponse>;
}

export interface ContractDepositTokenReader {
  getDepositToken(): Promise<string>;
}

export interface ContractHealthDependencies {
  rpc: StellarRpcHealthReader;
  contract: ContractDepositTokenReader;
  expectedDepositToken: string;
  timeoutMs?: number;
}

export type ContractHealthStatus = "healthy" | "degraded" | "unavailable";

export interface ContractHealthResult {
  status: ContractHealthStatus;
  rpc: {
    status: ContractHealthStatus;
    reportedStatus?: string;
    healthLatestLedger?: number;
    latestLedger?: number;
    error?: string;
  };
  contract: {
    status: ContractHealthStatus;
    expectedDepositToken: string;
    actualDepositToken?: string;
    error?: string;
  };
}

type ReadOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const DEFAULT_TIMEOUT_MS = 5_000;

class HealthCheckTimeoutError extends Error {}

export async function checkContractHealth(
  dependencies: ContractHealthDependencies,
): Promise<ContractHealthResult> {
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Health check timeout must be greater than zero.");
  }

  const [healthRead, latestLedgerRead, depositTokenRead] = await Promise.all([
    readWithTimeout(
      () => dependencies.rpc.getHealth(),
      "Stellar RPC health check",
      timeoutMs,
    ),
    readWithTimeout(
      () => dependencies.rpc.getLatestLedger(),
      "Stellar RPC latest ledger check",
      timeoutMs,
    ),
    readWithTimeout(
      () => dependencies.contract.getDepositToken(),
      "CommitPass deposit token check",
      timeoutMs,
    ),
  ]);

  const rpc = rpcResult(healthRead, latestLedgerRead);
  const contract = contractResult(
    depositTokenRead,
    dependencies.expectedDepositToken,
  );

  return {
    status:
      rpc.status === "unavailable"
        ? "unavailable"
        : rpc.status === "healthy" && contract.status === "healthy"
          ? "healthy"
          : "degraded",
    rpc,
    contract,
  };
}

function rpcResult(
  healthRead: ReadOutcome<StellarRpcHealthResponse>,
  latestLedgerRead: ReadOutcome<StellarLatestLedgerResponse>,
): ContractHealthResult["rpc"] {
  if (!latestLedgerRead.ok) {
    return {
      status: "unavailable",
      ...(healthRead.ok && {
        reportedStatus: healthRead.value.status,
        healthLatestLedger: healthRead.value.latestLedger,
      }),
      error: latestLedgerRead.error,
    };
  }

  if (!isPositiveLedger(latestLedgerRead.value.sequence)) {
    return {
      status: "unavailable",
      ...(healthRead.ok && {
        reportedStatus: healthRead.value.status,
        healthLatestLedger: healthRead.value.latestLedger,
      }),
      error:
        "Stellar RPC latest ledger response did not contain a positive integer sequence.",
    };
  }

  if (!healthRead.ok) {
    return {
      status: "degraded",
      latestLedger: latestLedgerRead.value.sequence,
      error: healthRead.error,
    };
  }

  if (!isPositiveLedger(healthRead.value.latestLedger)) {
    return {
      status: "degraded",
      reportedStatus: healthRead.value.status,
      latestLedger: latestLedgerRead.value.sequence,
      error:
        "Stellar RPC health response did not contain a positive integer latest ledger.",
    };
  }

  const rpcHealthy = healthRead.value.status === "healthy";
  return {
    status: rpcHealthy ? "healthy" : "degraded",
    reportedStatus: healthRead.value.status,
    healthLatestLedger: healthRead.value.latestLedger,
    latestLedger: latestLedgerRead.value.sequence,
    ...(!rpcHealthy && {
      error: `Stellar RPC reported status "${healthRead.value.status}".`,
    }),
  };
}

function isPositiveLedger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function contractResult(
  tokenRead: ReadOutcome<string>,
  expectedDepositToken: string,
): ContractHealthResult["contract"] {
  if (!tokenRead.ok) {
    return {
      status: "degraded",
      expectedDepositToken,
      error: tokenRead.error,
    };
  }

  if (!expectedDepositToken.trim()) {
    return {
      status: "degraded",
      expectedDepositToken,
      actualDepositToken: tokenRead.value,
      error: "Expected deposit token is not configured.",
    };
  }

  const tokenMatches = tokenRead.value === expectedDepositToken;
  return {
    status: tokenMatches ? "healthy" : "degraded",
    expectedDepositToken,
    actualDepositToken: tokenRead.value,
    ...(!tokenMatches && {
      error: "Contract deposit token does not match configuration.",
    }),
  };
}

async function readWithTimeout<T>(
  read: () => Promise<T>,
  label: string,
  timeoutMs: number,
): Promise<ReadOutcome<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () =>
        reject(
          new HealthCheckTimeoutError(
            `${label} timed out after ${timeoutMs}ms.`,
          ),
        ),
      timeoutMs,
    );
  });

  try {
    const value = await Promise.race([Promise.resolve().then(read), timeout]);
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error: readFailureMessage(error, label),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function readFailureMessage(error: unknown, label: string): string {
  if (error instanceof HealthCheckTimeoutError) {
    return error.message;
  }
  if (!(error instanceof Error) || !error.message.trim()) {
    return `${label} failed.`;
  }

  const message = error.message.trim();
  const punctuation = /[.!?]$/.test(message) ? "" : ".";
  return `${label} failed: ${message}${punctuation}`;
}
