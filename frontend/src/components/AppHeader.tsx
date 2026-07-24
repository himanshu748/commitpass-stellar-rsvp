import {
  Activity,
  ChevronDown,
  ExternalLink,
  FilePlus2,
  Menu,
  Orbit,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { NavLink } from "react-router-dom";
import { shortAddress } from "../data/demo";
import {
  PUBLIC_TESTNET_CONTRACT_ID,
  PUBLIC_TESTNET_EVENT_CREATION_TX,
} from "../lib/seed";
import { useCommitPass } from "../state/CommitPassProvider";
import { BrandMark } from "./BrandMark";
import { Modal } from "./Modal";
import { TransactionStatus } from "./TransactionStatus";

const navItems = [
  { label: "Events", to: "/" },
  { label: "My RSVPs", to: "/my-rsvps" },
  { label: "Host an event", to: "/host" },
];

export function AppHeader() {
  const {
    walletAddress,
    walletName,
    walletMode,
    testnetBalance,
    liveTestnetPayment,
    liveContractProof,
    connectDemoWallet,
    connectLiveWallet,
    disconnectWallet,
    refreshTestnetBalance,
    sendTestnetPayment,
    createLiveContractProof,
    refreshLiveContractRead,
  } = useCommitPass();
  const [walletOpen, setWalletOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [creatingProof, setCreatingProof] = useState(false);

  const handleLiveConnect = async () => {
    setConnecting(true);
    try {
      await connectLiveWallet();
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectWallet();
      setDestination("");
      setAmount("");
      setWalletOpen(false);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleTestnetPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const sent = await sendTestnetPayment(destination, amount);
      if (sent) setAmount("");
    } finally {
      setSending(false);
    }
  };

  const handleContractProof = async () => {
    if (creatingProof) return;
    setCreatingProof(true);
    try {
      await createLiveContractProof();
    } finally {
      setCreatingProof(false);
    }
  };

  const paymentPending =
    liveTestnetPayment?.status === "signing" ||
    liveTestnetPayment?.status === "submitting";
  const contractPending =
    liveContractProof.transaction?.status === "simulating" ||
    liveContractProof.transaction?.status === "awaiting-signature" ||
    liveContractProof.transaction?.status === "signing" ||
    liveContractProof.transaction?.status === "submitted" ||
    liveContractProof.transaction?.status === "pending" ||
    liveContractProof.transaction?.status === "submitting";

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <BrandMark />
          <nav
            className={`main-nav${menuOpen ? " main-nav--open" : ""}`}
            aria-label="Primary"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="app-header__actions">
            <button
              className="network-control"
              type="button"
              aria-label="Mode: no-funds judge sandbox"
              title="RSVP actions are a no-funds sandbox; the wallet panel includes a separate live Testnet proof"
            >
              <Orbit size={21} strokeWidth={1.7} />
              <span>Judge sandbox</span>
              <ChevronDown size={16} />
            </button>
            <button
              className={`wallet-control${walletAddress ? " wallet-control--connected" : ""}`}
              type="button"
              aria-label={
                walletAddress
                  ? `Wallet ${shortAddress(walletAddress)}; open wallet details`
                  : "Connect wallet"
              }
              onClick={() => setWalletOpen(true)}
            >
              <Wallet size={19} strokeWidth={1.8} />
              <span>
                {walletAddress ? shortAddress(walletAddress) : "Connect wallet"}
              </span>
            </button>
            <button
              className="mobile-menu-button"
              type="button"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      <Modal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        title={
          walletAddress
            ? walletMode === "live"
              ? "Testnet wallet & live proof"
              : "Demo wallet connected"
            : "Choose how to continue"
        }
        description={
          walletAddress
            ? walletMode === "live"
              ? "StellarWalletsKit connects your chosen wallet. Read the deployed contract, create a no-transfer proof event, and follow its Testnet status here."
              : "The seeded identity exercises the RSVP flow without a wallet, funds, or network transaction."
            : "Choose a Stellar Testnet wallet through StellarWalletsKit, or use the seeded demo identity. RSVP actions remain simulated."
        }
        size={walletMode === "live" ? "medium" : "small"}
      >
        {walletAddress ? (
          <div className="wallet-connected">
            <div className="wallet-summary">
              <div className="wallet-summary__icon">
                <Wallet size={24} />
              </div>
              <div>
                <strong>{walletName ?? "Connected wallet"}</strong>
                <span
                  className={
                    walletMode === "live"
                      ? "wallet-summary__address"
                      : undefined
                  }
                >
                  {walletMode === "live"
                    ? walletAddress
                    : shortAddress(walletAddress)}
                </span>
              </div>
            </div>

            {walletMode === "live" ? (
              <section className="wallet-proof" aria-label="Live Testnet proof">
                <div className="wallet-balance" role="status">
                  <div>
                    <small>Native balance · Stellar Testnet</small>
                    <strong>
                      {testnetBalance.status === "ready"
                        ? `${testnetBalance.amount} XLM`
                        : testnetBalance.status === "loading"
                          ? "Loading…"
                          : testnetBalance.status === "error"
                            ? "Unavailable"
                            : "—"}
                    </strong>
                    {testnetBalance.status === "error" ? (
                      <span>{testnetBalance.message}</span>
                    ) : null}
                  </div>
                  <button
                    className="icon-button wallet-balance__refresh"
                    type="button"
                    aria-label="Refresh Testnet XLM balance"
                    title="Refresh from Horizon"
                    disabled={testnetBalance.status === "loading"}
                    onClick={() => void refreshTestnetBalance()}
                  >
                    <RefreshCw
                      size={18}
                      className={
                        testnetBalance.status === "loading"
                          ? "spin"
                          : undefined
                      }
                    />
                  </button>
                </div>

                <div className="wallet-proof__disclosure">
                  <ShieldCheck size={20} />
                  <p>
                    <strong>Separate live proof.</strong> The main RSVP demo
                    remains no-funds. Wallet-not-found, rejected-signature,
                    wrong-network, and insufficient-balance failures are shown
                    without hiding the cause. Testnet XLM has no cash value.
                  </p>
                </div>

                <section
                  className="contract-proof"
                  aria-label="Live Soroban contract proof"
                >
                  <div className="contract-proof__heading">
                    <span className="contract-proof__icon">
                      <FilePlus2 size={20} />
                    </span>
                    <div>
                      <small>Deployed Soroban write</small>
                      <strong>create_event</strong>
                    </div>
                    <a
                      href={`https://stellar.expert/explorer/testnet/contract/${PUBLIC_TESTNET_CONTRACT_ID}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Contract <ExternalLink size={12} />
                    </a>
                  </div>
                  <dl className="contract-proof__facts">
                    <div>
                      <dt>Network</dt>
                      <dd>Stellar Testnet</dd>
                    </div>
                    <div>
                      <dt>Token movement</dt>
                      <dd>None</dd>
                    </div>
                    <div>
                      <dt>Public record</dt>
                      <dd>Permanent event metadata</dd>
                    </div>
                  </dl>
                  <p className="contract-proof__copy">
                    Creates a unique one-seat proof event in{" "}
                    <code>{shortAddress(PUBLIC_TESTNET_CONTRACT_ID)}</code>.
                    Your wallet shows the exact invocation before approval; only
                    the Testnet network fee is charged. This proof-only event
                    does not enable reservations.
                  </p>
                  <button
                    className="button button--primary button--full"
                    type="button"
                    disabled={creatingProof || contractPending || paymentPending}
                    onClick={() => void handleContractProof()}
                  >
                    {liveContractProof.transaction?.status ===
                    "awaiting-signature"
                      ? "Confirm in your wallet…"
                      : contractPending
                        ? "Waiting for Testnet…"
                        : "Create Testnet proof event"}
                    <FilePlus2 size={17} />
                  </button>
                  <TransactionStatus
                    transaction={liveContractProof.transaction}
                  />

                  <div className="contract-read">
                    <div>
                      <Activity size={17} />
                      <span>
                        <strong>Authoritative contract read</strong>
                        <small>
                          {liveContractProof.readStatus === "ready" &&
                          liveContractProof.event
                            ? `${shortAddress(liveContractProof.targetEventId)} · ${liveContractProof.event.seatsReserved}/${liveContractProof.event.capacity} seats · ${liveContractProof.event.status}`
                            : liveContractProof.readStatus === "loading"
                              ? "Reading get_event from RPC…"
                              : liveContractProof.readError ??
                                "Contract read unavailable."}
                        </small>
                      </span>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Refresh deployed contract state"
                      title="Refresh get_event"
                      disabled={liveContractProof.readStatus === "loading"}
                      onClick={() => void refreshLiveContractRead()}
                    >
                      <RefreshCw
                        size={16}
                        className={
                          liveContractProof.readStatus === "loading"
                            ? "spin"
                            : undefined
                        }
                      />
                    </button>
                  </div>

                  <div
                    className={`contract-sync contract-sync--${liveContractProof.syncStatus}`}
                    role="status"
                  >
                    <Radio size={17} />
                    <span>
                      <strong>Cursor-based event sync</strong>
                      <small>{liveContractProof.syncMessage}</small>
                    </span>
                  </div>
                  {liveContractProof.events.length > 0 ? (
                    <ul className="contract-activity">
                      {liveContractProof.events.slice(0, 3).map((event) => (
                        <li key={event.id}>
                          <span>
                            <strong>{event.name.replaceAll("_", " ")}</strong>
                            <small>Ledger {event.ledger}</small>
                          </span>
                          <a
                            href={`https://stellar.expert/explorer/testnet/tx/${event.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`View ${event.name} transaction`}
                          >
                            <ExternalLink size={14} />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <a
                      className="contract-proof__historical"
                      href={`https://stellar.expert/explorer/testnet/tx/${PUBLIC_TESTNET_EVENT_CREATION_TX}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Verified create_event transaction{" "}
                      <ExternalLink size={12} />
                    </a>
                  )}
                </section>

                <p className="wallet-proof__section-label">
                  Optional classic Testnet payment proof
                </p>
                <form
                  className="wallet-proof__form"
                  onSubmit={handleTestnetPayment}
                >
                  <label>
                    <span>Destination G-address</span>
                    <input
                      type="text"
                      name="testnet-destination"
                      value={destination}
                      maxLength={56}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="G…"
                      required
                      onChange={(event) => setDestination(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Amount (Testnet XLM)</span>
                    <input
                      type="text"
                      name="testnet-amount"
                      value={amount}
                      maxLength={32}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.1"
                      required
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </label>
                  <button
                    className="button button--primary button--full"
                    type="submit"
                    disabled={sending || paymentPending}
                  >
                    {liveTestnetPayment?.status === "signing"
                      ? "Waiting for wallet…"
                      : liveTestnetPayment?.status === "submitting"
                        ? "Submitting to Testnet…"
                        : "Send Testnet XLM"}
                    <Send size={17} />
                  </button>
                </form>

                <TransactionStatus transaction={liveTestnetPayment} />
              </section>
            ) : (
              <div className="wallet-proof__disclosure">
                <Orbit size={20} />
                <p>
                  <strong>No-funds RSVP demo.</strong> This identity cannot
                  sign or submit the separate live Testnet proof.
                </p>
              </div>
            )}

            <button
              className="button button--outline button--full"
              type="button"
              disabled={disconnecting || paymentPending || contractPending}
              onClick={handleDisconnect}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        ) : (
          <div className="wallet-options">
            <button
              className="wallet-option"
              type="button"
              disabled={connecting}
              onClick={handleLiveConnect}
            >
              <span className="wallet-option__icon">
                <Wallet size={22} />
              </span>
              <span>
                <strong>
                  {connecting ? "Opening wallets…" : "Choose Stellar wallet"}
                </strong>
                <small>
                  StellarWalletsKit · Freighter, Albedo, xBull, Rabet, Hana and
                  more
                </small>
              </span>
            </button>
            <button
              className="wallet-option"
              type="button"
              onClick={() => {
                connectDemoWallet();
                setWalletOpen(false);
              }}
            >
              <span className="wallet-option__icon wallet-option__icon--orange">
                <Orbit size={22} />
              </span>
              <span>
                <strong>Continue with demo wallet</strong>
                <small>No extension, funds, or account required</small>
              </span>
            </button>
            <p className="wallet-connect-disclosure">
              Connecting never exposes your seed phrase. A signature is
              requested only after you choose a live Testnet proof and approve
              the exact transaction in your wallet.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
