# CommitPass architecture

## System boundary

CommitPass has three execution layers:

1. **React web client** — presents event terms, connects a wallet, builds
   contract calls, creates attendee QR payloads, and displays transaction state.
2. **Event scanner** — reads an attendee pass and signs the exact canonical
   voucher bytes returned by the deployed contract.
3. **Soroban contract** — holds native XLM, enforces event windows and
   authorization, verifies Ed25519 vouchers, prevents replay, and performs
   refunds or no-show settlement.

The application has no backend custody service and never asks for a wallet
secret. Event metadata may live off-chain; immutable hashes and all financial
rules live on-chain.

## Attendee lifecycle

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
voucher as canonical Soroban `ScVal` XDR. The scanner signs those exact bytes.
This makes the signature deployment-bound and network-bound; it cannot be
replayed on a cloned contract or a different Stellar network.

The contract adapter requests `voucher_message` from the deployed contract
rather than maintaining a second serializer. The public verification lifecycle
used those canonical bytes. The no-funds judge sandbox intentionally uses a
separate, clearly labelled intent encoder for local cryptographic demonstration.

## Frontend runtime

- The RSVP → voucher → refund experience remains a no-funds judge sandbox and
  clearly labels simulated receipts.
- A separate live Testnet proof route is mounted in the wallet panel. On load,
  it reads the deployed verification event through `get_event`.
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
- The live proof builds a unique one-seat `create_event` call with a random
  event salt, a metadata hash, a fresh per-event scanner public key, and the
  connected address as organizer and beneficiary. The proof UI does not expose
  reservations and destroys the one-time private scanner key after creation.
  Its deposit configuration is one stroop, but `create_event` itself transfers
  no token; only the network fee is charged.
- The generated binding simulates the call and maps typed contract errors before
  asking for a wallet signature. It then submits, polls, decodes the result, and
  exposes simulation → awaiting signature → submitted → pending → confirmed or
  failed state to the UI.

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
5. correlate `event_created` to the currently displayed proof event and
   expected organizer, then call `get_event` for authoritative state.

The poller keeps its cursor and deduplication set in memory. It does not use an
event payload as the product's source of truth and does not persist potentially
stale state across browser sessions.

## Execution boundaries

| Route | Ledger behavior |
| --- | --- |
| Judge RSVP/check-in/refund | Deterministic local sandbox; no wallet signature or funds |
| Yellow `create_event` proof | Real Soroban Testnet write; no token transfer; wallet-approved network fee |
| Optional classic payment proof | Real user-entered Testnet XLM payment after wallet approval |
| Published lifecycle evidence | Real CLI event creation, reservation, scanner-signed refund, and public transaction hashes |

Reserve, check-in refund, cancellation, and settlement are implemented in the
generated adapter but are not mounted as live browser actions in this release.

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

The Testnet identity and scanner secret used for deployment verification stay
under ignored local workspace paths and are excluded from the submission
package. The browser proof generates its scanner key in memory and never writes
that private key to contract state.
