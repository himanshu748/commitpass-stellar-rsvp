import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





export const DirectoryError = {
  1: {message:"SourceEventNotFound"},
  2: {message:"EntryNotFound"},
  3: {message:"EntryCountOverflow"}
}


/**
 * Immutable evidence that an event existed in a compatible source contract
 * when this directory entry was first written.
 */
export interface EventDirectoryEntry {
  deposit_token: string;
  event_id: Buffer;
  indexed_at: u64;
  source_contract: string;
}

export interface Client {
  /**
   * Construct and simulate a get_entry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_entry: ({source_contract, event_id}: {source_contract: string, event_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<EventDirectoryEntry>>>

  /**
   * Construct and simulate a has_entry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  has_entry: ({source_contract, event_id}: {source_contract: string, event_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a index_event transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verify an event through its source contract and persist one immutable
   * directory entry.
   * 
   * This is the Orange Belt inter-contract boundary: the directory invokes
   * `has_event` and `get_deposit_token` on `source_contract` before writing
   * anything. Re-indexing the same pair is idempotent and emits no duplicate
   * event.
   */
  index_event: ({source_contract, event_id}: {source_contract: string, event_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<EventDirectoryEntry>>>

  /**
   * Construct and simulate a total_entries transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_entries: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABQAAAAAAAAAAAAAADEV2ZW50SW5kZXhlZAAAAAIAAAAJZGlyZWN0b3J5AAAAAAAADWV2ZW50X2luZGV4ZWQAAAAAAAAFAAAAAAAAAA9zb3VyY2VfY29udHJhY3QAAAAAEwAAAAEAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAABAAAAAAAAAA1kZXBvc2l0X3Rva2VuAAAAAAAAEwAAAAAAAAAAAAAACmluZGV4ZWRfYXQAAAAAAAYAAAAAAAAAAAAAAA10b3RhbF9lbnRyaWVzAAAAAAAABAAAAAAAAAAC",
        "AAAABAAAAAAAAAAAAAAADkRpcmVjdG9yeUVycm9yAAAAAAADAAAAAAAAABNTb3VyY2VFdmVudE5vdEZvdW5kAAAAAAEAAAAAAAAADUVudHJ5Tm90Rm91bmQAAAAAAAACAAAAAAAAABJFbnRyeUNvdW50T3ZlcmZsb3cAAAAAAAM=",
        "AAAAAAAAAAAAAAAJZ2V0X2VudHJ5AAAAAAAAAgAAAAAAAAAPc291cmNlX2NvbnRyYWN0AAAAABMAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAABAAAD6QAAB9AAAAATRXZlbnREaXJlY3RvcnlFbnRyeQAAAAfQAAAADkRpcmVjdG9yeUVycm9yAAA=",
        "AAAAAAAAAAAAAAAJaGFzX2VudHJ5AAAAAAAAAgAAAAAAAAAPc291cmNlX2NvbnRyYWN0AAAAABMAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAABAAAAAQ==",
        "AAAAAAAAATZWZXJpZnkgYW4gZXZlbnQgdGhyb3VnaCBpdHMgc291cmNlIGNvbnRyYWN0IGFuZCBwZXJzaXN0IG9uZSBpbW11dGFibGUKZGlyZWN0b3J5IGVudHJ5LgoKVGhpcyBpcyB0aGUgT3JhbmdlIEJlbHQgaW50ZXItY29udHJhY3QgYm91bmRhcnk6IHRoZSBkaXJlY3RvcnkgaW52b2tlcwpgaGFzX2V2ZW50YCBhbmQgYGdldF9kZXBvc2l0X3Rva2VuYCBvbiBgc291cmNlX2NvbnRyYWN0YCBiZWZvcmUgd3JpdGluZwphbnl0aGluZy4gUmUtaW5kZXhpbmcgdGhlIHNhbWUgcGFpciBpcyBpZGVtcG90ZW50IGFuZCBlbWl0cyBubyBkdXBsaWNhdGUKZXZlbnQuAAAAAAALaW5kZXhfZXZlbnQAAAAAAgAAAAAAAAAPc291cmNlX2NvbnRyYWN0AAAAABMAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAABAAAD6QAAB9AAAAATRXZlbnREaXJlY3RvcnlFbnRyeQAAAAfQAAAADkRpcmVjdG9yeUVycm9yAAA=",
        "AAAAAQAAAHVJbW11dGFibGUgZXZpZGVuY2UgdGhhdCBhbiBldmVudCBleGlzdGVkIGluIGEgY29tcGF0aWJsZSBzb3VyY2UgY29udHJhY3QKd2hlbiB0aGlzIGRpcmVjdG9yeSBlbnRyeSB3YXMgZmlyc3Qgd3JpdHRlbi4AAAAAAAAAAAAAE0V2ZW50RGlyZWN0b3J5RW50cnkAAAAABAAAAAAAAAANZGVwb3NpdF90b2tlbgAAAAAAABMAAAAAAAAACGV2ZW50X2lkAAAD7gAAACAAAAAAAAAACmluZGV4ZWRfYXQAAAAAAAYAAAAAAAAAD3NvdXJjZV9jb250cmFjdAAAAAAT",
        "AAAAAAAAAAAAAAANdG90YWxfZW50cmllcwAAAAAAAAAAAAABAAAABA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_entry: this.txFromJSON<Result<EventDirectoryEntry>>,
        has_entry: this.txFromJSON<boolean>,
        index_event: this.txFromJSON<Result<EventDirectoryEntry>>,
        total_entries: this.txFromJSON<u32>
  }
}