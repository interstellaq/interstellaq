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
import { type Invoice, toStroops, validateInvoiceData } from "../domain/invoice"

/** Stellar Testnet Horizon (NFR-01). */
export const HORIZON_URL = "https://horizon-testnet.stellar.org"

/** Explorer base for Testnet transaction evidence shown to the user. */
export const STELLAR_EXPERT_TX_BASE =
	"https://stellar.expert/explorer/testnet/tx/"

export const horizon = new Horizon.Server(HORIZON_URL)

/** Public evidence link for a transaction hash. */
export function stellarExpertTxUrl(hash: string): string {
	return `${STELLAR_EXPERT_TX_BASE}${hash}`
}

/** Horizon's maximum page size for collection endpoints. */
export const HORIZON_PAGE_LIMIT = 200

/**
 * Upper bound of the settlement scan: at most this many pages of the
 * recipient's transactions (newest first) are read per verification, that is
 * MAX_TRANSACTION_PAGES * HORIZON_PAGE_LIMIT records. Beyond it the result is
 * `incomplete`, never `no_match` (docs/adr/0002-invoice-correlation.md).
 */
export const MAX_TRANSACTION_PAGES = 5

/**
 * Margin for a browser clock running ahead of ledger time. The scan stops
 * early once it reaches transactions older than the invoice creation minus
 * this margin: the reference did not exist before the invoice, so no older
 * transaction can carry it.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60_000

/** Operation types whose top-level `to` field is the credited account. */
const PAYMENT_LIKE_TYPES = new Set([
	"payment",
	"path_payment_strict_receive",
	"path_payment_strict_send",
])

/** The subset of a Horizon transaction record the scan reads. */
export interface HorizonTransaction {
	hash: string
	successful: boolean
	memo_type: string
	memo?: string
	source_account: string
	/** Close time of the ledger that included the transaction. */
	created_at: string
	operation_count: number
	paging_token: string
}

/** The subset of a Horizon operation record the matcher reads. */
export interface HorizonOperation {
	id: string
	type: string
	/** Effective source: the operation's own source, else the transaction's. */
	source_account: string
	transaction_successful: boolean
	to?: string
	account?: string
	into?: string
	asset_type?: string
	amount?: string
}

/**
 * Read access to Horizon. Injected so the scan and its pagination can be
 * tested with simulated Horizon records instead of the network.
 */
export interface EvidenceSource {
	/** Transactions of `account`, newest first, strictly after `cursor`. */
	transactions(
		account: string,
		cursor: string | undefined,
		limit: number,
	): Promise<HorizonTransaction[]>
	/** Operations of one transaction, in transaction order. */
	operations(txHash: string, limit: number): Promise<HorizonOperation[]>
}

/** Default evidence source: the public Stellar Testnet Horizon. */
export const horizonEvidenceSource: EvidenceSource = {
	async transactions(account, cursor, limit) {
		let builder = horizon
			.transactions()
			.forAccount(account)
			.order("desc")
			.limit(limit)
		if (cursor !== undefined) builder = builder.cursor(cursor)
		const page = await builder.call()
		return page.records
	},
	async operations(txHash, limit) {
		const page = await horizon
			.operations()
			.forTransaction(txHash)
			.limit(limit)
			.call()
		return page.records.map((record) => {
			const fields = record as typeof record & Partial<HorizonOperation>
			return {
				id: record.id,
				type: record.type,
				source_account: record.source_account,
				transaction_successful: record.transaction_successful,
				to: fields.to,
				account: fields.account,
				into: fields.into,
				asset_type: fields.asset_type,
				amount: fields.amount,
			}
		})
	},
}

/** One operation, normalized to what the settlement rule needs. */
export interface OperationEvidence {
	id: string
	type: string
	/** Effective source account of the operation. */
	sourceAccount: string
	/** Account this operation credits, or null when it credits none. */
	creditedAccount: string | null
	/** Asset type for payment-like operations, else null. */
	assetType: string | null
	/** Decimal amount for payment-like operations, else null. */
	amount: string | null
}

/** One candidate transaction with every one of its operations. */
export interface TransactionEvidence {
	hash: string
	/** Transaction success as reported on the transaction and its operations. */
	successful: boolean
	memoType: string
	memo: string | null
	sourceAccount: string
	/** Ledger close time (ISO 8601) as reported by Horizon. */
	ledgerClosedAt: string
	/** Operation count declared by the transaction. */
	operationCount: number
	operations: OperationEvidence[]
}

/** Result of one bounded scan of the recipient's transactions. */
export interface SettlementEvidence {
	/** Transactions carrying the invoice reference as text memo. */
	transactions: TransactionEvidence[]
	/**
	 * True only when the scan reached the end of the account history or a
	 * transaction older than the invoice; otherwise absence of a match proves
	 * nothing.
	 */
	complete: boolean
	/** Number of transaction records inspected. */
	scanned: number
}

export type VerifyResult =
	| {
			settled: true
			txHash: string
			/** Horizon id of the operation that satisfies the invoice. */
			operationId: string
			ledgerClosedAt: string
	  }
	| {
			settled: false
			reason: "no_match" | "expired" | "incomplete" | "network_error"
	  }

/** Why a candidate transaction cannot settle an invoice. */
export type RejectionRule =
	| "failed"
	| "memo_mismatch"
	| "invalid_ledger_time"
	| "operations_incomplete"
	| "recipient_authorized"
	| "no_credit"
	| "multiple_credits"
	| "payment_mismatch"
	| "after_expiry"

export type TransactionVerdict =
	| { accepted: true; operationId: string; ledgerClosedAt: number }
	| { accepted: false; rule: RejectionRule }

function creditedAccount(operation: HorizonOperation): string | null {
	if (PAYMENT_LIKE_TYPES.has(operation.type)) return operation.to ?? null
	if (operation.type === "create_account") return operation.account ?? null
	if (operation.type === "account_merge") return operation.into ?? null
	return null
}

/** Normalize Horizon records into matcher evidence. */
export function toTransactionEvidence(
	transaction: HorizonTransaction,
	operations: HorizonOperation[],
): TransactionEvidence {
	return {
		hash: transaction.hash,
		successful:
			transaction.successful &&
			operations.every((operation) => operation.transaction_successful),
		memoType: transaction.memo_type,
		memo: transaction.memo ?? null,
		sourceAccount: transaction.source_account,
		ledgerClosedAt: transaction.created_at,
		operationCount: transaction.operation_count,
		operations: operations.map((operation) => {
			const paymentLike = PAYMENT_LIKE_TYPES.has(operation.type)
			return {
				id: operation.id,
				type: operation.type,
				sourceAccount: operation.source_account,
				creditedAccount: creditedAccount(operation),
				assetType: paymentLike ? (operation.asset_type ?? null) : null,
				amount: paymentLike ? (operation.amount ?? null) : null,
			}
		}),
	}
}

/**
 * Settlement rule for one transaction (FR-05, SECURITY.md payment
 * invariants). A transaction settles an invoice only when all hold:
 *
 * - it succeeded, and so did each of its operations;
 * - its memo is of type text and equals the invoice reference;
 * - its ledger close time is valid and earlier than the invoice expiry, so a
 *   payment confirmed in time settles even when checked after expiry;
 * - every declared operation was resolved, so nothing unseen can hide in it;
 * - the recipient is neither the transaction source nor the effective source
 *   of any operation: a merchant cannot settle its own invoice, not even by
 *   setting its account as the source of a single operation;
 * - exactly one operation credits the recipient, and it is a `payment` of
 *   native XLM for exactly the invoice amount in stroops. That operation is
 *   the one reported as satisfying the invoice.
 */
export function evaluateTransaction(
	invoice: Invoice,
	transaction: TransactionEvidence,
): TransactionVerdict {
	const reject = (rule: RejectionRule): TransactionVerdict => ({
		accepted: false,
		rule,
	})
	if (!transaction.successful) return reject("failed")
	if (transaction.memoType !== "text" || transaction.memo !== invoice.reference)
		return reject("memo_mismatch")
	const closedAt = Date.parse(transaction.ledgerClosedAt)
	if (!Number.isFinite(closedAt)) return reject("invalid_ledger_time")
	if (transaction.operations.length !== transaction.operationCount)
		return reject("operations_incomplete")
	if (
		transaction.sourceAccount === invoice.recipient ||
		transaction.operations.some(
			(operation) => operation.sourceAccount === invoice.recipient,
		)
	)
		return reject("recipient_authorized")

	const credits = transaction.operations.filter(
		(operation) => operation.creditedAccount === invoice.recipient,
	)
	const [credit] = credits
	if (credit === undefined) return reject("no_credit")
	if (credits.length > 1) return reject("multiple_credits")

	const wanted = toStroops(invoice.amount)
	if (
		wanted === null ||
		wanted <= 0n ||
		credit.type !== "payment" ||
		credit.assetType !== "native" ||
		toStroops(credit.amount ?? "") !== wanted
	)
		return reject("payment_mismatch")
	if (closedAt >= invoice.expiresAt) return reject("after_expiry")

	return { accepted: true, operationId: credit.id, ledgerClosedAt: closedAt }
}

/**
 * Pure settlement decision over one bounded scan.
 *
 * - Any accepted transaction settles the invoice; when several qualify, the
 *   earliest by ledger close time is chosen so the result is deterministic.
 * - Without an accepted transaction, an incomplete scan yields `incomplete`:
 *   it never claims that no payment exists.
 * - A complete scan yields `expired` once the invoice expired, else
 *   `no_match`.
 *
 * Expiry is judged on ledger time, not on the moment of the query. The
 * per-store transaction hash reuse check lives in lib/verify.ts.
 */
export function matchSettlement(
	invoice: Invoice,
	evidence: SettlementEvidence,
	now: number = Date.now(),
): VerifyResult {
	let best: { hash: string; operationId: string; closedAt: number } | null =
		null
	for (const transaction of evidence.transactions) {
		const verdict = evaluateTransaction(invoice, transaction)
		if (!verdict.accepted) continue
		if (best === null || verdict.ledgerClosedAt < best.closedAt) {
			best = {
				hash: transaction.hash,
				operationId: verdict.operationId,
				closedAt: verdict.ledgerClosedAt,
			}
		}
	}
	if (best !== null) {
		return {
			settled: true,
			txHash: best.hash,
			operationId: best.operationId,
			ledgerClosedAt: new Date(best.closedAt).toISOString(),
		}
	}
	if (!evidence.complete) return { settled: false, reason: "incomplete" }
	if (now >= invoice.expiresAt) return { settled: false, reason: "expired" }
	return { settled: false, reason: "no_match" }
}

/**
 * Bounded scan of the recipient's transactions, newest first, following
 * Horizon cursors. Operations are fetched only for transactions whose text
 * memo equals the invoice reference.
 *
 * The scan stops, with `complete: true`, when a page is shorter than the page
 * limit (end of history) or when its oldest record predates the invoice
 * creation minus CLOCK_SKEW_TOLERANCE_MS. After MAX_TRANSACTION_PAGES pages
 * it stops with `complete: false`.
 */
export async function fetchSettlementEvidence(
	invoice: Invoice,
	source: EvidenceSource = horizonEvidenceSource,
): Promise<SettlementEvidence> {
	const cutoff = invoice.createdAt - CLOCK_SKEW_TOLERANCE_MS
	const transactions: TransactionEvidence[] = []
	let cursor: string | undefined
	let scanned = 0

	for (let page = 0; page < MAX_TRANSACTION_PAGES; page++) {
		const records = await source.transactions(
			invoice.recipient,
			cursor,
			HORIZON_PAGE_LIMIT,
		)
		scanned += records.length
		for (const record of records) {
			if (record.memo_type !== "text" || record.memo !== invoice.reference)
				continue
			const operations = await source.operations(
				record.hash,
				HORIZON_PAGE_LIMIT,
			)
			transactions.push(toTransactionEvidence(record, operations))
		}
		const oldest = records[records.length - 1]
		if (oldest === undefined || records.length < HORIZON_PAGE_LIMIT) {
			return { transactions, complete: true, scanned }
		}
		const oldestTime = Date.parse(oldest.created_at)
		if (Number.isFinite(oldestTime) && oldestTime < cutoff) {
			return { transactions, complete: true, scanned }
		}
		cursor = oldest.paging_token
	}
	return { transactions, complete: false, scanned }
}

/**
 * Network-backed verification. On-chain evidence decides, including after
 * the invoice expired: a payment confirmed before expiry still settles.
 * Network failures resolve to `network_error` rather than throwing, so the
 * UI can show an actionable status without leaking internals (NFR-05).
 */
export async function verifySettlement(
	invoice: Invoice,
	now: number = Date.now(),
	source: EvidenceSource = horizonEvidenceSource,
): Promise<VerifyResult> {
	try {
		const evidence = await fetchSettlementEvidence(invoice, source)
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
	const validationError = validateInvoiceData(invoice, { requireId: true })
	if (validationError) throw new Error(validationError)
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
