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

import { type Invoice } from "../domain/invoice"
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

/** All invoices of one merchant, newest first. Never throws. */
export function loadInvoices(address: string): Invoice[] {
	const invoices = read<Invoice[]>(invoicesKey(address), [])
	return [...invoices].sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Insert or replace an invoice by id, enforcing reference uniqueness inside
 * the merchant store. Returns false when storage is unavailable or the
 * reference collides with another invoice.
 */
export function saveInvoice(address: string, invoice: Invoice): boolean {
	const invoices = read<Invoice[]>(invoicesKey(address), [])
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
	return (
		read<Invoice[]>(invoicesKey(address), []).find(
			(invoice) => invoice.id === id,
		) ?? null
	)
}

/** Load one invoice of a merchant by memo reference, or null. */
export function findInvoiceByReference(
	address: string,
	reference: string,
): Invoice | null {
	return (
		read<Invoice[]>(invoicesKey(address), []).find(
			(invoice) => invoice.reference === reference,
		) ?? null
	)
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
	return read<Invoice[]>(invoicesKey(address), []).some(
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
