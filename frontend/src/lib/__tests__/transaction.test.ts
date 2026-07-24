import { describe, expect, it } from "vitest";

import { CommitPassError } from "../domain";
import { normalizeTransactionError } from "../transaction";

describe("transaction error normalization", () => {
  it("handles a wallet that is missing or unavailable", () => {
    expect(
      normalizeTransactionError(
        new Error("Freighter wallet is not installed or unavailable."),
      ),
    ).toMatchObject({
      category: "wallet",
      retryable: true,
    });
  });

  it("handles an explicit wallet rejection without treating it as an RPC failure", () => {
    expect(
      normalizeTransactionError(
        Object.assign(new Error("User rejected the request"), { code: -4 }),
      ),
    ).toMatchObject({
      category: "wallet-rejected",
      message: "The wallet request was cancelled.",
      retryable: true,
    });
  });

  it("handles an insufficient Testnet balance as a recoverable funding error", () => {
    expect(
      normalizeTransactionError(
        new CommitPassError(
          "InsufficientBalance",
          "Not enough XLM for the network fee.",
        ),
      ),
    ).toMatchObject({
      category: "insufficient-balance",
      retryable: true,
    });
  });

  it("retains a typed contract failure returned by simulation", () => {
    expect(
      normalizeTransactionError(
        new Error("HostError: Error(Contract, #11)"),
      ),
    ).toMatchObject({
      category: "contract",
      contractError: "AlreadyReserved",
      contractCode: 11,
    });
  });
});
