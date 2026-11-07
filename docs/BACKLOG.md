# Implementation Backlog

Priority is a complete, demonstrable Testnet payment flow within the hackathon, with security validation ahead of optional expansion.

## M0 — Foundations

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| M0-01 | Generate the official Scaffold Stellar application | Repository initialization | Generated application runs without altering this documentation's stated scope. |
| M0-02 | Validate Testnet wallet and request format | M0-01 | A chosen wallet/request path is documented and manually proven on Testnet. |
| M0-03 | Decide payment correlation design | M0-02 | ADR or architecture update defines reference encoding and verification fields. |

## M1 — Demonstrable payment request

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| M1-01 | Implement merchant account connection and registration | M0-01, M0-02 | Merchant can prove/control selected Testnet account and see its registration state. |
| M1-02 | Implement invoice creation and expiry | M0-03, M1-01 | Valid fixed-amount invoice has immutable recipient, asset, amount, reference, and expiry. |
| M1-03 | Render QR request and review screen | M1-02 | QR and text details match the active invoice exactly. |
| M1-04 | Add wallet authorization handoff | M1-03, M0-02 | Customer authorizes one Testnet payment without sharing a secret. |
| M1-05 | Verify settlement and status | M1-04, M0-03 | Successful matching payment changes the invoice to settled with inspectable evidence. |

## M2 — Harden demo

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| M2-01 | Test negative and expiry cases | M1-05 | Wrong amount, wrong recipient, failed, duplicate, and expired cases do not settle an invoice. |
| M2-02 | Security review | M2-01 | Security checklist covers trust boundaries, authorization, replay, and secret handling. |
| M2-03 | Demo script and documentation | M2-02 | A new reviewer can reproduce the Testnet flow from documented prerequisites. |

## M3 — Evaluate programmable extensions

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| M3-01 | Assess Soroban invoice contract | M2-03 | Decision records why native operations are insufficient or rejects the contract. |
| M3-02 | Add generated contract client if adopted | M3-01 | Client calls are generated, tested, and consistent with contract authorization rules. |
