# Proposed Architecture

## Status and principles

This document separates confirmed choices from proposals. Confirmed: React/Vite/TypeScript frontend, Rust/Soroban where contracts are needed, Scaffold Stellar as the future development framework, and Stellar Testnet for the MVP. No application structure has yet been generated.

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

The future React application would provide merchant screens, invoice lifecycle views, QR display, wallet handoff, and status. Scaffold Stellar-generated clients would be used if a Soroban contract is introduced.

### Stellar accounts, assets, and transfers

The first implementation should use standard Stellar operations for direct payments when this preserves the required invoice correlation and verification semantics. Supported assets and trustline handling are unresolved. Native XLM requires no trustline; issued assets do.

### Soroban contracts

Potential—not yet confirmed—uses include durable invoice state, atomic programmable settlement rules, or merchant policy enforcement. Contracts are not assumed for simple direct payment requests. Contract authorization, storage costs, and wallet support must be evaluated before adopting this route.

### Merchant registration

The storage and authority model is unresolved. A minimal MVP may represent registration as a user-controlled public account plus off-chain UI metadata; an on-chain registry requires a justified discovery or trust need.

### Invoice lifecycle

Proposed states: `draft`, `active`, `payment_submitted` (optional), `settled`, `expired`, and `verification_failed`. The authoritative transition to `settled` must be based on verified Testnet evidence, not a client assertion.

### Settlement verification

Verification must match the chosen payment semantics: recipient, asset, amount, successful result, and reference/correlation rule. Whether this uses transaction memo conventions, Soroban events, or another supported mechanism remains an open decision.

## Open architecture questions

- Which wallet(s) and QR/URI request formats will be demonstrably supported?
- How will invoice references be safely represented and correlated on-chain?
- Is persistent off-chain invoice storage needed for the MVP, and if so, what is the minimum trust-preserving design?
- Which asset(s) are practical for the Testnet demo?
