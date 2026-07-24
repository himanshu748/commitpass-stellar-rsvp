# CommitPass demo script

Target length: 3 minutes.

## 0:00–0:20 — Problem

“Free RSVPs are easy to collect and hard to trust. Organizers plan for a full
room, genuine attendees get waitlisted, and empty seats still appear. CommitPass
adds one small, transparent commitment: show up and get it back.”

Show the attendee event page and the published 2 XLM rule.

## 0:20–0:50 — Reserve

Click **Reserve my spot**, choose **Use demo wallet**, and review:

- full refund after verified check-in;
- disclosed no-show beneficiary;
- cancellation always enables a full refund;
- Testnet XLM has no cash value.

Confirm the reservation. Point to the increased capacity count and confirmed
transaction state.

## 0:50–1:25 — Check in and refund

Open the one-time pass. Explain that the QR binds the event, attendee wallet,
and random nonce.

Click **Simulate organizer scan**. Explain:

“In the real lifecycle, the venue scanner signs canonical bytes from the
deployed contract. The voucher is bound to this wallet, this contract, and this
network. The product scanner uses a 60-second expiry policy.”

Click **Simulate my 2 XLM refund** and show the completed sandbox receipt.

## 1:25–1:50 — Organizer workflow

Open **Host an event**. Highlight the fixed deposit, capacity, check-in window,
beneficiary, and event-scoped scanner public key. Review the immutable rules and
create the event.

On **Check-in sandbox**, show the camera scanner and manual-code fallback. Avoid
requesting camera permission during a remote judge demo unless the camera has
already been tested.

## 1:50–2:30 — Yellow Belt live contract proof

Open **Connect wallet** → **Verify wallet address**. Point out that the chooser
is the official Stellar Wallets Kit modal and can list multiple supported
wallets. Choose an installed wallet on Testnet.

Show the native balance, **Authoritative contract read**, and **Cursor-based
event sync**. Explain:

“Events tell the client that something changed; they never replace contract
state. After an `event_created` signal, CommitPass reads `get_event` again.”

Select **Create Testnet proof event**. The generated client creates a unique
one-seat evidence record on the deployed contract. The UI does not enable
reservations for this proof-only event. It transfers no XLM; the wallet pays
only the Testnet network fee. Review the invocation in the wallet, approve it,
and point to simulation → awaiting signature → submitted → pending → confirmed.
Open the returned explorer link and then show the correlated contract read.

Do not imply that automation approved a wallet request. This live step is
performed only when the wallet holder is present and chooses to sign.

## 2:30–2:50 — Published on-chain evidence

Open the Stellar Expert Testnet contract:

`CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN`

Show the verified `create_event` call:

`f7e218954d1e4a75f5c6bbc8e6029b313592d37ab5301b7b7fa44c3e534ac83e`

Then show the real 2 XLM reservation transaction:

`2036256aecb600793f87980cd02df92ba8eb3fae4b3ffb14901cb370f9cf83d3`

Follow it with the scanner-signed 2 XLM refund:

`291d1d02ad1a741b22db56440293fd8b65813ca7002387573505dae65f163bdb`

State that the contract has 22 passing Rust tests and the frontend/application
layer has 50 unit tests plus 4 browser journeys across desktop and mobile.

## 2:50–3:00 — Close

“CommitPass is ready for the next evidence: two Bengaluru community pilots,
25–35 reserving wallets each, and a measured comparison with prior turnout. We
are asking Rise In for pilot-organizer introductions and Mainnet-readiness
feedback—not pretending the 50-user milestone is already complete.”

## Judge fallback

If no supported wallet is available or the holder does not want to sign, show
the live contract read and the verified historical `create_event` transaction
instead. Do not claim the historical transaction was browser-signed during this
session. The UI separately explains wallet unavailable, rejected request,
wrong network, and insufficient balance.

For the RSVP story, use demo mode. If the organizer camera is unavailable, copy
the fallback code below the attendee QR, open **Enter code instead**, paste the
complete `commitpass:pass:v1:…` payload, and verify it.

The demo mode is intentionally labeled; public Testnet transactions provide the
independent ledger evidence.
