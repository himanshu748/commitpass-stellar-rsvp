import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PilotFeedbackForm } from "../PilotFeedbackForm";
import { DEMO_ATTENDEE_ADDRESS, SEED_EVENT_ID } from "../../lib/seed";

describe("PilotFeedbackForm", () => {
  it("submits one validated attendee response and shows confirmation", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(
      <PilotFeedbackForm
        eventId={SEED_EVENT_ID}
        wallet={DEMO_ATTENDEE_ADDRESS}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "5 Excellent" }));
    await user.selectOptions(
      screen.getByLabelText("Hardest step"),
      "wallet",
    );
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.type(
      screen.getByLabelText("Anything we should improve?"),
      "Make wallet setup clearer.",
    );
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        eventId: SEED_EVENT_ID,
        role: "attendee",
        rating: 5,
        friction: "wallet",
        reuseIntent: "yes",
        comment: "Make wallet setup clearer.",
        wallet: DEMO_ATTENDEE_ADDRESS,
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Feedback saved. Thank you for helping improve CommitPass.",
    );
    expect(
      screen.queryByRole("button", { name: "Send feedback" }),
    ).not.toBeInTheDocument();
  });

  it("reports storage errors and allows the response to be retried", async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error("Storage unavailable"))
      .mockResolvedValueOnce(undefined);
    render(
      <PilotFeedbackForm eventId={SEED_EVENT_ID} onSubmit={onSubmit} />,
    );

    await user.click(screen.getByRole("radio", { name: "4 Good" }));
    await user.click(screen.getByRole("radio", { name: "Unsure" }));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Feedback could not be saved. Please try again.",
    );
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
