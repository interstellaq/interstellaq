# ADR 0001: Proposed Technology Stack

- Status: Proposed
- Date: 2026-11-06

## Context

InterstellaQ needs a hackathon-appropriate, Stellar-native path to demonstrate a non-custodial merchant payment request on Testnet. This is an initial choice; no runtime code has been created.

## Decision

Propose Scaffold Stellar for future project generation; React, Vite, and TypeScript for the web interface; Stellar SDK facilities and Testnet for account/transaction interaction; Rust and Soroban only for behavior requiring on-chain programmability; and generated contract clients when a Soroban contract is adopted.

## Rationale

This combination aligns with the requested ecosystem, supports a fast browser-facing prototype, and keeps direct Stellar payments available when a contract would add no protocol value. Rust/Soroban provides a path for explicit, auditable programmable rules.

## Alternatives considered

- A fully custom frontend setup: more control, but duplicates official framework setup effort.
- A contract-first design: rejected for now because basic payment requests may be handled with native Stellar operations.
- A custodial backend and database: rejected because it expands trust, security, and operational scope without being needed for the initial flow.
- EVM-compatible architecture: rejected because it does not reflect Stellar's account, transaction, and Soroban model.

## Consequences

The team must validate wallet compatibility, Testnet asset mechanics, and transaction correlation before promising a specific QR or wallet path. If a contract is added, its authorization, storage, deployment, and generated client lifecycle become part of the build and review process.

## Outstanding decisions

- Supported wallet(s) and evidence of QR/SEP-7 compatibility
- Testnet asset selection and trustline handling
- Invoice reference/correlation mechanism
- Minimal persistent invoice-state design
- Whether merchant registration needs an on-chain registry
