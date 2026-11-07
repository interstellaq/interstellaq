# Product Requirements Document

## Vision

InterstellaQ enables merchants to request Stellar payments through a simple QR flow while customers retain control of authorization and funds.

## Target users

- Small and online merchants accepting international payments
- Customers with compatible Stellar wallets
- Integrators evaluating an open payment-request protocol

## Problem and opportunity

Merchant checkout across borders often lacks a low-friction, interoperable payment request format. Stellar's fast settlement and asset support create an opportunity for a wallet-authorized flow without merchant custody of customer assets.

## MVP scope

The hackathon MVP will demonstrate, on Stellar Testnet: merchant registration, creation of one fixed-amount and expiring invoice, QR presentation, customer wallet authorization, and merchant-visible settlement verification. Asset, wallet, and contract choices remain subject to validation.

## Out of scope

Fiat on/off ramps, custody, refunds, chargebacks, KYC/AML operations, production deployment, multi-merchant administration, exchange-rate conversion, a proprietary wallet, and claims of universal wallet compatibility.

## User journeys

1. A merchant connects an eligible Testnet account and registers a display identity.
2. The merchant creates an invoice with recipient, asset, amount, expiry, and reference.
3. A customer scans its QR representation, reviews the request in a compatible wallet, and authorizes payment.
4. The merchant checks the relevant Stellar transaction or contract event and marks the invoice settled only after the selected verification rule passes.

## Success criteria

- A live Testnet demo completes the end-to-end journey once without custodial signing.
- The invoice reference, amount, recipient, asset, and expiry are visible before authorization.
- A settled invoice is linked to verifiable on-chain evidence.
- The documented flow identifies unsupported wallet or asset cases clearly.

## Future roadmap

Validate SEP-7 interoperability; add multi-asset quoting and exchange paths where appropriate; explore Soroban-enforced invoice state and merchant policies; define refunds and disputes; pursue production readiness and partner integrations.
