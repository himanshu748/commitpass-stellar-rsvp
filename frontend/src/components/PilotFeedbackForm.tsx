import { type FormEvent, useState } from "react";

import {
  createPilotFeedback,
  type PilotFeedbackFriction,
  type PilotFeedbackRecord,
  type PilotFeedbackReuseIntent,
  type PilotFeedbackRole,
} from "../lib/pilot-feedback";

const RATING_LABELS = [
  "1 Very difficult",
  "2 Difficult",
  "3 Okay",
  "4 Good",
  "5 Excellent",
] as const;

export interface PilotFeedbackFormProps {
  eventId: string;
  wallet?: string;
  role?: PilotFeedbackRole;
  onSubmit(record: PilotFeedbackRecord): void | Promise<void>;
}

export function PilotFeedbackForm({
  eventId,
  wallet,
  role = "attendee",
  onSubmit,
}: PilotFeedbackFormProps) {
  const [rating, setRating] = useState<number>();
  const [friction, setFriction] =
    useState<PilotFeedbackFriction>("none");
  const [reuseIntent, setReuseIntent] =
    useState<PilotFeedbackReuseIntent>();
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "saved" | "error"
  >("idle");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rating === undefined || reuseIntent === undefined) {
      setStatus("error");
      return;
    }
    setStatus("submitting");
    try {
      const record = createPilotFeedback({
        eventId,
        role,
        rating,
        friction,
        reuseIntent,
        comment,
        wallet,
      });
      await onSubmit(record);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  if (status === "saved") {
    return (
      <p className="feedback-confirmation" role="status">
        Feedback saved. Thank you for helping improve CommitPass.
      </p>
    );
  }

  return (
    <form className="feedback-form" onSubmit={submit}>
      <fieldset>
        <legend>How was your CommitPass experience?</legend>
        <div className="feedback-form__rating">
          {RATING_LABELS.map((label, index) => {
            const value = index + 1;
            return (
              <label key={label}>
                <input
                  checked={rating === value}
                  name="rating"
                  onChange={() => setRating(value)}
                  required
                  type="radio"
                  value={value}
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="field">
        <span>Hardest step</span>
        <select
          value={friction}
          onChange={(event) =>
            setFriction(event.target.value as PilotFeedbackFriction)
          }
        >
          <option value="none">Nothing was difficult</option>
          <option value="wallet">Wallet setup</option>
          <option value="reservation">Reservation</option>
          <option value="check-in">QR check-in</option>
          <option value="refund">Refund</option>
        </select>
      </label>

      <fieldset>
        <legend>Would you use CommitPass again?</legend>
        <div className="feedback-form__choices">
          {(["yes", "no", "unsure"] as const).map((intent) => (
            <label key={intent}>
              <input
                checked={reuseIntent === intent}
                name="reuse-intent"
                onChange={() => setReuseIntent(intent)}
                required
                type="radio"
                value={intent}
              />
              <span>
                {intent === "yes"
                  ? "Yes"
                  : intent === "no"
                    ? "No"
                    : "Unsure"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Anything we should improve?</span>
        <textarea
          maxLength={500}
          onChange={(event) => setComment(event.target.value)}
          rows={4}
          value={comment}
        />
      </label>

      {status === "error" ? (
        <p className="form-error" role="alert">
          Feedback could not be saved. Please try again.
        </p>
      ) : null}
      <button
        className="button button--primary"
        disabled={status === "submitting"}
        type="submit"
      >
        {status === "submitting" ? "Saving feedback…" : "Send feedback"}
      </button>
    </form>
  );
}
