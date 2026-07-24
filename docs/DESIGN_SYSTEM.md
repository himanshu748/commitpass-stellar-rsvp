# CommitPass design system

The accepted concepts are:

- `work/design/commitpass-attendee-concept.png`
- `work/design/commitpass-host-concept.png`
- `work/design/commitpass-checkin-concept.png`
- `work/design/commitpass-mobile-concept.png`

## Direction

Optimistic editorial event-tech. Blockchain is quiet infrastructure rather than
the visual theme. The signature motif is a return loop around a single seat dot.
Layouts use open white space, hairline divisions, progress routes, and one
purposeful art panel instead of card grids.

## Tokens

| Role | Value |
| --- | --- |
| Background | `#ffffff` |
| Ink | `#081120` |
| Body | `#465063` |
| Muted | `#6f7888` |
| Border | `#d9dee7` |
| Soft surface | `#f7f9fc` |
| Tangerine / primary | `#ff4f12` |
| Tangerine hover | `#e83f05` |
| Cobalt / link | `#1557ff` |
| Mint / refund | `#078b59` |
| Mint surface | `#effbf6` |
| Danger | `#c4382b` |
| Radius small | `10px` |
| Radius medium | `14px` |
| Radius art | `18px` |
| Hairline | `1px solid #d9dee7` |
| Focus ring | `0 0 0 3px rgba(21, 87, 255, .2)` |

Use true white. Do not reinterpret it as cream, warm gray, or an off-white.

## Typography

- UI and content: `Manrope`, with `Inter`, system sans-serif fallback.
- Display: 64/68 desktop, 44/48 tablet, 50/52 in the accepted mobile concept
  where space allows.
- Page title: 52/58 desktop; 40/46 mobile.
- Section heading: 24/30.
- Body: 17/27 desktop; 16/25 mobile.
- Control labels: 14/20, 600 weight.
- Buttons: 16/20, 700 weight.
- Table and queue rows: 15/22.

Controls must not inherit browser-default typography.

## Component families

- `BrandMark`: two circular arrows and an orange seat dot, plus lowercase
  `commitpass`.
- `AppHeader`: brand, three essential nav links, network selector, wallet
  control.
- `Button`: tangerine primary, cobalt outline, and quiet text variants.
- `CapacityProgress`: numeric capacity and a thin tangerine rail.
- `CommitmentRoute`: Reserve, Check in, Refunded; horizontal desktop and vertical
  mobile.
- `EventArt`: generated artwork at
  `frontend/public/commitpass-event-art.png`; no overlay or tint.
- `DepositSummary`: amount, refund rule, Testnet disclaimer.
- `Field`: label, input, helper/error, consistent 52px control height.
- `Stepper`: Event, Deposit, Review.
- `ArrivalRow`: avatar initial, name, short wallet, status, disclosure control.
- `Status`: semantic bordered label only when it conveys real state.
- `Toast` and `TransactionStatus`: submitted, pending, confirmed, failed, with
  transaction hash when present.
- `Modal`: wallet picker, reservation confirmation, manual scan code, and
  destructive confirmation.

## Container and rhythm

- Desktop maximum width: `1340px`; page gutter `44px`.
- Tablet gutter: `28px`; mobile gutter: `20px`.
- Header height: `84px` desktop, `72px` mobile.
- Main attendee screen: approximately 2:1 content/action columns separated by a
  hairline.
- Host form: broad form and narrow sticky summary.
- Check-in: broad scanner and narrow arrival queue.
- Avoid nested panels. Use open sections and dividers; one bordered surface may
  frame a functional unit such as the scanner or deposit receipt.

## Icon inventory

Use Lucide-style 1.5px outline icons consistently: wallet, ChevronDown,
CalendarDays, MapPin, Users, ArrowRight, ArrowLeft, CircleCheck, ShieldCheck,
QrCode, Camera, Keyboard, Search, ExternalLink, KeyRound, Coins, Clock,
Copy, RefreshCw, X, and Menu. The return-loop brand mark is a custom SVG.

## Motion

- Route/status transitions: 180ms ease-out.
- Button and row hover: 140ms ease.
- Reservation/refund confirmation: one restrained check stroke and amount
  transition, under 400ms.
- Honor `prefers-reduced-motion`.

## Allowed attendee first-viewport copy

- `commitpass`
- `Events`
- `My RSVPs`
- `Host an event`
- `Stellar Testnet`
- `Connect wallet`
- `Show up. Get it back.`
- `A tiny refundable deposit keeps your free spot real.`
- `Stellar Builders Night`
- `Wed, 12 Aug · 6:30 PM`
- `Bangalore International Centre`
- `Stellar Bengaluru`
- `42 of 60 spots reserved`
- `Reserve with 2 XLM`
- `Check in at the venue and all 2 XLM return to your wallet.`
- `Reserve my spot`
- `How it works`
- `Reserve — Lock 2 XLM`
- `Check in — Scan the live QR`
- `Refunded — Get 2 XLM back`
- `Your deposit`
- `2.00 XLM`
- `Fully refundable at check-in`
- `Testnet XLM has no cash value.`

Do not add an eyebrow, badge, promotional metric, or token-price content above
the heading.

## Responsive behavior

- At `<= 900px`, collapse content/action columns and keep the primary action
  immediately after event details.
- At `<= 700px`, hide desktop nav behind a simple menu; keep Testnet and wallet
  controls visible in compact form.
- On mobile, use one column, a vertical commitment route, full-width primary
  buttons, at least 44px touch targets, and no horizontally squeezed tables.
- Scanner mode prioritizes the camera frame and manual-code fallback; the queue
  follows below.

## Asset treatment

The event artwork has no overlay or color tint. It uses a stable square crop on
desktop and a wide crop on mobile through `object-fit: cover`. Do not recreate
it as a CSS gradient or substitute a stock image.
