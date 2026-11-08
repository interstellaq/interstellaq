/**
 * Live Testnet settlement scenarios beyond `npm run test:net` (issue #3).
 *
 * Sends real Stellar Testnet transactions from ephemeral accounts funded by
 * Friendbot. It is skipped entirely unless explicitly authorized:
 *
 *   INTERSTELLAQ_TESTNET_SCENARIOS=authorized npm run test:net:scenarios
 *
 * Before funding anything it checks that Horizon reports the Testnet network
 * passphrase. No real account, secret or fund is involved.
 *
 * Transactions when authorized (8 Friendbot fundings, 5 submissions):
 * - S1: one payment whose operation source is the merchant (signed by the
 *   ephemeral customer and merchant). Must not settle.
 * - S2: one multi-operation payment that must settle on its second
 *   operation, and one double payment that must not settle.
 * - S3: one payment built shortly before expiry and submitted after its
 *   upper time bound. Testnet must reject it (tx_too_late); nothing applies.
 * - S4: one payment confirmed before expiry and verified after it. Must
 *   settle.
 */
import {
	type Horizon,
	Keypair,
	Networks,
	type Transaction,
	TransactionBuilder,
} from "@stellar/stellar-sdk"
import { beforeAll, describe, expect, inject, it } from "vitest"
import { derivedStatus, isPayable, type Invoice } from "../../domain/invoice"
import {
	buildPaymentTransaction,
	evaluateTransaction,
	fetchSettlementEvidence,
	horizon,
	HORIZON_URL,
	verifySettlement,
} from "../stellar"
import {
	ambiguousDoublePayment,
	expiringInvoice,
	freshInvoice,
	merchantSourcedSelfPayment,
	multiOperationPayment,
} from "./testnetScenarios"

declare module "vitest" {
	export interface ProvidedContext {
		testnetScenariosAuthorized: boolean
	}
}

const authorized = inject("testnetScenariosAuthorized") === true

/** Public evidence for the run log: accounts and hashes, never secrets. */
const record = (label: string, fields: Record<string, unknown>): void => {
	console.info(`[testnet-scenario] ${label} ${JSON.stringify(fields)}`)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fund(keypair: Keypair): Promise<void> {
	const response = await fetch(
		`https://friendbot.stellar.org/?addr=${keypair.publicKey()}`,
	)
	if (!response.ok) throw new Error(`friendbot failed with ${response.status}`)
}

async function fundedPair(): Promise<{ merchant: Keypair; customer: Keypair }> {
	const merchant = Keypair.random()
	const customer = Keypair.random()
	await fund(merchant)
	await fund(customer)
	return { merchant, customer }
}

async function submit(transaction: Transaction): Promise<string> {
	const result = await horizon.submitTransaction(transaction)
	return result.hash
}

/** Horizon result codes of a rejected submission, or null. */
function resultCodes(error: unknown): unknown {
	const data = (
		error as {
			response?: { data?: { extras?: { result_codes?: unknown } } }
		}
	).response?.data
	return data?.extras?.result_codes ?? null
}

/** Native XLM balance of an account as reported by Horizon. */
function nativeBalance(account: Horizon.AccountResponse): string {
	const native = account.balances.find(
		(balance) => balance.asset_type === "native",
	)
	if (!native) throw new Error("account without native balance")
	return native.balance
}

async function latestLedgerTime(): Promise<number> {
	const page = await horizon.ledgers().order("desc").limit(1).call()
	const latest = page.records[0]
	if (!latest) throw new Error("no ledger")
	return Date.parse(latest.closed_at)
}

/** Wait until a closed ledger is later than `epochMs` in ledger time. */
async function waitForLedgerAfter(epochMs: number): Promise<number> {
	for (let attempt = 0; attempt < 60; attempt++) {
		const closedAt = await latestLedgerTime()
		if (closedAt > epochMs) return closedAt
		await sleep(5_000)
	}
	throw new Error("ledger time did not advance")
}

async function operationsOf(
	hash: string,
): Promise<Horizon.ServerApi.OperationRecord[]> {
	const page = await horizon.operations().forTransaction(hash).call()
	return page.records
}

async function rulesFor(invoice: Invoice, hash: string): Promise<unknown> {
	const evidence = await fetchSettlementEvidence(invoice)
	const tx = evidence.transactions.find((item) => item.hash === hash)
	return tx ? evaluateTransaction(invoice, tx) : "not_found"
}

describe.skipIf(!authorized)("live Testnet settlement scenarios", () => {
	beforeAll(async () => {
		const response = await fetch(HORIZON_URL)
		const root = (await response.json()) as { network_passphrase?: string }
		if (root.network_passphrase !== Networks.TESTNET) {
			throw new Error("Horizon is not Stellar Testnet; aborting")
		}
	})

	it("S1 never settles a payment whose operation source is the merchant", async () => {
		const { merchant, customer } = await fundedPair()
		const invoice = freshInvoice(merchant.publicKey(), "4.2000000")
		const tx = merchantSourcedSelfPayment(
			await horizon.loadAccount(customer.publicKey()),
			invoice,
		)
		tx.sign(customer, merchant)
		const hash = await submit(tx)

		const onChain = await horizon.transactions().transaction(hash).call()
		const [op] = await operationsOf(hash)
		const result = await verifySettlement(invoice)
		const verdict = await rulesFor(invoice, hash)
		record("S1", {
			merchant: merchant.publicKey(),
			customer: customer.publicKey(),
			reference: invoice.reference,
			txHash: hash,
			txSource: onChain.source_account,
			opSource: op?.source_account,
			verdict,
			result,
		})

		// The scenario really exercises the bypass the old rule allowed.
		expect(onChain.successful).toBe(true)
		expect(onChain.source_account).toBe(customer.publicKey())
		expect(op).toMatchObject({
			type: "payment",
			source_account: merchant.publicKey(),
			to: merchant.publicKey(),
			amount: invoice.amount,
		})
		expect(verdict).toEqual({ accepted: false, rule: "recipient_authorized" })
		expect(result).toEqual({ settled: false, reason: "no_match" })
	}, 180_000)

	it("S2 settles on the explicit operation of a multi-operation payment and rejects a double credit", async () => {
		const { merchant, customer } = await fundedPair()
		const unrelated = Keypair.random()

		const invoiceA = freshInvoice(merchant.publicKey(), "5.5000000")
		const txA = multiOperationPayment(
			await horizon.loadAccount(customer.publicKey()),
			invoiceA,
			unrelated.publicKey(),
		)
		txA.sign(customer)
		const hashA = await submit(txA)
		const opsA = await operationsOf(hashA)
		const resultA = await verifySettlement(invoiceA)

		const invoiceB = freshInvoice(merchant.publicKey(), "6.2500000")
		const txB = ambiguousDoublePayment(
			await horizon.loadAccount(customer.publicKey()),
			invoiceB,
		)
		txB.sign(customer)
		const hashB = await submit(txB)
		const resultB = await verifySettlement(invoiceB)
		const verdictB = await rulesFor(invoiceB, hashB)

		record("S2", {
			merchant: merchant.publicKey(),
			customer: customer.publicKey(),
			unrelated: unrelated.publicKey(),
			multiOperation: {
				reference: invoiceA.reference,
				txHash: hashA,
				operations: opsA.map((op) => [op.id, op.type]),
				result: resultA,
			},
			doubleCredit: {
				reference: invoiceB.reference,
				txHash: hashB,
				verdict: verdictB,
				result: resultB,
			},
		})

		expect(opsA.map((op) => op.type)).toEqual(["create_account", "payment"])
		expect(resultA).toMatchObject({
			settled: true,
			txHash: hashA,
			operationId: opsA[1]?.id,
		})
		expect(verdictB).toEqual({ accepted: false, rule: "multiple_credits" })
		expect(resultB).toEqual({ settled: false, reason: "no_match" })
	}, 180_000)

	it("S3 lets Testnet reject a payment that would land after expiry", async () => {
		const { merchant, customer } = await fundedPair()
		const invoice = expiringInvoice(merchant.publicKey(), "3.0000000", 30_000)
		const unsigned = await buildPaymentTransaction(
			customer.publicKey(),
			invoice,
		)
		const tx = TransactionBuilder.fromXDR(
			unsigned,
			Networks.TESTNET,
		) as Transaction
		const maxTime = Number(tx.timeBounds?.maxTime)
		const before = await horizon.loadAccount(customer.publicKey())
		const merchantBefore = await horizon.loadAccount(merchant.publicKey())

		await waitForLedgerAfter(maxTime * 1000)
		tx.sign(customer)
		let codes: unknown = null
		let hash: string | null = null
		try {
			hash = await submit(tx)
		} catch (error) {
			codes = resultCodes(error)
		}
		const after = await horizon.loadAccount(customer.publicKey())
		const merchantAfter = await horizon.loadAccount(merchant.publicKey())
		const result = await verifySettlement(invoice)
		record("S3", {
			merchant: merchant.publicKey(),
			customer: customer.publicKey(),
			reference: invoice.reference,
			expiresAt: new Date(invoice.expiresAt).toISOString(),
			maxTime,
			submittedHash: hash,
			resultCodes: codes,
			sequenceBefore: before.sequenceNumber(),
			sequenceAfter: after.sequenceNumber(),
			customerBalanceBefore: nativeBalance(before),
			customerBalanceAfter: nativeBalance(after),
			merchantBalanceBefore: nativeBalance(merchantBefore),
			merchantBalanceAfter: nativeBalance(merchantAfter),
			result,
		})

		expect(maxTime).toBe(Math.ceil(invoice.expiresAt / 1000) - 1)
		expect(hash).toBeNull()
		expect(codes).toMatchObject({ transaction: "tx_too_late" })
		// Nothing was applied: no fee, no sequence bump, no payment.
		expect(after.sequenceNumber()).toBe(before.sequenceNumber())
		expect(nativeBalance(after)).toBe(nativeBalance(before))
		expect(nativeBalance(merchantAfter)).toBe(nativeBalance(merchantBefore))
		expect(result).toMatchObject({ settled: false })
	}, 600_000)

	it("S4 settles a payment confirmed before expiry when verified after it", async () => {
		const { merchant, customer } = await fundedPair()
		const invoice = expiringInvoice(merchant.publicKey(), "2.7500000", 90_000)
		const unsigned = await buildPaymentTransaction(
			customer.publicKey(),
			invoice,
		)
		const tx = TransactionBuilder.fromXDR(
			unsigned,
			Networks.TESTNET,
		) as Transaction
		tx.sign(customer)
		const hash = await submit(tx)
		const onChain = await horizon.transactions().transaction(hash).call()

		await waitForLedgerAfter(invoice.expiresAt + 5_000)
		while (Date.now() <= invoice.expiresAt) await sleep(1_000)
		const verifiedAt = Date.now()
		const result = await verifySettlement(invoice)
		record("S4", {
			merchant: merchant.publicKey(),
			customer: customer.publicKey(),
			reference: invoice.reference,
			txHash: hash,
			ledgerClosedAt: onChain.created_at,
			expiresAt: new Date(invoice.expiresAt).toISOString(),
			verifiedAt: new Date(verifiedAt).toISOString(),
			result,
		})

		expect(Date.parse(onChain.created_at)).toBeLessThan(invoice.expiresAt)
		expect(derivedStatus(invoice, verifiedAt)).toBe("expired")
		expect(isPayable(invoice, verifiedAt)).toBe(false)
		expect(result).toMatchObject({ settled: true, txHash: hash })
	}, 600_000)
})
