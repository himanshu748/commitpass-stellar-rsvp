import {
  ArrowLeft,
  Camera,
  Check,
  ExternalLink,
  Keyboard,
  Search,
  ShieldCheck,
  StopCircle,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { Modal } from "../components/Modal";
import { DEMO_EVENT } from "../data/demo";
import { useCommitPass } from "../state/CommitPassProvider";

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorConstructor = new (options: {
  formats: string[];
}) => BarcodeDetectorLike;

const statusLabels = {
  "checked-in": "Checked in",
  "voucher-sent": "Voucher sent",
  reserved: "Reserved",
};

export function CheckInPage() {
  const { arrivals, scanDemoAttendee, pushToast } = useCommitPass();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [manualError, setManualError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [query, setQuery] = useState("");
  const [lastScan, setLastScan] = useState("Aarav · GD3K…2P9Q");

  const filteredArrivals = useMemo(
    () =>
      arrivals.filter((arrival) =>
        `${arrival.name} ${arrival.wallet}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [arrivals, query],
  );

  const stopCamera = () => {
    if (scanTimerRef.current) window.clearInterval(scanTimerRef.current);
    scanTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  useEffect(() => stopCamera, []);

  const acceptCode = async (code: string): Promise<boolean> => {
    setVerifying(true);
    try {
      await scanDemoAttendee(code);
      setLastScan("Riya · GCF2…6K8M");
      setManualCode("");
      setManualError("");
      setManualOpen(false);
      return true;
    } catch (error) {
      setManualError(
        error instanceof Error
          ? error.message
          : "Enter a valid CommitPass one-time code.",
      );
      return false;
    } finally {
      setVerifying(false);
    }
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setManualOpen(true);
      pushToast(
        "info",
        "Camera unavailable",
        "Use the manual-code fallback on this browser.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      const Detector = (
        window as typeof window & {
          BarcodeDetector?: BarcodeDetectorConstructor;
        }
      ).BarcodeDetector;
      if (Detector && videoRef.current) {
        const detector = new Detector({ formats: ["qr_code"] });
        scanTimerRef.current = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          const results = await detector.detect(videoRef.current);
          const code = results[0]?.rawValue;
          if (code) {
            if (await acceptCode(code)) {
              stopCamera();
            }
          }
        }, 350);
      }
    } catch {
      setManualOpen(true);
      pushToast(
        "info",
        "Camera permission was not granted",
        "You can paste or type the attendee’s one-time code instead.",
      );
    }
  };

  const checkedIn = arrivals.filter(
    (arrival) => arrival.status === "checked-in",
  ).length;

  return (
    <div className="page page--checkin">
      <Link className="back-link" to="/host">
        <ArrowLeft size={17} /> Back to event
      </Link>
      <div className="checkin-heading">
          <h1>Check-in sandbox</h1>
        <p>
          {DEMO_EVENT.name} · {DEMO_EVENT.date}
        </p>
        <span>
          <i /> Check-in open until 7:15 PM
        </span>
      </div>

      <div className="live-metrics" aria-label="Live attendance">
        <div>
          <strong>{DEMO_EVENT.reserved}</strong>
          <span>Reserved</span>
        </div>
        <div>
          <strong>{DEMO_EVENT.checkedIn + checkedIn}</strong>
          <span>Checked in</span>
        </div>
        <div>
          <strong>{DEMO_EVENT.reserved - DEMO_EVENT.checkedIn}</strong>
          <span>Waiting</span>
        </div>
        <div>
          <strong>54</strong>
          <span>Demo XLM refunded</span>
        </div>
      </div>

      <div className="checkin-layout">
        <section className="scanner-section">
          <h2>Scan an attendee pass</h2>
          <div className={`scanner-frame${cameraActive ? " scanner-frame--live" : ""}`}>
            <video ref={videoRef} muted playsInline />
            <span className="finder finder--tl" />
            <span className="finder finder--tr" />
            <span className="finder finder--bl" />
            <span className="finder finder--br" />
            {!cameraActive ? (
              <div className="scanner-frame__empty">
                <Camera size={36} />
                <span>Camera preview</span>
              </div>
            ) : null}
          </div>
          <p className="scanner-help">
            Place the attendee’s one-time QR inside the frame.
          </p>
          <div className="scanner-actions">
            <button
              className="button button--primary"
              type="button"
              onClick={cameraActive ? stopCamera : startCamera}
            >
              {cameraActive ? (
                <>
                  <StopCircle size={18} /> Stop camera
                </>
              ) : (
                <>
                  <Camera size={18} /> Start camera
                </>
              )}
            </button>
            <button
              className="button button--outline"
              type="button"
              onClick={() => setManualOpen(true)}
            >
              <Keyboard size={18} /> Enter code instead
            </button>
          </div>

          <div className="last-scan">
            <span className="last-scan__check">
              <Check size={27} />
            </span>
            <div>
              <strong>{lastScan}</strong>
              <small>Checked in just now</small>
            </div>
            <span>Demo refund voucher signed locally</span>
            <em>Signature verified</em>
          </div>
        </section>

        <aside className="arrival-queue">
          <h2>Arrival queue</h2>
          <label className="search-field">
            <Search size={19} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search wallet or name"
              aria-label="Search arrival queue"
            />
          </label>
          <ul>
            {filteredArrivals.map((arrival) => (
              <li key={arrival.wallet}>
                <span className="arrival-avatar">{arrival.name[0]}</span>
                <strong>{arrival.name}</strong>
                <span>· {arrival.wallet}</span>
                <em className={`status status--${arrival.status}`}>
                  {statusLabels[arrival.status]}
                </em>
              </li>
            ))}
          </ul>
          <div className="security-note">
            <ShieldCheck size={22} />
            <p>
              The demo enforces a 60-second scanner policy. The contract enforces
              the signed expiry, event window, wallet binding, and one-time nonce.
            </p>
          </div>
        </aside>
      </div>

      <a
        className="activity-link"
        href="https://stellar.expert/explorer/testnet/tx/291d1d02ad1a741b22db56440293fd8b65813ca7002387573505dae65f163bdb"
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink size={17} /> View the real Testnet refund proof
      </a>

      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Enter attendee code"
        description="The sandbox decodes the full pass, checks its event, seeded reservation, freshness, and nonce, then signs with the in-memory demo key."
        size="small"
      >
        <label className="field">
          <span>One-time pass</span>
          <input
            autoFocus
            value={manualCode}
            onChange={(event) => {
              setManualCode(event.target.value);
              setManualError("");
            }}
            placeholder="commitpass:pass:v1:…"
            aria-invalid={manualError ? "true" : undefined}
            aria-describedby={manualError ? "manual-code-error" : undefined}
          />
        </label>
        {manualError ? (
          <p id="manual-code-error" className="field-error" role="alert">
            {manualError}
          </p>
        ) : null}
        <button
          className="button button--primary button--full"
          type="button"
          disabled={verifying}
          onClick={() => void acceptCode(manualCode)}
        >
          {verifying ? "Verifying pass…" : "Verify and sign demo voucher"}
        </button>
      </Modal>
    </div>
  );
}
