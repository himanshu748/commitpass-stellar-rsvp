import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Server,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  PilotProgressPanel,
  type PilotProgressPanelProps,
} from "../components/PilotProgressPanel";
import {
  checkContractHealth,
  type ContractHealthResult,
} from "../lib/contract-health";
import {
  PUBLIC_TESTNET_CONFIG,
  PUBLIC_TESTNET_CONTRACT_ID,
} from "../lib/seed";

type StatusState =
  | { phase: "loading" }
  | {
      phase: "ready";
      result: ContractHealthResult;
      checkedAt: Date;
      refreshing: boolean;
      refreshError?: string;
    }
  | { phase: "error" };

export interface SystemStatusPageProps {
  loadHealth?: () => Promise<ContractHealthResult>;
  loadPilotMetrics?: PilotProgressPanelProps["loadMetrics"];
}

export function SystemStatusPage({
  loadHealth = loadPublicContractHealth,
  loadPilotMetrics,
}: SystemStatusPageProps) {
  const [state, setState] = useState<StatusState>({ phase: "loading" });
  const requestId = useRef(0);

  const runCheck = useCallback(async () => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setState((current) =>
      current.phase === "ready"
        ? { ...current, refreshing: true, refreshError: undefined }
        : { phase: "loading" },
    );
    try {
      const result = await loadHealth();
      if (requestId.current === currentRequest) {
        setState({
          phase: "ready",
          result,
          checkedAt: new Date(),
          refreshing: false,
        });
      }
    } catch {
      if (requestId.current === currentRequest) {
        setState((current) =>
          current.phase === "ready"
            ? {
                ...current,
                refreshing: false,
                refreshError:
                  "The latest refresh failed. Showing the last verified result.",
              }
            : { phase: "error" },
        );
      }
    }
  }, [loadHealth]);

  useEffect(() => {
    void runCheck();
    return () => {
      requestId.current += 1;
    };
  }, [runCheck]);

  return (
    <div className="page simple-page status-page">
      <Link className="back-link" to="/">
        <ArrowLeft size={17} /> Back to events
      </Link>
      <div className="simple-page__heading">
        <h1>CommitPass system status</h1>
        <p>
          A live read-only check of Stellar Testnet and the deployed RSVP
          contract. No wallet connection is used and no transaction is signed or
          submitted.
        </p>
      </div>

      {state.phase === "loading" ? (
        <div className="status-page__loading" role="status">
          <RefreshCw aria-hidden="true" size={23} />
          Checking Stellar Testnet and the deployed contract…
        </div>
      ) : state.phase === "error" ? (
        <section className="status-page__error" role="alert">
          <TriangleAlert aria-hidden="true" size={26} />
          <div>
            <h2>The status check could not run</h2>
            <p>The application is still available. Retry the read-only check.</p>
          </div>
          <button
            className="button button--outline"
            onClick={() => void runCheck()}
            type="button"
          >
            Retry status check
          </button>
        </section>
      ) : (
        <StatusResult
          checkedAt={state.checkedAt}
          onRefresh={runCheck}
          refreshError={state.refreshError}
          refreshing={state.refreshing}
          result={state.result}
        />
      )}

      <PilotProgressPanel loadMetrics={loadPilotMetrics} />
    </div>
  );
}

function StatusResult({
  checkedAt,
  onRefresh,
  refreshError,
  refreshing,
  result,
}: {
  checkedAt: Date;
  onRefresh(): Promise<void>;
  refreshError?: string;
  refreshing: boolean;
  result: ContractHealthResult;
}) {
  const headline =
    result.status === "healthy"
      ? "All systems operational"
      : result.status === "degraded"
        ? "Some checks are degraded"
        : "Stellar RPC is unavailable";
  const HeadlineIcon =
    result.status === "healthy" ? CheckCircle2 : TriangleAlert;

  return (
    <>
      <section className={`status-overview status-overview--${result.status}`}>
        <HeadlineIcon aria-hidden="true" size={31} />
        <div>
          <span>Current status</span>
          <h2>{headline}</h2>
          <p>
            Checked {checkedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <button
          className="button button--outline"
          disabled={refreshing}
          onClick={() => void onRefresh()}
          type="button"
        >
          <RefreshCw className={refreshing ? "is-spinning" : undefined} size={17} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </section>

      {refreshError ? (
        <p className="status-page__stale" role="status">
          <TriangleAlert aria-hidden="true" size={18} /> {refreshError}
        </p>
      ) : null}

      <div className="status-checks">
        <section>
          <Server aria-hidden="true" size={25} />
          <div>
            <span>Stellar Testnet RPC</span>
            <h3>{statusLabel(result.rpc.status)}</h3>
            {result.rpc.latestLedger ? (
              <p>
                Latest ledger <strong>{result.rpc.latestLedger.toLocaleString("en-US")}</strong>
              </p>
            ) : null}
            {result.rpc.error ? <p>{result.rpc.error}</p> : null}
          </div>
        </section>
        <section>
          <ShieldCheck aria-hidden="true" size={25} />
          <div>
            <span>Refundable RSVP contract</span>
            <h3>{statusLabel(result.contract.status)}</h3>
            <p>
              {result.contract.status === "healthy"
                ? "Native XLM deposit token verified against configuration."
                : "Deposit token verification is degraded."}
            </p>
            {result.contract.error ? <p>{result.contract.error}</p> : null}
            <a
              href={`https://stellar.expert/explorer/testnet/contract/${PUBLIC_TESTNET_CONTRACT_ID}`}
              rel="noreferrer"
              target="_blank"
            >
              View deployed contract <ExternalLink size={14} />
            </a>
          </div>
        </section>
      </div>

      <div className="status-page__read-only">
        <Activity aria-hidden="true" size={19} />
        <strong>No wallet signature required</strong>
        <span>These checks cannot submit a transaction or move funds.</span>
      </div>
    </>
  );
}

function statusLabel(status: ContractHealthResult["status"]): string {
  return status === "healthy"
    ? "Operational"
    : status === "degraded"
      ? "Degraded"
      : "Unavailable";
}

async function loadPublicContractHealth(): Promise<ContractHealthResult> {
  const [{ rpc: StellarRpc }, { createRefundableRsvpAdapter }] =
    await Promise.all([
      import("@stellar/stellar-sdk"),
      import("../lib/contract"),
    ]);
  return checkContractHealth({
    rpc: new StellarRpc.Server(PUBLIC_TESTNET_CONFIG.rpcUrl),
    contract: createRefundableRsvpAdapter(PUBLIC_TESTNET_CONFIG),
    expectedDepositToken: PUBLIC_TESTNET_CONFIG.xlmSacId,
  });
}
