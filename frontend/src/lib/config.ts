import { isStellarAddress } from "./domain";

export type CommitPassMode = "demo" | "contract";
export type StellarNetwork =
  | "testnet"
  | "mainnet"
  | "futurenet"
  | "standalone";

export interface CommitPassRuntimeConfig {
  mode: CommitPassMode;
  network: StellarNetwork;
  networkPassphrase: string;
  rpcUrl: string;
  contractId?: string;
  xlmSacId: string;
}

export interface ContractRuntimeConfig extends CommitPassRuntimeConfig {
  mode: "contract";
  contractId: string;
}

export type RuntimeEnvironment = Readonly<
  Record<string, string | boolean | undefined>
>;

const NETWORKS: readonly StellarNetwork[] = [
  "testnet",
  "mainnet",
  "futurenet",
  "standalone",
];

export function readRuntimeConfig(
  environment: RuntimeEnvironment,
): CommitPassRuntimeConfig {
  const rawMode = stringValue(environment.VITE_COMMITPASS_MODE) ?? "demo";
  if (rawMode !== "demo" && rawMode !== "contract") {
    throw new Error(
      'VITE_COMMITPASS_MODE must be either "demo" or "contract".',
    );
  }
  const rawNetwork =
    stringValue(environment.VITE_STELLAR_NETWORK) ?? "testnet";
  if (!(NETWORKS as readonly string[]).includes(rawNetwork)) {
    throw new Error("VITE_STELLAR_NETWORK is not supported.");
  }

  const config: CommitPassRuntimeConfig = {
    mode: rawMode,
    network: rawNetwork as StellarNetwork,
    networkPassphrase:
      stringValue(environment.VITE_STELLAR_NETWORK_PASSPHRASE) ?? "",
    rpcUrl: stringValue(environment.VITE_STELLAR_RPC_URL) ?? "",
    contractId: stringValue(environment.VITE_COMMITPASS_CONTRACT_ID),
    xlmSacId: stringValue(environment.VITE_XLM_SAC_ID) ?? "",
  };
  if (config.mode === "contract") {
    assertContractConfiguration(config);
  }
  return config;
}

export function assertContractConfiguration(
  config: CommitPassRuntimeConfig,
): asserts config is ContractRuntimeConfig {
  if (config.mode !== "contract") {
    throw new Error(
      "Real contract access is feature-gated by VITE_COMMITPASS_MODE=contract.",
    );
  }
  if (!config.contractId || !isContractAddress(config.contractId)) {
    throw new Error(
      "A valid VITE_COMMITPASS_CONTRACT_ID is required in contract mode.",
    );
  }
  if (!config.networkPassphrase.trim()) {
    throw new Error(
      "VITE_STELLAR_NETWORK_PASSPHRASE is required in contract mode.",
    );
  }
  if (!config.xlmSacId || !isContractAddress(config.xlmSacId)) {
    throw new Error(
      "A valid VITE_XLM_SAC_ID is required in contract mode.",
    );
  }
  assertRpcUrl(config.rpcUrl, config.network);
}

function assertRpcUrl(url: string, network: StellarNetwork): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("VITE_STELLAR_RPC_URL must be an absolute URL.");
  }
  const localHost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "::1";
  if (parsed.protocol !== "https:" && !(network === "standalone" && localHost)) {
    throw new Error(
      "Contract RPC must use HTTPS; HTTP is only allowed for local standalone mode.",
    );
  }
}

function isContractAddress(value: string): boolean {
  return value.startsWith("C") && isStellarAddress(value);
}

function stringValue(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}
