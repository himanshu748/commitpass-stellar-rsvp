import albedo from "@albedo-link/intent";
import {
  getAddress as getFreighterAddress,
  getNetworkDetails as getFreighterNetworkDetails,
  isConnected as isFreighterConnected,
  requestAccess as requestFreighterAccess,
  signAuthEntry as signFreighterAuthEntry,
  signTransaction as signFreighterTransaction,
} from "@stellar/freighter-api";
import {
  FeeBumpTransaction,
  Networks,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { verifyAsync } from "@noble/ed25519";

import type { ContractRuntimeConfig } from "./config";
import { CommitPassError, isStellarAddress } from "./domain";
import {
  normalizeTransactionError,
  type NormalizedTransactionError,
} from "./transaction";

export type WalletProviderId = "freighter" | "albedo";

export interface WalletState {
  status: "disconnected" | "connecting" | "connected" | "error";
  address?: string;
  selectedWalletId?: WalletProviderId;
  networkPassphrase: string;
  error?: NormalizedTransactionError;
}

export interface WalletSignOptions {
  networkPassphrase?: string;
  address?: string;
  path?: string;
  submit?: boolean;
  submitUrl?: string;
}

export type ContractSignTransaction = (
  xdr: string,
  options?: WalletSignOptions,
) => Promise<{
  signedTxXdr: string;
  signerAddress?: string;
  error?: { code: number; message: string; ext?: string[] };
}>;

export type ContractSignAuthEntry = (
  authEntry: string,
  options?: Pick<
    WalletSignOptions,
    "networkPassphrase" | "address" | "path"
  >,
) => Promise<{
  signedAuthEntry: string;
  signerAddress?: string;
  error?: { code: number; message: string; ext?: string[] };
}>;

export interface WalletAdapterOptions {
  networkPassphrase: string;
  hideUnsupportedWallets?: boolean;
}

export interface SupportedWallet {
  id: WalletProviderId;
  name: string;
  description: string;
  isAvailable: boolean;
  supportsSorobanAuthEntries: boolean;
}

interface FreighterApiError {
  code: number;
  message: string;
  ext?: string[];
}

const WALLET_NAMES: Readonly<Record<WalletProviderId, string>> = {
  freighter: "Freighter",
  albedo: "Albedo",
};

export class StellarWalletAdapter {
  private state: WalletState;
  private readonly listeners = new Set<() => void>();
  private readonly expectedNetworkPassphrase: string;
  private connectionGeneration = 0;

  constructor(options: WalletAdapterOptions) {
    if (!options.networkPassphrase.trim()) {
      throw new Error("A Stellar network passphrase is required.");
    }
    this.expectedNetworkPassphrase = options.networkPassphrase;
    this.state = {
      status: "disconnected",
      networkPassphrase: options.networkPassphrase,
    };
  }

  getSnapshot = (): WalletState => ({ ...this.state });

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async connect(walletId?: string): Promise<WalletState> {
    const generation = ++this.connectionGeneration;
    this.patchState({ status: "connecting", error: undefined });
    try {
      const provider = walletId
        ? parseWalletProviderId(walletId)
        : await this.preferredProvider();
      const address =
        provider === "freighter"
          ? await this.connectFreighter()
          : await this.connectAlbedo();
      this.assertCurrentConnection(generation);
      this.assertValidAccountAddress(address);
      this.patchState({
        status: "connected",
        address,
        selectedWalletId: provider,
        networkPassphrase: this.expectedNetworkPassphrase,
        error: undefined,
      });
      return this.getSnapshot();
    } catch (cause) {
      if (generation !== this.connectionGeneration) {
        throw new Error("The wallet connection was cancelled.", { cause });
      }
      this.patchState({
        status: "error",
        error: normalizeTransactionError(cause),
        address: undefined,
        selectedWalletId: undefined,
      });
      throw cause;
    }
  }

  async restore(): Promise<WalletState> {
    const generation = ++this.connectionGeneration;
    try {
      if (!(await this.freighterIsAvailable())) {
        if (generation !== this.connectionGeneration) {
          return this.getSnapshot();
        }
        return this.markDisconnected();
      }
      const result = await getFreighterAddress();
      throwFreighterError("Freighter could not restore the account", result.error);
      this.assertValidAccountAddress(result.address);
      await this.assertFreighterNetwork();
      if (generation !== this.connectionGeneration) {
        return this.getSnapshot();
      }
      this.patchState({
        status: "connected",
        address: result.address,
        selectedWalletId: "freighter",
        networkPassphrase: this.expectedNetworkPassphrase,
        error: undefined,
      });
    } catch {
      if (generation !== this.connectionGeneration) {
        return this.getSnapshot();
      }
      return this.markDisconnected();
    }
    return this.getSnapshot();
  }

  async disconnect(): Promise<void> {
    const snapshot = this.getSnapshot();
    this.connectionGeneration += 1;
    if (snapshot.selectedWalletId === "albedo" && snapshot.address) {
      albedo.forgetImplicitSession(snapshot.address);
    }
    this.markDisconnected();
  }

  async listWallets(): Promise<SupportedWallet[]> {
    return [
      {
        id: "freighter",
        name: WALLET_NAMES.freighter,
        description:
          "Browser extension with full Stellar and Soroban signing support.",
        isAvailable: await this.freighterIsAvailable(),
        supportsSorobanAuthEntries: true,
      },
      {
        id: "albedo",
        name: WALLET_NAMES.albedo,
        description:
          "Web wallet for root-source Stellar transaction signatures.",
        isAvailable: typeof window !== "undefined",
        supportsSorobanAuthEntries: false,
      },
    ];
  }

  readonly signTransaction: ContractSignTransaction = async (
    xdr,
    options,
  ) => {
    const address = this.requireConnectedAddress(options?.address);
    this.assertSigningNetwork(options?.networkPassphrase);
    const provider = this.requireSelectedProvider();

    if (provider === "freighter") {
      await this.assertFreighterNetwork();
      const result = await signFreighterTransaction(xdr, {
        networkPassphrase: this.expectedNetworkPassphrase,
        address,
      });
      throwFreighterError(
        "Freighter could not sign the transaction",
        result.error,
      );
      if (!result.signedTxXdr) {
        throw new Error(
          "Freighter returned an empty signed transaction envelope.",
        );
      }
      this.assertSignerAddress(result.signerAddress, address, "Freighter");
      this.assertSignedTransactionMatches(
        xdr,
        result.signedTxXdr,
        "Freighter",
      );
      return {
        signedTxXdr: result.signedTxXdr,
        signerAddress: result.signerAddress,
      };
    }

    this.assertAlbedoRootSourceTransaction(xdr, address);
    const result = await albedo.tx({
      xdr,
      pubkey: address,
      network: albedoNetwork(this.expectedNetworkPassphrase),
      submit: false,
    });
    if (!result.signed_envelope_xdr) {
      throw new Error("Albedo returned an empty signed transaction envelope.");
    }
    this.assertSignedTransactionMatches(
      xdr,
      result.signed_envelope_xdr,
      "Albedo",
    );
    this.assertAlbedoRootSourceTransaction(
      result.signed_envelope_xdr,
      address,
    );
    return {
      signedTxXdr: result.signed_envelope_xdr,
      signerAddress: address,
    };
  };

  readonly signAuthEntry: ContractSignAuthEntry = async (
    authEntry,
    options,
  ) => {
    const address = this.requireConnectedAddress(options?.address);
    this.assertSigningNetwork(options?.networkPassphrase);
    const provider = this.requireSelectedProvider();

    if (provider !== "freighter") {
      throw new Error(
        "Albedo cannot sign Soroban authorization entries. Connect Freighter for this contract action.",
      );
    }

    await this.assertFreighterNetwork();
    const result = await signFreighterAuthEntry(authEntry, {
      networkPassphrase: this.expectedNetworkPassphrase,
      address,
    });
    throwFreighterError(
      "Freighter could not sign the Soroban authorization entry",
      result.error,
    );
    if (!result.signedAuthEntry) {
      throw new Error(
        "Freighter returned an empty Soroban authorization entry.",
      );
    }
    this.assertSignerAddress(result.signerAddress, address, "Freighter");
    return {
      signedAuthEntry: result.signedAuthEntry,
      signerAddress: result.signerAddress,
    };
  };

  dispose(): void {
    this.listeners.clear();
  }

  private async preferredProvider(): Promise<WalletProviderId> {
    return (await this.freighterIsAvailable()) ? "freighter" : "albedo";
  }

  private async freighterIsAvailable(): Promise<boolean> {
    try {
      const result = await isFreighterConnected();
      return !result.error && result.isConnected;
    } catch {
      return false;
    }
  }

  private async connectFreighter(): Promise<string> {
    if (!(await this.freighterIsAvailable())) {
      throw new Error(
        "Freighter is not installed or is unavailable in this browser.",
      );
    }
    const result = await requestFreighterAccess();
    throwFreighterError("Freighter access failed", result.error);
    await this.assertFreighterNetwork();
    return result.address;
  }

  private async connectAlbedo(): Promise<string> {
    if (typeof window === "undefined") {
      throw new Error("Albedo is only available in a browser.");
    }
    const challenge = secureChallenge();
    const result = await albedo.publicKey({
      token: challenge,
      require_existing: true,
    });
    this.assertValidAccountAddress(result.pubkey);
    await verifyAlbedoChallenge(
      result.pubkey,
      challenge,
      result.signed_message,
      result.signature,
    );
    return result.pubkey;
  }

  private async assertFreighterNetwork(): Promise<void> {
    const details = await getFreighterNetworkDetails();
    throwFreighterError(
      "Freighter could not report its active network",
      details.error,
    );
    if (details.networkPassphrase !== this.expectedNetworkPassphrase) {
      throw networkMismatch(
        this.expectedNetworkPassphrase,
        details.networkPassphrase,
      );
    }
  }

  private assertAlbedoRootSourceTransaction(
    xdr: string,
    address: string,
  ): void {
    let transaction;
    try {
      transaction = TransactionBuilder.fromXDR(
        xdr,
        this.expectedNetworkPassphrase,
      );
    } catch (cause) {
      throw new Error(
        "Refusing to send malformed transaction XDR to Albedo.",
        { cause },
      );
    }
    if (transaction instanceof FeeBumpTransaction) {
      throw new Error(
        "Albedo signing is limited to non-fee-bump root-source transactions.",
      );
    }
    if (transaction.source !== address) {
      throw new Error(
        "Albedo can only sign a transaction whose root source matches the connected account.",
      );
    }
    const mismatchedOperation = transaction.operations.some(
      (operation) => operation.source && operation.source !== address,
    );
    if (mismatchedOperation) {
      throw new Error(
        "Albedo cannot sign a transaction containing a different operation source.",
      );
    }
  }

  private assertSignedTransactionMatches(
    requestedXdr: string,
    signedXdr: string,
    providerName: string,
  ): void {
    const requested = parseTransactionXdr(
      requestedXdr,
      this.expectedNetworkPassphrase,
      "The requested transaction XDR is malformed.",
    );
    const signed = parseTransactionXdr(
      signedXdr,
      this.expectedNetworkPassphrase,
      `${providerName} returned malformed signed transaction XDR.`,
    );
    const requestedEnvelopeType = requested.toEnvelope().switch().value;
    const signedEnvelopeType = signed.toEnvelope().switch().value;
    if (
      requestedEnvelopeType !== signedEnvelopeType ||
      !equalBytes(requested.tx.toXDR(), signed.tx.toXDR())
    ) {
      throw new Error(
        `${providerName} returned a signed transaction whose body differs from the requested transaction.`,
      );
    }
  }

  private assertSigningNetwork(networkPassphrase?: string): void {
    if (
      networkPassphrase &&
      networkPassphrase !== this.expectedNetworkPassphrase
    ) {
      throw new CommitPassError(
        "NetworkMismatch",
        "Refusing to sign a transaction for an unexpected network.",
      );
    }
  }

  private assertValidAccountAddress(address: string): void {
    if (!isStellarAddress(address) || !address.startsWith("G")) {
      throw new Error("The wallet returned an invalid account address.");
    }
  }

  private assertSignerAddress(
    signerAddress: string,
    expectedAddress: string,
    providerName: string,
  ): void {
    if (signerAddress !== expectedAddress) {
      throw new Error(
        `${providerName} signed with an account other than the connected wallet.`,
      );
    }
  }

  private requireConnectedAddress(requestedAddress?: string): string {
    if (this.state.status !== "connected" || !this.state.address) {
      throw new Error("Connect a Stellar wallet before signing.");
    }
    if (requestedAddress && requestedAddress !== this.state.address) {
      throw new Error(
        "The requested signer does not match the connected wallet.",
      );
    }
    return this.state.address;
  }

  private requireSelectedProvider(): WalletProviderId {
    if (!this.state.selectedWalletId) {
      throw new Error("The connected wallet provider is unavailable.");
    }
    return this.state.selectedWalletId;
  }

  private assertCurrentConnection(generation: number): void {
    if (generation !== this.connectionGeneration) {
      throw new Error("The wallet connection was cancelled.");
    }
  }

  private markDisconnected(): WalletState {
    this.patchState({
      status: "disconnected",
      address: undefined,
      selectedWalletId: undefined,
      networkPassphrase: this.expectedNetworkPassphrase,
      error: undefined,
    });
    return this.getSnapshot();
  }

  private patchState(patch: Partial<WalletState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function generatedClientOptions(
  config: ContractRuntimeConfig,
  wallet: StellarWalletAdapter,
): {
  contractId: string;
  networkPassphrase: string;
  rpcUrl: string;
  publicKey: string;
  signTransaction: ContractSignTransaction;
  signAuthEntry: ContractSignAuthEntry;
  allowHttp: boolean;
} {
  const snapshot = wallet.getSnapshot();
  if (snapshot.status !== "connected" || !snapshot.address) {
    throw new Error("Connect a wallet before creating a write-enabled client.");
  }
  return {
    contractId: config.contractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    publicKey: snapshot.address,
    signTransaction: wallet.signTransaction,
    signAuthEntry: wallet.signAuthEntry,
    allowHttp: config.network === "standalone",
  };
}

let defaultTestnetAdapter: StellarWalletAdapter | undefined;

/**
 * Compatibility entry point for the app provider. The adapter prefers
 * Freighter when its extension is present, then falls back to Albedo.
 */
export async function connectWallet(): Promise<{
  address: string;
  walletName: string;
}> {
  defaultTestnetAdapter ??= new StellarWalletAdapter({
    networkPassphrase: Networks.TESTNET,
  });
  const connection = await defaultTestnetAdapter.connect();
  if (!connection.address || !connection.selectedWalletId) {
    throw new Error("The wallet connected without returning an address.");
  }
  return {
    address: connection.address,
    walletName: WALLET_NAMES[connection.selectedWalletId],
  };
}

export async function disconnectWallet(): Promise<void> {
  await defaultTestnetAdapter?.disconnect();
}

export async function signConnectedTestnetTransaction(
  transactionXdr: string,
  {
    networkPassphrase,
    address,
  }: {
    networkPassphrase: string;
    address: string;
  },
): ReturnType<ContractSignTransaction> {
  if (!defaultTestnetAdapter) {
    throw new Error("Connect a Stellar wallet before signing.");
  }
  if (networkPassphrase !== Networks.TESTNET) {
    throw networkMismatch(Networks.TESTNET, networkPassphrase);
  }
  return defaultTestnetAdapter.signTransaction(transactionXdr, {
    networkPassphrase: Networks.TESTNET,
    address,
  });
}

function parseWalletProviderId(walletId: string): WalletProviderId {
  if (walletId === "freighter" || walletId === "albedo") {
    return walletId;
  }
  throw new Error(`Unsupported Stellar wallet provider: ${walletId}.`);
}

function throwFreighterError(
  context: string,
  error?: FreighterApiError,
): void {
  if (!error) {
    return;
  }
  throw Object.assign(new Error(`${context}: ${error.message}`), {
    code: error.code,
    ext: error.ext,
  });
}

function networkMismatch(
  expected: string,
  received: string,
): CommitPassError {
  return new CommitPassError(
    "NetworkMismatch",
    "The wallet is connected to a different Stellar network.",
    { details: { expected, received } },
  );
}

function albedoNetwork(passphrase: string): string {
  if (passphrase === Networks.TESTNET) {
    return "testnet";
  }
  if (passphrase === Networks.PUBLIC) {
    return "public";
  }
  return passphrase;
}

function secureChallenge(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function verifyAlbedoChallenge(
  publicKey: string,
  challenge: string,
  signedMessage: string,
  signatureHex: string,
): Promise<void> {
  const expectedMessage = `${publicKey}:${challenge}`;
  if (
    signedMessage !== expectedMessage ||
    !/^[0-9a-f]{128}$/i.test(signatureHex)
  ) {
    throw new Error("Albedo returned an invalid account-ownership proof.");
  }
  const signature = Uint8Array.from(
    signatureHex.match(/.{2}/g) ?? [],
    (byte) => Number.parseInt(byte, 16),
  );
  const verified = await verifyAsync(
    signature,
    await sha256Utf8(expectedMessage),
    Uint8Array.from(StrKey.decodeEd25519PublicKey(publicKey)),
    { zip215: false },
  );
  if (!verified) {
    throw new Error("Albedo account-ownership proof verification failed.");
  }
}

async function sha256Utf8(value: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoded));
}

function parseTransactionXdr(
  xdr: string,
  networkPassphrase: string,
  errorMessage: string,
): ReturnType<typeof TransactionBuilder.fromXDR> {
  try {
    return TransactionBuilder.fromXDR(xdr, networkPassphrase);
  } catch (cause) {
    throw new Error(errorMessage, { cause });
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}
