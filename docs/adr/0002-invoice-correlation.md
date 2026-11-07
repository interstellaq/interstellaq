# ADR 0002: Invoice Correlation, Storage and Wallet Handoff

- Status: Accepted
- Date: 2026-11-07
- Supersedes: open decisions in ADR 0001 and docs/ARCHITECTURE.md

## Context

The MVP must demonstrate, on Stellar Testnet, a complete payment request
flow: invoice creation, QR presentation, wallet authorization, and
settlement verification tied to the exact invoice. ADR 0001 left the
correlation mechanism, storage model, asset choice, and wallet handoff
unresolved. All four had to be decided before implementation.

## Decisions

### Asset: native XLM

Invoices are denominated in native XLM only. XLM needs no trustline, no
asset issuer, and no liquidity assumption on Testnet, which removes an
entire class of setup failures from the demo path. Issued assets remain a
post-hackathon extension (PRD future roadmap).

### Correlation: unique text memo

Each invoice carries a unique reference of the form `ISQ` plus 10 random
base32 characters (13 ASCII bytes, well inside the 28 byte text memo
limit). The payment transaction attaches the reference as a text memo.

Verification matches a Horizon transaction against all of the following:

- transaction successful;
- text memo equals the invoice reference;
- first payment operation is native XLM;
- payment destination equals the invoice recipient;
- payment amount equals the invoice amount exactly, compared in stroops;
- transaction source differs from the recipient (a merchant cannot settle
  its own invoice).

Because references are random (50 bits of entropy) and uniqueness is also
enforced per merchant store at save time, one transaction can never
satisfy two invoices. Verification is idempotent: re-running it for a
settled invoice returns the stored result, and a transaction hash already
claimed by another invoice is rejected.

Alternatives considered:

- Soroban invoice contract with events: rejected for the MVP. Native
  operations plus memos provide the required correlation and verification
  semantics with no contract deployment, authorization model, or storage
  cost to review inside the hackathon window (M3 of the backlog keeps the
  option open).
- Amount-encoded references: rejected because the memo must stay opaque
  and unique, and the amount is already an explicit invoice field.

### Storage: browser localStorage, keyed by merchant address

Invoices are stored under `interstellaq.invoices.<public key>` and
merchant profiles under `interstellaq.merchant.<public key>`. There is no
backend: the MVP keeps its trust surface inside the browser, which
matches the non-custodial posture in docs/SECURITY.md. Stored status is
treated as untrusted client state; only Horizon evidence can move an
invoice to `settled`.

Cross-device reads are handled by the QR payload: the invoice URL
embeds the complete payment request in the URL fragment
(`#p=<base64url json>`), so any device that scans the QR can render the
request and verify settlement against public Horizon data without a
shared store.

### Wallet handoff: SEP-7 plus in-app Wallets Kit signing

Two handoff paths, both non-custodial:

1. In-app: the Stellar Wallets Kit (already provided by Scaffold Stellar)
   connects the payer's wallet, the app builds the unsigned payment, the
   wallet signs it, and the app submits it. This is the demo path and the
   one exercised end to end.
2. SEP-7: the invoice detail exposes a `web+stellar://pay` URI carrying
   destination, asset, amount, memo, memo type, and network, for wallets
   that register the protocol handler.

### Merchant registration: signed no-op transaction

Registration submits a `bumpSequence` operation to the account's current
sequence number with the fixed memo `InterstellaQ:registro`. It changes no
ledger state but can only be signed by the holder of the account secret,
so a confirmed transaction proves control before the display name is
trusted (docs/SECURITY.md, authorization requirements). The transaction
hash is stored as registration evidence and linked to stellar.expert.

## Consequences

- Settlement evidence and registration proof are public and inspectable
  on stellar.expert/Testnet.
- The merchant panel and the invoice page poll Horizon every 20 seconds
  while an invoice is pending, so a confirmed payment updates the status
  without user action. The poll pauses when the tab is hidden, never runs
  two queries at once, and a failed check leaves the status unchanged.
- The demo depends on Horizon Testnet availability; verification failures
  surface as an actionable status instead of an invoice state change.
- Invoice state does not survive a browser clear or move across devices
  except through the QR payload; a shared backend is a post-MVP decision.
- The Soroban route (backlog M3) remains available if programmable
  settlement rules become a requirement.
