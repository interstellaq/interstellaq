/**
 * Live Testnet check for the full payment path. Excluded from the default
 * suite so it stays deterministic; run it explicitly with:
 *
 *   npm run test:net
 */
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk"
import { describe, expect, it } from "vitest"
import { createInvoice, type Invoice } from "../../domain/invoice"
import { createReference } from "../reference"
import {
	buildPaymentTransaction,
	submitSignedTransaction,
	verifySettlement,
} from "../stellar"

const funded = async (keypair: Keypair): Promise<void> => {
	const response = await fetch(
		`https://friendbot.stellar.org/?addr=${keypair.publicKey()}`,
	)
	if (!response.ok) {
		throw new Error(`friendbot failed with ${response.status}`)
	}
}

/** Public evidence for the run log: accounts and hashes, never secrets. */
const record = (label: string, fields: Record<string, string>): void => {
	console.info(`[testnet] ${label} ${JSON.stringify(fields)}`)
}

describe("live Testnet settlement", () => {
	it("builds, signs, submits and verifies a real payment", async () => {
		const merchant = Keypair.random()
		const customer = Keypair.random()
		await funded(merchant)
		await funded(customer)

		const created = createInvoice({
			recipient: merchant.publicKey(),
			recipientName: "Prueba en vivo",
			amount: "7.5000000",
			expiryMinutes: 15,
			reference: createReference(),
		})
		expect(created).not.toHaveProperty("error")
		const invoice = created as Invoice

		const unsigned = await buildPaymentTransaction(
			customer.publicKey(),
			invoice,
		)
		const transaction = TransactionBuilder.fromXDR(unsigned, Networks.TESTNET)
		transaction.sign(customer)
		const hash = await submitSignedTransaction(transaction.toXDR())
		expect(hash).toHaveLength(64)

		const result = await verifySettlement(invoice)
		record("valid-payment", {
			merchant: merchant.publicKey(),
			customer: customer.publicKey(),
			reference: invoice.reference,
			amount: invoice.amount,
			txHash: hash,
			result: JSON.stringify(result),
		})
		expect(result).toMatchObject({ settled: true, txHash: hash })
		if (!result.settled) throw new Error("payment did not settle")
		// The satisfying operation is identified explicitly, and the ledger
		// close time is real Horizon evidence earlier than the invoice expiry.
		expect(result.operationId).toMatch(/^\d+$/)
		const closedAt = Date.parse(result.ledgerClosedAt)
		expect(Number.isFinite(closedAt)).toBe(true)
		expect(closedAt).toBeLessThan(invoice.expiresAt)
	}, 90_000)

	it("does not settle an invoice when the amount differs", async () => {
		const merchant = Keypair.random()
		const customer = Keypair.random()
		await funded(merchant)
		await funded(customer)

		const created = createInvoice({
			recipient: merchant.publicKey(),
			amount: "9.2500000",
			expiryMinutes: 15,
			reference: createReference(),
		})
		const invoice = created as Invoice

		const wrongAmount: Invoice = { ...invoice, amount: "9.2600000" }
		const unsigned = await buildPaymentTransaction(
			customer.publicKey(),
			wrongAmount,
		)
		const transaction = TransactionBuilder.fromXDR(unsigned, Networks.TESTNET)
		transaction.sign(customer)
		const hash = await submitSignedTransaction(transaction.toXDR())

		const result = await verifySettlement(invoice)
		record("wrong-amount", {
			merchant: merchant.publicKey(),
			customer: customer.publicKey(),
			reference: invoice.reference,
			invoiceAmount: invoice.amount,
			paidAmount: wrongAmount.amount,
			txHash: hash,
			result: JSON.stringify(result),
		})
		expect(result).toEqual({ settled: false, reason: "no_match" })
	}, 90_000)
})
