import {
  ArrowRight,
  CalendarDays,
  Coins,
  MapPin,
} from "lucide-react";
import { Link } from "react-router-dom";
import { DEMO_EVENT } from "../data/demo";
import { useCommitPass } from "../state/CommitPassProvider";

export function MyRsvpsPage() {
  const { reservationStatus } = useCommitPass();
  return (
    <div className="page simple-page">
      <div className="simple-page__heading">
        <h1>My RSVPs</h1>
        <p>Every commitment, check-in, and refund in one clear place.</p>
      </div>
      <div className="rsvp-list">
        <Link className="rsvp-row" to="/events/demo">
          <span className="rsvp-row__date">
            <strong>12</strong>
            <small>Aug</small>
          </span>
          <span>
            <strong>{DEMO_EVENT.name}</strong>
            <small>
              <MapPin size={14} /> {DEMO_EVENT.venue}
            </small>
          </span>
          <span>
            <CalendarDays size={16} /> {DEMO_EVENT.date}
          </span>
          <span>
            <Coins size={16} /> 2 XLM
          </span>
          <em>
            {reservationStatus === "unreserved"
              ? "Available"
              : reservationStatus === "refunded"
                ? "Refunded"
                : "Reserved"}
          </em>
          <ArrowRight size={18} />
        </Link>
        <Link className="rsvp-row" to="/">
          <span className="rsvp-row__date rsvp-row__date--blue">
            <strong>22</strong>
            <small>Aug</small>
          </span>
          <span>
            <strong>Open Source Saturday</strong>
            <small>
              <MapPin size={14} /> SG Palya, Bangalore
            </small>
          </span>
          <span>
            <CalendarDays size={16} /> Sat, 22 Aug · 10:00 AM
          </span>
          <span>
            <Coins size={16} /> 1 XLM
          </span>
          <em>Reserved</em>
          <ArrowRight size={18} />
        </Link>
      </div>
    </div>
  );
}

