import {
  Account,
  AssetType,
  FeeBumpTransaction,
  Networks,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import { describe, expect, it, vi } from "vitest";

import {
  buildTestnetXlmPayment,
  calculateTestnetTransactionHash,
  loadTestnetXlmBalance,
  normalizeXlmAmount,
  parseNativeXlmBalance,
  submitTestnetXlmPayment,
  TESTNET_PAYMENT_TIMEOUT_SECONDS,
  type TestnetHorizonClient,
  type TestnetTransactionSigner,
} from "../stellar-account";
import { DEMO_BENEFICIARY_ADDRESS } from "../seed";

const SOURCE =
  "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";
const DESTINATION = DEMO_BENEFICIARY_ADDRESS;

async function transactionHash(
  transaction: Parameters<TestnetHorizonClient["submitTransaction"]>[0],
): Promise<string> {
  return calculateTestnetTransactionHash(transaction);
}

function accountResponse(
  address = SOURCE,
  balance = "24.5000000",
): Awaited<ReturnType<TestnetHorizonClient["loadAccount"]>> {
  return Object.assign(new Account(address, "41"), {
    balances: [
      {
        asset_type: "native",
        balance,
      },
    ],
  });
}

function horizonClient(): TestnetHorizonClient {
  return {
    loadAccount: vi.fn(async (address: string) => accountResponse(address)),
    fetchBaseFee: vi.fn(async () => 123),
    fetchTimebounds: vi.fn(async () => ({
      minTime: 1_800_000_000,
      maxTime: 1_800_000_180,
    })),
    submitTransaction: vi.fn(async (transaction) => ({
      hash: await transactionHash(transaction),
      ledger: 654_321,
      successful: true,
    })),
  };
}

function addDummySignature(
  transaction: Exclude<
    ReturnType<typeof TransactionBuilder.fromXDR>,
    FeeBumpTransaction
  >,
): void {
  transaction.addDecoratedSignature(
    new xdr.DecoratedSignature({
      hint: Buffer.alloc(4, 7),
      signature: Buffer.alloc(64, 11),
    }),
  );
}

const signWithSource: TestnetTransactionSigner = async (
  transactionXdr,
  options,
) => {
  expect(options).toEqual({
    networkPassphrase: Networks.TESTNET,
    address: SOURCE,
  });
  const transaction = TransactionBuilder.fromXDR(
    transactionXdr,
    Networks.TESTNET,
  );
  if (transaction instanceof FeeBumpTransaction) {
    throw new Error("Unexpected fee-bump transaction in test.");
  }
  addDummySignature(transaction);
  return {
    signedTxXdr: transaction.toXDR(),
    signerAddress: SOURCE,
  };
};

describe("Stellar Testnet account helpers", () => {
  it("finds and losslessly formats the native Horizon balance", async () => {
    expect(
      parseNativeXlmBalance([
        {
          asset_type: "credit_alphanum4",
          balance: "999.0000000",
        },
        {
          asset_type: "native",
          balance: "42.3400000",
        },
      ]),
    ).toBe("42.34");

    const horizon = horizonClient();
    vi.mocked(horizon.loadAccount).mockResolvedValueOnce(
      accountResponse(SOURCE, "7.0000001"),
    );
    await expect(loadTestnetXlmBalance(SOURCE, horizon)).resolves.toBe(
      "7.0000001",
    );
    expect(horizon.loadAccount).toHaveBeenCalledWith(SOURCE);
  });

  it("rejects missing or malformed native balances and unsafe amounts", () => {
    expect(() => parseNativeXlmBalance([])).toThrow("native XLM balance");
    expect(() =>
      parseNativeXlmBalance([
        { asset_type: "native", balance: "1e3" },
      ]),
    ).toThrow("plain decimal");

    expect(normalizeXlmAmount("0.1000000")).toBe("0.1");
    expect(normalizeXlmAmount("0.0000001")).toBe("0.0000001");
    for (const amount of [
      "0",
      "-1",
      "1e2",
      ".1",
      "01",
      "1.00000001",
      "922337203685.4775808",
    ]) {
      expect(() => normalizeXlmAmount(amount)).toThrow();
    }
  });

  it("builds a native-only Testnet payment with the Horizon fee and timebounds", () => {
    const transaction = buildTestnetXlmPayment({
      sourceAccount: new Account(SOURCE, "41"),
      destination: DESTINATION,
      amount: "1.2500000",
      baseFee: 123,
      timebounds: {
        minTime: 1_800_000_000,
        maxTime: 1_800_000_180,
      },
    });

    expect(transaction.source).toBe(SOURCE);
    expect(transaction.fee).toBe("123");
    expect(transaction.networkPassphrase).toBe(Networks.TESTNET);
    expect(transaction.timeBounds).toEqual({
      minTime: "1800000000",
      maxTime: "1800000180",
    });
    expect(transaction.operations).toHaveLength(1);
    const payment = transaction.operations[0];
    expect(payment.type).toBe("payment");
    if (payment.type !== "payment") {
      throw new Error("Expected a payment operation.");
    }
    expect(payment.destination).toBe(DESTINATION);
    expect(payment.amount).toBe("1.2500000");
    expect(payment.asset.getAssetType()).toBe(AssetType.native);
  });

  it("rejects self-payments and invalid Horizon build parameters", () => {
    expect(() =>
      buildTestnetXlmPayment({
        sourceAccount: new Account(SOURCE, "41"),
        destination: SOURCE,
        amount: "1",
        baseFee: 123,
        timebounds: {
          minTime: 1_800_000_000,
          maxTime: 1_800_000_180,
        },
      }),
    ).toThrow("destination must differ");
    expect(() =>
      buildTestnetXlmPayment({
        sourceAccount: new Account(SOURCE, "41"),
        destination: DESTINATION,
        amount: "1",
        baseFee: 0,
        timebounds: {
          minTime: 1_800_000_000,
          maxTime: 1_800_000_180,
        },
      }),
    ).toThrow("base fee");
    expect(() =>
      buildTestnetXlmPayment({
        sourceAccount: new Account(SOURCE, "41"),
        destination: DESTINATION,
        amount: "1",
        baseFee: 123,
        timebounds: {
          minTime: 1_800_000_180,
          maxTime: 1_800_000_000,
        },
      }),
    ).toThrow("timebounds");
  });

  it("signs through the wallet adapter and submits a confirmed payment", async () => {
    const horizon = horizonClient();
    const phases: string[] = [];

    const result = await submitTestnetXlmPayment({
      source: SOURCE,
      destination: DESTINATION,
      amount: "0.75",
      signTransaction: signWithSource,
      horizon,
      onPhase: (phase) => phases.push(phase),
    });

    expect(phases).toEqual(["signing", "submitting"]);
    expect(horizon.fetchBaseFee).toHaveBeenCalledOnce();
    expect(horizon.fetchTimebounds).toHaveBeenCalledWith(
      TESTNET_PAYMENT_TIMEOUT_SECONDS,
    );
    expect(horizon.submitTransaction).toHaveBeenCalledOnce();
    const submitted = vi.mocked(horizon.submitTransaction).mock.calls[0][0];
    expect(submitted.source).toBe(SOURCE);
    expect(submitted.signatures).toHaveLength(1);
    expect(result).toEqual({
      hash: await transactionHash(submitted),
      ledger: 654_321,
    });
  });

  it("does not submit when the wallet rejects the signature request", async () => {
    const horizon = horizonClient();
    const signTransaction = vi.fn<TestnetTransactionSigner>(async () => {
      throw new Error("User rejected the request");
    });

    await expect(
      submitTestnetXlmPayment({
        source: SOURCE,
        destination: DESTINATION,
        amount: "0.5",
        signTransaction,
        horizon,
      }),
    ).rejects.toThrow("User rejected");
    expect(horizon.submitTransaction).not.toHaveBeenCalled();
  });

  it("refuses an unexpected signer or a wallet-altered payment body", async () => {
    const wrongSignerHorizon = horizonClient();
    await expect(
      submitTestnetXlmPayment({
        source: SOURCE,
        destination: DESTINATION,
        amount: "0.5",
        signTransaction: async (transactionXdr, options) => ({
          ...(await signWithSource(transactionXdr, options)),
          signerAddress: DESTINATION,
        }),
        horizon: wrongSignerHorizon,
      }),
    ).rejects.toThrow("unexpected account");
    expect(wrongSignerHorizon.submitTransaction).not.toHaveBeenCalled();

    const alteredBodyHorizon = horizonClient();
    const alterBody: TestnetTransactionSigner = async () => {
      const altered = buildTestnetXlmPayment({
        sourceAccount: new Account(SOURCE, "41"),
        destination: DESTINATION,
        amount: "9",
        baseFee: 123,
        timebounds: {
          minTime: 1_800_000_000,
          maxTime: 1_800_000_180,
        },
      });
      addDummySignature(altered);
      return {
        signedTxXdr: altered.toXDR(),
        signerAddress: SOURCE,
      };
    };
    await expect(
      submitTestnetXlmPayment({
        source: SOURCE,
        destination: DESTINATION,
        amount: "0.5",
        signTransaction: alterBody,
        horizon: alteredBodyHorizon,
      }),
    ).rejects.toThrow("differs from the transaction shown");
    expect(alteredBodyHorizon.submitTransaction).not.toHaveBeenCalled();
  });

  it("surfaces Horizon submission failures after signing", async () => {
    const horizon = horizonClient();
    vi.mocked(horizon.submitTransaction).mockRejectedValueOnce(
      new Error("Horizon transaction failed"),
    );
    const phases: string[] = [];

    await expect(
      submitTestnetXlmPayment({
        source: SOURCE,
        destination: DESTINATION,
        amount: "0.5",
        signTransaction: signWithSource,
        horizon,
        onPhase: (phase) => phases.push(phase),
      }),
    ).rejects.toThrow("Horizon transaction failed");
    expect(phases).toEqual(["signing", "submitting"]);
  });

  it("rejects mismatched or malformed Horizon confirmation data", async () => {
    const horizon = horizonClient();
    vi.mocked(horizon.submitTransaction).mockResolvedValueOnce({
      hash: "b".repeat(64),
      ledger: 654_321,
      successful: true,
    });

    await expect(
      submitTestnetXlmPayment({
        source: SOURCE,
        destination: DESTINATION,
        amount: "0.5",
        signTransaction: signWithSource,
        horizon,
      }),
    ).rejects.toThrow("does not match the signed Testnet payment");

    vi.mocked(horizon.submitTransaction).mockImplementationOnce(
      async (transaction) => ({
        hash: await transactionHash(transaction),
        ledger: 0,
        successful: true,
      }),
    );
    await expect(
      submitTestnetXlmPayment({
        source: SOURCE,
        destination: DESTINATION,
        amount: "0.5",
        signTransaction: signWithSource,
        horizon,
      }),
    ).rejects.toThrow("does not match the signed Testnet payment");
  });
});
