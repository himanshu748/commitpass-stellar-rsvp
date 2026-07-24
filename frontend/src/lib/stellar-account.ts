import {
  Asset,
  FeeBumpTransaction,
  Horizon,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  xdr,
  type Transaction,
  type TransactionSource,
} from "@stellar/stellar-sdk";
import { Buffer } from "buffer";

export const STELLAR_TESTNET_HORIZON_URL =
  "https://horizon-testnet.stellar.org";
export const TESTNET_PAYMENT_TIMEOUT_SECONDS = 180;

const MAX_STROOPS = 9_223_372_036_854_775_807n;
const XLM_DECIMALS = 7;
const TESTNET_TRANSACTION_HASH = /^[0-9a-f]{64}$/i;

type HorizonBalanceLine = {
  asset_type: string;
  balance: string;
};

type TestnetAccountResponse = TransactionSource & {
  balances: readonly HorizonBalanceLine[];
};

type TestnetTimebounds = {
  minTime: number;
  maxTime: number;
};

type TestnetSubmissionResponse = {
  hash: string;
  ledger: number;
  successful: boolean;
};

export interface TestnetHorizonClient {
  loadAccount(address: string): Promise<TestnetAccountResponse>;
  fetchBaseFee(): Promise<number>;
  fetchTimebounds(seconds: number): Promise<TestnetTimebounds>;
  submitTransaction(transaction: Transaction): Promise<TestnetSubmissionResponse>;
}

export type TestnetPaymentPhase = "signing" | "submitting";

export type TestnetTransactionSigner = (
  transactionXdr: string,
  options: {
    networkPassphrase: string;
    address: string;
  },
) => Promise<{
  signedTxXdr: string;
  signerAddress?: string;
}>;

export type TestnetPaymentResult = {
  hash: string;
  ledger: number;
};

const defaultTestnetHorizon: TestnetHorizonClient = new Horizon.Server(
  STELLAR_TESTNET_HORIZON_URL,
);

export function parseNativeXlmBalance(
  balances: readonly HorizonBalanceLine[],
): string {
  const nativeBalance = balances.find(
    (balance) => balance.asset_type === "native",
  );
  if (!nativeBalance) {
    throw new Error("Horizon did not return a native XLM balance.");
  }
  return normalizeXlmDecimal(nativeBalance.balance, {
    allowZero: true,
    label: "native XLM balance",
  });
}

export async function loadTestnetXlmBalance(
  address: string,
  horizon: TestnetHorizonClient = defaultTestnetHorizon,
): Promise<string> {
  assertAccountAddress(address, "wallet");
  const account = await horizon.loadAccount(address);
  if (account.accountId() !== address) {
    throw new Error("Horizon returned a different Testnet account.");
  }
  return parseNativeXlmBalance(account.balances);
}

export function normalizeXlmAmount(amount: string): string {
  return normalizeXlmDecimal(amount, {
    allowZero: false,
    label: "payment amount",
  });
}

export function buildTestnetXlmPayment({
  sourceAccount,
  destination,
  amount,
  baseFee,
  timebounds,
}: {
  sourceAccount: TransactionSource;
  destination: string;
  amount: string;
  baseFee: number;
  timebounds: TestnetTimebounds;
}): Transaction {
  const source = sourceAccount.accountId();
  assertAccountAddress(source, "source");
  assertAccountAddress(destination, "destination");
  if (source === destination) {
    throw new Error("The Testnet payment destination must differ from the source.");
  }
  if (!Number.isSafeInteger(baseFee) || baseFee <= 0) {
    throw new Error("Horizon returned an invalid Testnet base fee.");
  }
  if (
    !Number.isSafeInteger(timebounds.minTime) ||
    !Number.isSafeInteger(timebounds.maxTime) ||
    timebounds.minTime < 0 ||
    timebounds.maxTime <= timebounds.minTime
  ) {
    throw new Error("Horizon returned invalid Testnet transaction timebounds.");
  }

  return new TransactionBuilder(sourceAccount, {
    fee: baseFee.toString(),
    networkPassphrase: Networks.TESTNET,
    timebounds,
  })
    .addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount: normalizeXlmAmount(amount),
      }),
    )
    .build();
}

export async function submitTestnetXlmPayment({
  source,
  destination,
  amount,
  signTransaction,
  horizon = defaultTestnetHorizon,
  onPhase,
}: {
  source: string;
  destination: string;
  amount: string;
  signTransaction: TestnetTransactionSigner;
  horizon?: TestnetHorizonClient;
  onPhase?: (phase: TestnetPaymentPhase) => void;
}): Promise<TestnetPaymentResult> {
  assertAccountAddress(source, "source");
  assertAccountAddress(destination, "destination");
  const normalizedAmount = normalizeXlmAmount(amount);

  const [sourceAccount, baseFee, timebounds] = await Promise.all([
    horizon.loadAccount(source),
    horizon.fetchBaseFee(),
    horizon.fetchTimebounds(TESTNET_PAYMENT_TIMEOUT_SECONDS),
  ]);
  if (sourceAccount.accountId() !== source) {
    throw new Error("Horizon returned a different Testnet source account.");
  }

  const transaction = buildTestnetXlmPayment({
    sourceAccount,
    destination,
    amount: normalizedAmount,
    baseFee,
    timebounds,
  });
  onPhase?.("signing");

  const signed = await signTransaction(transaction.toXDR(), {
    networkPassphrase: Networks.TESTNET,
    address: source,
  });
  if (signed.signerAddress !== source) {
    throw new Error(
      "The wallet signed the Testnet payment with an unexpected account.",
    );
  }

  const signedTransaction = parseSignedTestnetTransaction(signed.signedTxXdr);
  if (
    signedTransaction.source !== source ||
    !equalBytes(transaction.tx.toXDR(), signedTransaction.tx.toXDR())
  ) {
    throw new Error(
      "The signed Testnet payment differs from the transaction shown to the wallet.",
    );
  }
  if (signedTransaction.signatures.length === 0) {
    throw new Error("The wallet returned a Testnet payment without a signature.");
  }

  const expectedHash =
    await calculateTestnetTransactionHash(signedTransaction);
  onPhase?.("submitting");
  const submission = await horizon.submitTransaction(signedTransaction);
  if (
    !submission.successful ||
    !TESTNET_TRANSACTION_HASH.test(submission.hash) ||
    submission.hash.toLowerCase() !== expectedHash ||
    !Number.isSafeInteger(submission.ledger) ||
    submission.ledger <= 0
  ) {
    throw new Error(
      "Horizon returned confirmation data that does not match the signed Testnet payment.",
    );
  }
  return {
    hash: submission.hash,
    ledger: submission.ledger,
  };
}

function normalizeXlmDecimal(
  input: string,
  {
    allowZero,
    label,
  }: {
    allowZero: boolean;
    label: string;
  },
): string {
  const value = input.trim();
  if (value.length === 0 || value.length > 32) {
    throw new Error(`Enter a valid ${label}.`);
  }
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,7}))?$/.exec(value);
  if (!match) {
    throw new Error(
      `The ${label} must be a plain decimal with at most ${XLM_DECIMALS} places.`,
    );
  }

  const fraction = (match[2] ?? "").padEnd(XLM_DECIMALS, "0");
  const stroops =
    BigInt(match[1]) * 10n ** BigInt(XLM_DECIMALS) + BigInt(fraction || "0");
  if ((!allowZero && stroops === 0n) || stroops > MAX_STROOPS) {
    throw new Error(
      allowZero
        ? `Horizon returned an invalid ${label}.`
        : "The payment amount must be greater than zero and fit in Stellar's 64-bit amount range.",
    );
  }

  const displayFraction = (match[2] ?? "").replace(/0+$/, "");
  return displayFraction ? `${match[1]}.${displayFraction}` : match[1];
}

function assertAccountAddress(address: string, label: string): void {
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new Error(`Enter a valid G-address for the Testnet ${label}.`);
  }
}

function parseSignedTestnetTransaction(transactionXdr: string): Transaction {
  if (!transactionXdr) {
    throw new Error("The wallet returned an empty Testnet transaction.");
  }
  let parsed;
  try {
    parsed = TransactionBuilder.fromXDR(transactionXdr, Networks.TESTNET);
  } catch (cause) {
    throw new Error("The wallet returned malformed Testnet transaction XDR.", {
      cause,
    });
  }
  if (parsed instanceof FeeBumpTransaction) {
    throw new Error("The wallet unexpectedly replaced the Testnet payment.");
  }
  return parsed;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

export async function calculateTestnetTransactionHash(
  transaction: Transaction,
): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "This browser cannot verify the signed Testnet transaction hash.",
    );
  }
  // Construct the canonical signature payload explicitly because the SDK's
  // browser Buffer polyfill can come from a different realm than its bundled
  // hashing helper under strict browser/test isolation.
  const encodedPassphrase = new TextEncoder().encode(Networks.TESTNET);
  const passphraseInput = new Uint8Array(encodedPassphrase.byteLength);
  passphraseInput.set(encodedPassphrase);
  const networkIdBytes = await globalThis.crypto.subtle.digest(
    "SHA-256",
    passphraseInput.buffer,
  );
  if (!(transaction.tx instanceof xdr.Transaction)) {
    throw new Error("The wallet unexpectedly replaced the Testnet payment.");
  }
  const signaturePayload = new xdr.TransactionSignaturePayload({
    networkId: xdr.Hash.fromXDR(Buffer.from(networkIdBytes)),
    taggedTransaction:
      xdr.TransactionSignaturePayloadTaggedTransaction.envelopeTypeTx(
        transaction.tx,
      ),
  });
  const encodedPayload = signaturePayload.toXDR();
  const payloadInput = new Uint8Array(encodedPayload.byteLength);
  payloadInput.set(encodedPayload);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    payloadInput.buffer,
  );
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
