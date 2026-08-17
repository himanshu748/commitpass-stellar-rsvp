import {
  Activity,
  CircleCheck,
  Download,
  ExternalLink,
  RefreshCw,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  buildPilotMetrics,
  type PilotMetrics,
} from "../lib/pilot-metrics";
import { serializePilotEvidence } from "../lib/pilot-evidence";
import {
  PUBLIC_TESTNET_CONFIG,
  PUBLIC_TESTNET_CONTRACT_DEPLOYMENT_LEDGER,
} from "../lib/seed";

export interface PilotMetricsSnapshot {
  metrics: PilotMetrics;
  complete: boolean;
  pages: number;
}

export interface PilotProgressPanelProps {
  loadMetrics?: () => Promise<PilotMetricsSnapshot>;
  downloadEvidence?: (snapshot: PilotMetricsSnapshot) => void;
}

type PilotMetricsState =
  | { phase: "loading" }
  | { phase: "ready"; snapshot: PilotMetricsSnapshot }
  | { phase: "error" };

export function PilotProgressPanel({
  loadMetrics = loadPublicPilotMetrics,
  downloadEvidence = downloadPilotEvidence,
}: PilotProgressPanelProps) {
  const [state, setState] = useState<PilotMetricsState>({ phase: "loading" });
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    void loadMetrics()
      .then((snapshot) => {
        if (requestId.current === currentRequest) {
          setState({ phase: "ready", snapshot });
        }
      })
      .catch(() => {
        if (requestId.current === currentRequest) {
          setState({ phase: "error" });
        }
      });
    return () => {
      requestId.current += 1;
    };
  }, [loadMetrics]);

  return (
    <section className="pilot-progress" aria-labelledby="pilot-progress-title">
      <div className="pilot-progress__heading">
        <div>
          <span>On-chain analytics</span>
          <h2 id="pilot-progress-title">Public Testnet pilot activity</h2>
          <p>
            Counts come from successful contract events. Repeated reservations
            never inflate the verified-user total.
          </p>
        </div>
        <Activity aria-hidden="true" size={27} />
      </div>

      {state.phase === "loading" ? (
        <p className="pilot-progress__state" role="status">
          <RefreshCw aria-hidden="true" className="is-spinning" size={18} />
          Loading contract history…
        </p>
      ) : state.phase === "error" ? (
        <p className="pilot-progress__state pilot-progress__state--error" role="status">
          <TriangleAlert aria-hidden="true" size={18} />
          Pilot activity is temporarily unavailable. Contract health remains
          independent.
        </p>
      ) : (
        <PilotMetricsResult
          downloadEvidence={downloadEvidence}
          snapshot={state.snapshot}
        />
      )}
    </section>
  );
}

function PilotMetricsResult({
  downloadEvidence,
  snapshot,
}: {
  downloadEvidence(snapshot: PilotMetricsSnapshot): void;
  snapshot: PilotMetricsSnapshot;
}) {
  const { metrics } = snapshot;
  return (
    <>
      <div className="pilot-progress__metrics">
        <Metric
          icon={Users}
          label="Verified wallets"
          value={metrics.uniqueReservingWallets.toString()}
        />
        <Metric
          icon={Activity}
          label="Reservations"
          value={metrics.reservations.toString()}
        />
        <Metric
          icon={CircleCheck}
          label="Check-in refunds"
          value={metrics.checkInRefunds.toString()}
        />
      </div>

      <div className="pilot-progress__goals">
        <GoalProgress label="Green pilot" progress={metrics.green} />
        <GoalProgress label="Blue pilot" progress={metrics.blue} />
      </div>

      {metrics.proof.length > 0 ? (
        <div className="pilot-progress__proof">
          <h3>First reservation proof per wallet</h3>
          <ul>
            {metrics.proof.slice(0, 5).map((proof) => (
              <li key={proof.wallet}>
                <code>{shortAddress(proof.wallet)}</code>
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${proof.txHash}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Ledger {proof.ledger.toLocaleString("en-US")}
                  <ExternalLink aria-hidden="true" size={13} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="pilot-progress__empty">
          No successful reservation wallet has been observed yet.
        </p>
      )}

      <p className="pilot-progress__source">
        {snapshot.complete
          ? `Complete history loaded in ${snapshot.pages} ${snapshot.pages === 1 ? "page" : "pages"}.`
          : "History reached its safety limit. Counts are a verified lower bound."}
      </p>
      <button
        className="button button--outline pilot-progress__download"
        onClick={() => downloadEvidence(snapshot)}
        type="button"
      >
        <Download aria-hidden="true" size={16} /> Download evidence JSON
      </button>
      <p className="pilot-progress__privacy">
        Contains public ledger data only. No feedback or private data is
        included.
      </p>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div>
      <Icon aria-hidden="true" size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GoalProgress({
  label,
  progress,
}: {
  label: string;
  progress: PilotMetrics["green"];
}) {
  return (
    <div>
      <span>
        {label} <strong>{progress.achieved}/{progress.target}</strong>
      </span>
      <progress
        aria-label={`${label}: ${progress.achieved} of ${progress.target} verified wallets`}
        max={progress.target}
        value={progress.achieved}
      />
    </div>
  );
}

function shortAddress(address: string): string {
  return `${address.slice(0, 7)}…${address.slice(-7)}`;
}

async function loadPublicPilotMetrics(): Promise<PilotMetricsSnapshot> {
  const [{ rpc: StellarRpc }, { loadPilotEventHistory }] = await Promise.all([
    import("@stellar/stellar-sdk"),
    import("../lib/pilot-event-history"),
  ]);
  const history = await loadPilotEventHistory({
    rpc: new StellarRpc.Server(PUBLIC_TESTNET_CONFIG.rpcUrl),
    contractId: PUBLIC_TESTNET_CONFIG.contractId,
    startLedger: PUBLIC_TESTNET_CONTRACT_DEPLOYMENT_LEDGER,
  });
  return {
    metrics: buildPilotMetrics(history.events),
    complete: history.complete,
    pages: history.pages,
  };
}

function downloadPilotEvidence(snapshot: PilotMetricsSnapshot): void {
  const contents = serializePilotEvidence(snapshot);
  const url = URL.createObjectURL(
    new Blob([contents], { type: "application/json;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `commitpass-pilot-evidence-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
