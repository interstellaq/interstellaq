# InterstellaQ

> Open Payments Without Borders

InterstellaQ is an early-stage, non-custodial global merchant payment protocol for Stellar. Registered merchants create QR-code payment requests that customers authorize with compatible Stellar wallets.

## Problem

Cross-border merchant payments remain fragmented, costly, and difficult to integrate. Merchants need a simple, interoperable request-and-settlement flow without taking custody of customer funds.

## Proposed solution

InterstellaQ is a Stellar-native payment request protocol: a merchant publishes an invoice, a customer scans a QR request and authorizes a transfer in their wallet, and the merchant verifies settlement on Stellar. Soroban will be considered only where programmable protocol rules add value beyond native operations.

## What is implemented (Código Cordillera, Genesis track)

The hackathon MVP runs on Stellar Testnet end to end:

- Merchant registration with an on-chain proof of account control (signed no-op transaction, evidence linked on stellar.expert).
- Fixed-amount invoices with unique text-memo references and expiry (15 min to 24 h).
- QR payment request that embeds the full request in the URL, so it opens on any device without a backend, plus a SEP-7 `web+stellar://pay` handoff.
- Customer payment through the connected wallet (Stellar Wallets Kit): the app builds the exact XLM payment, the wallet signs it, the app submits it.
- Settlement verification against Horizon: successful transaction, matching memo reference, recipient, exact amount in stroops, non-native assets rejected, self-payments rejected, expired invoices never settle, and one transaction can never settle two invoices.
- Invoice states: active, settled, expired, verification_failed, with public evidence links per settled invoice.
- Spanish interface, keyboard-operable forms, and text equivalents for QR data.

Deliberately out of scope for the MVP (see docs/PRD.md): custody, refunds, fiat ramps, KYC, issued assets, and a backend.

## How to run

Prerequisites: Node.js 20+ and npm. The Stellar CLI, Rust, and Docker are only needed if you work with the scaffold's contract workspace (not required for the demo).

```bash
npm install
npm start
```

Open http://localhost:5173, connect a Testnet wallet (for example Freighter set to Testnet), and use "Cargar cuenta" if the account needs test XLM.

### Tests

```bash
npm test        # unit suite: reference, lifecycle, settlement rules, payloads
npm run test:net  # live Testnet check: real payment settles, wrong amount does not
```

`npm run test:net` funds two throwaway accounts via friendbot, submits a real payment, and asserts the verification result against Horizon.

### Deploy

The frontend builds as a static Vite app and deploys to Vercel from the `app/` directory:

```bash
cd app
vercel --prod
```

`app/vercel.json` points the build at the workspace (`npm run build`, output `app/app/dist`).

## Project layout

```
app/                 Scaffold Stellar workspace (npm workspaces)
  app/               React + Vite + TypeScript frontend (the demo)
  app-lib/           Shared wallet, network, and formatting helpers
  contracts/         Scaffold example contracts (unused by the MVP, kept for backlog M3)
docs/                PRD, requirements, architecture, security, backlog, pitch
docs/adr/            ADR 0001 (stack) and ADR 0002 (correlation, storage, handoff)
```

## Documentation

- [Product requirements](docs/PRD.md)
- [Requirements](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Backlog](docs/BACKLOG.md)
- [Pitch script](docs/PITCH.md)
- [Technology-stack ADR](docs/adr/0001-technology-stack.md)
- [Correlation, storage and handoff ADR](docs/adr/0002-invoice-correlation.md)

## Verification evidence

Settlement and registration are public on Testnet. Every settled invoice and merchant registration links its transaction on [stellar.expert/Testnet](https://stellar.expert/testnet).

## Long-term vision

Make open, interoperable merchant payments as approachable as Brazil's Pix while using Stellar for cross-border value movement and Soroban for carefully scoped programmable settlement capabilities.
