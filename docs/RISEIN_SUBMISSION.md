# Rise In submission copy

Verified against the signed-in August 2026 White, Yellow and Orange task pages
on August 15, 2026. Each configured submission selects the connected public
GitHub repository. The repository and README hold the required evidence.

## Project name

CommitPass

## One-line description

A refundable RSVP on Stellar that returns a small XLM commitment when an
attendee checks in, turning free-event intent into real turnout.

## Problem

Free events routinely overbook because clicking RSVP has no consequence.
Organizers waste seats, catering, venue capacity and volunteer time, while
people who genuinely want to attend remain on a waitlist.

## Solution

CommitPass lets an organizer publish a fixed refundable XLM commitment,
capacity, check-in window, cancellation policy and no-show beneficiary. An
attendee locks the amount in a Soroban contract. At the venue, the organizer’s
event-scoped scanner signs a wallet-bound, one-time voucher. The attendee
authorizes the claim and receives the entire deposit back. No-show funds can
settle only to the beneficiary disclosed before reservation.

## Why Stellar

Stellar provides native accounts, fast low-cost transactions, a built-in asset
contract for XLM and Soroban authorization and cryptography in one stack.
CommitPass needs small-value commitments whose rules are transparent and whose
refund can return directly to the attendee without platform custody.

## What is shipped

- responsive React attendee, organizer, QR pass and scanner flows;
- the official `@creit.tech/stellar-wallets-kit` 2.5.0 multi-wallet modal,
  Testnet network validation and hardened signing;
- explicit wallet-unavailable, rejected-request, wrong-network and
  insufficient-balance handling;
- a separate live Testnet panel that calls `create_event`, `reserve`,
  `voucher_message` and `claim_check_in_refund` against the deployed contract,
  displays simulation through confirmation/failure and links transaction
  hashes;
- cursor-based Stellar RPC event polling, deduplication and authoritative
  contract reads after create, reserve, check-in, cancellation, refund and
  no-show sync signals;
- Refundable RSVP Soroban contract with event creation, reservation, check-in refund,
  attendee cancellation, organizer cancellation, pull refunds, no-show
  settlement, scanner rotation, typed events and queries;
- Event Directory Soroban contract that reads RSVP state across contracts,
  with a generated TypeScript client and immutable source-and-event entries;
- generated TypeScript clients and fail-closed contract-mode configuration;
- 27 passing contract tests, 97 frontend unit tests and 4 browser journeys
  across desktop Chrome and mobile Chrome;
- green GitHub Actions CI covering both contracts, both generated clients, web
  checks and retained Playwright evidence, plus a reproducible release
  workflow;
- public Stellar Testnet contract:
  `CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN`;
- a verified public `create_event` contract call:
  `f7e218954d1e4a75f5c6bbc8e6029b313592d37ab5301b7b7fa44c3e534ac83e`;
- a real Testnet event and real 2 XLM reservation transaction:
  `2036256aecb600793f87980cd02df92ba8eb3fae4b3ffb14901cb370f9cf83d3`;
- a real scanner-signed check-in and 2 XLM refund transaction:
  `291d1d02ad1a741b22db56440293fd8b65813ca7002387573505dae65f163bdb`;
- focused threat model and a two-event 50-user pilot plan.

## Technical differentiation

In the public Testnet lifecycle, the scanner did not sign a hand-rolled JSON
string: it asked the deployed contract for canonical Soroban XDR bytes
containing the voucher, network ID, contract ID and domain separator. The
deployed RSVP contract calls Stellar's native XLM SAC for custody. A second
Event Directory contract calls RSVP read methods and is covered by CI and tests;
it is not represented as publicly deployed. The hosted judge sandbox remains
clearly separate and demonstrates strict pass validation and replay rejection
without sending funds.

## Security model

CommitPass is organizer-attested attendance with cryptographic anti-replay, not
trustless proof of physical presence. A compromised scanner can issue refunds
during its event window, but cannot redirect a refund or claim without the
attendee wallet. The current review found no remaining Critical, High or Medium
contract issue. Mainnet custody remains gated on an independent review and
secure scanner-key storage.

## Target users

Organizers of free developer meetups, community workshops, open-source build
days and limited-capacity educational events with 30–100 registrations.

## Business model hypothesis

Free for attendees. Organizers pay per active event or through a lightweight
community operations subscription. CommitPass does not take a percentage of
refundable deposits and never holds wallet keys.

## Go-to-market

Partner with two Bengaluru developer-community organizers, run one assisted
Testnet rehearsal and then onboard 25–35 reserving wallets per event. Compare
attendance with each organizer’s previous comparable free event and measure
refund success, check-in time, clarity and support burden.

## Traction

The product and public Testnet proof are shipped. The 50-user Blue Belt target
is a planned two-event pilot and is not represented as completed traction.

## Current ask

Rise In mentor feedback, two pilot-organizer introductions and review of the
Mainnet readiness gates after the Testnet cohorts.

## Links to paste

- Live demo:
  https://commitpass-stellar-rsvp.a-9724.chatgpt.site
- Public source repository:
  https://github.com/himanshu748/commitpass-stellar-rsvp
- Contract explorer:
  https://stellar.expert/explorer/testnet/contract/CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN
- Contract-call proof:
  https://stellar.expert/explorer/testnet/tx/f7e218954d1e4a75f5c6bbc8e6029b313592d37ab5301b7b7fa44c3e534ac83e
- Reservation proof:
  https://stellar.expert/explorer/testnet/tx/2036256aecb600793f87980cd02df92ba8eb3fae4b3ffb14901cb370f9cf83d3
- Refund proof:
  https://stellar.expert/explorer/testnet/tx/291d1d02ad1a741b22db56440293fd8b65813ca7002387573505dae65f163bdb
- Demo script: `docs/DEMO_SCRIPT.md`
- Green CI:
  https://github.com/himanshu748/commitpass-stellar-rsvp/actions/runs/30139625279
- Orange demo video:
  https://commitpass-stellar-rsvp.a-9724.chatgpt.site/commitpass-orange-demo.mp4

## Historical Yellow Belt submission copy

The following copy records the earlier Yellow milestone. Its create-only proof
description is intentionally historical; the current Orange implementation
adds the live reservation and refund actions documented below.

### Short description

At the Yellow milestone, CommitPass used the official Stellar Wallets Kit 2.5.0
multi-wallet modal and called a deployed Soroban contract from the browser. A
connected Testnet wallet could create a unique one-seat proof event through
`create_event`; the then-current proof UI enabled no reservations, the write
transferred no tokens and it cost only the Testnet network fee. The UI showed
simulation, wallet confirmation, submission, pending, confirmed and failed
states, with specific messages for wallet unavailable, rejected request, wrong
network and insufficient balance.

The frontend also read an existing event from the deployed contract and polled
successful application events through the Stellar RPC cursor API. Events were
treated only as synchronization hints: after `event_created`, CommitPass read
the correlated event ID and organizer from `get_event` rather than trusting the
event payload as application state.

### Technical proof

- Contract:
  `CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN`
- Verified `create_event` transaction:
  `f7e218954d1e4a75f5c6bbc8e6029b313592d37ab5301b7b7fa44c3e534ac83e`
- Live demo:
  https://commitpass-stellar-rsvp.a-9724.chatgpt.site
- Source:
  https://github.com/himanshu748/commitpass-stellar-rsvp

The verified historical transaction proves the deployed contract call, but it
is not represented as a browser-signed transaction from this preparation
session. A new browser call remains available in the live proof panel and
requires the wallet holder to review and approve it.

### Yellow submission checklist

- [x] Public GitHub repository with setup instructions.
- [x] Public live demo.
- [x] Official `@creit.tech/stellar-wallets-kit` 2.5.0 integration.
- [x] Multi-wallet selection through the kit's supported-wallet modal.
- [x] Explicit wallet unavailable, rejected request, wrong network and
  insufficient balance errors.
- [x] Soroban contract deployed on Stellar Testnet.
- [x] `create_event` called by the frontend generated client.
- [x] Visible simulation, signature, submission, pending, confirmation and
  failure states.
- [x] Cursor-based RPC event polling with deduplication and retries.
- [x] Contract events used as sync hints followed by authoritative reads.
- [x] Public contract address and verifiable contract-call transaction hash.
- [x] Production wallet-options screenshot captured from the real Stellar
  Wallets Kit modal (`docs/screenshots/wallet-options-production.jpg`).
- [x] Ten meaningful August commits are visible in the
  [August comparison](https://github.com/himanshu748/commitpass-stellar-rsvp/compare/cdeb8361d3c79920ba07f9be2b4982308d6e12b0...main).

## Orange Belt submission copy

### Short description

CommitPass is a complete responsive Stellar mini-dApp for refundable event
RSVPs. A Testnet wallet creates an event, reserves a seat with a 0.001 XLM
commitment, receives a short-lived event-scoped Ed25519 check-in voucher and
submits it for an atomic full refund. The browser re-reads authoritative
contract state after lifecycle event signals and exposes loading, rejection,
wrong-network and insufficient-balance states on desktop and mobile.

The deployed Refundable RSVP contract performs load-bearing inter-contract
calls to Stellar's native XLM SAC. A second custom Event Directory contract
reads RSVP state across contracts and is tested and built in CI. The directory
is not claimed as a public deployment; public deployment proof in this
submission refers to Refundable RSVP and the native Testnet XLM SAC.

### Technical proof

- Live production mini-dApp:
  https://commitpass-stellar-rsvp.a-9724.chatgpt.site
- Public repository:
  https://github.com/himanshu748/commitpass-stellar-rsvp
- Green CI run:
  https://github.com/himanshu748/commitpass-stellar-rsvp/actions/runs/30139625279
- Deployed RSVP contract:
  `CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN`
- Native Testnet XLM SAC:
  `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
- Deployment transaction:
  `6e748b3100fd70f03c10dadabbb62f0b064c0357a923bea7691b1ba084776f51`
- Reservation / XLM SAC transfer proof:
  `2036256aecb600793f87980cd02df92ba8eb3fae4b3ffb14901cb370f9cf83d3`
- Scanner-signed refund proof:
  `291d1d02ad1a741b22db56440293fd8b65813ca7002387573505dae65f163bdb`
- Orange demo video:
  https://commitpass-stellar-rsvp.a-9724.chatgpt.site/commitpass-orange-demo.mp4

### Orange submission checklist

- [x] Public repository with complete setup, architecture, security and
  deployment documentation.
- [x] Ten meaningful August commits plus the established implementation
  history. The August comparison is linked above.
- [x] Responsive production frontend and explicit loading/error states.
- [x] Complete wallet-approved create → reserve → signed check-in → refund
  Testnet browser lifecycle.
- [x] Advanced custody, authorization, replay resistance, cancellation,
  refund and no-show contract logic.
- [x] Load-bearing inter-contract communication with the native XLM SAC.
- [x] Second custom Event Directory contract with cross-contract RSVP reads.
- [x] Cursor-based event streaming with deduplication, retry and authoritative
  state reconciliation.
- [x] 27 Rust tests, 97 frontend tests and four desktop/mobile Playwright
  journeys.
- [x] GitHub Actions CI and reproducible contract/frontend release workflow.
- [x] Public Testnet contract address, deployment hash, reservation hash and
  refund hash.
- [x] CI retains a Playwright HTML report and screenshots as a workflow
  artifact.
- [x] Mobile UI screenshot: `docs/screenshots/orange-mobile.png`.
- [x] Green CI/CD screenshot: `docs/screenshots/orange-ci.png`.
- [x] Four-passing-tests screenshot: `docs/screenshots/orange-tests.png`.
- [x] One-to-two-minute narrated evidence video.

## Belt mapping

| Public criterion | CommitPass evidence |
| --- | --- |
| White: wallet/balance/transaction | live multi-wallet Testnet connection, native XLM balance from Horizon, optional user-approved payment, pending/success/failure UI and a real transaction hash |
| Yellow: multi-wallet/contracts/events | official Stellar Wallets Kit modal, four explicit wallet/transaction errors, frontend `create_event` call to the deployed Testnet contract, complete transaction status, cursor-based event sync, authoritative reads and public call hash |
| Orange: mini-dApp/tests/deployment | complete contract-backed browser lifecycle, two custom Soroban contracts, load-bearing XLM SAC call, event reconciliation, responsive errors, 27 Rust tests, 97 frontend tests, four browser journeys, green CI/CD, release workflow, public deployment proof, screenshots and 78-second video |
| Idea submission | complete in the Rise In program portal |
| Green: production MVP | next milestone: isolated scanner signer or secure keystore, fresh Testnet pilots and production-readiness review |
| Blue: 50 users/feedback/deck/demo | pitch deck and two-event 50-user pilot still to prepare |
| Black: Mainnet/20 users/security/growth | explicitly not claimed; gated by audit and pilots |

Official program:
https://www.risein.com/programs/stellar-journey-to-mastery-monthly-builder-challenges
