import { StrKey } from "@stellar/stellar-sdk"

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

const TX_HASH_PATTERN = /^[0-9a-f]{64}$/i

/**
 * Validate merchant metadata read from browser storage. This establishes only
 * that the local record is well formed; on-chain registration evidence is
 * checked separately by lib/registration.ts before the UI trusts the profile.
 */
export function validateMerchantProfile(
	value: unknown,
	expectedAddress?: string,
): value is MerchantProfile {
	if (typeof value !== "object" || value === null) return false
	const profile = value as Partial<MerchantProfile>
	return (
		typeof profile.address === "string" &&
		StrKey.isValidEd25519PublicKey(profile.address) &&
		(expectedAddress === undefined || profile.address === expectedAddress) &&
		typeof profile.displayName === "string" &&
		validateDisplayName(profile.displayName) === null &&
		typeof profile.registeredAt === "number" &&
		Number.isSafeInteger(profile.registeredAt) &&
		profile.registeredAt > 0 &&
		typeof profile.registrationTxHash === "string" &&
		TX_HASH_PATTERN.test(profile.registrationTxHash)
	)
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
