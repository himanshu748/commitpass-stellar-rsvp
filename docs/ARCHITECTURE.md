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

- The rendered app is fixed to a no-funds judge sandbox and clearly labels every
  simulated state; connecting a wallet verifies only the address.
- The contract integration modules validate the RPC URL, network passphrase,
  contract address, and XLM SAC before creating a generated client, but are not
  mounted as a live UI route in this release.
- The generated binding handles simulation, wallet authorization, submission,
  polling, error decoding, and result mapping.
- Freighter supports transaction and Soroban authorization-entry signing.
- Albedo supports delegated root-source transaction signing; unsupported
  authorization-entry requests fail closed.
- Both wallet paths compare the returned pre-signature transaction body with the
  requested body and reject provider substitution.

## Deployment

- Stellar CLI: `27.0.0`
- Soroban SDK: `27.0.2`
- JavaScript SDK: `16.1.0`
- Network: Stellar Testnet
- Contract:
  `CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN`
- Wasm SHA-256:
  `e6c17cb2c717609f18a34afd69569ea3661641f855584136efe09226c095ea81`

The Testnet identity and scanner secret used for deployment verification stay
under ignored local workspace paths and are excluded from the submission
package.
