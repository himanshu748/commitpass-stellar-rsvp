import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import type {
  ModuleInterface,
  Networks as WalletKitNetwork,
} from "@creit.tech/stellar-wallets-kit/types";
import {
  Networks,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import type { ContractRuntimeConfig } from "./config";
import { CommitPassError, isStellarAddress } from "./domain";
import {
  normalizeTransactionError,
  type NormalizedTransactionError,
} from "./transaction";

export type WalletProviderId = string;

export interface WalletState {
  status: "disconnected" | "connecting" | "connected" | "error";
  address?: string;
  selectedWalletId?: WalletProviderId;
  selectedWalletName?: string;
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

export interface ConnectedWallet {
  address: string;
  walletName: string;
  /**
   * Optional for backwards-compatible consumers, but populated by
   * `connectWallet` for every successful Stellar Wallets Kit connection.
   */
  walletId?: WalletProviderId;
}

interface SelectedWallet {
  id: string;
  name: string;
}

// Stellar Wallets Kit 2.5 does not expose a capability flag and several
// modules implement signAuthEntry only to reject it. Keep this conservative.
const SOROBAN_AUTH_ENTRY_WALLET_IDS = new Set([
  "cactuslink",
  "dcent",
  "freighter",
  "hana",
  "klever",
  "onekey",
]);

export class StellarWalletAdapter {
  private state: WalletState;
  private readonly listeners = new Set<() => void>();
  private readonly expectedNetworkPassphrase: string;
  private readonly modules: ModuleInterface[];
  private connectionGeneration = 0;

  constructor(options: WalletAdapterOptions) {
    if (!options.networkPassphrase.trim()) {
      throw new Error("A Stellar network passphrase is required.");
    }

    this.expectedNetworkPassphrase = options.networkPassphrase;
    this.modules = defaultModules();
    this.state = {
      status: "disconnected",
      networkPassphrase: options.networkPassphrase,
    };

    StellarWalletsKit.init({
      modules: this.modules,
      network: options.networkPassphrase as WalletKitNetwork,
      authModal: {
        hideUnsupportedWallets: options.hideUnsupportedWallets ?? true,
      },
    });
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
      const { address } = walletId
        ? await this.connectSelectedWallet(walletId)
        : await StellarWalletsKit.authModal();
      this.assertCurrentConnection(generation);
      this.assertValidAccountAddress(address);

      const selectedWallet = this.getSelectedWallet();
      await this.assertKitNetwork();
      this.assertCurrentConnection(generation);

      this.patchState({
        status: "connected",
        address,
        selectedWalletId: selectedWallet.id,
        selectedWalletName: selectedWallet.name,
        networkPassphrase: this.expectedNetworkPassphrase,
        error: undefined,
      });
      return this.getSnapshot();
    } catch (cause) {
      if (generation !== this.connectionGeneration) {
        throw new Error("The wallet connection was cancelled.", { cause });
      }

      const error = normalizeWalletKitError(cause);
      this.patchState({
        status: "error",
        error: normalizeTransactionError(error),
        address: undefined,
        selectedWalletId: undefined,
        selectedWalletName: undefined,
      });
      throw error;
    }
  }

  async restore(): Promise<WalletState> {
    const generation = ++this.connectionGeneration;
    try {
      const { address } = await StellarWalletsKit.getAddress();
      this.assertCurrentConnection(generation);
      this.assertValidAccountAddress(address);

      const selectedWallet = this.getSelectedWallet();
      await this.assertKitNetwork();
      if (generation !== this.connectionGeneration) {
        return this.getSnapshot();
      }

      this.patchState({
        status: "connected",
        address,
        selectedWalletId: selectedWallet.id,
        selectedWalletName: selectedWallet.name,
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
    this.connectionGeneration += 1;
    let disconnectError: Error | undefined;
    try {
      await StellarWalletsKit.disconnect();
    } catch (cause) {
      disconnectError = normalizeWalletKitError(cause);
    } finally {
      this.markDisconnected();
    }
    if (disconnectError) {
      throw disconnectError;
    }
  }

  async listWallets(): Promise<SupportedWallet[]> {
    try {
      const supportedWallets =
        await StellarWalletsKit.refreshSupportedWallets();
      return supportedWallets.map((wallet) => ({
        id: wallet.id,
        name: wallet.name,
        description: wallet.url
          ? `${wallet.name} wallet (${wallet.url})`
          : `${wallet.name} wallet via Stellar Wallets Kit.`,
        isAvailable: wallet.isAvailable,
        supportsSorobanAuthEntries:
          SOROBAN_AUTH_ENTRY_WALLET_IDS.has(wallet.id),
      }));
    } catch (cause) {
      throw normalizeWalletKitError(cause);
    }
  }

  readonly signTransaction: ContractSignTransaction = async (
    xdr,
    options,
  ) => {
    try {
      const address = this.requireConnectedAddress(options?.address);
      this.assertSigningNetwork(options?.networkPassphrase);
      this.assertSelectedWallet();
      await this.assertKitNetwork();

      const result = await StellarWalletsKit.signTransaction(
        xdr,
        signingOptions(this.expectedNetworkPassphrase, address, options?.path),
      );
      if (!result.signedTxXdr) {
        throw new Error(
          "The wallet returned an empty signed transaction envelope.",
        );
      }
      this.assertSignerAddress(result.signerAddress, address);
      this.assertSignedTransactionMatches(xdr, result.signedTxXdr);
      return {
        signedTxXdr: result.signedTxXdr,
        signerAddress: result.signerAddress,
      };
    } catch (cause) {
      throw normalizeWalletKitError(cause);
    }
  };

  readonly signAuthEntry: ContractSignAuthEntry = async (
    authEntry,
    options,
  ) => {
    try {
      const address = this.requireConnectedAddress(options?.address);
      this.assertSigningNetwork(options?.networkPassphrase);
      this.assertSelectedWallet();
      await this.assertKitNetwork();

      const result = await StellarWalletsKit.signAuthEntry(
        authEntry,
        signingOptions(this.expectedNetworkPassphrase, address, options?.path),
      );
      if (!result.signedAuthEntry) {
        throw new Error(
          "The wallet returned an empty Soroban authorization entry.",
        );
      }
      this.assertSignerAddress(result.signerAddress, address);
      return {
        signedAuthEntry: result.signedAuthEntry,
        signerAddress: result.signerAddress,
      };
    } catch (cause) {
      throw normalizeWalletKitError(cause);
    }
  };

  dispose(): void {
    this.connectionGeneration += 1;
    this.listeners.clear();
  }

  private async connectSelectedWallet(
    walletId: string,
  ): Promise<{ address: string }> {
    StellarWalletsKit.setWallet(walletId);
    return StellarWalletsKit.fetchAddress();
  }

  private getSelectedWallet(): SelectedWallet {
    const selectedModule = StellarWalletsKit.selectedModule;
    if (
      !selectedModule.productId.trim() ||
      !selectedModule.productName.trim()
    ) {
      throw new Error(
        "Stellar Wallets Kit selected a wallet without a valid identity.",
      );
    }
    return {
      id: selectedModule.productId,
      name: selectedModule.productName,
    };
  }

  private assertSelectedWallet(): void {
    if (!this.state.selectedWalletId) {
      throw new Error("The connected wallet provider is unavailable.");
    }
    if (
      StellarWalletsKit.selectedModule.productId !==
      this.state.selectedWalletId
    ) {
      throw new Error(
        "The active Stellar wallet no longer matches the connected wallet.",
      );
    }
  }

  private async assertKitNetwork(): Promise<void> {
    const details = await StellarWalletsKit.getNetwork();
    if (
      !details ||
      typeof details.networkPassphrase !== "string" ||
      !details.networkPassphrase
    ) {
      throw new Error(
        "The wallet returned an invalid Stellar network response.",
      );
    }
    if (details.networkPassphrase !== this.expectedNetworkPassphrase) {
      throw networkMismatch(
        this.expectedNetworkPassphrase,
        details.networkPassphrase,
      );
    }
  }

  private assertSignedTransactionMatches(
    requestedXdr: string,
    signedXdr: string,
  ): void {
    const requested = parseTransactionXdr(
      requestedXdr,
      this.expectedNetworkPassphrase,
      "The requested transaction XDR is malformed.",
    );
    const signed = parseTransactionXdr(
      signedXdr,
      this.expectedNetworkPassphrase,
      "The wallet returned malformed signed transaction XDR.",
    );
    const requestedEnvelopeType = requested.toEnvelope().switch().value;
    const signedEnvelopeType = signed.toEnvelope().switch().value;
    if (
      requestedEnvelopeType !== signedEnvelopeType ||
      !equalBytes(requested.tx.toXDR(), signed.tx.toXDR())
    ) {
      throw new Error(
        "The wallet returned a signed transaction whose body differs from the requested transaction.",
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
    signerAddress: string | undefined,
    expectedAddress: string,
  ): void {
    if (signerAddress && signerAddress !== expectedAddress) {
      throw new Error(
        "The wallet signed with an account other than the connected wallet.",
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
      selectedWalletName: undefined,
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
  if (snapshot.networkPassphrase !== config.networkPassphrase) {
    throw networkMismatch(
      snapshot.networkPassphrase,
      config.networkPassphrase,
    );
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
 * Compatibility entry point for the app provider. Without an explicit wallet
 * id the official Stellar Wallets Kit authentication modal handles selection.
 */
export async function connectWallet(
  walletId?: string,
): Promise<ConnectedWallet> {
  defaultTestnetAdapter ??= new StellarWalletAdapter({
    networkPassphrase: Networks.TESTNET,
  });
  const connection = await defaultTestnetAdapter.connect(walletId);
  if (
    !connection.address ||
    !connection.selectedWalletId ||
    !connection.selectedWalletName
  ) {
    throw new Error("The wallet connected without returning an identity.");
  }
  return {
    address: connection.address,
    walletName: connection.selectedWalletName,
    walletId: connection.selectedWalletId,
  };
}

export function getConnectedTestnetWalletAdapter(): StellarWalletAdapter {
  if (!defaultTestnetAdapter) {
    throw new Error("Connect a Testnet wallet before creating an adapter.");
  }
  const snapshot = defaultTestnetAdapter.getSnapshot();
  if (
    snapshot.status !== "connected" ||
    !snapshot.address ||
    !snapshot.selectedWalletId
  ) {
    throw new Error("Connect a Testnet wallet before creating an adapter.");
  }
  if (snapshot.networkPassphrase !== Networks.TESTNET) {
    throw networkMismatch(Networks.TESTNET, snapshot.networkPassphrase);
  }
  return defaultTestnetAdapter;
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
  return getConnectedTestnetWalletAdapter().signTransaction(transactionXdr, {
    networkPassphrase: Networks.TESTNET,
    address,
  });
}

function signingOptions(
  networkPassphrase: string,
  address: string,
  path?: string,
): {
  networkPassphrase: string;
  address: string;
  path?: string;
} {
  return {
    networkPassphrase,
    address,
    ...(path ? { path } : {}),
  };
}

function normalizeWalletKitError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }

  if (typeof cause === "string") {
    return new Error(cause);
  }

  if (cause && typeof cause === "object") {
    const record = cause as Record<string, unknown>;
    const message =
      typeof record.message === "string"
        ? record.message
        : "Unhandled error from the Stellar wallet.";
    const error = new Error(message);
    if (typeof record.code === "number") {
      Object.assign(error, { code: record.code });
    }
    if (record.ext !== undefined) {
      Object.assign(error, { ext: record.ext });
    }
    return error;
  }

  return new Error("Unhandled error from the Stellar wallet.");
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
