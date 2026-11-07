# Proposed Architecture

## Status and principles

This document separates confirmed choices from proposals. Confirmed: React/Vite/TypeScript frontend, Rust/Soroban where contracts are needed, Scaffold Stellar as the development framework, and Stellar Testnet for the MVP. The application is generated at `app/` and the delivered decisions are recorded in [ADR 0002](adr/0002-invoice-correlation.md).

## Confirmed decisions

- Customers authorize transfers with their own Stellar-compatible wallet; InterstellaQ does not custody signing keys.
- The MVP is constrained to Stellar Testnet.
- Native Stellar transaction capabilities are preferred when they meet the requirement.
- SEP-7 support is a design consideration, not a verified integration commitment.

## Proposed flow

1. A frontend associates a merchant profile with a public Stellar account.
2. The merchant creates an invoice: recipient, asset, amount, expiry, and unique reference.
3. The frontend encodes the request into a QR payload for wallet handoff.
4. The customer wallet builds and signs the selected Stellar operation or transaction.
5. The frontend or a minimal read-only index/query path verifies Testnet settlement and records the invoice status.

## Proposed components

### Frontend

The React application at `app/app/` provides merchant screens, invoice lifecycle views, QR display, wallet handoff, and status. Scaffold Stellar-generated clients would be used if a Soroban contract is introduced.

### Stellar accounts, assets, and transfers

The implementation uses standard Stellar operations for direct payments, which preserves the required invoice correlation and verification semantics. The MVP settles in native XLM: no trustline is needed. Issued assets (including stablecoins) require trustline handling and are deferred to the roadmap.

### Soroban contracts

Potential uses include durable invoice state, atomic programmable settlement rules, or merchant policy enforcement. The MVP needs none of them, so no contract is deployed; the workspace under `app/contracts/` is kept for backlog M3. Contract authorization, storage costs, and wallet support must be evaluated before adopting this route.

### Merchant registration

Delivered as a signed no-op transaction (sequence bump) with a fixed memo, which proves control of the public key on chain, plus off-chain display metadata in browser storage. No central registry.

### Invoice lifecycle

Delivered states: `active`, `settled`, `expired`, and `verification_failed`. The transition to `settled` is based on verified Testnet evidence, never on a client assertion.

### Settlement verification

Delivered: a Horizon query over the recipient's recent transactions, filtered by the invoice's unique text memo, then matched against recipient, native asset, exact amount in stroops, and a source account different from the recipient. Failed checks leave the stored status untouched.

The check runs automatically every 20 seconds while the merchant panel or the invoice page holds a pending invoice, in addition to the manual "Verificar estado" button and the check that follows a payment submission. The poll pauses while the tab is hidden and never overlaps itself.

## Architecture questions: resolved in ADR 0002

- Which wallet(s) and QR/URI request formats are demonstrably supported? Stellar Wallets Kit (Freighter included) for in-app signing, plus a SEP-7 `web+stellar://pay` URI; the QR carries the full request in the URL fragment.
- How are invoice references represented and correlated on-chain? A unique text memo (`ISQ` + 10 base32 characters, within the 28 byte limit).
- Is persistent off-chain invoice storage needed? Yes, but only in the browser: `localStorage` keyed by merchant public key, with the QR payload as the cross-device path.
- Which assets are practical for the Testnet demo? Native XLM only; issued assets and stablecoins are a roadmap item.
