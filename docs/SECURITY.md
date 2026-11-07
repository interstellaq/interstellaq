# Security

## Security posture

InterstellaQ is designed as non-custodial: customer authorization occurs in the customer's wallet, and the protocol must never request, receive, log, or store private keys or seed phrases.

## Assets and trust boundaries

Assets include customer funds, merchant receiving accounts, invoice data, QR payloads, wallet handoff data, and settlement evidence. Trust boundaries exist between browser and wallet, browser and Stellar network/query provider, merchant input and displayed invoice, and any future contract or storage service.

## Initial threat model

| Threat | Initial control |
|---|---|
| QR substitution or tampering | Show recipient, asset, amount, and expiry in human-readable form before wallet authorization; bind verification to immutable invoice fields. |
| Merchant-account impersonation | Require proof of control appropriate to the selected wallet/signing flow; do not treat a display name as ownership proof. |
| Invoice replay or duplicate payment | Use unique invoice references, explicit lifecycle state, expiry, and idempotent verification; define any repeat-payment policy. |
| Stale or fabricated settlement result | Query authoritative Testnet transaction/contract evidence and validate successful execution and all expected fields. |
| Client-side state manipulation | Treat browser status as untrusted until independently derived from on-chain evidence. |
| Secret leakage | Exclude secrets from UI collection, logs, analytics, source control, and error messages. |

## Authorization requirements

- Customer signatures must be created by the customer's wallet.
- Merchant actions must be linked to control of the declared merchant account before their registration is trusted.
- Any Soroban administrative capability must be explicit, minimal, and documented before deployment.

## Payment invariants

An invoice may be marked settled only if the selected successful Testnet evidence matches its recipient, asset, amount, expiry policy, and correlation rule. Expired invoices must not be represented as payable. A transaction for a different recipient, asset, or amount never settles the invoice.

## Replay protection

Each invoice needs a unique identifier and expiry. Verification must be idempotent and prevent one transaction from silently satisfying multiple invoices unless such allocation is an explicit, tested protocol rule. The exact on-chain correlation format remains unresolved.

## Open decisions

Wallet capability validation, reference encoding, merchant proof-of-control, external provider trust, contract authorization model, and incident reporting procedures require review before implementation or Testnet deployment.
