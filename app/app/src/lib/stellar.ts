/**
 * Stellar Testnet access: payment building, submission and settlement
 * verification (FR-05, NFR-01).
 *
 * Verification is authoritative: an invoice only becomes `settled` when a
 * successful Horizon transaction matches its recipient, asset, amount and
 * memo reference. Browser state alone is never trusted (SECURITY.md).
 *
 * The pure matcher is separated from the network calls so the settlement
 * rules can be unit tested without a network (docs/adr/0002-invoice-
 * correlation.md).
 */

import {
	type Account,
	Asset,
	BASE_FEE,
	Horizon,
	Memo,
	Networks,
	Operation,
	TransactionBuilder,
} from "@stellar/stellar-sdk"
import { type Invoice, toStroops } from "../domain/invoice"

/** Stellar Testnet Horizon (NFR-01). */
export const HORIZON_URL = "https://horizon-testnet.stellar.org"

/** Explorer base for Testnet transaction evidence shown to the user. */
export const STELLAR_EXPERT_TX_BASE = "https://stellar.expert/explorer/testnet/tx/"

export const horizon = new Horizon.Server(HORIZON_URL)

/** Public evidence link for a transaction hash. */
export function stellarExpertTxUrl(hash: string): string {
	return `${STELLAR_EXPERT_TX_BASE}${hash}`
}

/**
 * The subset of an on-chain payment the matcher needs. Built from Horizon
 * records: one entry per candidate transaction with its first payment
 * operation resolved.
 */
export interface PaymentEvidence {
	hash: string
	successful: boolean
	/** Text memo of the transaction, or null when absent or non-text. */
	memo: string | null
	/** Account that signed and submitted the transaction. */
	sourceAccount: string
	/** Destination of the first payment operation, or null when none. */
	destination: string | null
	/** Asset type of that payment, e.g. "native". */
	assetType: string | null
	/** Decimal amount of that payment as reported by Horizon. */
	amount: string | null
}

export type VerifyResult =
	| { settled: true; txHash: string }
	| { settled: false; reason: "no_match" | "expired" | "network_error" }

/**
 * Pure settlement rule (FR-05, SECURITY.md payment invariants):
 *
 * - expired invoices never settle, even when a matching payment exists;
 * - the transaction must be successful;
 * - its text memo must equal the invoice reference;
 * - it must carry a native XLM payment to the invoice recipient;
 * - the amount must equal the invoice amount exactly, in stroops;
 * - a transaction sent by the recipient itself is rejected, so a merchant
 *   cannot settle an invoice without an incoming payment.
 *
 * References are unique, so a matching transaction can only satisfy the one
 * invoice that carries that reference.
 */
export function matchSettlement(
	invoice: Invoice,
	evidence: PaymentEvidence[],
	now: number = Date.now(),
): VerifyResult {
	if (now >= invoice.expiresAt) {
		return { settled: false, reason: "expired" }
	}
	const wanted = toStroops(invoice.amount)
	if (wanted === null) {
		return { settled: false, reason: "no_match" }
	}
	const match = evidence.find(
		(item) =>
			item.successful &&
			item.memo === invoice.reference &&
			item.destination === invoice.recipient &&
			item.sourceAccount !== invoice.recipient &&
			item.assetType === "native" &&
			toStroops(item.amount ?? "") === wanted,
	)
	return match
		? { settled: true, txHash: match.hash }
		: { settled: false, reason: "no_match" }
}

/**
 * Fetch settlement evidence for an invoice from Horizon: recent transactions
 * of the recipient filtered to the invoice reference, with payment
 * operations resolved only for those candidates.
 */
export async function fetchSettlementEvidence(
	invoice: Invoice,
): Promise<PaymentEvidence[]> {
	const page = await horizon
		.transactions()
		.forAccount(invoice.recipient)
		.order("desc")
		.limit(200)
		.call()

	const candidates = page.records.filter(
		(tx) =>
			tx.successful && tx.memo_type === "text" && tx.memo === invoice.reference,
	)

	const evidence: PaymentEvidence[] = []
	for (const tx of candidates) {
		const operations = await tx.operations()
		const payment = operations.records.find((op) => op.type === "payment")
		evidence.push({
			hash: tx.hash,
			successful: tx.successful,
			memo: tx.memo ?? null,
			sourceAccount: tx.source_account,
			destination: payment && payment.type === "payment" ? payment.to : null,
			assetType:
				payment && payment.type === "payment" ? payment.asset_type : null,
			amount: payment && payment.type === "payment" ? payment.amount : null,
		})
	}
	return evidence
}

/**
 * Network-backed verification. Network failures resolve to `network_error`
 * rather than throwing, so the UI can show an actionable status without
 * leaking internals (NFR-05).
 */
export async function verifySettlement(
	invoice: Invoice,
	now: number = Date.now(),
): Promise<VerifyResult> {
	if (now >= invoice.expiresAt) {
		return { settled: false, reason: "expired" }
	}
	try {
		const evidence = await fetchSettlementEvidence(invoice)
		return matchSettlement(invoice, evidence, now)
	} catch {
		return { settled: false, reason: "network_error" }
	}
}

/**
 * Build the unsigned native XLM payment for an invoice: exact recipient,
 * exact amount, invoice reference as text memo, 10 minute time bounds.
 * The payer signs it in their own wallet; no secret ever reaches the app.
 */
export async function buildPaymentTransaction(
	payer: string,
	invoice: Invoice,
): Promise<string> {
	const account = await horizon.loadAccount(payer)
	const transaction = new TransactionBuilder(account, {
		fee: BASE_FEE,
		networkPassphrase: Networks.TESTNET,
	})
		.addOperation(
			Operation.payment({
				destination: invoice.recipient,
				asset: Asset.native(),
				amount: invoice.amount,
			}),
		)
		.addMemo(Memo.text(invoice.reference))
		.setTimeout(600)
		.build()
	return transaction.toXDR()
}

/**
 * Submit a wallet-signed transaction and return its hash. Horizon rejects
 * the transaction when it is invalid or when the account has no funds.
 */
export async function submitSignedTransaction(
	signedXdr: string,
): Promise<string> {
	const transaction = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET)
	const result = await horizon.submitTransaction(transaction)
	return result.hash
}

/**
 * Fetch the current sequence number of an account as an `Account` handle for
 * TransactionBuilder. Used by registration and payment building.
 */
export async function loadAccount(address: string): Promise<Account> {
	return horizon.loadAccount(address)
}
