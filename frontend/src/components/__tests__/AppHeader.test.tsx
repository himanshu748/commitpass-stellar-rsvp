import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { useCommitPass } from "../../state/CommitPassProvider";
import { AppHeader } from "../AppHeader";

vi.mock("../../state/CommitPassProvider", () => ({
  useCommitPass: vi.fn(),
}));

const ACCOUNT =
  "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";
const HASH = "a".repeat(64);
const mockedUseCommitPass = vi.mocked(useCommitPass);

function liveContext(
  overrides: Partial<ReturnType<typeof useCommitPass>> = {},
): ReturnType<typeof useCommitPass> {
  return {
    walletAddress: ACCOUNT,
    walletName: "Freighter",
    walletMode: "live",
    testnetBalance: { status: "ready", amount: "12.345" },
    liveTestnetPayment: {
      mode: "contract",
      status: "confirmed",
      hash: HASH,
      message: "Confirmed in Testnet ledger 123.",
    },
    reservationStatus: "unreserved",
    transaction: null,
    arrivals: [],
    toasts: [],
    scannerPublicKey: null,
    connectDemoWallet: vi.fn(),
    connectLiveWallet: vi.fn(async () => true),
    disconnectWallet: vi.fn(async () => undefined),
    refreshTestnetBalance: vi.fn(async () => undefined),
    sendTestnetPayment: vi.fn(async () => true),
    reserveSpot: vi.fn(async () => undefined),
    simulateVoucher: vi.fn(async () => undefined),
    claimRefund: vi.fn(async () => undefined),
    scanDemoAttendee: vi.fn(async () => undefined),
    rotateScannerKey: vi.fn(async () => undefined),
    dismissToast: vi.fn(),
    pushToast: vi.fn(),
    ...overrides,
  };
}

describe("AppHeader live Testnet proof", () => {
  it("shows a copyable full address, balance, disclosure, and explorer link", async () => {
    mockedUseCommitPass.mockReturnValue(liveContext());
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /GDVEU…ZA57/ }));

    expect(screen.getByText(ACCOUNT, { exact: true })).toBeVisible();
    expect(screen.getByText("12.345 XLM", { exact: true })).toBeVisible();
    expect(
      screen.getByText(/main RSVP demo remains no-funds/i),
    ).toBeVisible();
    expect(screen.getByText(/has no cash value/i)).toBeVisible();
    expect(
      screen.getByRole("link", { name: /View transaction/ }),
    ).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${HASH}`,
    );
  });

  it("locks payment and disconnect controls while a signature is pending", async () => {
    mockedUseCommitPass.mockReturnValue(
      liveContext({
        liveTestnetPayment: {
          mode: "contract",
          status: "signing",
          message: "Confirm in your wallet.",
        },
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /GDVEU…ZA57/ }));

    expect(
      screen.getByRole("button", { name: /Waiting for wallet/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Disconnect" }),
    ).toBeDisabled();
  });
});
