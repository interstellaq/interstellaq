import { Keypair } from "@stellar/stellar-sdk"
import { describe, expect, it } from "vitest"
import { type MerchantProfile } from "../../domain/merchant"
import { canCreateInvoices } from "../../lib/registrationGate"

const merchant: MerchantProfile = {
	address: Keypair.random().publicKey(),
	displayName: "Café Andes",
	registeredAt: 1_760_000_000_000,
	registrationTxHash: "a".repeat(64),
}

describe("merchant invoice creation gate", () => {
	it("does not render InvoiceForm for invalid or unavailable registration evidence", () => {
		expect(canCreateInvoices(null, false)).toBe(false)
		expect(canCreateInvoices(merchant, true)).toBe(false)
	})

	it("renders InvoiceForm only after confirmed registration evidence", () => {
		expect(canCreateInvoices(merchant, false)).toBe(true)
	})
})
