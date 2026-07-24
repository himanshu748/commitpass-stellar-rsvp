# CommitPass security review

## Review status

The contract received an internal focused review after implementation and a
second review after hardening. No remaining Critical, High, or Medium issue was
identified. Twenty-two unit tests include real missing-authorization checks and
atomic rollback tests for failed outgoing token transfers.

This is not an independent audit. Mainnet custody must wait for an external
review, a minimal-value pilot, operational key controls, and incident procedures.

## Security properties

| Property | Enforcement |
| --- | --- |
| Event ownership | `create_event`, cancellation, and scanner rotation require organizer authorization |
| Event-ID integrity | ID hashes the domain, network, contract, organizer, full config, and random nonzero salt |
| Asset integrity | Constructor permanently pins one native-XLM SAC address |
| Deposit custody | Native SAC transfer and state transition execute atomically |
| Attendee binding | Voucher attendee must equal the reservation and the transaction authorizer |
| Deployment binding | Voucher message includes network ID and current contract address |
| Replay resistance | Every 32-byte nonce is accepted at most once per event |
| Short validity | Voucher expiry is bounded by the event check-in deadline |
| Double-settlement prevention | Every reservation has exactly one terminal state |
| Bounded cancellation | Attendees pull refunds individually; no unbounded organizer loop |
| No-show routing | Settlement can go only to the immutable disclosed beneficiary |

## Threat model

### Malicious attendee

- Cannot reserve without authorizing the XLM transfer.
- Cannot claim with another wallet’s voucher.
- Cannot alter event, attendee, nonce, or timestamps without breaking the
  signature.
- Cannot reuse a successful nonce.
- Cannot claim outside the event window.

### Malicious organizer

- Can lie about physical attendance because attendance is organizer-attested.
- Cannot redirect an attendee refund to another address.
- Cannot change the no-show beneficiary or deposit after event creation.
- Cannot rotate the scanner key after check-in begins.
- Can cancel through the inclusive check-in deadline; the disclosed contract
  design then gives unsettled attendees a full pull refund.

### Compromised scanner

A compromised event scanner can issue valid vouchers during that event’s
check-in window. It cannot:

- spend an attendee wallet;
- redirect a refund;
- use a voucher without the attendee’s authorization;
- reuse a consumed nonce;
- sign for a different deployment or network.

Mitigations for production:

- one key per event;
- OS secure enclave, hardware-backed keystore, or isolated signing service;
- role-restricted scanner devices;
- short voucher TTLs;
- key rotation before event start;
- an organizer incident action to cancel the event and enable refunds.

### Compromised frontend

A malicious frontend can propose harmful transactions or lie about display
copy. Wallet transaction review and open-source verification remain necessary.
The Yellow proof deliberately uses `create_event`, which moves no token, but it
still creates permanent contract state and incurs a Testnet network fee. Users
must inspect and approve the wallet prompt; the app never signs automatically.
Production deployments should add:

- a pinned contract address and build provenance;
- strict CSP and dependency integrity controls;
- reproducible builds;
- verified event metadata hashes;
- domain monitoring and signed release tags.

## Deployment trust

The contract cannot internally prove that the constructor argument is the
same-network native XLM SAC. A deployer could pin another contract address. The
deployment procedure therefore derives the SAC with Stellar CLI and verifies
`get_deposit_token` immediately after deployment.

For the current public Testnet deployment, both commands resolve to:

`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`

## Dependency review

The frontend pins the official `@creit.tech/stellar-wallets-kit` package at
2.5.0 instead of accepting a floating range. The kit supplies a common
supported-wallet modal and module interface. A package update must repeat unit,
browser, build, and dependency-audit checks before release.
CI installs the generated client and frontend with `npm ci --ignore-scripts`;
the clean-install production build is verified under that restriction.

Wallet convenience does not relax the application boundary:

- the connected value must be a valid Stellar G-address;
- the selected kit module must have a stable ID and name;
- when a wallet module implements network reporting, its passphrase must equal
  Stellar Testnet; every module receives only the pinned Testnet passphrase in
  signing requests;
- a signed transaction must keep the requested envelope type and transaction
  body;
- a returned signer address, when supplied, must match the connected account;
- disconnect clears local connection state even when a provider disconnect call
  fails.

Wallet unavailable, user rejection, wrong network, and insufficient balance are
normalized separately so a generic failure cannot hide the action the user
needs to take.

## Event synchronization safety

RPC contract events are hints, not authoritative records. The poller accepts
only successful contract events for the pinned contract, decodes the expected
`rsvp` namespace, deduplicates event IDs, and advances the opaque RPC cursor
only after its event callback succeeds. The app reconciles only the currently
displayed event ID and expected organizer; a matching `event_created` signal
triggers `get_event`.

The in-memory cursor can be lost on refresh, so the client restarts from a
bounded ledger lookback and deduplicates the returned page. Replayed, delayed,
missing, or out-of-order events therefore cannot directly overwrite product
state.

## Operational limitations

- Direct token transfers to the contract are not reservations and cannot be
  attributed or recovered by the current interface.
- Persistent entries can eventually archive; client writes request automatic
  restoration where supported.
- The MVP has no decentralized proof of physical presence.
- The mounted browser contract write is limited to `create_event`; live browser
  reserve and refund flows are not claimed.
- Each proof event receives a fresh scanner public key. The proof UI exposes no
  reservation path and destroys the one-time private key after publication, so
  these records are evidence-only rather than operational events.
- The public historical `create_event` hash proves the deployed method, but is
  not represented as a browser signature from the current preparation session.
- The verification deployment is Testnet only; Testnet XLM has no cash value.
