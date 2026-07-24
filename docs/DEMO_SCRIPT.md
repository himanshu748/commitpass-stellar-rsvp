# CommitPass demo script

Target length: 2 minutes 30 seconds.

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

## 1:50–2:15 — On-chain proof

Open the Stellar Expert Testnet contract:

`CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN`

Then show the real 2 XLM reservation transaction:

`2036256aecb600793f87980cd02df92ba8eb3fae4b3ffb14901cb370f9cf83d3`

Follow it with the scanner-signed 2 XLM refund:

`291d1d02ad1a741b22db56440293fd8b65813ca7002387573505dae65f163bdb`

State that the contract has 22 passing Rust tests and the frontend/application
layer has 33 unit tests plus 4 browser journeys across desktop and mobile.

## 2:15–2:30 — Close

“CommitPass is ready for the next evidence: two Bengaluru community pilots,
25–35 reserving wallets each, and a measured comparison with prior turnout. We
are asking Rise In for pilot-organizer introductions and Mainnet-readiness
feedback—not pretending the 50-user milestone is already complete.”

## Judge fallback

If a wallet extension or RPC is unavailable, use demo mode. If the organizer
camera is unavailable, copy the fallback code below the attendee QR, open
**Enter code instead**, paste the complete `commitpass:pass:v1:…` payload, and
verify it.

The demo mode is intentionally labeled; public Testnet transactions provide the
independent ledger evidence.
