/**
 * Wallet handoff payloads (FR-03, FR-04).
 *
 * Two handoff paths, both non-custodial:
 *
 * - QR payload: a self-contained invoice URL. The payment request travels
 *   inside the URL fragment, so any device that scans it can render the
 *   exact recipient, asset, amount, reference and expiry, and verify
 *   settlement against public Horizon data without a backend.
 * - SEP-7 link: a `web+stellar://pay` URI that compatible wallets parse
 *   directly into a reviewable payment (docs/adr/0002-invoice-correlation.md).
 */

import { type Invoice } from "../domain/invoice"

/** Fields carried in the QR payload fragment. */
export interface InvoicePayload {
	id: string
	reference: string
	recipient: string
	recipientName?: string
	asset: "XLM"
	amount: string
	note?: string
	createdAt: number
	expiresAt: number
}

export function toPayload(invoice: Invoice): InvoicePayload {
	return {
		id: invoice.id,
		reference: invoice.reference,
		recipient: invoice.recipient,
		recipientName: invoice.recipientName,
		asset: invoice.asset,
		amount: invoice.amount,
		note: invoice.note,
		createdAt: invoice.createdAt,
		expiresAt: invoice.expiresAt,
	}
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = ""
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlToBytes(value: string): Uint8Array {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/")
	const binary = atob(
		padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="),
	)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	return bytes
}

/** Encode an invoice payload as a URL-safe base64 fragment value. */
export function encodePayload(payload: InvoicePayload): string {
	const json = JSON.stringify(payload)
	return bytesToBase64Url(new TextEncoder().encode(json))
}

/**
 * Decode a QR payload fragment. Returns null for malformed data or data
 * that does not describe a complete payment request, so a tampered or
 * truncated QR never reaches the review screen.
 */
export function decodePayload(fragment: string): InvoicePayload | null {
	try {
		const json = new TextDecoder().decode(base64UrlToBytes(fragment))
		const parsed = JSON.parse(json) as Partial<InvoicePayload>
		if (
			typeof parsed.id !== "string" ||
			typeof parsed.reference !== "string" ||
			typeof parsed.recipient !== "string" ||
			typeof parsed.amount !== "string" ||
			typeof parsed.expiresAt !== "number" ||
			typeof parsed.createdAt !== "number" ||
			parsed.asset !== "XLM"
		) {
			return null
		}
		return parsed as InvoicePayload
	} catch {
		return null
	}
}

/**
 * Canonical invoice URL with the request embedded in the fragment. This is
 * the QR payload: it renders on any device and works without a backend.
 */
export function buildInvoiceUrl(
	invoice: Invoice,
	origin: string = window.location.origin,
): string {
	const base = `${origin}/factura/${invoice.recipient}/${invoice.id}`
	return `${base}#p=${encodePayload(toPayload(invoice))}`
}

/**
 * SEP-7 payment request URI for compatible wallets. Every field the wallet
 * must show before authorization is included: destination, asset, amount,
 * memo reference and Testnet (FR-04).
 */
export function buildSep7PayUri(invoice: Invoice): string {
	const params = new URLSearchParams({
		destination: invoice.recipient,
		amount: invoice.amount,
		asset: "XLM",
		memo: invoice.reference,
		memo_type: "text",
		network: "TESTNET",
	})
	return `web+stellar://pay?${params.toString()}`
}
