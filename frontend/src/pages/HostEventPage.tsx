import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Coins,
  KeyRound,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  type FormEvent,
  useMemo,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { DEMO_EVENT } from "../data/demo";
import { useCommitPass } from "../state/CommitPassProvider";

export function HostEventPage() {
  const navigate = useNavigate();
  const {
    walletAddress,
    connectDemoWallet,
    pushToast,
    scannerPublicKey,
    rotateScannerKey,
  } = useCommitPass();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const shortKey = useMemo(
    () =>
      scannerPublicKey
        ? `${scannerPublicKey.slice(0, 8)}…${scannerPublicKey.slice(-8)}`
        : "Preparing key…",
    [scannerPublicKey],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setReviewOpen(true);
  };

  const createEvent = async () => {
    if (!walletAddress) connectDemoWallet();
    setCreating(true);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
    setCreating(false);
    setReviewOpen(false);
    pushToast(
      "success",
      "Demo event ready",
      "The judge sandbox is ready. No contract transaction was submitted.",
    );
    navigate("/host/demo/check-in");
  };

  return (
    <>
      <div className="page page--host">
        <Link className="back-link" to="/">
          <ArrowLeft size={17} /> Back to hosted events
        </Link>
        <div className="host-heading">
          <h1>Make every RSVP count.</h1>
          <p>Set a tiny refundable deposit and share one commitment link.</p>
        </div>

        <div className="host-layout">
          <form className="host-form" onSubmit={submit}>
            <ol className="form-stepper" aria-label="Event creation progress">
              <li>
                <span>1</span> Event
              </li>
              <li className="form-stepper__active">
                <span>2</span> Deposit
              </li>
              <li>
                <span>3</span> Review
              </li>
            </ol>

            <section className="form-section">
              <h2>Event details</h2>
              <div className="field-grid">
                <label className="field">
                  <span>Event name</span>
                  <input defaultValue={DEMO_EVENT.name} required />
                </label>
                <label className="field field--icon">
                  <span>Date &amp; time</span>
                  <CalendarDays size={18} />
                  <input defaultValue={DEMO_EVENT.dateLong} required />
                </label>
                <label className="field field--icon">
                  <span>Venue</span>
                  <MapPin size={18} />
                  <input defaultValue={DEMO_EVENT.venue} required />
                </label>
                <label className="field field--icon">
                  <span>Capacity</span>
                  <Users size={18} />
                  <input
                    defaultValue={DEMO_EVENT.capacity}
                    inputMode="numeric"
                    min="1"
                    max="500"
                    type="number"
                    required
                  />
                </label>
                <label className="field field--icon">
                  <span>RSVP closes</span>
                  <CalendarDays size={18} />
                  <input defaultValue={DEMO_EVENT.rsvpCloses} required />
                </label>
                <label className="field field--icon">
                  <span>Check-in window</span>
                  <Clock size={18} />
                  <input defaultValue={DEMO_EVENT.checkInWindow} required />
                </label>
              </div>
            </section>

            <section className="form-section">
              <h2>Refundable commitment</h2>
              <div className="field-grid">
                <label className="field field--icon">
                  <span>Deposit amount</span>
                  <Coins size={18} />
                  <input
                    defaultValue={DEMO_EVENT.deposit}
                    inputMode="decimal"
                    min="0.1"
                    step="0.1"
                    type="number"
                    required
                  />
                </label>
                <label className="field">
                  <span>Asset</span>
                  <select defaultValue="XLM" disabled>
                    <option>XLM</option>
                  </select>
                </label>
                <label className="field">
                  <span>No-show destination</span>
                  <input defaultValue={DEMO_EVENT.beneficiary} required />
                  <small>Attendees see this destination before they reserve.</small>
                </label>
                <div className="field scanner-key-field">
                  <span>Ephemeral scanner public key</span>
                  <div>
                    <KeyRound size={18} />
                    <strong>{shortKey}</strong>
                  </div>
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => void rotateScannerKey()}
                  >
                    <RefreshCw size={14} /> Regenerate key
                  </button>
                </div>
              </div>
            </section>

            <div className="host-form__mobile-actions">
              <button className="button button--primary button--full" type="submit">
                Review event <ArrowRight size={18} />
              </button>
            </div>
          </form>

          <aside className="commitment-summary">
            <span className="return-mark" aria-hidden="true">
              <RefreshCw size={37} />
              <i />
            </span>
            <h2>Event commitment</h2>
            <p className="commitment-summary__amount">
              <strong>2 XLM</strong> per attendee
            </p>
            <p>
              Up to <strong>120 XLM</strong> locked
            </p>
            <ul>
              <li>
                <Check size={18} /> Returned at verified check-in
              </li>
              <li>
                <Check size={18} /> Event cancellation always refunds
              </li>
              <li>
                <Check size={18} /> No-show funds settle after check-in closes
              </li>
            </ul>
            <button
              className="button button--primary button--full"
              type="button"
              onClick={() => setReviewOpen(true)}
            >
              Review event <ArrowRight size={18} />
            </button>
            <button className="button button--outline button--full" type="button">
              Save draft
            </button>
          </aside>
        </div>

        <div className="trust-strip trust-strip--mint">
          <ShieldCheck size={23} />
          <p>
            CommitPass never holds event deposits. Soroban enforces the published
            rules.
          </p>
        </div>
      </div>

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Review the published rules"
        description="Review the terms the judge sandbox will simulate. A deployed event makes these financial rules immutable."
      >
        <dl className="confirm-list">
          <div>
            <dt>Event</dt>
            <dd>{DEMO_EVENT.name}</dd>
          </div>
          <div>
            <dt>Capacity</dt>
            <dd>{DEMO_EVENT.capacity} attendees</dd>
          </div>
          <div>
            <dt>Deposit</dt>
            <dd>2 XLM per reservation</dd>
          </div>
          <div>
            <dt>Check-in</dt>
            <dd>{DEMO_EVENT.checkInWindow}</dd>
          </div>
          <div>
            <dt>No-show destination</dt>
            <dd>{DEMO_EVENT.beneficiary}</dd>
          </div>
          <div>
            <dt>Scanner key</dt>
            <dd>{shortKey}</dd>
          </div>
        </dl>
        <p className="legal-note">
          This sandbox creates a real ephemeral Ed25519 keypair in memory and
          signs locally; it makes no on-chain write. A deployed event stores only
          the public verification key on-chain.
        </p>
        <button
          className="button button--primary button--full"
          type="button"
          disabled={creating || !scannerPublicKey}
          onClick={createEvent}
        >
          {creating ? "Preparing sandbox…" : "Create demo event"}
        </button>
      </Modal>
    </>
  );
}
