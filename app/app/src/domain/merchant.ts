/**
 * Merchant registration model (FR-01).
 *
 * Registration is off-chain metadata bound to a Testnet account, and it is
 * only trusted after the account proves control by signing an on-chain
 * registration transaction (SECURITY.md, authorization requirements).
 */

export interface MerchantProfile {
	/** Stellar public key (G...) of the merchant. */
	address: string
	/** Display name shown on invoices. Not an ownership proof by itself. */
	displayName: string
	/** Epoch milliseconds of the confirmed registration. */
	registeredAt: number
	/** Hash of the registration transaction that proves account control. */
	registrationTxHash: string
}

/**
 * Validate the display name. Returns an error message for direct display,
 * or null when the value is acceptable.
 */
export function validateDisplayName(name: string): string | null {
	const trimmed = name.trim()
	if (trimmed.length < 2) {
		return "El nombre debe tener al menos 2 caracteres."
	}
	if (trimmed.length > 40) {
		return "El nombre no puede superar 40 caracteres."
	}
	return null
}
