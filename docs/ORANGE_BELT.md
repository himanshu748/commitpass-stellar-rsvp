# Orange Belt evidence

This page is the concise judge index for CommitPass's Stellar Journey to
Mastery Orange Belt submission.

## Product

- Live mini-dApp:
  https://commitpass-stellar-rsvp.a-9724.chatgpt.site
- 78.1-second demo:
  https://commitpass-stellar-rsvp.a-9724.chatgpt.site/commitpass-orange-demo.mp4
- Public source:
  https://github.com/himanshu748/commitpass-stellar-rsvp
- Green CI:
  https://github.com/himanshu748/commitpass-stellar-rsvp/actions/runs/30139625279

The live Testnet panel mounts:

```text
create_event
  → reserve 0.001 XLM
  → voucher_message
  → event-scoped Ed25519 signature
  → claim_check_in_refund
  → authoritative event + reservation reads
```

Wallet-authorized writes always require the connected wallet holder's review.
Testnet XLM has no cash value.

## Submission screenshots

Mobile production UI:

![Responsive CommitPass production UI](screenshots/orange-mobile.png)

Green CI/CD:

![GitHub Actions run with passing Web and Soroban jobs](screenshots/orange-ci.png)

Test output with four passing browser journeys:

![Playwright report with four passing desktop and mobile tests](screenshots/orange-tests.png)

## Advanced contracts

| Evidence | Location |
| --- | --- |
| Refundable RSVP contract | `contracts/refundable-rsvp` |
| Event Directory contract | `contracts/event-directory` |
| Native XLM SAC call | RSVP `reserve`, refund, cancellation, and settlement paths |
| Directory → RSVP reads | Directory registration verifies RSVP event and token |
| Generated RSVP client | `packages/refundable-rsvp` |
| Generated directory client | `packages/event-directory` |
| Contract tests | 27 passing Rust tests |

Event Directory is tested, built, and release-ready. It is not represented as
publicly deployed; its Testnet deployment fields remain null.

## Real-time and frontend quality

- cursor-based Stellar RPC event polling;
- opaque cursor persistence during the session and event-ID deduplication;
- transient retry handling;
- create, reserve, check-in, cancellation, refund, and no-show signals;
- authoritative `get_event` / `get_reservation` reconciliation;
- responsive desktop/mobile experience;
- explicit loading, wallet-unavailable, rejected-request, wrong-network,
  insufficient-balance, submission, confirmation, and failure states;
- modal focus trap, opener focus restoration, and reduced-motion behavior.

## Tests and delivery

| Layer | Passing evidence |
| --- | --- |
| Soroban | 27 Rust tests; formatting; Clippy; two Wasm builds |
| Frontend | 53 Vitest tests; ESLint; production build |
| Browser | 4 Playwright journeys across desktop Chrome and Pixel 7 |
| CI | GitHub Actions run `30139625279`, conclusion `success` |
| Retained proof | `playwright-report` artifact with screenshots |
| Release | reproducible frontend/Wasm checksum workflow |
| History | 20 meaningful commits at verified CI commit `125a200` |

## Public Testnet proof

| Artifact | Value |
| --- | --- |
| Refundable RSVP | `CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN` |
| Native XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Wasm SHA-256 | `e6c17cb2c717609f18a34afd69569ea3661641f855584136efe09226c095ea81` |
| Deployment transaction | `6e748b3100fd70f03c10dadabbb62f0b064c0357a923bea7691b1ba084776f51` |
| Event creation | `f7e218954d1e4a75f5c6bbc8e6029b313592d37ab5301b7b7fa44c3e534ac83e` |
| Reservation / SAC transfer | `2036256aecb600793f87980cd02df92ba8eb3fae4b3ffb14901cb370f9cf83d3` |
| Scanner-signed refund | `291d1d02ad1a741b22db56440293fd8b65813ca7002387573505dae65f163bdb` |

## Security boundary

CommitPass proves organizer-attested attendance with cryptographic anti-replay;
it is not decentralized proof of physical presence. The browser-held
event-scoped key is suitable for this Testnet demonstration, not production
custody. Mainnet use remains gated on an independent audit, isolated scanner
key management, pilot evidence, and incident procedures.

Before publication, a GitGuardian-compatible high-confidence scan covered the
tracked working tree and every Git revision. It found zero matching secret
files and zero quoted long secret assignments. The one sensitive-looking
tracked filename, `frontend/.env.example`, contains public Testnet
configuration only. The official `ggshield` cloud scan was not run because no
GitGuardian API token is configured; this distinction is intentional and
documented rather than overstated.
