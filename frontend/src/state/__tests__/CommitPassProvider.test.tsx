import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  connectWallet,
  disconnectWallet as disconnectWalletModule,
} from "../../lib/wallet";
import { loadTestnetXlmBalance } from "../../lib/stellar-account";
import {
  CommitPassProvider,
  useCommitPass,
} from "../CommitPassProvider";

vi.mock("../../lib/wallet", () => ({
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signConnectedTestnetTransaction: vi.fn(),
}));

vi.mock("../../lib/stellar-account", () => ({
  loadTestnetXlmBalance: vi.fn(),
  submitTestnetXlmPayment: vi.fn(),
}));

const ACCOUNT =
  "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";

function WalletHarness() {
  const {
    walletAddress,
    walletMode,
    testnetBalance,
    connectDemoWallet,
    connectLiveWallet,
    disconnectWallet,
  } = useCommitPass();

  return (
    <>
      <output data-testid="wallet-state">
        {walletAddress ?? "none"}|{walletMode ?? "none"}|
        {testnetBalance.status}
        {testnetBalance.status === "ready"
          ? `|${testnetBalance.amount}`
          : ""}
      </output>
      <button type="button" onClick={() => void connectLiveWallet()}>
        Connect
      </button>
      <button type="button" onClick={connectDemoWallet}>
        Demo
      </button>
      <button type="button" onClick={() => void disconnectWallet()}>
        Disconnect
      </button>
    </>
  );
}

describe("CommitPassProvider wallet lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectWallet).mockResolvedValue({
      address: ACCOUNT,
      walletName: "Freighter",
    });
    vi.mocked(loadTestnetXlmBalance).mockResolvedValue("12.345");
    vi.mocked(disconnectWalletModule).mockResolvedValue();
  });

  it("loads the Testnet balance after connection and delegates disconnect", async () => {
    const user = userEvent.setup();
    render(
      <CommitPassProvider>
        <WalletHarness />
      </CommitPassProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(screen.getByTestId("wallet-state")).toHaveTextContent(
        `${ACCOUNT}|live|ready|12.345`,
      ),
    );
    expect(loadTestnetXlmBalance).toHaveBeenCalledWith(ACCOUNT);

    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() =>
      expect(screen.getByTestId("wallet-state")).toHaveTextContent(
        "none|none|idle",
      ),
    );
    expect(disconnectWalletModule).toHaveBeenCalledOnce();
  });

  it("ignores a live connection that resolves after choosing the demo wallet", async () => {
    const user = userEvent.setup();
    let resolveConnection:
      | ((value: Awaited<ReturnType<typeof connectWallet>>) => void)
      | undefined;
    vi.mocked(connectWallet).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConnection = resolve;
        }),
    );
    render(
      <CommitPassProvider>
        <WalletHarness />
      </CommitPassProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(connectWallet).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Demo" }));
    expect(screen.getByTestId("wallet-state")).toHaveTextContent(
      "|demo|idle",
    );
    resolveConnection?.({
      address: ACCOUNT,
      walletName: "Freighter",
    });

    await waitFor(() =>
      expect(disconnectWalletModule).toHaveBeenCalledOnce(),
    );
    expect(screen.getByTestId("wallet-state")).toHaveTextContent(
      "|demo|idle",
    );
    expect(loadTestnetXlmBalance).not.toHaveBeenCalled();
  });

  it("ignores a live connection that resolves after disconnect", async () => {
    const user = userEvent.setup();
    let resolveConnection:
      | ((value: Awaited<ReturnType<typeof connectWallet>>) => void)
      | undefined;
    vi.mocked(connectWallet).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConnection = resolve;
        }),
    );
    render(
      <CommitPassProvider>
        <WalletHarness />
      </CommitPassProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(connectWallet).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByTestId("wallet-state")).toHaveTextContent(
      "none|none|idle",
    );
    resolveConnection?.({
      address: ACCOUNT,
      walletName: "Freighter",
    });

    await waitFor(() =>
      expect(disconnectWalletModule).toHaveBeenCalledOnce(),
    );
    expect(screen.getByTestId("wallet-state")).toHaveTextContent(
      "none|none|idle",
    );
    expect(loadTestnetXlmBalance).not.toHaveBeenCalled();
  });
});
