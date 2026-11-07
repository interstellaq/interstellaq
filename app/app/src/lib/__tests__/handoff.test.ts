import { describe, expect, it } from "vitest"
import { type Invoice } from "../../domain/invoice"
import {
	buildInvoiceUrl,
	buildSep7PayUri,
	decodePayload,
	encodePayload,
	toPayload,
} from "../handoff"

const NOW = 1_760_000_000_000
const RECIPIENT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
	id: "2f6b5f8e-0000-4000-8000-000000000001",
	reference: "ISQABCDEFGHIJ",
	recipient: RECIPIENT,
	recipientName: "Café Andes",
	asset: "XLM",
	amount: "12.5000000",
	note: "Pedido 1042",
	createdAt: NOW,
	expiresAt: NOW + 30 * 60_000,
	status: "active",
	...overrides,
})

describe("invoice payload codec", () => {
	it("round trips a payment request", () => {
		const invoice = makeInvoice()
		const decoded = decodePayload(encodePayload(toPayload(invoice)))
		expect(decoded).toEqual(toPayload(invoice))
	})

	it("rejects malformed or incomplete payloads", () => {
		expect(decodePayload("")).toBeNull()
		expect(decodePayload("not-base64!!")).toBeNull()
		expect(decodePayload(encodePayload({} as never))).toBeNull()
		const missingAmount = { ...toPayload(makeInvoice()) } as Record<
			string,
			unknown
		>
		delete missingAmount.amount
		expect(decodePayload(encodePayload(missingAmount as never))).toBeNull()
	})

	it("rejects a non-XLM asset in a tampered payload", () => {
		const tampered = { ...toPayload(makeInvoice()), asset: "USDC" }
		expect(decodePayload(encodePayload(tampered as never))).toBeNull()
	})

	it("rejects structurally invalid QR data", () => {
		const invoice = makeInvoice()
		for (const tampered of [
			{ ...toPayload(invoice), recipient: "GABC" },
			{ ...toPayload(invoice), reference: "invalid" },
			{ ...toPayload(invoice), amount: "0" },
			{ ...toPayload(invoice), expiresAt: invoice.createdAt },
			{ ...toPayload(invoice), expiresAt: invoice.createdAt + 17 * 60_000 },
			{ ...toPayload(invoice), id: "not-a-uuid" },
		]) {
			expect(decodePayload(encodePayload(tampered))).toBeNull()
		}
	})
})

describe("buildInvoiceUrl", () => {
	it("embeds the full request in the URL fragment", () => {
		const invoice = makeInvoice()
		const url = buildInvoiceUrl(invoice, "https://interstellaq.app")
		expect(url.startsWith("https://interstellaq.app/factura/")).toBe(true)
		expect(url).toContain(invoice.recipient)
		expect(url).toContain(invoice.id)
		const fragment = url.split("#p=")[1] ?? ""
		const decoded = decodePayload(fragment)
		expect(decoded?.reference).toBe(invoice.reference)
		expect(decoded?.amount).toBe(invoice.amount)
		expect(decoded?.expiresAt).toBe(invoice.expiresAt)
	})
})

describe("buildSep7PayUri", () => {
	it("carries every field the wallet must review", () => {
		const invoice = makeInvoice()
		const uri = buildSep7PayUri(invoice)
		expect(uri.startsWith("web+stellar://pay?")).toBe(true)
		const params = new URLSearchParams(uri.split("?")[1])
		expect(params.get("destination")).toBe(invoice.recipient)
		expect(params.get("amount")).toBe(invoice.amount)
		expect(params.get("asset")).toBe("XLM")
		expect(params.get("memo")).toBe(invoice.reference)
		expect(params.get("memo_type")).toBe("text")
		expect(params.get("network")).toBe("TESTNET")
	})
})
