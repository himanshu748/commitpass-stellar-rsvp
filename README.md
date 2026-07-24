# CommitPass

**A refundable RSVP for real turnout.**

CommitPass lets an event organizer require a small XLM commitment for a free
event. An attendee reserves a place by locking the published amount in a
Soroban contract. At the venue, an event-scoped scanner signs a short-lived,
wallet-bound check-in voucher. The attendee submits that voucher and receives
the full deposit back. Unclaimed no-show deposits settle only to the beneficiary
disclosed before reservation.

This repository is a complete Stellar Journey to Mastery submission candidate:

- a polished responsive attendee and organizer web app;
- a protocol-27 Soroban contract with 22 passing Rust tests;
- generated TypeScript bindings and a typed application adapter;
- hardened Freighter and Albedo adapters plus an explicit live Testnet proof
  panel for address connection, native XLM balance, and wallet-signed payment;
- real camera QR scanning, strict pass validation, replay rejection, and local
  Ed25519 signing in the judge sandbox;
- a deterministic in-session demo for judges without wallet setup;
- a public Stellar Testnet deployment and complete on-chain lifecycle proof;
- a threat model, pilot plan, submission copy, demo script, and pitch deck.

## Try the product

Public production demo:
https://commitpass-stellar-rsvp.a-9724.chatgpt.site

```sh
cd frontend
npm install
npm run dev
```

Open the local URL. The product deliberately offers two separate paths:

- **Use demo wallet** runs the complete RSVP → check-in → refund story locally
  without an extension or funds.
- **Verify wallet address** opens a clearly labelled Stellar Testnet proof
  panel. It reads the connected account's native XLM balance and can send a
  user-entered Testnet payment only after the wallet shows its own confirmation.

The full judge-sandbox flow is:

1. reserve the demo event with 2 Testnet XLM;
2. open the one-time check-in pass;
3. simulate the organizer scan;
4. claim the full refund;
5. create an organizer event and test the scanner fallback.

RSVP, check-in, and refund actions remain a clearly labelled no-funds judge
sandbox. Only the separate proof panel can submit a transaction, and only on
Testnet. Testnet XLM has no cash value.

## White Belt Testnet walkthrough

1. Install [Freighter](https://www.freighter.app/) from its official browser
   extension listing.
2. In Freighter, create or import a wallet and switch the network to
   **Testnet**.
3. Fund the public address with test-only XLM using
   [Stellar Laboratory's Friendbot](https://lab.stellar.org/account/fund).
4. Open CommitPass and choose **Connect wallet** → **Verify wallet address**.
   Approve access in Freighter. CommitPass rejects a Mainnet connection.
5. Confirm that the panel shows the full connected address, `Testnet`, and the
   native XLM balance returned by Horizon.
6. Enter a valid Testnet destination and a small amount. Review and approve the
   payment in Freighter.
7. The panel moves through waiting → submitting → confirmed (or failed) and
   returns the real transaction hash with a Stellar Expert Testnet link.
8. Use **Refresh balance** to load the post-transaction balance and
   **Disconnect** to clear the app and wallet-adapter session.

Never enter a seed phrase into CommitPass. The app requests only the public
address and a wallet signature for the transaction XDR.

## Product screenshots

### Responsive attendee experience

![CommitPass desktop attendee experience](docs/screenshots/desktop-attendee.jpg)

![CommitPass mobile attendee experience](docs/screenshots/mobile-attendee.jpg)

### Early interaction concepts

![CommitPass desktop interaction concept](docs/screenshots/desktop-concept.png)

![CommitPass mobile interaction concept](docs/screenshots/mobile-concept.png)

## Public Testnet proof

| Artifact | Public value |
| --- | --- |
| Contract | `CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN` |
| Native Testnet XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Wasm SHA-256 | `e6c17cb2c717609f18a34afd69569ea3661641f855584136efe09226c095ea81` |
| Wasm upload transaction | [`31f0ccaa…33c7a`](https://stellar.expert/explorer/testnet/tx/31f0ccaab93ece2199405e05d1c00f3f9380af70e43e44d2b9ef14fd72633c7a) |
| Contract deployment transaction | [`6e748b31…76f51`](https://stellar.expert/explorer/testnet/tx/6e748b3100fd70f03c10dadabbb62f0b064c0357a923bea7691b1ba084776f51) |
| Event creation transaction | [`f7e21895…ac83e`](https://stellar.expert/explorer/testnet/tx/f7e218954d1e4a75f5c6bbc8e6029b313592d37ab5301b7b7fa44c3e534ac83e) |
| Real 2 XLM reservation transaction | [`2036256a…f83d3`](https://stellar.expert/explorer/testnet/tx/2036256aecb600793f87980cd02df92ba8eb3fae4b3ffb14901cb370f9cf83d3) |
| Scanner-signed 2 XLM refund transaction | [`291d1d02…3bdb`](https://stellar.expert/explorer/testnet/tx/291d1d02ad1a741b22db56440293fd8b65813ca7002387573505dae65f163bdb) |
| Verification event ID | `287273b2c9e628b24d70322796f89a989a557095b78ce275c7c019f0619be51f` |

The constructor permanently pins the same-network native XLM SAC. The pinned
address was read back from the deployed contract after deployment. The
verification event completed the real reserve → scanner signature → attendee
refund lifecycle on public Testnet.

## Run the checks

```sh
# Contract
cd contracts
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build --target wasm32v1-none --release --package refundable-rsvp

# Generated binding
cd ../packages/refundable-rsvp
npm install
npm run build

# Web application
cd ../../frontend
npm install
npm test
npm run lint
npm run build
npm run test:e2e
npm audit --omit=dev
```

## Integration boundary

The rendered RSVP product is deliberately fixed to the no-funds judge sandbox.
Event reserve, voucher, and refund actions remain local simulations and their
receipts are labelled as demo state. The isolated wallet proof panel is the only
live route: it reads and sends native XLM on Stellar Testnet, never Mainnet.

The repository also ships the generated contract client, a typed
`GeneratedRefundableRsvpAdapter`, fail-closed runtime validation, and hardened
wallet signing adapters. Contract-backed RSVP actions are not activated in the
current UI. The real reserve → canonical scanner-signature → refund lifecycle
was executed with Stellar CLI and is independently visible in the public
transactions above.

Before a pilot, wire an explicit contract-backed provider to those modules,
query reservations in the scanner, add a secure voucher relay or isolated
signer, and repeat the browser suite against a fresh Testnet event. This
boundary is intentional and documented so a simulated receipt cannot be
mistaken for a ledger transaction.

## Repository map

```text
contracts/refundable-rsvp/   Soroban contract and Rust tests
packages/refundable-rsvp/    Generated TypeScript contract client
frontend/                    React/Vite app, unit tests, and Playwright tests
docs/                        Product, architecture, security, pilot, and submission docs
outputs/                     Judge-ready deliverables
```

## Security boundary

CommitPass provides **organizer-attested attendance with cryptographic
anti-replay**. It is not a trustless proof that a person was physically present.
A compromised scanner key can authorize refunds during its event window, but it
cannot redirect a refund away from the wallet bound into the voucher, and the
attendee must still authorize the claim.

The scanner private key is never stored on-chain. The MVP keeps it in memory;
production pilots need an isolated signer or secure device keystore. The
contract has received an internal focused review with no remaining Critical,
High, or Medium findings, but it has not received an independent audit and
must not custody Mainnet funds until it does.

Read [the architecture](docs/ARCHITECTURE.md),
[the threat model](docs/SECURITY.md), and
[the pilot plan](docs/PILOT_PLAN.md) before a production pilot.

## Rise In fit

This repository is submitted for the active July **White Belt** review with a
real Testnet wallet connection, balance read, user-approved XLM payment,
transaction result/hash, public repository, setup guide, and screenshots.

The Soroban contract, generated client, tests, deployment, and public lifecycle
proof are additional evidence. They do not replace unfinished higher-belt
criteria: the current UI does not yet use StellarWalletsKit or submit the RSVP
contract call from the browser, and it does not claim Orange, Green, Blue, or
Black completion. Contract-backed UI wiring, secure pilot scanner operations,
and real-user evidence remain future milestones.

Program terms and prize decisions remain solely with Rise In and Stellar:
[Stellar Journey to Mastery](https://www.risein.com/programs/stellar-journey-to-mastery-monthly-builder-challenges).

## License

No license has been selected yet. Add one before accepting outside
contributions.
