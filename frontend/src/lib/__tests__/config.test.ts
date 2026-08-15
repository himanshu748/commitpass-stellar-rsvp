import { describe, expect, it } from "vitest";

import { readRuntimeConfig } from "../config";
import { PUBLIC_TESTNET_CONFIG } from "../seed";

describe("readRuntimeConfig", () => {
  it("inherits validated deployment defaults while honoring environment overrides", () => {
    const config = readRuntimeConfig(
      {
        VITE_STELLAR_RPC_URL: "https://rpc.example.com",
      },
      PUBLIC_TESTNET_CONFIG,
    );

    expect(config).toEqual({
      mode: "contract",
      network: "testnet",
      networkPassphrase: "Test SDF Network ; September 2015",
      rpcUrl: "https://rpc.example.com",
      contractId:
        "CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN",
      xlmSacId:
        "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    });
  });
});
