import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import {
  Account,
  Asset,
  Networks,
  Operation,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { DEMO_BENEFICIARY_ADDRESS, DEMO_ORGANIZER_ADDRESS } from "../seed";
import {
  connectWallet,
  disconnectWallet,
  generatedClientOptions,
  getConnectedTestnetWalletAdapter,
  signConnectedTestnetTransaction,
  StellarWalletAdapter,
} from "../wallet";

const kitState = vi.hoisted(() => ({
  selectedModule: {
    productId: "freighter",
    productName: "Freighter",
  },
  modules: [
    {
      productId: "freighter",
      productName: "Freighter",
      signAuthEntry: vi.fn(),
    },
    {
      productId: "albedo",
      productName: "Albedo",
      signAuthEntry: vi.fn(),
    },
    {
      productId: "xbull",
      productName: "xBull",
      signAuthEntry: vi.fn(),
    },
  ],
}));

const kitMocks = vi.hoisted(() => ({
  init: vi.fn(),
  setWallet: vi.fn(),
  getAddress: vi.fn(),
  fetchAddress: vi.fn(),
  authModal: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
  signAuthEntry: vi.fn(),
  disconnect: vi.fn(),
  refreshSupportedWallets: vi.fn(),
  defaultModules: vi.fn(),
}));

vi.mock("@creit.tech/stellar-wallets-kit/modules/utils", () => ({
  defaultModules: kitMocks.defaultModules,
}));

vi.mock("@creit.tech/stellar-wallets-kit/sdk", () => ({
  StellarWalletsKit: {
    init: kitMocks.init,
    setWallet: kitMocks.setWallet,
    getAddress: kitMocks.getAddress,
    fetchAddress: kitMocks.fetchAddress,
    authModal: kitMocks.authModal,
    getNetwork: kitMocks.getNetwork,
    signTransaction: kitMocks.signTransaction,
    signAuthEntry: kitMocks.signAuthEntry,
    disconnect: kitMocks.disconnect,
    refreshSupportedWallets: kitMocks.refreshSupportedWallets,
    get selectedModule() {
      return kitState.selectedModule;
    },
  },
}));

const ACCOUNT =
  "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";
const OTHER_ACCOUNT = DEMO_ORGANIZER_ADDRESS;
const DESTINATION = DEMO_BENEFICIARY_ADDRESS;

const mockedDefaultModules = vi.mocked(defaultModules);
const mockedInit = vi.mocked(StellarWalletsKit.init);
const mockedSetWallet = vi.mocked(StellarWalletsKit.setWallet);
const mockedGetAddress = vi.mocked(StellarWalletsKit.getAddress);
const mockedFetchAddress = vi.mocked(StellarWalletsKit.fetchAddress);
const mockedAuthModal = vi.mocked(StellarWalletsKit.authModal);
const mockedGetNetwork = vi.mocked(StellarWalletsKit.getNetwork);
const mockedSignTransaction = vi.mocked(
  StellarWalletsKit.signTransaction,
);
const mockedSignAuthEntry = vi.mocked(StellarWalletsKit.signAuthEntry);
const mockedDisconnect = vi.mocked(StellarWalletsKit.disconnect);
const mockedRefreshSupportedWallets = vi.mocked(
  StellarWalletsKit.refreshSupportedWallets,
);

function buildTransaction(amount = "1"): string {
  return new TransactionBuilder(new Account(ACCOUNT, "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: DESTINATION,
        asset: Asset.native(),
        amount,
      }),
    )
    .setTimebounds(0, 2_000_000_000)
    .build()
    .toXDR();
}

function withDummySignature(transactionXdr: string): string {
  const transaction = TransactionBuilder.fromXDR(
    transactionXdr,
    Networks.TESTNET,
  );
  transaction.addDecoratedSignature(
    new xdr.DecoratedSignature({
      hint: Buffer.alloc(4, 7),
      signature: Buffer.alloc(64, 11),
    }),
  );
  return transaction.toXDR();
}

beforeEach(() => {
  vi.clearAllMocks();
  kitState.selectedModule = {
    productId: "freighter",
    productName: "Freighter",
  };
  mockedDefaultModules.mockReturnValue(
    kitState.modules as unknown as ReturnType<typeof defaultModules>,
  );
  mockedSetWallet.mockImplementation((walletId) => {
    kitState.selectedModule = {
      productId: walletId,
      productName:
        walletId === "freighter" ? "Freighter" : "Custom Wallet",
    };
  });
  mockedAuthModal.mockResolvedValue({ address: ACCOUNT });
  mockedGetAddress.mockResolvedValue({ address: ACCOUNT });
  mockedFetchAddress.mockResolvedValue({ address: ACCOUNT });
  mockedGetNetwork.mockResolvedValue({
    network: "TESTNET",
    networkPassphrase: Networks.TESTNET,
  });
  mockedDisconnect.mockResolvedValue();
  mockedRefreshSupportedWallets.mockResolvedValue([
    {
      id: "freighter",
      name: "Freighter",
      type: "HOT_WALLET",
      icon: "freighter.svg",
      url: "https://freighter.app",
      isAvailable: true,
      isPlatformWrapper: false,
    },
    {
      id: "albedo",
      name: "Albedo",
      type: "HOT_WALLET",
      icon: "albedo.svg",
      url: "https://albedo.link",
      isAvailable: true,
      isPlatformWrapper: false,
    },
    {
      id: "xbull",
      name: "xBull",
      type: "HOT_WALLET",
      icon: "xbull.svg",
      url: "https://xbull.app",
      isAvailable: true,
      isPlatformWrapper: false,
    },
  ]);
});

describe("StellarWalletAdapter", () => {
  it("initializes the kit and uses authModal when no wallet id is supplied", async () => {
    kitState.selectedModule = {
      productId: "fordefi",
      productName: "Fordefi",
    };
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
      hideUnsupportedWallets: false,
    });

    await expect(adapter.connect()).resolves.toMatchObject({
      status: "connected",
      address: ACCOUNT,
      selectedWalletId: "fordefi",
      selectedWalletName: "Fordefi",
      networkPassphrase: Networks.TESTNET,
    });

    expect(mockedDefaultModules).toHaveBeenCalledOnce();
    expect(mockedInit).toHaveBeenCalledWith({
      modules: kitState.modules,
      network: Networks.TESTNET,
      authModal: { hideUnsupportedWallets: false },
    });
    expect(mockedAuthModal).toHaveBeenCalledOnce();
    expect(mockedSetWallet).not.toHaveBeenCalled();
    expect(mockedGetNetwork).toHaveBeenCalledOnce();
  });

  it("supports an arbitrary toolkit wallet id through explicit selection", async () => {
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });

    await expect(adapter.connect("cactus-link")).resolves.toMatchObject({
      status: "connected",
      address: ACCOUNT,
      selectedWalletId: "cactus-link",
      selectedWalletName: "Custom Wallet",
    });

    expect(mockedSetWallet).toHaveBeenCalledWith("cactus-link");
    expect(mockedFetchAddress).toHaveBeenCalledOnce();
    expect(mockedAuthModal).not.toHaveBeenCalled();
  });

  it("signs transactions and auth entries through the kit with strict checks", async () => {
    const requestedXdr = buildTransaction();
    const signedXdr = withDummySignature(requestedXdr);
    mockedSignTransaction.mockResolvedValue({
      signedTxXdr: signedXdr,
      signerAddress: ACCOUNT,
    });
    mockedSignAuthEntry.mockResolvedValue({
      signedAuthEntry: "signed-auth-entry",
      signerAddress: ACCOUNT,
    });
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });
    await adapter.connect();

    await expect(
      adapter.signTransaction(requestedXdr, {
        networkPassphrase: Networks.TESTNET,
        address: ACCOUNT,
        path: "44'/148'/0'",
      }),
    ).resolves.toEqual({
      signedTxXdr: signedXdr,
      signerAddress: ACCOUNT,
    });
    await expect(
      adapter.signAuthEntry("auth-entry-xdr"),
    ).resolves.toEqual({
      signedAuthEntry: "signed-auth-entry",
      signerAddress: ACCOUNT,
    });

    expect(mockedSignTransaction).toHaveBeenCalledWith(requestedXdr, {
      networkPassphrase: Networks.TESTNET,
      address: ACCOUNT,
      path: "44'/148'/0'",
    });
    expect(mockedSignAuthEntry).toHaveBeenCalledWith("auth-entry-xdr", {
      networkPassphrase: Networks.TESTNET,
      address: ACCOUNT,
    });
    expect(mockedGetNetwork).toHaveBeenCalledTimes(3);
  });

  it("fails closed when the selected wallet reports another network", async () => {
    mockedGetNetwork.mockResolvedValue({
      network: "PUBLIC",
      networkPassphrase: Networks.PUBLIC,
    });
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });

    await expect(adapter.connect()).rejects.toMatchObject({
      name: "NetworkMismatch",
      details: {
        expected: Networks.TESTNET,
        received: Networks.PUBLIC,
      },
    });
    expect(adapter.getSnapshot()).toMatchObject({
      status: "error",
      address: undefined,
      selectedWalletId: undefined,
      error: { category: "configuration", retryable: false },
    });
  });

  it("keeps Testnet signing available when an official module cannot report its network", async () => {
    kitState.selectedModule = {
      productId: "albedo",
      productName: "Albedo",
    };
    const requestedXdr = buildTransaction();
    const signedXdr = withDummySignature(requestedXdr);
    mockedSignTransaction.mockResolvedValue({
      signedTxXdr: signedXdr,
      signerAddress: ACCOUNT,
    });
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });

    await expect(adapter.connect()).resolves.toMatchObject({
      status: "connected",
      selectedWalletId: "albedo",
    });
    await expect(adapter.signTransaction(requestedXdr)).resolves.toEqual({
      signedTxXdr: signedXdr,
      signerAddress: ACCOUNT,
    });

    expect(mockedGetNetwork).not.toHaveBeenCalled();
    expect(mockedSignTransaction).toHaveBeenCalledWith(requestedXdr, {
      networkPassphrase: Networks.TESTNET,
      address: ACCOUNT,
    });
  });

  it("rechecks the network before signing and never invokes a mismatched wallet", async () => {
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });
    await adapter.connect();
    mockedGetNetwork.mockResolvedValue({
      network: "PUBLIC",
      networkPassphrase: Networks.PUBLIC,
    });

    await expect(
      adapter.signTransaction(buildTransaction()),
    ).rejects.toMatchObject({ name: "NetworkMismatch" });
    expect(mockedSignTransaction).not.toHaveBeenCalled();
  });

  it("rejects a signed envelope whose transaction body was substituted", async () => {
    const requestedXdr = buildTransaction();
    mockedSignTransaction.mockResolvedValue({
      signedTxXdr: withDummySignature(buildTransaction("2")),
      signerAddress: ACCOUNT,
    });
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });
    await adapter.connect();

    await expect(adapter.signTransaction(requestedXdr)).rejects.toThrow(
      "signed transaction whose body differs",
    );
  });

  it("rejects a signer address that differs from the connected account", async () => {
    const requestedXdr = buildTransaction();
    mockedSignTransaction.mockResolvedValue({
      signedTxXdr: withDummySignature(requestedXdr),
      signerAddress: OTHER_ACCOUNT,
    });
    mockedSignAuthEntry.mockResolvedValue({
      signedAuthEntry: "signed-auth-entry",
      signerAddress: OTHER_ACCOUNT,
    });
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });
    await adapter.connect();

    await expect(adapter.signTransaction(requestedXdr)).rejects.toThrow(
      "account other than the connected wallet",
    );
    await expect(adapter.signAuthEntry("auth-entry-xdr")).rejects.toThrow(
      "account other than the connected wallet",
    );
  });

  it("accepts toolkit signatures when the wallet omits its optional signer address", async () => {
    const requestedXdr = buildTransaction();
    const signedXdr = withDummySignature(requestedXdr);
    mockedSignTransaction.mockResolvedValue({
      signedTxXdr: signedXdr,
    });
    mockedSignAuthEntry.mockResolvedValue({
      signedAuthEntry: "signed-auth-entry",
    });
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });
    await adapter.connect();

    await expect(adapter.signTransaction(requestedXdr)).resolves.toEqual({
      signedTxXdr: signedXdr,
      signerAddress: undefined,
    });
    await expect(
      adapter.signAuthEntry("auth-entry-xdr"),
    ).resolves.toEqual({
      signedAuthEntry: "signed-auth-entry",
      signerAddress: undefined,
    });
  });

  it("checks requested signing network and address before calling the kit", async () => {
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });
    await adapter.connect();

    await expect(
      adapter.signTransaction(buildTransaction(), {
        networkPassphrase: Networks.PUBLIC,
      }),
    ).rejects.toMatchObject({ name: "NetworkMismatch" });
    await expect(
      adapter.signTransaction(buildTransaction(), {
        address: OTHER_ACCOUNT,
      }),
    ).rejects.toThrow(
      "requested signer does not match the connected wallet",
    );
    expect(mockedSignTransaction).not.toHaveBeenCalled();
  });

  it("normalizes plain toolkit rejection objects without losing their code", async () => {
    mockedAuthModal.mockRejectedValue({
      code: -1,
      message: "The user closed the modal.",
      ext: "auth-modal",
    });
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });

    await expect(adapter.connect()).rejects.toMatchObject({
      code: -1,
      message: "The user closed the modal.",
      ext: "auth-modal",
    });
    expect(adapter.getSnapshot()).toMatchObject({
      status: "error",
      error: {
        category: "wallet-rejected",
        retryable: true,
      },
    });
  });

  it("restores a cached kit address only after validating its network", async () => {
    kitState.selectedModule = {
      productId: "freighter",
      productName: "Freighter",
    };
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });

    await expect(adapter.restore()).resolves.toMatchObject({
      status: "connected",
      address: ACCOUNT,
      selectedWalletId: "freighter",
      selectedWalletName: "Freighter",
    });
    expect(mockedGetAddress).toHaveBeenCalledOnce();
    expect(mockedGetNetwork).toHaveBeenCalledOnce();
  });

  it("disconnects the kit and clears local connection state", async () => {
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });
    await adapter.connect();

    await adapter.disconnect();

    expect(mockedDisconnect).toHaveBeenCalledOnce();
    expect(adapter.getSnapshot()).toMatchObject({
      status: "disconnected",
      address: undefined,
      selectedWalletId: undefined,
      selectedWalletName: undefined,
    });
  });

  it("does not reconnect when authModal resolves after disconnect", async () => {
    let resolveAuth:
      | ((value: { address: string }) => void)
      | undefined;
    mockedAuthModal.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAuth = resolve;
        }),
    );
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });

    const connecting = adapter.connect();
    await vi.waitFor(() => expect(mockedAuthModal).toHaveBeenCalledOnce());
    await adapter.disconnect();
    resolveAuth?.({ address: ACCOUNT });

    await expect(connecting).rejects.toThrow("connection was cancelled");
    expect(adapter.getSnapshot()).toMatchObject({
      status: "disconnected",
      address: undefined,
      selectedWalletId: undefined,
    });
    expect(mockedGetNetwork).not.toHaveBeenCalled();
  });

  it("lists toolkit modules through the compatibility wallet shape", async () => {
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });

    await expect(adapter.listWallets()).resolves.toEqual([
      expect.objectContaining({
        id: "freighter",
        name: "Freighter",
        isAvailable: true,
        supportsSorobanAuthEntries: true,
      }),
      expect.objectContaining({
        id: "albedo",
        name: "Albedo",
        isAvailable: true,
        supportsSorobanAuthEntries: false,
      }),
      expect.objectContaining({
        id: "xbull",
        name: "xBull",
        isAvailable: true,
        supportsSorobanAuthEntries: false,
      }),
    ]);
  });

  it("exposes generated-client callbacks only after connection", async () => {
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });
    const config = {
      mode: "contract" as const,
      network: "testnet" as const,
      networkPassphrase: Networks.TESTNET,
      rpcUrl: "https://soroban-testnet.stellar.org",
      contractId:
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      xlmSacId:
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
    };

    expect(() => generatedClientOptions(config, adapter)).toThrow(
      "Connect a wallet",
    );
    await adapter.connect();
    expect(() =>
      generatedClientOptions(
        { ...config, networkPassphrase: Networks.PUBLIC },
        adapter,
      ),
    ).toThrow("different Stellar network");
    expect(generatedClientOptions(config, adapter)).toMatchObject({
      contractId: config.contractId,
      networkPassphrase: Networks.TESTNET,
      rpcUrl: config.rpcUrl,
      publicKey: ACCOUNT,
      allowHttp: false,
      signTransaction: adapter.signTransaction,
      signAuthEntry: adapter.signAuthEntry,
    });
  });
});

describe("Testnet compatibility exports", () => {
  it("returns the connected adapter, product name, and selected wallet id", async () => {
    expect(() => getConnectedTestnetWalletAdapter()).toThrow(
      "Connect a Testnet wallet",
    );
    kitState.selectedModule = {
      productId: "lobstr",
      productName: "LOBSTR",
    };

    await expect(connectWallet()).resolves.toEqual({
      address: ACCOUNT,
      walletName: "LOBSTR",
      walletId: "lobstr",
    });
    expect(getConnectedTestnetWalletAdapter()).toBeInstanceOf(
      StellarWalletAdapter,
    );

    const requestedXdr = buildTransaction();
    const signedXdr = withDummySignature(requestedXdr);
    mockedSignTransaction.mockResolvedValue({
      signedTxXdr: signedXdr,
      signerAddress: ACCOUNT,
    });
    await expect(
      signConnectedTestnetTransaction(requestedXdr, {
        networkPassphrase: Networks.TESTNET,
        address: ACCOUNT,
      }),
    ).resolves.toEqual({
      signedTxXdr: signedXdr,
      signerAddress: ACCOUNT,
    });

    await disconnectWallet();
    expect(() => getConnectedTestnetWalletAdapter()).toThrow(
      "Connect a Testnet wallet",
    );
  });
});
