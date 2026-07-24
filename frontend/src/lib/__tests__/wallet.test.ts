import albedo from "@albedo-link/intent";
import {
  getAddress,
  getNetworkDetails,
  isConnected,
  requestAccess,
  signAuthEntry,
  signTransaction,
} from "@stellar/freighter-api";
import {
  Account,
  Asset,
  Networks,
  Operation,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { EphemeralScannerSigner } from "../scanner-crypto";
import {
  generatedClientOptions,
  StellarWalletAdapter,
} from "../wallet";
import { DEMO_BENEFICIARY_ADDRESS, DEMO_ORGANIZER_ADDRESS } from "../seed";

vi.mock("@stellar/freighter-api", () => ({
  getAddress: vi.fn(),
  getNetworkDetails: vi.fn(),
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  signAuthEntry: vi.fn(),
  signTransaction: vi.fn(),
}));

vi.mock("@albedo-link/intent", () => ({
  default: {
    forgetImplicitSession: vi.fn(),
    publicKey: vi.fn(),
    tx: vi.fn(),
  },
}));

let albedoSigner: EphemeralScannerSigner;
const ACCOUNT =
  "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";
const OTHER_ACCOUNT = DEMO_ORGANIZER_ADDRESS;
const DESTINATION = DEMO_BENEFICIARY_ADDRESS;

const mockedFreighterConnected = vi.mocked(isConnected);
const mockedFreighterAddress = vi.mocked(getAddress);
const mockedFreighterNetwork = vi.mocked(getNetworkDetails);
const mockedFreighterAccess = vi.mocked(requestAccess);
const mockedFreighterSignAuthEntry = vi.mocked(signAuthEntry);
const mockedFreighterSignTransaction = vi.mocked(signTransaction);
const mockedAlbedo = vi.mocked(albedo, true);

function buildTransaction(
  source = ACCOUNT,
  operationSource?: string,
  amount = "1",
): string {
  return new TransactionBuilder(new Account(source, "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        source: operationSource,
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

function mockFreighterNetwork(
  networkPassphrase = Networks.TESTNET,
): void {
  mockedFreighterNetwork.mockResolvedValue({
    network: networkPassphrase === Networks.TESTNET ? "TESTNET" : "PUBLIC",
    networkUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase,
    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
  });
}

beforeAll(async () => {
  albedoSigner = await EphemeralScannerSigner.fromPrivateKey(
    new Uint8Array(32).fill(7),
  );
});

afterAll(() => {
  albedoSigner.destroy();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedFreighterConnected.mockResolvedValue({ isConnected: false });
  mockedFreighterAddress.mockResolvedValue({ address: ACCOUNT });
  mockedFreighterAccess.mockResolvedValue({ address: ACCOUNT });
  mockFreighterNetwork();
  mockedAlbedo.publicKey.mockImplementation(async ({ token }) => {
    const signedMessage = `${ACCOUNT}:${token}`;
    return {
      pubkey: ACCOUNT,
      signed_message: signedMessage,
      signature: Array.from(
        await albedoSigner.sign(await sha256Utf8(signedMessage)),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join(""),
    };
  });
});

async function sha256Utf8(value: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoded));
}

describe("StellarWalletAdapter", () => {
  it("prefers Freighter and signs transactions and Soroban auth entries", async () => {
    mockedFreighterConnected.mockResolvedValue({ isConnected: true });
    const transactionXdr = buildTransaction();
    const signedTransactionXdr = withDummySignature(transactionXdr);
    mockedFreighterSignTransaction.mockResolvedValue({
      signedTxXdr: signedTransactionXdr,
      signerAddress: ACCOUNT,
    });
    mockedFreighterSignAuthEntry.mockResolvedValue({
      signedAuthEntry: "signed-auth-entry",
      signerAddress: ACCOUNT,
    });
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });

    await expect(adapter.connect()).resolves.toMatchObject({
      status: "connected",
      address: ACCOUNT,
      selectedWalletId: "freighter",
    });
    await expect(
      adapter.signTransaction(transactionXdr, {
        networkPassphrase: Networks.TESTNET,
        address: ACCOUNT,
      }),
    ).resolves.toEqual({
      signedTxXdr: signedTransactionXdr,
      signerAddress: ACCOUNT,
    });
    await expect(
      adapter.signAuthEntry("auth-entry-xdr"),
    ).resolves.toEqual({
      signedAuthEntry: "signed-auth-entry",
      signerAddress: ACCOUNT,
    });

    expect(mockedFreighterNetwork).toHaveBeenCalledTimes(3);
    expect(mockedFreighterSignTransaction).toHaveBeenCalledWith(
      transactionXdr,
      {
        networkPassphrase: Networks.TESTNET,
        address: ACCOUNT,
      },
    );
    expect(mockedFreighterSignAuthEntry).toHaveBeenCalledWith(
      "auth-entry-xdr",
      {
        networkPassphrase: Networks.TESTNET,
        address: ACCOUNT,
      },
    );
    expect(mockedAlbedo.publicKey).not.toHaveBeenCalled();
  });

  it("fails closed when Freighter reports a different network", async () => {
    mockedFreighterConnected.mockResolvedValue({ isConnected: true });
    mockFreighterNetwork(Networks.PUBLIC);
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
    expect(mockedAlbedo.publicKey).not.toHaveBeenCalled();
  });

  it("falls back to Albedo for root-source transaction signing", async () => {
    const transactionXdr = buildTransaction();
    const signedTransactionXdr = withDummySignature(transactionXdr);
    mockedAlbedo.tx.mockResolvedValue({
      xdr: transactionXdr,
      tx_hash: "deadbeef",
      signed_envelope_xdr: signedTransactionXdr,
      network: "testnet",
      result: {},
    });
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });

    await expect(adapter.connect()).resolves.toMatchObject({
      status: "connected",
      address: ACCOUNT,
      selectedWalletId: "albedo",
    });
    await expect(
      adapter.signTransaction(transactionXdr),
    ).resolves.toEqual({
      signedTxXdr: signedTransactionXdr,
      signerAddress: ACCOUNT,
    });
    expect(mockedAlbedo.tx).toHaveBeenCalledWith({
      xdr: transactionXdr,
      pubkey: ACCOUNT,
      network: "testnet",
      submit: false,
    });
  });

  it("rejects a same-source transaction body substituted by Freighter", async () => {
    mockedFreighterConnected.mockResolvedValue({ isConnected: true });
    const requestedXdr = buildTransaction();
    const substitutedXdr = withDummySignature(
      buildTransaction(ACCOUNT, undefined, "2"),
    );
    mockedFreighterSignTransaction.mockResolvedValue({
      signedTxXdr: substitutedXdr,
      signerAddress: ACCOUNT,
    });
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });
    await adapter.connect();

    await expect(adapter.signTransaction(requestedXdr)).rejects.toThrow(
      "Freighter returned a signed transaction whose body differs",
    );
  });

  it("rejects a same-source transaction body substituted by Albedo", async () => {
    const requestedXdr = buildTransaction();
    const substitutedXdr = withDummySignature(
      buildTransaction(ACCOUNT, undefined, "2"),
    );
    mockedAlbedo.tx.mockResolvedValue({
      xdr: requestedXdr,
      tx_hash: "deadbeef",
      signed_envelope_xdr: substitutedXdr,
      network: "testnet",
      result: {},
    });
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });
    await adapter.connect("albedo");

    await expect(adapter.signTransaction(requestedXdr)).rejects.toThrow(
      "Albedo returned a signed transaction whose body differs",
    );
  });

  it("rejects an Albedo account response not bound to the fresh challenge", async () => {
    mockedAlbedo.publicKey.mockResolvedValue({
      pubkey: ACCOUNT,
      signed_message: `${ACCOUNT}:stale-challenge`,
      signature: "00".repeat(64),
    });
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });

    await expect(adapter.connect("albedo")).rejects.toThrow(
      "invalid account-ownership proof",
    );
    expect(adapter.getSnapshot()).toMatchObject({
      status: "error",
      address: undefined,
      selectedWalletId: undefined,
    });
  });

  it("refuses Albedo auth entries and non-root or mixed-source transactions", async () => {
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });
    await adapter.connect("albedo");

    await expect(adapter.signAuthEntry("auth-entry-xdr")).rejects.toThrow(
      "Albedo cannot sign Soroban authorization entries",
    );
    await expect(
      adapter.signTransaction(buildTransaction(OTHER_ACCOUNT)),
    ).rejects.toThrow(
      "root source matches the connected account",
    );
    await expect(
      adapter.signTransaction(buildTransaction(ACCOUNT, OTHER_ACCOUNT)),
    ).rejects.toThrow(
      "different operation source",
    );
    expect(mockedAlbedo.tx).not.toHaveBeenCalled();
  });

  it("checks the requested network and signer before invoking a provider", async () => {
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });
    await adapter.connect("albedo");

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
    expect(mockedAlbedo.tx).not.toHaveBeenCalled();
  });

  it("restores only a verified Freighter session and clears local state", async () => {
    mockedFreighterConnected.mockResolvedValue({ isConnected: true });
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });

    await expect(adapter.restore()).resolves.toMatchObject({
      status: "connected",
      address: ACCOUNT,
      selectedWalletId: "freighter",
    });
    await adapter.disconnect();
    expect(adapter.getSnapshot()).toMatchObject({
      status: "disconnected",
      address: undefined,
      selectedWalletId: undefined,
    });
  });

  it("does not reconnect when Freighter access resolves after disconnect", async () => {
    mockedFreighterConnected.mockResolvedValue({ isConnected: true });
    let resolveAccess:
      | ((value: Awaited<ReturnType<typeof requestAccess>>) => void)
      | undefined;
    mockedFreighterAccess.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAccess = resolve;
        }),
    );
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });

    const connecting = adapter.connect();
    await vi.waitFor(() => expect(mockedFreighterAccess).toHaveBeenCalledOnce());
    await adapter.disconnect();
    resolveAccess?.({ address: ACCOUNT });

    await expect(connecting).rejects.toThrow("connection was cancelled");
    expect(adapter.getSnapshot()).toMatchObject({
      status: "disconnected",
      address: undefined,
      selectedWalletId: undefined,
    });
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
    await adapter.connect("albedo");
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

  it("propagates Freighter API errors and refuses empty signatures", async () => {
    mockedFreighterConnected.mockResolvedValue({ isConnected: true });
    mockedFreighterSignTransaction.mockResolvedValue({
      signedTxXdr: "",
      signerAddress: "",
      error: {
        code: -4,
        message: "User rejected the request",
      },
    });
    const adapter = new StellarWalletAdapter({
      networkPassphrase: Networks.TESTNET,
    });
    await adapter.connect();

    await expect(
      adapter.signTransaction(buildTransaction()),
    ).rejects.toMatchObject({
      code: -4,
      message: expect.stringContaining("User rejected the request"),
    });
  });
});
