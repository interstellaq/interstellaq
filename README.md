# InterstellaQ

> Open Payments Without Borders

InterstellaQ is an early-stage, non-custodial global merchant payment protocol for Stellar. Registered merchants will create QR-code payment requests that customers authorize with compatible Stellar wallets.

## Problem

Cross-border merchant payments remain fragmented, costly, and difficult to integrate. Merchants need a simple, interoperable request-and-settlement flow without taking custody of customer funds.

## Proposed solution

InterstellaQ proposes a Stellar-native payment request protocol: a merchant publishes an invoice, a customer scans a QR request and authorizes a transfer in their wallet, and the merchant verifies settlement on Stellar. Soroban will be considered only where programmable protocol rules add value beyond native operations.

## Core capabilities (planned)

- Merchant registration and payment addresses
- Amount-specific, expiring QR payment requests
- Wallet-oriented customer authorization
- Testnet settlement verification and invoice status
- Optional programmable rules through Soroban

## Planned stack

Scaffold Stellar, React, Vite, TypeScript, Rust/Soroban, generated contract clients, and Stellar Testnet. SEP-7 is a compatibility consideration pending wallet-interoperability validation.

## Hackathon status

This repository was initialized for Código Cordillera, Genesis Track. It currently contains planning and design documentation only; no application, contract, payment flow, or deployment has been implemented.

## Documentation

- [Product requirements](docs/PRD.md)
- [Requirements](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Backlog](docs/BACKLOG.md)
- [Technology-stack ADR](docs/adr/0001-technology-stack.md)

## Long-term vision

Make open, interoperable merchant payments as approachable as Brazil's Pix while using Stellar for cross-border value movement and Soroban for carefully scoped programmable settlement capabilities.
