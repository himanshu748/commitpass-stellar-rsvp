# CommitPass Orange Belt demo script

Target length: 90–120 seconds. The prerecorded evidence video is 78.1 seconds;
this version leaves room for an optional live wallet confirmation.

## 0:00–0:15 — Problem and promise

“Free RSVPs are easy to collect and hard to trust. CommitPass asks for one
small, published Testnet XLM commitment: show up, verify attendance, and get the
entire amount back.”

Show the responsive attendee page and the four-step Reserve → Arrive → Verify →
Refund explanation.

## 0:15–0:45 — Live Testnet lifecycle

Open **Connect wallet** → **Choose Stellar wallet** and keep the wallet on
Testnet.

1. Select **Create live Testnet event** and review the `create_event`
   invocation.
2. Select **Reserve 0.001 XLM** and review the amount in the wallet.
3. When check-in opens, select **Claim check-in refund**.

Explain:

“The event-scoped Ed25519 signer exists only in this browser session. It asks
the deployed contract for canonical voucher bytes. The attendee authorizes the
claim, the contract verifies the short-lived voucher, and all 10,000 stroops
return atomically.”

Point to the final authoritative reservation and event reads. Never imply that
the demo automation approved a wallet request; the wallet holder reviews every
authorization.

## 0:45–1:05 — Advanced contract and event architecture

Show the architecture:

```text
Attendee wallet → Refundable RSVP → native XLM SAC
                         ▲
                         │ read-only cross-contract calls
                  Event Directory
```

State that the deployed RSVP contract's reserve path performs the load-bearing
native SAC transfer. Event Directory is a second tested custom contract that
calls RSVP read methods; it is built in CI but is not claimed as publicly
deployed.

Show cursor event sync and explain:

“Events are hints, not application state. Create, reserve, check-in,
cancellation, refund, and no-show signals are deduplicated by cursor and
followed by authoritative contract reads.”

## 1:05–1:20 — Repeatable evidence

Show the green CI run:

https://github.com/himanshu748/commitpass-stellar-rsvp/actions/runs/30139625279

State:

“Twenty-seven Rust tests, fifty-three frontend tests, and four Playwright journeys
validate both contracts, both generated clients, the responsive app, and the
browser flows. CI retains the Playwright report and screenshots.”

## 1:20–1:35 — Public proof

Open:

- deployed RSVP contract:
  `CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN`;
- reservation / native SAC transfer:
  `2036256aecb600793f87980cd02df92ba8eb3fae4b3ffb14901cb370f9cf83d3`;
- scanner-signed refund:
  `291d1d02ad1a741b22db56440293fd8b65813ca7002387573505dae65f163bdb`.

Close:

“The app is live, the code and CI are public, and the material claims are
independently inspectable on Stellar Testnet. Testnet XLM has no cash value,
and Mainnet custody remains gated on an independent audit and secure scanner
operations.”

## Judge fallback

If no compatible wallet is present, use the no-funds judge sandbox for the
product story, then show the deployed contract, public lifecycle transactions,
green CI run, and retained browser artifact. The sandbox is labelled and is
never presented as a ledger transaction.
