/**
 * Invoice model and lifecycle for the InterstellaQ payment request flow.
 *
 * An invoice is an immutable payment request: once created, its recipient,
 * asset, amount, reference and expiry never change (NFR-03). Only the status
 * evolves, and only through verified on-chain evidence (FR-05).
 */

export type InvoiceStatus = "active" | "settled" | "verification_failed"

/** Status shown to the user: stored status plus the time-derived `expired`. */
export type DerivedStatus = InvoiceStatus | "expired"

export interface Invoice {
	/** UUID, unique per invoice. */
	id: string
	/** Memo-safe correlation reference, see lib/reference.ts. */
	reference: string
	/** Merchant Stellar public key (G...) that receives the payment. */
	recipient: string
	/** Display name of the merchant at creation time. */
	recipientName?: string
	/** MVP asset set: native XLM only. */
	asset: "XLM"
	/** Decimal string in XLM, 1 to 7 fractional digits. */
	amount: string
	/** Optional free-text concept shown before authorization (NFR-04). */
	note?: string
	/** Epoch milliseconds. */
	createdAt: number
	/** Epoch milliseconds; the invoice is expired from this instant (FR-06). */
	expiresAt: number
	/** Last stored status. Authoritative transitions require verification. */
	status: InvoiceStatus
	/** Hash of the transaction that settled this invoice. */
	txHash?: string
	/** Epoch milliseconds of the last successful verification. */
	verifiedAt?: number
}

/** One stroop is 10^-7 XLM. */
export const STROOPS_PER_XLM = 10_000_000n

/** Allowed expiry windows for a new invoice, in minutes. */
export const EXPIRY_OPTIONS_MINUTES = [15, 30, 60, 1440] as const

const AMOUNT_PATTERN = /^\d{1,10}(\.\d{1,7})?$/

/**
 * Convert a decimal XLM string to stroops. Returns null when the string is
 * not a valid, non-negative XLM amount with at most 7 fractional digits, so
 * callers can never compare partially parsed amounts (FR-05).
 */
export function toStroops(amount: string): bigint | null {
	if (!AMOUNT_PATTERN.test(amount)) return null
	const [whole = "0", fraction = ""] = amount.split(".")
	return (
		BigInt(whole) * STROOPS_PER_XLM + BigInt(`${fraction}0000000`.slice(0, 7))
	)
}

export interface InvoiceInput {
	recipient: string
	recipientName?: string
	amount: string
	note?: string
	expiryMinutes: number
	reference: string
	now?: number
}

/**
 * Validate user input and build an invoice (FR-02). Invalid or incomplete
 * input is rejected with a message suitable for direct display.
 */
export function createInvoice(
	input: InvoiceInput,
): Invoice | { error: string } {
	const now = input.now ?? Date.now()
	const stroops = toStroops(input.amount.trim())
	if (stroops === null || stroops <= 0n) {
		return { error: "Ingresa un monto válido en XLM mayor que cero." }
	}
	if (!Number.isInteger(input.expiryMinutes) || input.expiryMinutes <= 0) {
		return { error: "Selecciona un tiempo de expiración válido." }
	}
	const note = input.note?.trim()
	if (note !== undefined && note.length > 60) {
		return { error: "El concepto no puede superar 60 caracteres." }
	}
	return {
		id: crypto.randomUUID(),
		reference: input.reference,
		recipient: input.recipient,
		recipientName: input.recipientName,
		asset: "XLM",
		amount: input.amount.trim(),
		note: note === "" ? undefined : note,
		createdAt: now,
		expiresAt: now + input.expiryMinutes * 60_000,
		status: "active",
	}
}

/**
 * Status shown to the user. A settled invoice stays settled; anything else
 * past its expiry reads as expired and can never be presented as payable
 * (FR-06). `verification_failed` keeps the invoice payable until expiry: a
 * failed check is information, not a state transition.
 */
export function derivedStatus(
	invoice: Invoice,
	now: number = Date.now(),
): DerivedStatus {
	if (invoice.status === "settled") return "settled"
	if (now >= invoice.expiresAt) return "expired"
	return invoice.status
}

/**
 * An invoice can only be paid while it has not settled and has not expired.
 * A failed verification is informational: the invoice stays payable until
 * its expiry window closes.
 */
export function isPayable(invoice: Invoice, now: number = Date.now()): boolean {
	const status = derivedStatus(invoice, now)
	return status === "active" || status === "verification_failed"
}

/** Milliseconds remaining until expiry; 0 once expired. */
export function remainingMs(
	invoice: Invoice,
	now: number = Date.now(),
): number {
	return Math.max(0, invoice.expiresAt - now)
}
