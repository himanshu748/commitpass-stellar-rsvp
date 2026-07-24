import {
  ArrowRight,
  CalendarDays,
  CircleCheck,
  Coins,
  MapPin,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CapacityProgress } from "../components/CapacityProgress";
import { CommitmentRoute } from "../components/CommitmentRoute";
import { Modal } from "../components/Modal";
import { TransactionStatus } from "../components/TransactionStatus";
import { DEMO_EVENT } from "../data/demo";
import { useCommitPass } from "../state/CommitPassProvider";

export function EventPage() {
  const {
    walletAddress,
    reservationStatus,
    transaction,
    connectDemoWallet,
    connectLiveWallet,
    reserveSpot,
  } = useCommitPass();
  const [reserveOpen, setReserveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isPending =
    transaction?.status === "signing" || transaction?.status === "submitting";

  const handleReserve = async () => {
    if (!walletAddress) {
      setReserveOpen(true);
      return;
    }
    setBusy(true);
    try {
      await reserveSpot();
      setReserveOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const connectAndContinue = async (kind: "demo" | "live") => {
    if (kind === "demo") connectDemoWallet();
    else await connectLiveWallet();
  };

  return (
    <>
      <div className="page page--attendee">
        <section className="event-hero">
          <div className="event-hero__main">
            <div className="event-hero__intro">
              <h1>Show up. Get it back.</h1>
              <p>A tiny refundable deposit keeps your free spot real.</p>
            </div>

            <div className="event-feature">
              <img
                className="event-art"
                src="/commitpass-event-art.png"
                alt=""
              />
              <div className="event-feature__details">
                <h2>{DEMO_EVENT.name}</h2>
                <ul className="event-facts">
                  <li>
                    <CalendarDays size={22} />
                    <span>{DEMO_EVENT.date}</span>
                  </li>
                  <li>
                    <MapPin size={22} />
                    <span>{DEMO_EVENT.venue}</span>
                  </li>
                  <li>
                    <Users size={22} />
                    <span>{DEMO_EVENT.organizer}</span>
                  </li>
                </ul>
                <CapacityProgress
                  reserved={
                    DEMO_EVENT.reserved +
                    (reservationStatus !== "unreserved" ? 1 : 0)
                  }
                  capacity={DEMO_EVENT.capacity}
                />
              </div>
            </div>

            <div className="event-about">
              <div>
                <h3>What we’re building</h3>
                <p>{DEMO_EVENT.description}</p>
              </div>
              <div className="organizer">
                <span className="organizer__avatar">SB</span>
                <span>
                  <small>Organizer</small>
                  <strong>{DEMO_EVENT.organizer}</strong>
                  <button className="text-link" type="button">
                    View organizer <ArrowRight size={14} />
                  </button>
                </span>
              </div>
            </div>
          </div>

          <aside className="deposit-panel">
            {reservationStatus === "unreserved" ? (
              <>
                <div>
                  <h2>Reserve with 2 XLM</h2>
                  <p>
                    Check in at the venue and all 2 XLM return to your wallet.
                  </p>
                </div>
                <button
                  className="button button--primary button--full"
                  type="button"
                  disabled={isPending || busy}
                  onClick={handleReserve}
                >
                  Reserve my spot <ArrowRight size={19} />
                </button>
                <Link
                  className="button button--outline button--full"
                  to="/how-it-works"
                >
                  How it works
                </Link>
              </>
            ) : (
              <div className="reserved-summary">
                <span className="reserved-summary__icon">
                  <CircleCheck size={28} />
                </span>
                <div>
                  <p className="label">Your RSVP</p>
                  <h2>
                    {reservationStatus === "refunded"
                      ? "Commitment complete"
                      : "Your spot is reserved"}
                  </h2>
                  <p>
                    {reservationStatus === "refunded"
                      ? "You checked in and the full deposit returned."
                      : "Bring your one-time pass to receive the full refund."}
                  </p>
                </div>
                {reservationStatus === "refunded" ? null : (
                  <Link
                    className="button button--primary button--full"
                    to="/events/demo/pass"
                  >
                    Open check-in pass <ArrowRight size={19} />
                  </Link>
                )}
              </div>
            )}

            <CommitmentRoute status={reservationStatus} />

            <div className="deposit-receipt">
              <span className="deposit-receipt__icon">
                <Coins size={27} />
              </span>
              <div>
                <small>Your deposit</small>
                <strong>2.00 XLM</strong>
                <span>
                  {reservationStatus === "refunded"
                    ? "Returned to your wallet"
                    : "Fully refundable at check-in"}
                </span>
                <em>Testnet XLM has no cash value.</em>
              </div>
            </div>
            <TransactionStatus transaction={transaction} />
          </aside>
        </section>

        <section className="upcoming-section">
          <h2>Your upcoming RSVPs</h2>
          <Link className="upcoming-row" to="/my-rsvps">
            <span className="upcoming-row__icon">
              <CalendarDays size={22} />
            </span>
            <strong>Open Source Saturday</strong>
            <span>
              <CalendarDays size={17} /> Sat, 22 Aug · 10:00 AM
            </span>
            <span>
              <MapPin size={17} /> SG Palya, Bangalore
            </span>
            <span>
              <Coins size={17} /> 1 XLM
            </span>
            <em>Reserved</em>
            <ArrowRight size={18} />
          </Link>
        </section>

        <div className="trust-strip">
          <ShieldCheck size={21} />
          <p>
            CommitPass never holds your keys. Soroban enforces the published
            refund rules.
          </p>
        </div>
      </div>

      <Modal
        open={reserveOpen}
        onClose={() => setReserveOpen(false)}
        title={walletAddress ? "Confirm your commitment" : "Connect to reserve"}
        description={
          walletAddress
            ? "Review the rule this no-funds judge sandbox will simulate. No wallet transaction is sent."
            : "Choose a demo identity or verify a wallet address for the preview."
        }
      >
        {!walletAddress ? (
          <div className="wallet-options">
            <button
              className="wallet-option"
              type="button"
              onClick={() => connectAndContinue("live")}
            >
              <span className="wallet-option__icon">
                <Wallet size={22} />
              </span>
              <span>
                <strong>Connect wallet for preview</strong>
                <small>Verify an address; event actions remain simulated</small>
              </span>
            </button>
            <button
              className="wallet-option"
              type="button"
              onClick={() => connectAndContinue("demo")}
            >
              <span className="wallet-option__icon wallet-option__icon--orange">
                <Coins size={22} />
              </span>
              <span>
                <strong>Use demo wallet</strong>
                <small>Experience every state with simulated Testnet funds</small>
              </span>
            </button>
          </div>
        ) : (
          <div className="confirm-commitment">
            <dl className="confirm-list">
              <div>
                <dt>Deposit</dt>
                <dd>2 XLM</dd>
              </div>
              <div>
                <dt>Refund</dt>
                <dd>Full amount after verified check-in</dd>
              </div>
              <div>
                <dt>If you do not attend</dt>
                <dd>{DEMO_EVENT.beneficiary}</dd>
              </div>
              <div>
                <dt>Event cancellation</dt>
                <dd>Always enables a full refund claim</dd>
              </div>
            </dl>
            <p className="legal-note">
              This hosted experience is a no-funds sandbox. The linked public
              Testnet transactions independently prove the real reserve and
              refund lifecycle.
            </p>
            <button
              className="button button--primary button--full"
              type="button"
              disabled={busy}
              onClick={handleReserve}
            >
              {busy ? "Simulating reservation…" : "Simulate 2 XLM reservation"}
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
