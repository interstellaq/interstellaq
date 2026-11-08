import { Keypair } from "@stellar/stellar-sdk"
import { describe, expect, it } from "vitest"
import { type Invoice } from "../../domain/invoice"
import {
	evaluateTransaction,
	matchSettlement,
	type OperationEvidence,
	type SettlementEvidence,
	type TransactionEvidence,
} from "../stellar"

const NOW = 1_760_000_000_000
const EXPIRES_AT = NOW + 30 * 60_000

const account = (seed: number) =>
	Keypair.fromRawEd25519Seed(Buffer.alloc(32, seed)).publicKey()

const RECIPIENT = account(1)
const CUSTOMER = account(2)
const OTHER = account(3)

const iso = (epochMs: number) => new Date(epochMs).toISOString()

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
	id: "2f6b5f8e-0000-4000-8000-000000000001",
	reference: "ISQABCDEFGHIJ",
	recipient: RECIPIENT,
	asset: "XLM",
	amount: "12.5000000",
	createdAt: NOW,
	expiresAt: EXPIRES_AT,
	status: "active",
	...overrides,
})

const payment = (
	overrides: Partial<OperationEvidence> = {},
): OperationEvidence => ({
	id: "1001",
	type: "payment",
	sourceAccount: CUSTOMER,
	creditedAccount: RECIPIENT,
	assetType: "native",
	amount: "12.5000000",
	...overrides,
})

const makeTx = (
	overrides: Partial<TransactionEvidence> = {},
): TransactionEvidence => {
	const operations = overrides.operations ?? [payment()]
	return {
		hash: "a".repeat(64),
		successful: true,
		memoType: "text",
		memo: "ISQABCDEFGHIJ",
		sourceAccount: CUSTOMER,
		ledgerClosedAt: iso(NOW + 60_000),
		operationCount: operations.length,
		...overrides,
		operations,
	}
}

const scan = (
	transactions: TransactionEvidence[],
	complete = true,
): SettlementEvidence => ({
	transactions,
	complete,
	scanned: transactions.length,
})

const rule = (tx: TransactionEvidence, invoice = makeInvoice()) => {
	const verdict = evaluateTransaction(invoice, tx)
	return verdict.accepted ? "accepted" : verdict.rule
}

describe("evaluateTransaction: basic payment invariants", () => {
	it("accepts an exact native payment and identifies its operation", () => {
		expect(evaluateTransaction(makeInvoice(), makeTx())).toEqual({
			accepted: true,
			operationId: "1001",
			ledgerClosedAt: NOW + 60_000,
		})
	})

	it("rejects a failed transaction", () => {
		expect(rule(makeTx({ successful: false }))).toBe("failed")
	})

	it("rejects a different memo, a missing memo and a non-text memo", () => {
		expect(rule(makeTx({ memo: "ISQOTHERREF12" }))).toBe("memo_mismatch")
		expect(rule(makeTx({ memo: null }))).toBe("memo_mismatch")
		expect(rule(makeTx({ memoType: "hash" }))).toBe("memo_mismatch")
	})

	it("rejects a payment to a different recipient", () => {
		expect(
			rule(makeTx({ operations: [payment({ creditedAccount: OTHER })] })),
		).toBe("no_credit")
	})

	it("rejects an amount off by one stroop in either direction", () => {
		expect(
			rule(makeTx({ operations: [payment({ amount: "12.4999999" })] })),
		).toBe("payment_mismatch")
		expect(
			rule(makeTx({ operations: [payment({ amount: "12.5000001" })] })),
		).toBe("payment_mismatch")
	})

	it("compares amounts in stroops, not as strings", () => {
		expect(rule(makeTx({ operations: [payment({ amount: "12.5" })] }))).toBe(
			"accepted",
		)
	})

	it("rejects a non-native asset", () => {
		expect(
			rule(
				makeTx({ operations: [payment({ assetType: "credit_alphanum4" })] }),
			),
		).toBe("payment_mismatch")
	})

	it("rejects a path payment even when it delivers native XLM", () => {
		expect(
			rule(
				makeTx({
					operations: [payment({ type: "path_payment_strict_receive" })],
				}),
			),
		).toBe("payment_mismatch")
	})

	it("rejects an unparseable ledger time", () => {
		expect(rule(makeTx({ ledgerClosedAt: "not-a-date" }))).toBe(
			"invalid_ledger_time",
		)
	})

	it("never accepts a payment for an invoice with an invalid amount", () => {
		expect(rule(makeTx(), makeInvoice({ amount: "abc" }))).toBe(
			"payment_mismatch",
		)
	})
})

describe("evaluateTransaction: effective operation source", () => {
	it("rejects an operation whose own source is the merchant", () => {
		// The customer submits and pays the fee, but the payment operation is
		// sourced from the merchant: a self-payment that must never settle.
		const tx = makeTx({
			sourceAccount: CUSTOMER,
			operations: [payment({ sourceAccount: RECIPIENT })],
		})
		expect(rule(tx)).toBe("recipient_authorized")
	})

	it("rejects a transaction submitted by the merchant", () => {
		expect(rule(makeTx({ sourceAccount: RECIPIENT }))).toBe(
			"recipient_authorized",
		)
	})

	it("rejects a merchant operation hidden next to a valid payment", () => {
		const tx = makeTx({
			operations: [
				payment(),
				payment({
					id: "1002",
					sourceAccount: RECIPIENT,
					creditedAccount: CUSTOMER,
				}),
			],
		})
		expect(rule(tx)).toBe("recipient_authorized")
	})

	it("accepts a payment whose operation source is a third party", () => {
		const tx = makeTx({ operations: [payment({ sourceAccount: OTHER })] })
		expect(rule(tx)).toBe("accepted")
	})
})

describe("evaluateTransaction: multi-operation transactions", () => {
	it("identifies the satisfying operation among unrelated ones", () => {
		const tx = makeTx({
			operations: [
				payment({ id: "2001", creditedAccount: OTHER, amount: "3" }),
				{
					id: "2002",
					type: "manage_data",
					sourceAccount: CUSTOMER,
					creditedAccount: null,
					assetType: null,
					amount: null,
				},
				payment({ id: "2003" }),
			],
		})
		expect(evaluateTransaction(makeInvoice(), tx)).toMatchObject({
			accepted: true,
			operationId: "2003",
		})
	})

	it("rejects two operations that each pay the exact amount", () => {
		const tx = makeTx({
			operations: [payment({ id: "3001" }), payment({ id: "3002" })],
		})
		expect(rule(tx)).toBe("multiple_credits")
	})

	it("rejects an exact payment combined with another credit to the merchant", () => {
		const extraCredits: OperationEvidence[] = [
			payment({ id: "4002", amount: "0.0000001" }),
			payment({ id: "4002", assetType: "credit_alphanum4", amount: "1" }),
			{
				id: "4002",
				type: "account_merge",
				sourceAccount: CUSTOMER,
				creditedAccount: RECIPIENT,
				assetType: null,
				amount: null,
			},
		]
		for (const extra of extraCredits) {
			const tx = makeTx({ operations: [payment({ id: "4001" }), extra] })
			expect(rule(tx)).toBe("multiple_credits")
		}
	})

	it("rejects a transaction whose operations were not all resolved", () => {
		const tx = makeTx({ operationCount: 2, operations: [payment()] })
		expect(rule(tx)).toBe("operations_incomplete")
	})
})

describe("evaluateTransaction: expiry by ledger time", () => {
	it("accepts a payment closed one millisecond before expiry", () => {
		const tx = makeTx({ ledgerClosedAt: iso(EXPIRES_AT - 1) })
		expect(rule(tx)).toBe("accepted")
	})

	it("rejects a payment closed at or after expiry", () => {
		expect(rule(makeTx({ ledgerClosedAt: iso(EXPIRES_AT) }))).toBe(
			"after_expiry",
		)
		expect(rule(makeTx({ ledgerClosedAt: iso(EXPIRES_AT + 60_000) }))).toBe(
			"after_expiry",
		)
	})
})

describe("matchSettlement", () => {
	it("settles on an exact match and reports the operation", () => {
		expect(matchSettlement(makeInvoice(), scan([makeTx()]), NOW)).toEqual({
			settled: true,
			txHash: "a".repeat(64),
			operationId: "1001",
			ledgerClosedAt: iso(NOW + 60_000),
		})
	})

	it("settles a payment confirmed before expiry when checked after expiry", () => {
		const result = matchSettlement(
			makeInvoice(),
			scan([makeTx({ ledgerClosedAt: iso(EXPIRES_AT - 5_000) })]),
			EXPIRES_AT + 24 * 60 * 60_000,
		)
		expect(result).toMatchObject({ settled: true, txHash: "a".repeat(64) })
	})

	it("reports expired when the only payment closed after expiry", () => {
		const result = matchSettlement(
			makeInvoice(),
			scan([makeTx({ ledgerClosedAt: iso(EXPIRES_AT + 1_000) })]),
			EXPIRES_AT + 2_000,
		)
		expect(result).toEqual({ settled: false, reason: "expired" })
	})

	it("reports expired after a complete scan without a payment", () => {
		expect(matchSettlement(makeInvoice(), scan([]), EXPIRES_AT)).toEqual({
			settled: false,
			reason: "expired",
		})
	})

	it("reports no_match before expiry after a complete scan", () => {
		expect(matchSettlement(makeInvoice(), scan([]), NOW)).toEqual({
			settled: false,
			reason: "no_match",
		})
	})

	it("never reports no_match or expired when the scan was incomplete", () => {
		expect(matchSettlement(makeInvoice(), scan([], false), NOW)).toEqual({
			settled: false,
			reason: "incomplete",
		})
		expect(matchSettlement(makeInvoice(), scan([], false), EXPIRES_AT)).toEqual(
			{ settled: false, reason: "incomplete" },
		)
	})

	it("still settles on a match found by an incomplete scan", () => {
		expect(
			matchSettlement(makeInvoice(), scan([makeTx()], false), NOW),
		).toMatchObject({ settled: true })
	})

	it("ignores rejected candidates and settles on the valid one", () => {
		const result = matchSettlement(
			makeInvoice(),
			scan([
				makeTx({ hash: "b".repeat(64), memo: "OTHEREVENT" }),
				makeTx({
					hash: "c".repeat(64),
					operations: [payment({ sourceAccount: RECIPIENT })],
				}),
				makeTx({ hash: "d".repeat(64) }),
			]),
			NOW,
		)
		expect(result).toMatchObject({ settled: true, txHash: "d".repeat(64) })
	})

	it("picks the earliest valid payment when several qualify", () => {
		const result = matchSettlement(
			makeInvoice(),
			scan([
				makeTx({ hash: "e".repeat(64), ledgerClosedAt: iso(NOW + 120_000) }),
				makeTx({ hash: "f".repeat(64), ledgerClosedAt: iso(NOW + 30_000) }),
			]),
			NOW,
		)
		expect(result).toMatchObject({ settled: true, txHash: "f".repeat(64) })
	})

	it("never settles a self-payment through the operation source", () => {
		const result = matchSettlement(
			makeInvoice(),
			scan([makeTx({ operations: [payment({ sourceAccount: RECIPIENT })] })]),
			NOW,
		)
		expect(result).toEqual({ settled: false, reason: "no_match" })
	})
})
