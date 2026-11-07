# Requirements

## Functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-01 | Merchant registration | A Testnet account can submit required registration fields; its public address is displayed after confirmation. |
| FR-02 | Invoice creation | Merchant can create an invoice containing recipient, asset identifier, amount, expiry, and unique reference; invalid or incomplete input is rejected. |
| FR-03 | QR request | Each active invoice renders a QR payload that represents the reviewed payment request. |
| FR-04 | Customer authorization | The flow presents a wallet-compatible request for customer approval; no customer private key is collected or persisted by InterstellaQ. |
| FR-05 | Settlement verification | An invoice changes to settled only when on-chain evidence matches its recipient, asset, amount, and reference/approved correlation rule. |
| FR-06 | Expiry handling | An invoice past its expiry cannot be presented as payable and is labelled expired. |

## Non-functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| NFR-01 | Network scope | Demo transactions and lookups use Stellar Testnet; network is shown in the user interface. |
| NFR-02 | Non-custody | No private keys, seed phrases, or wallet signing secrets enter application storage, logs, or source control. |
| NFR-03 | Integrity | Invoice records preserve the created recipient, asset, amount, expiry, and reference for verification. |
| NFR-04 | Usability | Before wallet handoff, the customer can read recipient, asset, amount, and expiry. |
| NFR-05 | Observability | Verification failures expose a safe, actionable status without revealing credentials or secrets. |
| NFR-06 | Accessibility | The core form and status flow are keyboard operable and present text equivalents for QR data. |

## Open requirements

The canonical QR payload, supported asset set, durable invoice storage approach, and exact settlement correlation mechanism require technical validation before implementation.
