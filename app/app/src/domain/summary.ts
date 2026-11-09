import {
	derivedStatus,
	STROOPS_PER_XLM,
	toStroops,
	type DerivedStatus,
	type Invoice,
} from "./invoice"

/**
 * Merchant dashboard metrics and status filters (Dashboard V2).
 *
 * Pure functions over the invoices already loaded and validated by
 * lib/persistence.ts. Amounts are summed in stroops with bigint, never as
 * floating point, so a total always equals the exact sum of the invoices.
 *
 * Issued amounts and verified settlements are kept apart: an invoice counts
 * as settled only when this app recorded it as settled through Horizon
 * verification (status, transaction hash and verification time together).
 * A transaction hash on its own never counts as proof of payment.
 */

const TX_HASH_PATTERN = /^[0-9a-f]{64}$/i

/**
 * True when the stored record carries the full verification footprint that
 * lib/verify.ts writes after Horizon confirmed the payment. Records with a
 * hash but another status, or a settled status without evidence, are not
 * verified settlements.
 */
export function isVerifiedSettlement(invoice: Invoice): boolean {
	return (
		invoice.status === "settled" &&
		typeof invoice.txHash === "string" &&
		TX_HASH_PATTERN.test(invoice.txHash) &&
		typeof invoice.verifiedAt === "number" &&
		Number.isSafeInteger(invoice.verifiedAt) &&
		invoice.verifiedAt > 0
	)
}

export interface AmountTotal {
	/** Number of invoices in the bucket. */
	count: number
	/** Exact sum in stroops (1 XLM = 10^7 stroops). */
	stroops: bigint
}

export interface InvoiceSummary {
	/** Every invoice issued by the merchant in this browser. */
	issued: AmountTotal
	/** Settlements confirmed against Horizon, see isVerifiedSettlement. */
	verified: AmountTotal
	/** Still payable: active, or submitted but not yet confirmed. */
	open: AmountTotal
	/** Subset of `open` whose last verification did not confirm a payment. */
	awaitingConfirmation: AmountTotal
	/** Past expiry without a settlement. */
	expired: AmountTotal
	/**
	 * Marked settled locally but missing the verification evidence. Never
	 * part of `verified`; surfaced so the gap is visible, not hidden.
	 */
	unverifiedSettled: AmountTotal
}

const empty = (): AmountTotal => ({ count: 0, stroops: 0n })

function add(total: AmountTotal, stroops: bigint): void {
	total.count += 1
	total.stroops += stroops
}

/** Compute dashboard metrics at instant `now` (epoch milliseconds). */
export function summarizeInvoices(
	invoices: readonly Invoice[],
	now: number,
): InvoiceSummary {
	const summary: InvoiceSummary = {
		issued: empty(),
		verified: empty(),
		open: empty(),
		awaitingConfirmation: empty(),
		expired: empty(),
		unverifiedSettled: empty(),
	}
	for (const invoice of invoices) {
		const stroops = toStroops(invoice.amount)
		// Stored invoices are validated on load; skip anything unparsable
		// rather than letting it corrupt a total.
		if (stroops === null) continue
		add(summary.issued, stroops)
		const status = derivedStatus(invoice, now)
		if (status === "settled") {
			add(
				isVerifiedSettlement(invoice)
					? summary.verified
					: summary.unverifiedSettled,
				stroops,
			)
		} else if (status === "expired") {
			add(summary.expired, stroops)
		} else {
			add(summary.open, stroops)
			if (status === "verification_failed") {
				add(summary.awaitingConfirmation, stroops)
			}
		}
	}
	return summary
}

/**
 * Format stroops as an exact XLM decimal string: trailing fractional zeros
 * are dropped and the whole part is grouped with narrow no-break spaces, an
 * unambiguous separator in every Spanish locale ("1 234.5").
 */
export function formatXlm(stroops: bigint): string {
	const negative = stroops < 0n
	const absolute = negative ? -stroops : stroops
	const whole = (absolute / STROOPS_PER_XLM).toString()
	const fraction = (absolute % STROOPS_PER_XLM)
		.toString()
		.padStart(7, "0")
		.replace(/0+$/, "")
	const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F")
	return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`
}

export interface DailyReceipts {
	/** Epoch milliseconds of local midnight that starts the day. */
	dayStart: number
	/** Exact sum of verified settlements confirmed that day, in stroops. */
	stroops: bigint
	/** Number of verified settlements confirmed that day. */
	count: number
}

/**
 * Verified receipts per local calendar day, for the last `days` days ending
 * today, oldest first, with empty days included. Uses the same evidence rule
 * as the summary (isVerifiedSettlement) and groups by `verifiedAt`, the time
 * this app confirmed the payment against Horizon: the ledger close time is
 * not stored locally. Reads local data only; never queries the network.
 */
export function dailyVerifiedReceipts(
	invoices: readonly Invoice[],
	now: number,
	days = 14,
): DailyReceipts[] {
	const today = new Date(now)
	const buckets: DailyReceipts[] = []
	for (let offset = days - 1; offset >= 0; offset--) {
		// Built from calendar fields, so daylight saving changes never shift a day.
		const dayStart = new Date(
			today.getFullYear(),
			today.getMonth(),
			today.getDate() - offset,
		).getTime()
		buckets.push({ dayStart, stroops: 0n, count: 0 })
	}
	const byDay = new Map(buckets.map((bucket) => [bucket.dayStart, bucket]))
	for (const invoice of invoices) {
		if (!isVerifiedSettlement(invoice)) continue
		const stroops = toStroops(invoice.amount)
		if (stroops === null) continue
		const verified = new Date(invoice.verifiedAt as number)
		const bucket = byDay.get(
			new Date(
				verified.getFullYear(),
				verified.getMonth(),
				verified.getDate(),
			).getTime(),
		)
		if (!bucket) continue
		bucket.stroops += stroops
		bucket.count += 1
	}
	return buckets
}

/** Status filters offered by the invoice list. */
export const INVOICE_FILTERS = [
	"all",
	"active",
	"verification_failed",
	"settled",
	"expired",
] as const

export type InvoiceFilter = (typeof INVOICE_FILTERS)[number]

/**
 * Whether an invoice belongs to a filter at instant `now`. Filters use the
 * same derived status as the status badge, so expiry is evaluated against
 * the clock, exactly as on the invoice page.
 */
export function matchesFilter(
	invoice: Invoice,
	filter: InvoiceFilter,
	now: number,
): boolean {
	if (filter === "all") return true
	return derivedStatus(invoice, now) === filter
}

/** Invoices in a filter, keeping the input order (newest first on load). */
export function filterInvoices(
	invoices: readonly Invoice[],
	filter: InvoiceFilter,
	now: number,
): Invoice[] {
	return invoices.filter((invoice) => matchesFilter(invoice, filter, now))
}

/** Number of invoices in every filter at instant `now`. */
export function countByFilter(
	invoices: readonly Invoice[],
	now: number,
): Record<InvoiceFilter, number> {
	const counts: Record<InvoiceFilter, number> = {
		all: invoices.length,
		active: 0,
		verification_failed: 0,
		settled: 0,
		expired: 0,
	}
	for (const invoice of invoices) {
		const status: DerivedStatus = derivedStatus(invoice, now)
		counts[status] += 1
	}
	return counts
}
