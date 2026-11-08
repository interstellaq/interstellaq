import { type MerchantProfile } from "../domain/merchant"

/** Invoice creation is allowed only for a confirmed registration. */
export function canCreateInvoices(
	merchant: MerchantProfile | null,
	registrationUnavailable: boolean,
): boolean {
	return merchant !== null && !registrationUnavailable
}
