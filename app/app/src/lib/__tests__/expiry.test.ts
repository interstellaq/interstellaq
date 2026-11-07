import { describe, expect, it } from "vitest"
import {
	createInvoice,
	derivedStatus,
	isPayable,
	remainingMs,
	toStroops,
	type Invoice,
} from "../../domain/invoice"

const NOW = 1_760_000_000_000

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
	id: "2f6b5f8e-0000-4000-8000-000000000001",
	reference: "ISQABCDEFGHIJ",
	recipient: "GMERCHANTADDRESSEXAMPLE0000000000000000000000000000",
	recipientName: "Café Andes",
	asset: "XLM",
	amount: "12.5000000",
	createdAt: NOW,
	expiresAt: NOW + 30 * 60_000,
	status: "active",
	...overrides,
})

describe("toStroops", () => {
	it("converts decimal XLM to stroops exactly", () => {
		expect(toStroops("12.5")).toBe(125_000_000n)
		expect(toStroops("0.0000001")).toBe(1n)
		expect(toStroops("1")).toBe(10_000_000n)
	})

	it("rejects invalid amounts", () => {
		expect(toStroops("")).toBeNull()
		expect(toStroops("-1")).toBeNull()
		expect(toStroops("1.12345678")).toBeNull()
		expect(toStroops("abc")).toBeNull()
		expect(toStroops("1e5")).toBeNull()
	})
})

describe("createInvoice", () => {
	it("creates an active invoice with the given expiry", () => {
		const result = createInvoice({
			recipient: "GABC",
			amount: "5",
			note: "Pedido 1",
			expiryMinutes: 30,
			reference: "ISQABCDEFGHIJ",
			now: NOW,
		})
		expect(result).not.toHaveProperty("error")
		const invoice = result as Invoice
		expect(invoice.status).toBe("active")
		expect(invoice.asset).toBe("XLM")
		expect(invoice.expiresAt).toBe(NOW + 30 * 60_000)
		expect(invoice.reference).toBe("ISQABCDEFGHIJ")
	})

	it("rejects invalid or incomplete input", () => {
		expect(
			createInvoice({
				recipient: "GABC",
				amount: "0",
				expiryMinutes: 30,
				reference: "ISQABCDEFGHIJ",
				now: NOW,
			}),
		).toHaveProperty("error")
		expect(
			createInvoice({
				recipient: "GABC",
				amount: "5",
				expiryMinutes: 0,
				reference: "ISQABCDEFGHIJ",
				now: NOW,
			}),
		).toHaveProperty("error")
		expect(
			createInvoice({
				recipient: "GABC",
				amount: "5",
				note: "x".repeat(61),
				expiryMinutes: 30,
				reference: "ISQABCDEFGHIJ",
				now: NOW,
			}),
		).toHaveProperty("error")
	})
})

describe("invoice lifecycle", () => {
	it("stays active before expiry and expires after it", () => {
		const invoice = makeInvoice()
		expect(derivedStatus(invoice, NOW)).toBe("active")
		expect(derivedStatus(invoice, invoice.expiresAt)).toBe("expired")
		expect(isPayable(invoice, NOW)).toBe(true)
		expect(isPayable(invoice, invoice.expiresAt)).toBe(false)
	})

	it("keeps a settled invoice settled even after expiry", () => {
		const invoice = makeInvoice({
			status: "settled",
			txHash: "deadbeef",
			verifiedAt: NOW + 60_000,
		})
		expect(derivedStatus(invoice, invoice.expiresAt + 1)).toBe("settled")
	})

	it("reports remaining time until expiry", () => {
		const invoice = makeInvoice()
		expect(remainingMs(invoice, NOW)).toBe(30 * 60_000)
		expect(remainingMs(invoice, invoice.expiresAt + 5_000)).toBe(0)
	})

	it("treats verification_failed as payable until expiry", () => {
		const invoice = makeInvoice({ status: "verification_failed" })
		expect(derivedStatus(invoice, NOW)).toBe("verification_failed")
		expect(isPayable(invoice, NOW)).toBe(true)
		expect(isPayable(invoice, invoice.expiresAt)).toBe(false)
	})
})
