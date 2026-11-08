/**
 * Offline checks of the live scenario builders: the transactions are built
 * from in-memory `Account` handles, never signed and never submitted.
 */
import { Account, Keypair, type Operation } from "@stellar/stellar-sdk"
import { afterEach, describe, expect, it, vi } from "vitest"
import { derivedStatus, validateInvoiceData } from "../../domain/invoice"
import { paymentMaxTime } from "../stellar"
import {
	ambiguousDoublePayment,
	expiringInvoice,
	freshInvoice,
	merchantSourcedSelfPayment,
	multiOperationPayment,
} from "./testnetScenarios"

const account = (seed: number) =>
	Keypair.fromRawEd25519Seed(Buffer.alloc(32, seed)).publicKey()

const MERCHANT = account(1)
const CUSTOMER = account(2)
const UNRELATED = account(3)
const NOW = 1_760_000_000_000

const customerAccount = () => new Account(CUSTOMER, "100")

afterEach(() => vi.useRealTimers())

const at = (now: number) => {
	vi.useFakeTimers({ toFake: ["Date"] })
	vi.setSystemTime(now)
}

describe("scenario invoices", () => {
	it("creates valid regular and backdated invoices", () => {
		at(NOW)
		const fresh = freshInvoice(MERCHANT, "4.2000000")
		const expiring = expiringInvoice(MERCHANT, "3.0000000", 30_000, NOW)

		for (const invoice of [fresh, expiring]) {
			expect(validateInvoiceData(invoice, { requireId: true })).toBeNull()
		}
		expect(expiring.expiresAt).toBe(NOW + 30_000)
		expect(expiring.expiresAt - expiring.createdAt).toBe(15 * 60_000)
		expect(derivedStatus(expiring, NOW + 30_000)).toBe("expired")
	})
})

describe("scenario transactions", () => {
	it("S1 sources the only payment from the merchant to itself", () => {
		at(NOW)
		const invoice = freshInvoice(MERCHANT, "4.2000000")
		const tx = merchantSourcedSelfPayment(customerAccount(), invoice)
		const [payment] = tx.operations as Operation.Payment[]

		expect(tx.source).toBe(CUSTOMER)
		expect(tx.operations).toHaveLength(1)
		expect(payment).toMatchObject({
			type: "payment",
			source: MERCHANT,
			destination: MERCHANT,
			amount: "4.2000000",
		})
		expect(payment?.asset.isNative()).toBe(true)
		expect(tx.memo.value?.toString()).toBe(invoice.reference)
		expect(Number(tx.timeBounds?.maxTime)).toBe(paymentMaxTime(invoice, NOW))
	})

	it("S2a puts an unrelated operation before the exact payment", () => {
		at(NOW)
		const invoice = freshInvoice(MERCHANT, "5.5000000")
		const tx = multiOperationPayment(customerAccount(), invoice, UNRELATED)

		expect(tx.source).toBe(CUSTOMER)
		expect(tx.operations.map((op) => op.type)).toEqual([
			"createAccount",
			"payment",
		])
		expect(tx.operations[0]).toMatchObject({ destination: UNRELATED })
		expect(tx.operations[1]).toMatchObject({
			destination: MERCHANT,
			amount: "5.5000000",
		})
		// Neither operation overrides the source: both are the customer's.
		expect(tx.operations.every((op) => op.source === undefined)).toBe(true)
	})

	it("S2b credits the merchant twice with the exact amount", () => {
		at(NOW)
		const invoice = freshInvoice(MERCHANT, "6.2500000")
		const tx = ambiguousDoublePayment(customerAccount(), invoice)

		expect(tx.operations).toHaveLength(2)
		for (const op of tx.operations) {
			expect(op).toMatchObject({
				type: "payment",
				destination: MERCHANT,
				amount: "6.2500000",
			})
		}
	})

	it("S3 bounds the payment by the invoice expiry, not by 10 minutes", () => {
		at(NOW)
		const invoice = expiringInvoice(MERCHANT, "3.0000000", 30_000, NOW)
		const tx = merchantSourcedSelfPayment(customerAccount(), invoice)

		expect(Number(tx.timeBounds?.maxTime)).toBe(
			Math.ceil(invoice.expiresAt / 1000) - 1,
		)
	})

	it("refuses to build for an already expired invoice", () => {
		at(NOW)
		const invoice = expiringInvoice(MERCHANT, "3.0000000", 30_000, NOW)
		at(invoice.expiresAt)
		expect(() => ambiguousDoublePayment(customerAccount(), invoice)).toThrow(
			"invoice already expired",
		)
	})
})
