# Rise In Reviewer Evidence

This file provides direct, machine-readable paths for the White, Yellow and
Orange Belt requirements. CommitPass is a monorepo. The React application is
inside `frontend/`, while the Soroban contracts are inside `contracts/`.
The core belt implementation below was present before review in commit
[`aa2f62631f7a86c922ee5c0ff2f552918ee4d28c`](https://github.com/himanshu748/commitpass-stellar-rsvp/commit/aa2f62631f7a86c922ee5c0ff2f552918ee4d28c).
The current
[August comparison](https://github.com/himanshu748/commitpass-stellar-rsvp/compare/cdeb8361d3c79920ba07f9be2b4982308d6e12b0...main)
contains ten meaningful follow-up commits for the August challenge.

## August reviewer correction

| Requirement | Direct evidence |
| --- | --- |
| Ten meaningful August commits | The comparison above contains ten focused commits covering metrics, runtime configuration, complete event pagination, feedback, canonical event metadata, safe draft persistence, contract health and the application status screen. |
| Current automated checks | 27 Rust contract tests, 97 Vitest frontend tests and four desktop/mobile Playwright journeys. |
| Read-only deployment check | [`SystemStatusPage.tsx`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/pages/SystemStatusPage.tsx) exposes signer-free RPC, ledger and deposit-token checks. The checks cannot submit a transaction or move funds. |

## White Belt

| Requirement | Direct evidence |
| --- | --- |
| Stellar wallet dependency | [`frontend/package.json`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/package.json#L15-L18) installs `@creit.tech/stellar-wallets-kit` 2.5.0 and `@stellar/stellar-sdk`. |
| Wallet permission and connection | [`frontend/src/lib/wallet.ts`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/lib/wallet.ts#L130-L169) initializes Stellar Wallets Kit and calls `StellarWalletsKit.authModal()`. |
| Address retrieval | [`frontend/src/lib/wallet.ts`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/lib/wallet.ts#L187-L214) restores the selected address with `StellarWalletsKit.getAddress()`. A specific provider path calls `fetchAddress()` at [lines 315 to 320](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/lib/wallet.ts#L315-L320). |
| Disconnect | [`frontend/src/lib/wallet.ts`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/lib/wallet.ts#L217-L230) calls `StellarWalletsKit.disconnect()` and clears local state. |
| Transaction signing | [`frontend/src/lib/wallet.ts`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/lib/wallet.ts#L251-L279) calls `StellarWalletsKit.signTransaction()` and validates the signer plus signed envelope. |
| Application connection handler | [`frontend/src/state/CommitPassProvider.tsx`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/state/CommitPassProvider.tsx) connects and disconnects the live wallet. |
| Visible connect UI | [`frontend/src/components/AppHeader.tsx`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/components/AppHeader.tsx) mounts the live connect and disconnect handlers and renders the wallet controls. |
| Testnet balance | [`frontend/src/lib/stellar-account.ts`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/lib/stellar-account.ts#L72-L97) loads the native XLM balance from Horizon. |
| Testnet XLM payment | [`frontend/src/lib/stellar-account.ts`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/lib/stellar-account.ts#L99-L224) builds, signs, validates and submits a Testnet payment. |
| Wallet tests | [`frontend/src/lib/__tests__/wallet.test.ts`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/lib/__tests__/wallet.test.ts), [`frontend/src/lib/__tests__/stellar-account.test.ts`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/lib/__tests__/stellar-account.test.ts), [`CommitPassProvider.test.tsx`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/state/__tests__/CommitPassProvider.test.tsx) and [`AppHeader.test.tsx`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/components/__tests__/AppHeader.test.tsx) cover the implementation. |

### Wallet API clarification

CommitPass uses the official Stellar Wallets Kit abstraction rather than the
raw Freighter API. Wallets Kit 2.5 handles provider permission and address
access through `authModal`, `fetchAddress` and `getAddress`. A direct
`setAllowed` call is therefore not part of this implementation.

## Yellow Belt

| Requirement | Direct evidence |
| --- | --- |
| Multi-wallet integration | [`frontend/src/lib/wallet.ts`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/lib/wallet.ts#L1-L8) imports Stellar Wallets Kit and its default provider modules. |
| Deployed Testnet contract | [`CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN`](https://stellar.expert/explorer/testnet/contract/CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN) |
| Deployment transaction | [`6e748b3100fd70f03c10dadabbb62f0b064c0357a923bea7691b1ba084776f51`](https://stellar.expert/explorer/testnet/tx/6e748b3100fd70f03c10dadabbb62f0b064c0357a923bea7691b1ba084776f51) |
| Verified contract call | [`f7e218954d1e4a75f5c6bbc8e6029b313592d37ab5301b7b7fa44c3e534ac83e`](https://stellar.expert/explorer/testnet/tx/f7e218954d1e4a75f5c6bbc8e6029b313592d37ab5301b7b7fa44c3e534ac83e) |
| Deployed contract configuration | [`frontend/src/lib/config.ts`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/lib/config.ts) validates environment overrides and falls back to the checked-in public Testnet deployment. |
| Frontend contract call | [`CommitPassProvider.tsx`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/state/CommitPassProvider.tsx) invokes `create_event` through the live generated client. |
| Frontend contract adapter | [`frontend/src/lib/contract.ts`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/lib/contract.ts) uses the generated client, wallet authorization, simulation, submission and result decoding. |
| Event synchronization | [`frontend/src/lib/contract-events.ts`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/frontend/src/lib/contract-events.ts) polls contract events and triggers authoritative state reads. |
| Deployment manifest | [`deployments/testnet.json`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/deployments/testnet.json) records the contract, deployment transaction and verified lifecycle. |

## Orange Belt

| Requirement | Direct evidence |
| --- | --- |
| Advanced contract | [`contracts/refundable-rsvp/src/lib.rs`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/contracts/refundable-rsvp/src/lib.rs) implements event creation, XLM escrow, signed attendance vouchers, cancellation and refunds. |
| Inter-contract communication | [`contracts/event-directory/src/lib.rs`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/contracts/event-directory/src/lib.rs) reads RSVP state through typed cross-contract calls. The RSVP contract also invokes the native XLM SAC. |
| Contract tests | [`contracts/refundable-rsvp/src/test.rs`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/contracts/refundable-rsvp/src/test.rs) and [`contracts/event-directory/src/test.rs`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/contracts/event-directory/src/test.rs) are included in the 27 passing Rust tests. |
| Frontend tests | [`frontend/src`](https://github.com/himanshu748/commitpass-stellar-rsvp/tree/main/frontend/src) contains the 97 passing Vitest tests. |
| Browser tests | [`frontend/e2e`](https://github.com/himanshu748/commitpass-stellar-rsvp/tree/main/frontend/e2e) contains four passing desktop and mobile Playwright journeys. |
| CI workflow | [`.github/workflows/ci.yml`](https://github.com/himanshu748/commitpass-stellar-rsvp/blob/main/.github/workflows/ci.yml) builds both Wasm contracts and runs contract, generated client, frontend and browser checks. |
| Successful CI run | [GitHub Actions run 30148297086](https://github.com/himanshu748/commitpass-stellar-rsvp/actions/runs/30148297086) |
| Live demo | [CommitPass production site](https://commitpass-stellar-rsvp.a-9724.chatgpt.site) |
| Demo video | [78-second public demo](https://commitpass-stellar-rsvp.a-9724.chatgpt.site/commitpass-orange-demo.mp4) |

## Public lifecycle proof

| Step | Stellar Expert |
| --- | --- |
| Contract deployment | [`6e748b31…76f51`](https://stellar.expert/explorer/testnet/tx/6e748b3100fd70f03c10dadabbb62f0b064c0357a923bea7691b1ba084776f51) |
| Event creation | [`f7e21895…ac83e`](https://stellar.expert/explorer/testnet/tx/f7e218954d1e4a75f5c6bbc8e6029b313592d37ab5301b7b7fa44c3e534ac83e) |
| Real 2 XLM reservation | [`2036256a…f83d3`](https://stellar.expert/explorer/testnet/tx/2036256aecb600793f87980cd02df92ba8eb3fae4b3ffb14901cb370f9cf83d3) |
| Scanner-signed refund | [`291d1d02…3bdb`](https://stellar.expert/explorer/testnet/tx/291d1d02ad1a741b22db56440293fd8b65813ca7002387573505dae65f163bdb) |
