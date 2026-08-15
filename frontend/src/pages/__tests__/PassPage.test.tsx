import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEMO_ATTENDEE_ADDRESS } from "../../lib/seed";
import {
  buildStorageNamespace,
  NamespacedStorage,
} from "../../lib/storage";
import { pilotFeedbackCodec } from "../../lib/pilot-feedback";
import { PassPage } from "../PassPage";

const context = vi.hoisted(() => ({
  walletAddress: "",
  reservationStatus: "refunded",
  transaction: null,
  simulateVoucher: vi.fn(),
  claimRefund: vi.fn(),
  pushToast: vi.fn(),
}));

vi.mock("../../state/CommitPassProvider", () => ({
  useCommitPass: () => context,
}));

describe("PassPage post-refund feedback", () => {
  beforeEach(() => {
    context.walletAddress = DEMO_ATTENDEE_ADDRESS;
    context.reservationStatus = "refunded";
    window.localStorage.clear();
  });

  it("persists one validated response after the attendee refund", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PassPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("radio", { name: "5 Excellent" }));
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.selectOptions(
      screen.getByLabelText("Hardest step"),
      "check-in",
    );
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Feedback saved",
    );
    const storage = new NamespacedStorage(
      window.localStorage,
      buildStorageNamespace({ mode: "demo", network: "testnet" }),
    );
    await waitFor(() => {
      const saved = storage.read("pilot-feedback", pilotFeedbackCodec);
      expect(saved.status).toBe("valid");
      if (saved.status === "valid") {
        expect(saved.value).toHaveLength(1);
        expect(saved.value[0]).toEqual(
          expect.objectContaining({
            role: "attendee",
            rating: 5,
            friction: "check-in",
            reuseIntent: "yes",
            wallet: DEMO_ATTENDEE_ADDRESS,
          }),
        );
      }
    });
  });
});
