import {
  ChevronDown,
  Menu,
  Orbit,
  RefreshCw,
  Send,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { NavLink } from "react-router-dom";
import { shortAddress } from "../data/demo";
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
    connectDemoWallet,
    connectLiveWallet,
    disconnectWallet,
    refreshTestnetBalance,
    sendTestnetPayment,
  } = useCommitPass();
  const [walletOpen, setWalletOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);

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

  const paymentPending =
    liveTestnetPayment?.status === "signing" ||
    liveTestnetPayment?.status === "submitting";

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
              ? "Your native XLM balance comes from Horizon. CommitPass never receives your private key."
              : "The seeded identity exercises the RSVP flow without a wallet, funds, or network transaction."
            : "Connect a Stellar Testnet wallet for the separate live proof, or use the seeded demo identity. RSVP actions remain simulated."
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
                    remains no-funds. This form sends real Testnet XLM only
                    after you confirm the exact transaction in your wallet.
                    Testnet XLM is test-only and has no cash value.
                  </p>
                </div>

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
              disabled={disconnecting || paymentPending}
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
                  {connecting
                    ? "Opening wallets…"
                    : "Connect Testnet wallet"}
                </strong>
                <small>Freighter or Albedo · Stellar Testnet only</small>
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
              Connecting a wallet does not fund the RSVP demo. A payment is
              requested only if you separately submit the live Testnet proof
              form and approve it in your wallet.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
