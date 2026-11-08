/**
 * Local invoice and merchant persistence.
 *
 * The MVP keeps invoice state in the browser (docs/adr/0002-invoice-
 * correlation.md): no backend, no custody, no secrets. Invoices are stored
 * per merchant public key, which is also the isolation boundary between
 * merchants on a shared device.
 *
 * Stored status is untrusted client state (SECURITY.md): the UI may only
 * move an invoice to `settled` through lib/stellar.ts verification.
 */

import {
	type Invoice,
	type InvoiceStatus,
	validateInvoiceData,
} from "../domain/invoice"
import { type MerchantProfile } from "../domain/merchant"

const invoicesKey = (address: string) => `interstellaq.invoices.${address}`
const merchantKey = (address: string) => `interstellaq.merchant.${address}`

function read<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key)
		if (raw === null) return fallback
		return JSON.parse(raw) as T
	} catch {
		return fallback
	}
}

function write(key: string, value: unknown): boolean {
	try {
		localStorage.setItem(key, JSON.stringify(value))
		return true
	} catch {
		return false
	}
}

/**
 * Raw records of a merchant store, keeping only object entries so that a
 * corrupt value (null, a string, a non-list) can never crash a reader.
 * Objects are not validated here: writers preserve them, and the hash reuse
 * check still sees every claimed transaction.
 */
function readRecords(address: string): Partial<Invoice>[] {
	const stored = read<unknown>(invoicesKey(address), [])
	if (!Array.isArray(stored)) return []
	return stored.filter(
		(item): item is Partial<Invoice> =>
			typeof item === "object" && item !== null && !Array.isArray(item),
	)
}

const STORED_STATUSES: readonly InvoiceStatus[] = [
	"active",
	"settled",
	"verification_failed",
]

/**
 * A stored record is usable only when it passes the structural invoice
 * validation (docs/adr/0003) and carries a known status. Anything else is
 * treated as tampered or corrupt and never reaches the UI or verification.
 */
export function isValidStoredInvoice(value: unknown): value is Invoice {
	if (typeof value !== "object" || value === null) return false
	const invoice = value as Partial<Invoice>
	return (
		validateInvoiceData(invoice, { requireId: true }) === null &&
		STORED_STATUSES.includes(invoice.status as InvoiceStatus)
	)
}

/**
 * All structurally valid invoices of one merchant, newest first. Invalid
 * records are skipped. Never throws.
 */
export function loadInvoices(address: string): Invoice[] {
	return readRecords(address)
		.filter(isValidStoredInvoice)
		.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Insert or replace an invoice by id, enforcing reference uniqueness inside
 * the merchant store. Returns false when storage is unavailable or the
 * reference collides with another invoice.
 */
export function saveInvoice(address: string, invoice: Invoice): boolean {
	const invoices = readRecords(address)
	const duplicate = invoices.some(
		(existing) =>
			existing.id !== invoice.id && existing.reference === invoice.reference,
	)
	if (duplicate) return false
	const next = invoices.filter((existing) => existing.id !== invoice.id)
	next.push(invoice)
	return write(invoicesKey(address), next)
}

/** Load one invoice of a merchant by id, or null. */
export function getInvoice(address: string, id: string): Invoice | null {
	const invoice =
		readRecords(address).find((invoice) => invoice.id === id) ?? null
	return isValidStoredInvoice(invoice) ? invoice : null
}

/** Load one valid invoice of a merchant by memo reference, or null. */
export function findInvoiceByReference(
	address: string,
	reference: string,
): Invoice | null {
	const invoice =
		readRecords(address).find((invoice) => invoice.reference === reference) ??
		null
	return isValidStoredInvoice(invoice) ? invoice : null
}

/**
 * True when another invoice of the same merchant already claims this
 * transaction hash. Verification must reject the reuse of one transaction
 * across invoices (SECURITY.md, replay protection).
 */
export function isTxHashUsed(
	address: string,
	txHash: string,
	excludeInvoiceId?: string,
): boolean {
	return readRecords(address).some(
		(invoice) =>
			invoice.id !== excludeInvoiceId &&
			invoice.status === "settled" &&
			invoice.txHash === txHash,
	)
}

/** Merchant profile for an address, or null when unregistered. */
export function loadMerchant(address: string): MerchantProfile | null {
	return read<MerchantProfile | null>(merchantKey(address), null)
}

/** Persist a confirmed merchant registration. Returns false when unavailable. */
export function saveMerchant(profile: MerchantProfile): boolean {
	return write(merchantKey(profile.address), profile)
}
