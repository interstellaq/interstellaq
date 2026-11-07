import { describe, expect, it } from "vitest"
import { type Invoice } from "../../domain/invoice"
import { matchSettlement, type PaymentEvidence } from "../stellar"

const NOW = 1_760_000_000_000

const RECIPIENT = "GMERCHANTADDRESSEXAMPLE0000000000000000000000000000"
const CUSTOMER = "GCUSTOMERADDRESSEXAMPLE00000000000000000000000000000"

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
	id: "2f6b5f8e-0000-4000-8000-000000000001",
	reference: "ISQABCDEFGHIJ",
	recipient: RECIPIENT,
	asset: "XLM",
	amount: "12.5000000",
	createdAt: NOW,
	expiresAt: NOW + 30 * 60_000,
	status: "active",
	...overrides,
})

const makeEvidence = (
	overrides: Partial<PaymentEvidence> = {},
): PaymentEvidence => ({
	hash: "a".repeat(64),
	successful: true,
	memo: "ISQABCDEFGHIJ",
	sourceAccount: CUSTOMER,
	destination: RECIPIENT,
	assetType: "native",
	amount: "12.5000000",
	...overrides,
})

describe("matchSettlement", () => {
	it("settles on a successful exact match", () => {
		const result = matchSettlement(makeInvoice(), [makeEvidence()], NOW)
		expect(result).toEqual({ settled: true, txHash: "a".repeat(64) })
	})

	it("rejects an expired invoice even with a matching payment", () => {
		const invoice = makeInvoice()
		const result = matchSettlement(invoice, [makeEvidence()], invoice.expiresAt)
		expect(result).toEqual({ settled: false, reason: "expired" })
	})

	it("rejects a failed transaction", () => {
		const result = matchSettlement(
			makeInvoice(),
			[makeEvidence({ successful: false })],
			NOW,
		)
		expect(result).toEqual({ settled: false, reason: "no_match" })
	})

	it("rejects a transaction with a different memo", () => {
		const result = matchSettlement(
			makeInvoice(),
			[makeEvidence({ memo: "ISQOTHERREF12" })],
			NOW,
		)
		expect(result).toEqual({ settled: false, reason: "no_match" })
	})

	it("rejects a payment to a different recipient", () => {
		const result = matchSettlement(
			makeInvoice(),
			[makeEvidence({ destination: CUSTOMER })],
			NOW,
		)
		expect(result).toEqual({ settled: false, reason: "no_match" })
	})

	it("rejects a payment of a different amount", () => {
		const result = matchSettlement(
			makeInvoice(),
			[makeEvidence({ amount: "12.4999999" })],
			NOW,
		)
		expect(result).toEqual({ settled: false, reason: "no_match" })
	})

	it("rejects a non-native asset payment", () => {
		const result = matchSettlement(
			makeInvoice(),
			[makeEvidence({ assetType: "credit_alphanum4" })],
			NOW,
		)
		expect(result).toEqual({ settled: false, reason: "no_match" })
	})

	it("rejects a self-payment sent by the recipient", () => {
		const result = matchSettlement(
			makeInvoice(),
			[makeEvidence({ sourceAccount: RECIPIENT })],
			NOW,
		)
		expect(result).toEqual({ settled: false, reason: "no_match" })
	})

	it("rejects transactions without the invoice reference", () => {
		const result = matchSettlement(
			makeInvoice(),
			[makeEvidence({ memo: null })],
			NOW,
		)
		expect(result).toEqual({ settled: false, reason: "no_match" })
	})

	it("ignores unrelated transactions and settles on the matching one", () => {
		const result = matchSettlement(
			makeInvoice(),
			[
				makeEvidence({ hash: "b".repeat(64), memo: "OTHEREVENT" }),
				makeEvidence({ hash: "c".repeat(64), amount: "1.0000000" }),
				makeEvidence({ hash: "d".repeat(64) }),
			],
			NOW,
		)
		expect(result).toEqual({ settled: true, txHash: "d".repeat(64) })
	})

	it("never settles with no evidence at all", () => {
		const result = matchSettlement(makeInvoice(), [], NOW)
		expect(result).toEqual({ settled: false, reason: "no_match" })
	})
})
