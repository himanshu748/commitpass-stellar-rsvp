import {
  createDemoState,
  DemoCommitPassStore,
  type DemoState,
} from "./demo-store";
import { EphemeralScannerSigner } from "./scanner-crypto";
import {
  DEMO_ATTENDEE_ADDRESS,
  DEMO_CONTRACT_ID,
  SEED_EVENT,
  STELLAR_TESTNET_PASSPHRASE,
} from "./seed";
import {
  browserLocalStorage,
  buildStorageNamespace,
  NamespacedStorage,
  type StorageLike,
} from "./storage";
import {
  intentVoucherMessageProvider,
  networkIdFromPassphrase,
  type VoucherSigningContext,
} from "./voucher";

export interface SeededDemoStoreOptions {
  now?: () => number;
  storage?: StorageLike | null;
  initialState?: DemoState;
}

export async function createSeededDemoStore(
  options: SeededDemoStoreOptions = {},
): Promise<DemoCommitPassStore> {
  const context = await demoVoucherContext();
  const storage =
    options.storage === null
      ? undefined
      : (options.storage ?? browserLocalStorage());
  const namespacedStorage = storage
    ? new NamespacedStorage(
        storage,
        buildStorageNamespace({
          mode: "demo",
          network: "testnet",
        }),
      )
    : undefined;
  return new DemoCommitPassStore({
    initialState:
      options.initialState ??
      createDemoState([SEED_EVENT], {
        [DEMO_ATTENDEE_ADDRESS]: 1_000_000_000n,
      }),
    now: options.now,
    storage: namespacedStorage,
    voucherContext: context,
    voucherMessageProvider: intentVoucherMessageProvider(context),
  });
}

/**
 * Creates a non-persistent demo scanner session. Its private seed is held only
 * in memory, and the event copy is updated to the matching public key.
 */
export async function createEphemeralDemoScannerSession(input: {
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
} = {}): Promise<{
  store: DemoCommitPassStore;
  signer: EphemeralScannerSigner;
  context: VoucherSigningContext;
}> {
  const signer = await EphemeralScannerSigner.generate(input.randomBytes);
  const event = {
    ...structuredClone(SEED_EVENT),
    scannerPublicKey: signer.publicKeyHex,
  };
  const context = await demoVoucherContext();
  const store = new DemoCommitPassStore({
    initialState: createDemoState([event], {
      [DEMO_ATTENDEE_ADDRESS]: 1_000_000_000n,
    }),
    now: input.now,
    voucherContext: context,
    voucherMessageProvider: intentVoucherMessageProvider(context),
  });
  return { store, signer, context };
}

export async function demoVoucherContext(): Promise<VoucherSigningContext> {
  return {
    networkId: await networkIdFromPassphrase(STELLAR_TESTNET_PASSPHRASE),
    contractId: DEMO_CONTRACT_ID,
  };
}
