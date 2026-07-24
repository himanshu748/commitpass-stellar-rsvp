# CommitPass 50-user pilot plan

## Objective

Validate whether a small refundable XLM commitment improves attendance at free
community events without creating unacceptable wallet or check-in friction.

The Blue Belt target is **not yet achieved**. The plan below is the acquisition
and learning path to at least 50 real users.

## Cohort

Run two Bengaluru developer-community events:

| Pilot | RSVP target | Deposit | Format |
| --- | ---: | ---: | --- |
| Stellar Builders Night | 25–35 | 1–2 XLM equivalent | Evening meetup |
| Open Source Saturday | 25–35 | 1 XLM equivalent | Half-day build session |

Use Testnet for the first staff rehearsal. Use Mainnet only after an independent
review and explicit participant consent, with a deliberately tiny amount.

## Recruitment

1. Partner with two existing organizers who already have 30–100 free-event
   registrations.
2. Give each organizer one shareable CommitPass link and a 15-minute scanner
   rehearsal.
3. Explain the no-show destination before wallet connection.
4. Offer an assisted Freighter onboarding desk at the venue.
5. Invite every participant to give a two-question post-event response.

## Success metrics

Primary:

- reservation-to-attendance rate;
- change versus the organizer’s previous comparable free event;
- refund-claim success rate;
- median time from QR presentation to confirmed refund.

Guardrails:

- wallet connection failure rate;
- abandoned reservation rate;
- manual-code fallback rate;
- support requests per attendee;
- accidental no-show settlement or incorrect refund count;
- organizer scanner setup time.

Targets for the first two pilots:

- at least 50 unique reserving wallets in total;
- at least 90% successful check-in refund claims;
- median check-in under 20 seconds;
- zero incorrect settlements;
- at least 70% of surveyed attendees say the deposit rule was clear before
  they reserved.

These are targets, not current results.

## Feedback prompts

Attendees:

1. Did the small deposit make you more likely to attend?
2. What was the hardest step: wallet setup, reservation, QR check-in, or refund?

Organizers:

1. Did the commitment reduce uncertainty before the event?
2. Would you use CommitPass again, and what would block you?

## Rollout gates

| Gate | Required evidence |
| --- | --- |
| Staff rehearsal | 10 repeated reserve/check-in/refund cycles with no failure |
| Testnet community pilot | 25+ users, support log, scanner runbook |
| Second community pilot | 50+ cumulative users and comparison to prior turnout |
| Mainnet decision | Independent review, secure scanner keystore, incident plan |
| Mainnet pilot | Small disclosed deposit, 20+ consenting real users |

## Learning decision

Continue when turnout improves or organizers report materially better planning
confidence and the refund path remains easy. Pivot the mechanism if attendees
understand the value but wallet setup dominates drop-off. Stop the monetary
pilot if any user can be incorrectly settled or if organizers cannot operate the
scanner reliably.
