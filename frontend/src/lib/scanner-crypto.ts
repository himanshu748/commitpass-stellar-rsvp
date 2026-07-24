import {
  getPublicKeyAsync,
  signAsync,
  verifyAsync,
} from "@noble/ed25519";

import { asHex32, secureRandomBytes } from "./bytes";
import type { Hex32 } from "./domain";

export interface ScannerSigner {
  readonly publicKey: Uint8Array;
  sign(message: Uint8Array): Promise<Uint8Array>;
}

/**
 * An event-scoped Ed25519 signer whose private seed never leaves this object.
 *
 * This is suitable for the in-browser demo and short-lived scanner sessions.
 * Production organizers should place this interface behind platform-backed
 * secure storage or a remote isolated signer; raw private keys must not be put
 * in localStorage.
 */
export class EphemeralScannerSigner implements ScannerSigner {
  private secretKey: Uint8Array | null;
  private readonly publicKeyBytes: Uint8Array;

  private constructor(secretKey: Uint8Array, publicKey: Uint8Array) {
    this.secretKey = secretKey;
    this.publicKeyBytes = publicKey;
  }

  static async generate(
    randomBytes: (length: number) => Uint8Array = secureRandomBytes,
  ): Promise<EphemeralScannerSigner> {
    const secretKey = randomBytes(32);
    return EphemeralScannerSigner.fromPrivateKey(secretKey);
  }

  /**
   * Imports a 32-byte Ed25519 seed from a caller-controlled secure source.
   * The input is copied, so the caller can wipe its original buffer.
   */
  static async fromPrivateKey(
    privateKey: Uint8Array,
  ): Promise<EphemeralScannerSigner> {
    if (privateKey.length !== 32) {
      throw new TypeError("An Ed25519 private seed must be exactly 32 bytes.");
    }
    const secretKey = privateKey.slice();
    const publicKey = await getPublicKeyAsync(secretKey);
    return new EphemeralScannerSigner(secretKey, publicKey);
  }

  get publicKey(): Uint8Array {
    return this.publicKeyBytes.slice();
  }

  get publicKeyHex(): Hex32 {
    return asHex32(this.publicKeyBytes);
  }

  async sign(message: Uint8Array): Promise<Uint8Array> {
    if (!this.secretKey) {
      throw new Error("The scanner signer has been destroyed.");
    }
    return signAsync(message, this.secretKey);
  }

  /**
   * Best-effort memory cleanup. JavaScript runtimes may retain internal copies,
   * so this is not a substitute for a hardware/platform keystore.
   */
  destroy(): void {
    this.secretKey?.fill(0);
    this.secretKey = null;
  }
}

export async function verifyScannerSignature(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  if (signature.length !== 64 || publicKey.length !== 32) {
    return false;
  }
  try {
    // Soroban's Ed25519 host verification follows strict RFC 8032 behavior.
    return await verifyAsync(signature, message, publicKey, { zip215: false });
  } catch {
    return false;
  }
}
