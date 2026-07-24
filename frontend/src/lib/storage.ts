export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StorageCodec<T> {
  encode(value: T): string;
  decode(serialized: string): T;
}

export type StorageReadResult<T> =
  | { status: "missing" }
  | { status: "valid"; value: T }
  | { status: "invalid"; error: Error };

export const COMMITPASS_STORAGE_PREFIX = "commitpass:v1";

const BIGINT_TAG = "$commitpass.bigint";
const SENSITIVE_FIELD =
  /(?:^|_)(?:private|secret|seed)(?:_|$)|(?:private|secret|seed)Key/i;

export class StorageValidationError extends Error {
  constructor(
    message: string,
    readonly key?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class SensitiveStorageError extends Error {}

export function jsonStorageCodec<T>(
  validate: (value: unknown) => value is T,
): StorageCodec<T> {
  return {
    encode(value) {
      assertNoSensitiveFields(value);
      return JSON.stringify(value, (_key, nestedValue: unknown) =>
        typeof nestedValue === "bigint"
          ? { [BIGINT_TAG]: nestedValue.toString() }
          : nestedValue,
      );
    },
    decode(serialized) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(serialized, (_key, nestedValue: unknown) => {
          if (
            isRecord(nestedValue) &&
            Object.keys(nestedValue).length === 1 &&
            typeof nestedValue[BIGINT_TAG] === "string" &&
            /^-?\d+$/.test(nestedValue[BIGINT_TAG])
          ) {
            return BigInt(nestedValue[BIGINT_TAG]);
          }
          return nestedValue;
        });
      } catch (cause) {
        throw new StorageValidationError("Stored JSON could not be parsed.", undefined, {
          cause,
        });
      }
      if (!validate(parsed)) {
        throw new StorageValidationError(
          "Stored data did not match the expected schema.",
        );
      }
      return parsed;
    },
  };
}

export class NamespacedStorage {
  constructor(
    private readonly storage: StorageLike,
    readonly namespace: string,
  ) {
    if (!/^[a-z0-9:._-]+$/i.test(namespace)) {
      throw new TypeError("Storage namespace contains unsupported characters.");
    }
  }

  key(name: string): string {
    if (!/^[a-z0-9._-]+$/i.test(name)) {
      throw new TypeError("Storage key contains unsupported characters.");
    }
    return `${COMMITPASS_STORAGE_PREFIX}:${this.namespace}:${name}`;
  }

  read<T>(name: string, codec: StorageCodec<T>): StorageReadResult<T> {
    const key = this.key(name);
    const serialized = this.storage.getItem(key);
    if (serialized === null) {
      return { status: "missing" };
    }
    try {
      return { status: "valid", value: codec.decode(serialized) };
    } catch (cause) {
      const error =
        cause instanceof Error
          ? cause
          : new StorageValidationError("Stored data was invalid.", key, {
              cause,
            });
      return { status: "invalid", error };
    }
  }

  write<T>(name: string, value: T, codec: StorageCodec<T>): void {
    this.storage.setItem(this.key(name), codec.encode(value));
  }

  remove(name: string): void {
    this.storage.removeItem(this.key(name));
  }
}

export function buildStorageNamespace(input: {
  mode: "demo" | "contract";
  network: string;
  contractId?: string;
}): string {
  const network = sanitizeScope(input.network);
  const deployment =
    input.mode === "contract"
      ? sanitizeScope(input.contractId ?? "unconfigured")
      : "local";
  return `${input.mode}:${network}:${deployment}`;
}

export function browserLocalStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function sanitizeScope(value: string): string {
  const sanitized = value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_");
  if (!sanitized) {
    throw new TypeError("Storage scope cannot be empty.");
  }
  return sanitized;
}

function assertNoSensitiveFields(
  value: unknown,
  seen = new WeakSet<object>(),
): void {
  if (typeof value !== "object" || value === null) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_FIELD.test(key)) {
      throw new SensitiveStorageError(
        `Refusing to persist sensitive field "${key}". Scanner keys must remain ephemeral or use a dedicated secure keystore.`,
      );
    }
    assertNoSensitiveFields(nestedValue, seen);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
