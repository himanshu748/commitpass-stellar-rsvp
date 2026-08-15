import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Clock3,
  Copy,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router-dom";
import { PilotFeedbackForm } from "../components/PilotFeedbackForm";
import { TransactionStatus } from "../components/TransactionStatus";
import { DEMO_EVENT, DEMO_WALLET, shortAddress } from "../data/demo";
import {
  pilotFeedbackCodec,
  type PilotFeedbackRecord,
  upsertPilotFeedback,
} from "../lib/pilot-feedback";
import {
  browserLocalStorage,
  buildStorageNamespace,
  NamespacedStorage,
} from "../lib/storage";
import { createAttendeePass, encodeAttendeePass } from "../lib/voucher";
import { useCommitPass } from "../state/CommitPassProvider";

export function PassPage() {
  const {
    walletAddress,
    reservationStatus,
    transaction,
    simulateVoucher,
    claimRefund,
    pushToast,
  } = useCommitPass();
  const [busy, setBusy] = useState(false);
  const saveFeedback = useCallback((record: PilotFeedbackRecord) => {
    const storage = browserLocalStorage();
    if (!storage) {
      throw new Error("Browser storage is unavailable.");
    }
    const feedbackStorage = new NamespacedStorage(
      storage,
      buildStorageNamespace({ mode: "demo", network: "testnet" }),
    );
    const current = feedbackStorage.read(
      "pilot-feedback",
      pilotFeedbackCodec,
    );
    if (current.status === "invalid") {
      throw current.error;
    }
    feedbackStorage.write(
      "pilot-feedback",
      upsertPilotFeedback(
        current.status === "valid" ? current.value : [],
        record,
      ),
      pilotFeedbackCodec,
    );
  }, []);
  const passCode = useMemo(
    () => encodeAttendeePass(
      createAttendeePass({
        eventId: DEMO_EVENT.contractEventId,
        attendee: walletAddress ?? DEMO_WALLET,
        issuedAt: Math.floor(Date.now() / 1_000),
      }),
    ),
    [walletAddress],
  );

  const simulateScan = async () => {
    setBusy(true);
    try {
      await simulateVoucher();
    } finally {
      setBusy(false);
    }
  };

  const refund = async () => {
    setBusy(true);
    try {
      await claimRefund();
    } finally {
      setBusy(false);
    }
  };

  if (reservationStatus === "unreserved") {
    return (
      <div className="page empty-page">
        <QrCode size={38} />
        <h1>Reserve before opening a pass.</h1>
        <p>Your one-time QR is created only after the deposit is locked.</p>
        <Link className="button button--primary" to="/">
          View event <ArrowRight size={18} />
        </Link>
      </div>
    );
  }

  return (
    <div className="page page--pass">
      <Link className="back-link" to="/">
        <ArrowLeft size={17} /> Back to event
      </Link>
      <div className="pass-layout">
        <section className="pass-card">
          <div className="pass-card__heading">
            <p className="label">Your one-time pass</p>
            <h1>{DEMO_EVENT.name}</h1>
            <p>{DEMO_EVENT.date}</p>
          </div>
          {reservationStatus === "refunded" ? (
            <div className="refund-complete">
              <span>
                <CircleCheck size={38} />
              </span>
              <h2>2 XLM returned</h2>
              <p>Your check-in was verified and the commitment is complete.</p>
            </div>
          ) : (
            <div className="qr-wrap">
              <QRCodeSVG
                value={passCode}
                size={246}
                bgColor="#ffffff"
                fgColor="#081120"
                level="M"
                marginSize={2}
                title="CommitPass attendee check-in QR"
              />
              <button
                className="text-link"
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(passCode);
                  pushToast(
                    "success",
                    "Pass code copied",
                    "Share it only with the organizer at the venue.",
                  );
                }}
              >
                <Copy size={15} /> Copy fallback code
              </button>
            </div>
          )}
          <div className="pass-wallet">
            <small>Bound to</small>
            <strong>{shortAddress(walletAddress ?? "Demo wallet")}</strong>
          </div>
        </section>

        <aside className="pass-actions">
          {reservationStatus === "reserved" ? (
            <>
              <p className="label">At the venue</p>
              <h2>Show this pass to the organizer.</h2>
              <p>
                Their event scanner verifies your reservation and signs a
                short-lived refund voucher for this wallet.
              </p>
              <div className="security-note security-note--open">
                <ShieldCheck size={23} />
                <p>
                  Organizer-attested attendance with wallet binding and
                  cryptographic anti-replay.
                </p>
              </div>
              <button
                className="button button--primary button--full"
                type="button"
                disabled={busy}
                onClick={simulateScan}
              >
                {busy ? "Signing voucher…" : "Simulate organizer scan"}
              </button>
              <p className="demo-hint">
                Demo control: a live pilot receives this voucher through the
                scanner relay.
              </p>
            </>
          ) : reservationStatus === "voucher-ready" ? (
            <>
              <span className="voucher-ready-icon">
                <CircleCheck size={28} />
              </span>
              <p className="label">Voucher received</p>
              <h2>Check-in verified.</h2>
              <p>
                This demo voucher is bound to your wallet and uses a 60-second
                scanner policy.
              </p>
              <div className="voucher-timer">
                <Clock3 size={19} />
                <span>00:60</span>
                <small>One claim only</small>
              </div>
              <button
                className="button button--primary button--full"
                type="button"
                disabled={busy}
                onClick={refund}
              >
                {busy ? "Simulating refund…" : "Simulate my 2 XLM refund"}
              </button>
            </>
          ) : (
            <>
              <p className="label">Commitment complete</p>
              <h2>Thanks for showing up.</h2>
              <p>
                Your transaction receipt is ready. Share a short optional
                response to help improve the pilot.
              </p>
              <PilotFeedbackForm
                eventId={DEMO_EVENT.contractEventId}
                wallet={walletAddress ?? undefined}
                onSubmit={saveFeedback}
              />
              <Link className="button button--outline button--full" to="/">
                Return to event
              </Link>
            </>
          )}
          <TransactionStatus transaction={transaction} />
        </aside>
      </div>
    </div>
  );
}
