import {
  CircleCheck,
  QrCode,
  RotateCcw,
  TicketCheck,
} from "lucide-react";
import type { ReservationStatus } from "../data/demo";

const steps = [
  {
    key: "reserve",
    title: "Reserve",
    desktopTitle: "Reserve — Lock 2 XLM",
    description: "Secure your spot with a tiny deposit.",
    Icon: TicketCheck,
  },
  {
    key: "checkin",
    title: "Check in",
    desktopTitle: "Check in — Scan your one-time pass",
    description: "The organizer signs a wallet-bound voucher.",
    Icon: QrCode,
  },
  {
    key: "refund",
    title: "Refunded",
    desktopTitle: "Refunded — Get 2 XLM back",
    description: "The full amount returns to your wallet.",
    Icon: RotateCcw,
  },
] as const;

const activeIndex: Record<ReservationStatus, number> = {
  unreserved: 0,
  reserved: 1,
  "voucher-ready": 1,
  refunded: 2,
};

export function CommitmentRoute({
  status,
  compact = false,
}: {
  status: ReservationStatus;
  compact?: boolean;
}) {
  const current = activeIndex[status];

  return (
    <ol className={`commitment-route${compact ? " commitment-route--compact" : ""}`}>
      {steps.map((step, index) => {
        const complete =
          index < current || (status === "refunded" && index === current);
        const active = index === current && !complete;
        const Icon = complete ? CircleCheck : step.Icon;
        return (
          <li
            key={step.key}
            className={[
              "commitment-step",
              active ? "commitment-step--active" : "",
              complete ? "commitment-step--complete" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="commitment-step__marker">
              <Icon size={17} strokeWidth={1.9} />
            </span>
            <span className="commitment-step__copy">
              <strong className="commitment-step__desktop">
                {step.desktopTitle}
              </strong>
              <strong className="commitment-step__mobile">{step.title}</strong>
              {!compact ? <small>{step.description}</small> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

