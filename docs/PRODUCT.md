# CommitPass

**A refundable RSVP for real turnout.**

CommitPass is a narrow, non-custodial commitment layer for free, in-person
community events. An attendee locks a small, clearly disclosed XLM deposit when
reserving a place. At the venue, an event-scoped scanner signs a short-lived,
attendee-bound check-in voucher. The attendee authorizes the claim and the
Soroban contract returns the full deposit.

CommitPass is not an event marketplace, loyalty program, token, yield product,
or ticket-resale platform. Organizers keep using Luma, Meetup, Google Forms, or
their existing event page and add one CommitPass link.

## Primary user

An organizer of a free developer workshop, college tech event, or community
meetup with 30–100 registrations who needs a better signal of real attendance.

## Core promise

> Free registrations are easy; empty seats are expensive. CommitPass makes an
> RSVP a programmable promise without charging people who attend.

## MVP workflows

### Organizer

1. Connect a Stellar wallet.
2. Create an event with capacity, a fixed XLM deposit, RSVP deadline, check-in
   window, no-show beneficiary, metadata hash, and event-scoped scanner key.
3. Share the event commitment link.
4. At the venue, scan an attendee's one-time pass and sign a voucher using the
   product's 60-second scanner policy.
5. Cancel the event when necessary, enabling pull refunds for all unsettled
   reservations.
6. After the event ends, settle no-show deposits to the beneficiary disclosed
   before reservation.

### Attendee

1. Open the event link and see the deposit, deadlines, and no-show destination.
2. Connect a Stellar wallet.
3. Reserve a place, authorizing the fixed deposit transfer to the contract.
4. Display a one-time, wallet-bound check-in pass at the venue.
5. Receive an organizer-attested voucher and authorize the refund claim.
6. See the on-chain receipt and optionally leave two-question feedback.

## Security statement

CommitPass provides **organizer-attested attendance with cryptographic
anti-replay**. The voucher is domain-, network-, contract-, event-, attendee-,
nonce-, and time-bound. It prevents replay, wallet substitution, early
settlement, changing published rules, and double refunds.

It is not trustless proof of physical presence. The organizer is the real-world
oracle and a compromised scanner key can falsely attest attendance during the
check-in window. The contract cannot redirect a refund away from the bound
attendee, and the attendee must still authorize the claim.

## Rise In progression

- **White:** wallet connection, address and balance, first signed Testnet
  transaction.
- **Yellow:** multi-wallet connection, Soroban calls, transaction lifecycle,
  contract-event synchronization.
- **Orange:** deployed mini-dApp, RSVP contract, tests, reservation and refund
  flows.
- **Green:** production-ready event creation, scanner, voucher relay, accessible
  responsive UI, security documentation.
- **Blue:** two pilot organizers, 50 unique reserving wallets, feedback-driven
  iteration, demo and pitch.
- **Black:** public project account, 30 additional users, reviewed Mainnet
  release, at least 20 Mainnet users, and an independent security review.

## Pilot metrics

- Unique wallets completing `reserve`
- Independent organizers
- RSVP-to-check-in conversion
- Successful refund rate
- Median onboarding time
- Voucher failures and replay rejections
- Feedback responses
- Prior-event turnout comparison when the organizer has reliable data

Never claim reduced no-shows until pilot data supports it.

## Deliberate exclusions

No NFTs, secondary ticketing, yield, attendee redistribution, waitlists,
discovery marketplace, chat, fiat ramps, multi-asset selection, or token-price
content in v1.
