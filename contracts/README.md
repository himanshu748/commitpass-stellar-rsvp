# Refundable RSVP contract

`refundable-rsvp` is CommitPass's Soroban contract for refundable event-attendance
deposits. One deployment manages many events and reservations using the native XLM
Stellar Asset Contract (SAC) fixed at deployment.

This code is suitable for Testnet development and judging. It has not received an
independent security audit and must not custody production funds until it has.

## Lifecycle

1. The deployer passes the network's native XLM SAC address to `__constructor`.
   This address is stored atomically with contract creation and cannot be replaced
   or front-run through a later initializer.
2. An organizer submits an event config with a fresh 32-byte salt, metadata hash,
   schedule, capacity, XLM deposit amount, cancellation policy, no-show
   beneficiary, and event-scoped Ed25519 scanner public key. The contract derives
   and returns the organizer-bound event ID.
3. An attendee authorizes `reserve` before `start_at`. The contract atomically
   transfers one deposit into custody.
4. At the venue, the scanner signs an attendee-bound voucher. The attendee
   authorizes `claim_check_in_refund`, and the contract verifies the voucher before
   atomically returning the full deposit.
5. Before `start_at`, an attendee may cancel. `FullRefund` returns the deposit;
   `ForfeitDeposit` pays it to the configured beneficiary.
6. The organizer may cancel an event through `check_in_deadline`, inclusive. Each
   still-reserved attendee can independently call `claim_event_refund`, so
   cancellation remains bounded even for large events. After that deadline,
   cancellation is permanently closed.
7. At or after `end_at`, anyone may call `sweep_no_show` for an unchecked
   reservation. Funds always go to the event's immutable beneficiary.

Reservations are terminal after check-in, cancellation, event refund, or no-show
settlement. Records are retained, so an attendee cannot reserve twice or settle a
deposit twice.

## Event ID security

`create_event` does not accept a caller-chosen ID. It derives the ID as SHA-256 of
canonical Soroban `ScVal` XDR containing:

- the fixed 32-byte domain `COMMITPASS_EVENT_ID_V1` followed by ten zero bytes;
- `env.ledger().network_id()`;
- `env.current_contract_address()`;
- the organizer address;
- the exact `EventConfig`, including its non-zero `event_salt`.

Consequently, another organizer using the same salt and config receives a different
ID and cannot occupy the intended organizer's ID. A config change also changes the
ID. Clients can call read-only `derive_event_id` before submission and should use a
cryptographically random salt for every event.

## Voucher security model

A `CheckInVoucher` contains:

- `event_id`
- `attendee`
- a 32-byte, event-scoped `nonce`
- `checked_in_at`
- `expires_at`

The contract canonicalizes this payload as Soroban `ScVal` XDR after adding:

- the fixed 32-byte domain `COMMITPASS_CHECKIN_V1` followed by eleven zero bytes;
- `env.ledger().network_id()`;
- `env.current_contract_address()`.

The venue scanner signs those exact bytes with the private key corresponding to
the event's `scanner_public_key`. Call the read-only `voucher_message` method to
obtain the exact bytes to sign; this avoids implementing a second serializer in
the scanner during the MVP.

`claim_check_in_refund` enforces all of the following:

- the voucher event and attendee equal the call arguments;
- the attendee authorizes the transaction;
- the event and voucher are inside the check-in window;
- the signature matches the event-scoped scanner key;
- the event-scoped nonce has never been used;
- the reservation is still unsettled.

The scanner key may rotate before `start_at` and is frozen from `start_at`
onward. A failed signature raises a Soroban host crypto error because
`ed25519_verify` fails closed; the transaction and all state changes roll back.

This is **organizer-attested attendance**, not trustless proof of physical
presence. A compromised scanner key can authorize refunds during the event's
check-in window, but it cannot redirect a refund away from the bound attendee and
cannot claim without that attendee's authorization. Scanner private keys must
remain off-chain and should be isolated per event.

## Public methods

| Method | Authorization | Purpose |
| --- | --- | --- |
| `__constructor` | deployment only | Permanently pin the native XLM SAC |
| `get_deposit_token` | none | Read the constructor-pinned XLM SAC |
| `derive_event_id` | none | Derive an organizer/config-bound event ID |
| `create_event` | organizer | Create an event and return its derived ID |
| `update_scanner_key` | organizer | Rotate scanner key before `start_at` |
| `reserve` | attendee | Lock one deposit before `start_at` |
| `claim_check_in_refund` | attendee + scanner signature | Check in and reclaim deposit |
| `cancel_reservation` | attendee | Apply the event's pre-start cancellation policy |
| `cancel_event` | organizer | Cancel through `check_in_deadline` |
| `claim_event_refund` | attendee | Pull refund after event cancellation |
| `sweep_no_show` | none | Settle an unchecked reservation after `end_at` |
| `get_event`, `has_event` | none | Read event state |
| `get_reservation`, `has_reservation` | none | Read reservation state |
| `voucher_message`, `is_nonce_used` | none | Build/check voucher data |

Every state transition emits a typed event. Event and reservation records use
persistent storage. The contract instance and state entries loaded or written by
an interaction have their TTLs extended toward the network maximum.

## Build and test

Prerequisites are Rust 1.84 or newer, the `wasm32v1-none` target, and the current
Stellar CLI.

```sh
cd contracts
rustup target add wasm32v1-none

cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

# Equivalent to the core compilation step used by `stellar contract build`.
cargo build --target wasm32v1-none --release --package refundable-rsvp

# Preferred when Stellar CLI is installed; it also optimizes the Wasm.
stellar contract build --package refundable-rsvp
```

The raw Cargo artifact is:

```text
target/wasm32v1-none/release/refundable_rsvp.wasm
```

## Deploy to Testnet

```sh
stellar keys generate commitpass-deployer --network testnet --fund

COMMITPASS_XLM_SAC="$(
  stellar contract id asset \
    --asset native \
    --network testnet
)"

stellar contract deploy \
  --wasm target/wasm32v1-none/release/refundable_rsvp.wasm \
  --source-account commitpass-deployer \
  --network testnet \
  --alias refundable_rsvp \
  -- \
  --deposit-token "$COMMITPASS_XLM_SAC"
```

The constructor runs in the deployment transaction, so there is no separately
callable initialization window. Verify the pinned value after deployment:

```sh
stellar contract invoke \
  --id refundable_rsvp \
  --network testnet \
  -- \
  get_deposit_token
```

Inspect the generated CLI for the deployed interface:

```sh
stellar contract invoke \
  --id refundable_rsvp \
  --source-account commitpass-deployer \
  --network testnet \
  -- \
  --help
```

## Important assumptions

- Amounts are signed `i128` values in stroops (`1 XLM = 10,000,000 stroops`);
  deposits must be strictly positive.
- Every event must use the exact native XLM SAC address constructor-pinned for
  this deployment. `create_event` rejects every other token address. Deployers
  must derive the native SAC for the same network on which they deploy.
- Event IDs bind the organizer, exact config, random salt, network, and contract
  deployment. Salt reuse with the same organizer and config resolves to the same
  ID and is rejected as a duplicate.
- Direct token transfers to the contract are not reservations and cannot be
  attributed or recovered through the RSVP methods.
- Ledger timestamps are the only time source. Reservations close exactly at
  `start_at`; check-in includes both endpoints; no-show settlement begins exactly
  at `end_at`.
- Organizer cancellation is available only through the inclusive check-in
  deadline and uses pull refunds to avoid unbounded loops. Attendees therefore
  trust the organizer not to cancel strategically during check-in; cancellation
  refunds every reservation that is still unsettled.
- Persistent entries can be archived by the network after TTL expiry and may then
  require restoration. Methods that load or write an event, reservation, or
  nonce renew that entry; lightweight `has_*` and `is_nonce_used` queries renew
  only the contract instance.
