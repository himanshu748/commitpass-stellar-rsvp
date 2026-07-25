# CommitPass architecture

## System boundary

CommitPass has three execution layers:

1. **React web client** — presents event terms, connects a wallet, builds
   contract calls, creates attendee QR payloads, and displays transaction state.
2. **Scanner/signing boundary** — currently demonstrated by two intentionally
   separate browser paths; the pilot target is an isolated organizer scanner
   that joins QR input to canonical contract voucher bytes.
3. **Soroban contract** — holds native XLM, enforces event windows and
   authorization, verifies Ed25519 vouchers, prevents replay, and performs
   refunds or no-show settlement.

The application has no backend custody service and never asks for a wallet
secret. Event metadata may live off-chain; immutable hashes and all financial
rules live on-chain.

The repository also contains an `EventDirectory` Soroban contract. Its
`index_event(source_contract, event_id)` path calls the supplied compatible
RSVP contract's `has_event` and `get_deposit_token` methods before storing an
immutable entry keyed by that source-and-event pair. One directory can
therefore index multiple compatible RSVP deployments without a constructor or
mutable global source pointer. This makes its inter-contract relationship
load-bearing rather than decorative. It is covered by tests and CI, but it is
not represented as publicly deployed in the current proof manifest.

## Current scanner scope

The shipped Testnet demonstrations keep two scanner concerns deliberately
separate:

- The **live contract panel** retains a fresh event-scoped signer only in
  browser memory, requests canonical bytes through the deployed contract's
  `voucher_message`, signs them locally, and submits the attendee-authorized
  claim. This short proof loop does not scan a QR code.
- The **QR scanner judge sandbox** exercises camera/manual pass ingestion,
  strict validation, local Ed25519 signing, and replay rejection without funds.
  It uses the sandbox's clearly labelled local intent encoding rather than
  canonical bytes from the deployed contract.

The pilot target is an isolated organizer device or signing service that scans
the attendee QR, validates its event and wallet fields, requests
`voucher_message` from the pinned deployment, and returns the resulting
short-lived signature to the attendee. That integrated QR-to-contract scanner
path is target architecture, not a shipped claim in this submission.

## Attendee lifecycle (target pilot architecture)

The contract state machine is implemented, while the physical QR-to-contract
scanner handoff shown below remains the pilot integration target described
above.

```text
Organizer creates event
        │
        ▼
Attendee wallet authorizes reserve(event, attendee)
        │  native XLM SAC transfer
        ▼
Contract stores Reserved + locks one fixed deposit
        │
        ▼
Attendee displays {event_id, attendee, nonce}
        │
        ▼
Scanner confirms arrival and signs contract.voucher_message(voucher)
        │
        ▼
Attendee authorizes claim_check_in_refund(...)
        │  verify wallet, window, signature, nonce
        ▼
Contract marks CheckedIn + returns the full deposit
```

An event cancellation does not loop over attendees. It opens a bounded pull
refund path that each still-reserved attendee can claim. After `end_at`, anyone
may trigger `sweep_no_show`; funds can go only to the immutable beneficiary.

## Contract state

The contract constructor pins one deposit token address. Every event must use
that exact token, preventing an organizer from substituting a malicious token.

An event stores:

- an organizer/config/salt/network/contract-derived event ID;
- metadata hash and random nonzero event salt;
- start, check-in deadline, and end timestamps;
- fixed deposit amount and capacity;
- native XLM SAC and disclosed no-show beneficiary;
- cancellation policy;
- event-scoped Ed25519 scanner public key;
- reservation and outstanding-deposit counters.

A reservation stores `Reserved` and one terminal state:
`CheckedIn`, `AttendeeRefunded`, `AttendeeForfeited`, `EventRefunded`, or
`NoShow`.

## Voucher format

A voucher contains:

- `event_id`;
- `attendee`;
- a random 32-byte event-scoped nonce;
- `checked_in_at`;
- `expires_at`.

The contract serializes a domain separator, network ID, contract address, and
voucher as canonical Soroban `ScVal` XDR. A contract-integrated signer signs
those exact bytes. This makes the signature deployment-bound and network-bound;
it cannot be replayed on a cloned contract or a different Stellar network.

The contract adapter requests `voucher_message` from the deployed contract
rather than maintaining a second serializer. The public verification lifecycle
used those canonical bytes. The no-funds judge sandbox intentionally uses a
separate, clearly labelled intent encoder for local cryptographic demonstration.

## Frontend runtime

- The narrative RSVP → voucher → refund routes remain a no-funds judge sandbox
  and clearly label simulated receipts.
- A separate live Testnet route is mounted in the wallet panel. It creates a
  one-seat event, reserves 0.001 XLM, obtains canonical voucher bytes, signs the
  voucher with an in-memory event-scoped Ed25519 key without a QR scan, submits
  the attendee-authorized refund, and re-reads the final event and reservation
  state.
- `@creit.tech/stellar-wallets-kit` 2.5.0 supplies the supported-wallet modal
  and wallet modules. The adapter validates the returned G-address and selected
  module identity. It validates the reported passphrase for modules that
  implement `getNetwork`; modules that do not are still given only the pinned
  Testnet passphrase on every signing request.
- The adapter rejects a wallet unavailable error, user rejection, wrong
  network, and insufficient fee balance as separate UI categories.
- Before returning a wallet signature, the adapter compares the signed
  transaction envelope type and transaction body with the requested XDR. A
  signer address, when supplied by the wallet module, must match the connected
  account.
- The live flow builds a unique one-seat `create_event` call with a random
  event salt, a metadata hash, a fresh per-event scanner public key, and the
  connected address as organizer and beneficiary. Its deposit is 10,000
  stroops (0.001 Testnet XLM). The private scanner key remains only in memory
  for that event and is destroyed after refund, disconnect, or event
  replacement.
- The generated binding simulates the call and maps typed contract errors before
  asking for a wallet signature. It then submits, polls, decodes the result, and
  exposes simulation → awaiting signature → submitted → pending → confirmed or
  failed state to the UI. The same adapter path is used for `create_event`,
  `reserve`, and `claim_check_in_refund`.
- The live refund path requests `voucher_message` from the deployed contract,
  signs those canonical bytes locally, and never maintains a second browser
  serializer.

## Event synchronization

Stellar RPC contract events are consumed with cursor polling rather than a
browser push channel:

1. start from the caller's cursor, explicit ledger, or a bounded 5,000-ledger
   lookback;
2. request successful contract events filtered to the pinned CommitPass
   contract;
3. decode the `rsvp` event namespace, deduplicate by event ID, and retain the
   returned opaque cursor;
4. retry transient failures and continue from the last acknowledged cursor;
5. correlate `event_created`, `reserved`, `checked_in`, cancellation, refund,
   and no-show signals to the active event;
6. call `get_event` and, when attendee state may have changed,
   `get_reservation` for authoritative state.

The poller keeps its cursor and deduplication set in memory. It does not use an
event payload as the product's source of truth and does not persist potentially
stale state across browser sessions.

## Execution boundaries

| Route | Ledger behavior |
| --- | --- |
| Judge RSVP/check-in/refund | Deterministic local sandbox; no wallet signature or funds |
| Live Testnet lifecycle | Real wallet-approved `create_event`, 0.001 XLM `reserve`, canonical voucher, `claim_check_in_refund`, and authoritative final reads |
| Optional classic payment proof | Real user-entered Testnet XLM payment after wallet approval |
| Published lifecycle evidence | Real CLI event creation, reservation, scanner-signed refund, and public transaction hashes |

Cancellation and no-show settlement remain implemented and tested contract
paths but are not part of the short live judge loop.

## Deployment

- Stellar CLI: `27.0.0`
- Soroban SDK: `27.0.2`
- JavaScript SDK: `16.1.0`
- Network: Stellar Testnet
- Contract:
  `CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN`
- Verified `create_event` transaction:
  `f7e218954d1e4a75f5c6bbc8e6029b313592d37ab5301b7b7fa44c3e534ac83e`
- Wasm SHA-256:
  `e6c17cb2c717609f18a34afd69569ea3661641f855584136efe09226c095ea81`
- Event Directory Wasm SHA-256:
  `7d845ad41f6eedf196bd3d38febadff741b4a1fb9e64a95a0a335766e0b3030b`

The Testnet identity and scanner secret used for deployment verification stay
under ignored local workspace paths and are excluded from the submission
package. The browser live flow generates its scanner key in memory and never
writes that private key to contract state. `deployments/testnet.json` leaves
the Event Directory deployment fields null; this documentation does not claim
an unverified second public deployment.
