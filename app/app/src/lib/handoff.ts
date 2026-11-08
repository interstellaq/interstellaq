/**
 * Wallet handoff payloads (FR-03, FR-04).
 *
 * Two handoff paths, both non-custodial:
 *
 * - QR payload: a self-contained invoice URL. The payment request travels
 *   inside the URL fragment, so any device that scans it can render the
 *   exact recipient, asset, amount, reference and expiry, and verify
 *   settlement against public Horizon data without a backend.
 * - SEP-7 link: an experimental `web+stellar:pay` URI (SEP-0007 v2.1.0) for
 *   wallets that register the protocol handler. It is a fallback, not the
 *   recommended path: no wallet has been verified to process it, and `pay`
 *   carries no time bounds and lets the wallet choose a path payment, which
 *   the settlement rule rejects (docs/adr/0002-invoice-correlation.md).
 */

import { Networks } from "@stellar/stellar-sdk"
import {
	type Invoice,
	isPayable,
	remainingMs,
	validateInvoiceData,
} from "../domain/invoice"

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
		if (validateInvoiceData(parsed, { requireId: true }) !== null) return null
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

/** SEP-0007 scheme plus the `pay` operation: no forward slashes. */
export const SEP7_PAY_PREFIX = "web+stellar:pay?"

/** SEP-0007 limit for `msg`, in characters before URL encoding. */
export const SEP7_MSG_MAX_LENGTH = 300

/**
 * Characters that can make `msg` render misleadingly in a wallet: control
 * characters (line breaks that forge extra lines), format characters (bidi
 * overrides, isolates and marks that reorder text, zero-width characters
 * that hide it) and line or paragraph separators.
 */
const MSG_UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u

/**
 * Minimum time left before expiry for offering the SEP-7 handoff. `pay` has
 * no time bounds, so the payer must open the wallet, review and sign before
 * the invoice expires. Five minutes leaves room for that review while
 * keeping the handoff available for two thirds of the shortest (15 minute)
 * invoice. Payments built in the app are bounded by `paymentMaxTime` instead.
 */
export const SEP7_MIN_REMAINING_MS = 5 * 60_000

/**
 * SEP-0007 `pay` URI for native XLM on Stellar Testnet, or null when the
 * invoice must not be offered through SEP-7: structurally invalid, settled,
 * expired, or with less than SEP7_MIN_REMAINING_MS left.
 *
 * - `destination`, `amount` and `memo` are the invoice fields unchanged; the
 *   amount string is never converted to a number, so stroops are preserved.
 * - The asset is native XLM because `asset_code` and `asset_issuer` are
 *   omitted, as SEP-0007 specifies.
 * - `memo_type` is `MEMO_TEXT`, the only memo type the settlement rule
 *   accepts.
 * - `network_passphrase` is always present: SEP-0007 assumes the public
 *   network when it is missing.
 * - `msg` carries the invoice concept when there is one. It is off-chain
 *   display text and never replaces the memo. A concept from a shared QR is
 *   untrusted, so `msg` is omitted when it contains MSG_UNSAFE characters;
 *   every other parameter and the invoice itself stay unchanged.
 *
 * Every value is encoded with `encodeURIComponent`, so a space is `%20`.
 * `URLSearchParams` would emit `+`, which a wallet decoding with
 * `decodeURIComponent` would not turn back into the Testnet passphrase.
 */
export function buildSep7PayUri(
	invoice: Invoice,
	now: number = Date.now(),
): string | null {
	if (validateInvoiceData(invoice, { requireId: true }) !== null) return null
	if (!isPayable(invoice, now)) return null
	if (remainingMs(invoice, now) < SEP7_MIN_REMAINING_MS) return null

	const params: [string, string][] = [
		["destination", invoice.recipient],
		["amount", invoice.amount],
		["memo", invoice.reference],
		["memo_type", "MEMO_TEXT"],
		["network_passphrase", Networks.TESTNET],
	]
	const msg = invoice.note?.trim()
	if (msg && !MSG_UNSAFE.test(msg)) {
		if (msg.length > SEP7_MSG_MAX_LENGTH) return null
		params.push(["msg", msg])
	}
	try {
		const query = params
			.map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
			.join("&")
		return `${SEP7_PAY_PREFIX}${query}`
	} catch {
		// encodeURIComponent throws URIError on a lone UTF-16 surrogate, which a
		// tampered QR payload can carry in its concept.
		return null
	}
}
