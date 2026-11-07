/**
 * Invoice reference generation and validation.
 *
 * The reference is the correlation key between an invoice and the on-chain
 * payment: it travels as a Stellar text memo, which is limited to 28 bytes
 * (docs/adr/0002-invoice-correlation.md). References are random, memo-safe
 * and unique per invoice, so one transaction can never silently satisfy two
 * invoices (SECURITY.md, replay protection).
 */

export const REFERENCE_PREFIX = "ISQ"

/** RFC 4648 base32 alphabet: uppercase letters and digits 2 to 7. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

/** Random body length. 10 base32 chars is 50 bits of entropy. */
const BODY_LENGTH = 10

/** Stellar text memo limit in bytes. */
export const MAX_MEMO_BYTES = 28

const REFERENCE_PATTERN = /^ISQ[A-Z2-7]{10}$/

/** Build a new reference: `ISQ` plus 10 random base32 characters. */
export function createReference(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(BODY_LENGTH))
	let body = ""
	for (const byte of bytes) {
		body += ALPHABET[byte % ALPHABET.length]
	}
	return REFERENCE_PREFIX + body
}

/**
 * True when the value is a well-formed reference that fits a text memo.
 * Accepts only ASCII, so `byteLength` equals `length`.
 */
export function isValidReference(reference: string): boolean {
	return (
		REFERENCE_PATTERN.test(reference) &&
		new TextEncoder().encode(reference).length <= MAX_MEMO_BYTES
	)
}
