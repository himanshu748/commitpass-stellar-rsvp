import {
  ArrowRight,
  CircleCheck,
  QrCode,
  RotateCcw,
  ShieldCheck,
  TicketCheck,
} from "lucide-react";
import { Link } from "react-router-dom";

const steps = [
  {
    number: "01",
    Icon: TicketCheck,
    title: "Reserve a real place",
    body: "Your wallet locks the event’s small, clearly disclosed XLM deposit in the Soroban contract.",
  },
  {
    number: "02",
    Icon: QrCode,
    title: "Check in with your pass",
    body: "The organizer scanner signs a short-lived voucher bound to your event, wallet, and one-time nonce.",
  },
  {
    number: "03",
    Icon: RotateCcw,
    title: "Claim the whole deposit",
    body: "You authorize the claim. The contract verifies the voucher and returns the exact deposit once.",
  },
];

export function HowItWorksPage() {
  return (
    <div className="page simple-page how-page">
      <div className="simple-page__heading">
        <h1>A programmable promise, not a ticket fee.</h1>
        <p>
          CommitPass adds one commitment link to the event page organizers
          already use.
        </p>
      </div>
      <ol className="how-steps">
        {steps.map(({ number, Icon, title, body }) => (
          <li key={number}>
            <span className="how-steps__number">{number}</span>
            <Icon size={31} />
            <h2>{title}</h2>
            <p>{body}</p>
          </li>
        ))}
      </ol>
      <section className="threat-model">
        <ShieldCheck size={30} />
        <div>
          <h2>Honest security, in plain language</h2>
          <p>
            The organizer remains the real-world attendance oracle. CommitPass
            prevents voucher replay, wallet substitution, early no-show
            settlement, and double refunds; it does not claim to prove physical
            presence without trusting the event scanner.
          </p>
          <ul>
            <li>
              <CircleCheck size={17} /> Event-scoped scanner key
            </li>
            <li>
              <CircleCheck size={17} /> Wallet-bound vouchers with a 60-second
              scanner policy
            </li>
            <li>
              <CircleCheck size={17} /> Immutable refund and no-show rules
            </li>
          </ul>
        </div>
      </section>
      <Link className="button button--primary how-page__cta" to="/">
        See the attendee flow <ArrowRight size={18} />
      </Link>
    </div>
  );
}
