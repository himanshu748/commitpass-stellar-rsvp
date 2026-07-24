import type { Hex32, Hex64 } from "./domain";

const HEX_RE = /^[0-9a-f]+$/i;

export function bytesToHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, "0");
  }
  return result;
}

export function hexToBytes(hex: string, expectedLength?: number): Uint8Array {
  if (
    hex.length % 2 !== 0 ||
    (hex.length > 0 && !HEX_RE.test(hex)) ||
    (expectedLength !== undefined && hex.length !== expectedLength * 2)
  ) {
    throw new TypeError(
      expectedLength === undefined
        ? "Expected an even-length hexadecimal string."
        : `Expected exactly ${expectedLength} bytes of hexadecimal data.`,
    );
  }

  const output = new Uint8Array(hex.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

export function asHex32(bytes: Uint8Array): Hex32 {
  if (bytes.length !== 32) {
    throw new TypeError("Expected a 32-byte value.");
  }
  return bytesToHex(bytes);
}

export function asHex64(bytes: Uint8Array): Hex64 {
  if (bytes.length !== 64) {
    throw new TypeError("Expected a 64-byte value.");
  }
  return bytesToHex(bytes);
}

export function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function bytesToUtf8(value: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(value);
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function uint16Bytes(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError("Value does not fit in an unsigned 16-bit integer.");
  }
  const result = new Uint8Array(2);
  new DataView(result.buffer).setUint16(0, value, false);
  return result;
}

export function uint64Bytes(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new RangeError("Value does not fit in an unsigned 64-bit integer.");
  }
  const result = new Uint8Array(8);
  new DataView(result.buffer).setBigUint64(0, value, false);
  return result;
}

export function lengthPrefixed(value: Uint8Array): Uint8Array {
  return concatBytes(uint16Bytes(value.length), value);
}

export function secureRandomBytes(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new RangeError("Random byte length must be a positive safe integer.");
  }
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("A cryptographically secure random source is unavailable.");
  }
  return cryptoApi.getRandomValues(new Uint8Array(length));
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function bytesToBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new TypeError("Expected unpadded base64url data.");
  }
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256(value: Uint8Array): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable.");
  }
  // Copy into an ArrayBuffer-backed view. TypeScript 5.9 correctly models that
  // a generic Uint8Array may otherwise be backed by SharedArrayBuffer, which
  // Web Crypto does not accept as a BufferSource.
  const input = new Uint8Array(value.byteLength);
  input.set(value);
  return new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", input.buffer),
  );
}
