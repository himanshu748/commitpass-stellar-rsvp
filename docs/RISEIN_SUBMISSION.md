# Rise In submission copy

Verified against the public Stellar Journey to Mastery page on July 24, 2026.
Exact private form fields and belt-specific submission deadlines may differ
inside a signed-in Rise In account.

## Project name

CommitPass

## One-line description

A refundable RSVP on Stellar that returns a small XLM commitment when an
attendee checks in, turning free-event intent into real turnout.

## Problem

Free events routinely overbook because clicking RSVP has no consequence.
Organizers waste seats, catering, venue capacity, and volunteer time, while
people who genuinely want to attend remain on a waitlist.

## Solution

CommitPass lets an organizer publish a fixed refundable XLM commitment,
capacity, check-in window, cancellation policy, and no-show beneficiary. An
attendee locks the amount in a Soroban contract. At the venue, the organizer’s
event-scoped scanner signs a wallet-bound, one-time voucher. The attendee
authorizes the claim and receives the entire deposit back. No-show funds can
settle only to the beneficiary disclosed before reservation.

## Why Stellar

Stellar provides native accounts, fast low-cost transactions, a built-in asset
contract for XLM, and Soroban authorization and cryptography in one stack.
CommitPass needs small-value commitments whose rules are transparent and whose
refund can return directly to the attendee without platform custody.

## What is shipped

- responsive React attendee, organizer, QR pass, and scanner flows;
- the official `@creit.tech/stellar-wallets-kit` 2.5.0 multi-wallet modal,
  Testnet network validation, and hardened signing;
- explicit wallet-unavailable, rejected-request, wrong-network, and
  insufficient-balance handling;
- a separate live Testnet proof panel that calls the deployed contract's
  `create_event` method from the frontend, displays simulation through
  confirmation/failure, and links a confirmed transaction hash;
- cursor-based Stellar RPC event polling, deduplication, and authoritative
  `get_event` reads after `event_created` sync signals;
- Rust Soroban contract with event creation, reservation, check-in refund,
  attendee cancellation, organizer cancellation, pull refunds, no-show
  settlement, scanner rotation, typed events, and queries;
- generated TypeScript client and fail-closed contract-mode configuration;
- 22 passing contract tests, 50 frontend unit tests, and 4 browser journeys
  across desktop Chrome and mobile Chrome;
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
containing the voucher, network ID, contract ID, and domain separator. The
hosted judge sandbox is clearly separate and demonstrates strict pass
validation, replay rejection, and real local Ed25519 signing without sending
funds.

## Security model

CommitPass is organizer-attested attendance with cryptographic anti-replay, not
trustless proof of physical presence. A compromised scanner can issue refunds
during its event window, but cannot redirect a refund or claim without the
attendee wallet. The current review found no remaining Critical, High, or Medium
contract issue. Mainnet custody remains gated on an independent review and
secure scanner-key storage.

## Target users

Organizers of free developer meetups, community workshops, open-source build
days, and limited-capacity educational events with 30–100 registrations.

## Business model hypothesis

Free for attendees. Organizers pay per active event or through a lightweight
community operations subscription. CommitPass does not take a percentage of
refundable deposits and never holds wallet keys.

## Go-to-market

Partner with two Bengaluru developer-community organizers, run one assisted
Testnet rehearsal, and then onboard 25–35 reserving wallets per event. Compare
attendance with each organizer’s previous comparable free event and measure
refund success, check-in time, clarity, and support burden.

## Traction

The product and public Testnet proof are shipped. The 50-user Blue Belt target
is a planned two-event pilot and is not represented as completed traction.

## Current ask

Rise In mentor feedback, two pilot-organizer introductions, and review of the
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

## Yellow Belt submission copy

### Short description

CommitPass now uses the official Stellar Wallets Kit 2.5.0 multi-wallet modal
and calls a deployed Soroban contract from the browser. A connected Testnet
wallet can create a unique one-seat proof event through `create_event`; the
proof UI enables no reservations, the write transfers no tokens, and it costs
only the Testnet network fee. The UI shows
simulation, wallet confirmation, submission, pending, confirmed, and failed
states, with specific messages for wallet unavailable, rejected request, wrong
network, and insufficient balance.

The frontend also reads an existing event from the deployed contract and polls
successful application events through the Stellar RPC cursor API. Events are
treated only as synchronization hints: after `event_created`, CommitPass reads
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
- [x] Explicit wallet unavailable, rejected request, wrong network, and
  insufficient balance errors.
- [x] Soroban contract deployed on Stellar Testnet.
- [x] `create_event` called by the frontend generated client.
- [x] Visible simulation, signature, submission, pending, confirmation, and
  failure states.
- [x] Cursor-based RPC event polling with deduplication and retries.
- [x] Contract events used as sync hints followed by authoritative reads.
- [x] Public contract address and verifiable contract-call transaction hash.
- [ ] Add a wallet-options screenshot only after capturing the real modal in
  the target browser; no screenshot is fabricated in this repository state.
- [x] Final Git history contains at least two meaningful Yellow implementation
  commits (`0820e1b` wallet kit; `fbb8ecd` contract proof and event sync).

## Belt mapping

| Public criterion | CommitPass evidence |
| --- | --- |
| White — wallet/balance/transaction | live multi-wallet Testnet connection, native XLM balance from Horizon, optional user-approved payment, pending/success/failure UI, and a real transaction hash |
| Yellow — multi-wallet/contracts/events | official Stellar Wallets Kit modal, four explicit wallet/transaction errors, frontend `create_event` call to the deployed Testnet contract, complete transaction status, cursor-based event sync, authoritative reads, and public call hash |
| Orange — mini-dApp/tests/deployment | supplementary evidence only: responsive sandbox UI, tests, CI workflow, Testnet deployment, and real CLI lifecycle proof; higher-belt video and other rubric items are not claimed |
| Idea approval | requires submission and Rise In decision |
| Green — production MVP | next milestone: contract-backed UI provider, secure scanner relay/keystore, fresh Testnet pilot |
| Blue — 50 users/feedback/deck/demo | deck and demo ready; two-event 50-user pilot still to execute |
| Black — Mainnet/20 users/security/growth | explicitly not claimed; gated by audit and pilots |

Official program:
https://www.risein.com/programs/stellar-journey-to-mastery-monthly-builder-challenges
