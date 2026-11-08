/**
 * Integration of the settlement scan, matcher, verification flow and local
 * persistence against simulated Horizon responses: paginated transaction
 * records with cursors, and per-transaction operation records. No network,
 * no signing, no real payments.
 */
import { Keypair } from "@stellar/stellar-sdk"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type Invoice } from "../../domain/invoice"
import { getInvoice, saveInvoice } from "../persistence"
import {
	type EvidenceSource,
	fetchSettlementEvidence,
	horizon,
	horizonEvidenceSource,
	type HorizonOperation,
	type HorizonTransaction,
	HORIZON_PAGE_LIMIT,
	MAX_TRANSACTION_PAGES,
	verifySettlement,
} from "../stellar"
import { EXPIRY_GRACE_MS, verifyAndUpdate, verifyPending } from "../verify"

const T0 = 1_760_000_000_000
const SECOND = 1_000
const MINUTE = 60 * SECOND

const account = (seed: number) =>
	Keypair.fromRawEd25519Seed(Buffer.alloc(32, seed)).publicKey()

const MERCHANT = account(1)
const CUSTOMER = account(2)
const OTHER = account(3)
const REFERENCE = "ISQABCDEFGHIJ"

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
	id: "2f6b5f8e-0000-4000-8000-000000000001",
	reference: REFERENCE,
	recipient: MERCHANT,
	asset: "XLM",
	amount: "12.5000000",
	createdAt: T0,
	expiresAt: T0 + 30 * MINUTE,
	status: "active",
	...overrides,
})

interface SimulatedTx {
	record: HorizonTransaction
	operations: HorizonOperation[]
}

let hashCounter = 0
const nextHash = () => (++hashCounter).toString(16).padStart(64, "0")

/** Unrelated activity of the merchant account, e.g. other customers. */
const filler = (closedAt: number): SimulatedTx => {
	const hash = nextHash()
	return {
		record: {
			hash,
			successful: true,
			memo_type: "none",
			source_account: OTHER,
			created_at: new Date(closedAt).toISOString(),
			operation_count: 1,
			paging_token: "",
		},
		operations: [
			{
				id: `${hash}-1`,
				type: "payment",
				source_account: OTHER,
				transaction_successful: true,
				to: MERCHANT,
				asset_type: "native",
				amount: "1.0000000",
			},
		],
	}
}

const paymentOp = (
	overrides: Partial<HorizonOperation> = {},
): HorizonOperation => ({
	id: "900001",
	type: "payment",
	source_account: CUSTOMER,
	transaction_successful: true,
	to: MERCHANT,
	asset_type: "native",
	amount: "12.5000000",
	...overrides,
})

/** The invoice payment as Horizon reports it. */
const invoicePayment = (
	closedAt: number,
	options: {
		hash?: string
		reference?: string
		source?: string
		operations?: HorizonOperation[]
		operationCount?: number
	} = {},
): SimulatedTx => {
	const operations = options.operations ?? [paymentOp()]
	return {
		record: {
			hash: options.hash ?? nextHash(),
			successful: true,
			memo_type: "text",
			memo: options.reference ?? REFERENCE,
			source_account: options.source ?? CUSTOMER,
			created_at: new Date(closedAt).toISOString(),
			operation_count: options.operationCount ?? operations.length,
			paging_token: "",
		},
		operations,
	}
}

/**
 * In-memory Horizon: the account history newest first, served in pages of
 * `limit` records strictly after a paging token, like `order=desc&cursor=`.
 */
class SimulatedHorizon implements EvidenceSource {
	readonly transactionCalls: (string | undefined)[] = []
	readonly operationCalls: string[] = []
	private readonly history: SimulatedTx[]

	constructor(history: SimulatedTx[]) {
		// Newest first, with paging tokens that decrease along the history.
		this.history = [...history]
			.sort(
				(a, b) =>
					Date.parse(b.record.created_at) - Date.parse(a.record.created_at),
			)
			.map((tx, index, all) => ({
				...tx,
				record: { ...tx.record, paging_token: String(all.length - index) },
			}))
	}

	transactions(
		accountId: string,
		cursor: string | undefined,
		limit: number,
	): Promise<HorizonTransaction[]> {
		expect(accountId).toBe(MERCHANT)
		this.transactionCalls.push(cursor)
		const start =
			cursor === undefined
				? 0
				: this.history.findIndex((tx) => tx.record.paging_token === cursor) + 1
		return Promise.resolve(
			this.history.slice(start, start + limit).map((tx) => tx.record),
		)
	}

	operations(txHash: string): Promise<HorizonOperation[]> {
		this.operationCalls.push(txHash)
		const tx = this.history.find((item) => item.record.hash === txHash)
		return Promise.resolve(tx?.operations ?? [])
	}
}

/** `count` unrelated transactions closing one second apart before `newest`. */
const activity = (count: number, newest: number): SimulatedTx[] =>
	Array.from({ length: count }, (_, index) => filler(newest - index * SECOND))

describe("bounded Horizon pagination", () => {
	it("finds a payment beyond the first 200 transactions by following cursors", async () => {
		const payment = invoicePayment(T0 + 100 * SECOND)
		const horizonSim = new SimulatedHorizon([
			// 450 transactions after the invoice was created...
			...activity(349, T0 + 450 * SECOND),
			payment,
			...activity(100, T0 + 99 * SECOND),
			// ...and older history from before the invoice.
			...activity(300, T0 - 10 * MINUTE),
		])

		const result = await verifySettlement(makeInvoice(), T0, horizonSim)

		expect(result).toMatchObject({
			settled: true,
			txHash: payment.record.hash,
			operationId: "900001",
		})
		// Pages 1-3: the third page reaches history older than the invoice.
		expect(horizonSim.transactionCalls).toHaveLength(3)
		expect(horizonSim.transactionCalls[0]).toBeUndefined()
		expect(horizonSim.transactionCalls[1]).toBeDefined()
		// Operations are only fetched for the transaction carrying the memo.
		expect(horizonSim.operationCalls).toEqual([payment.record.hash])
	})

	it("reports incomplete, not no_match, when the payment is beyond the page budget", async () => {
		const horizonSim = new SimulatedHorizon([
			...activity(1100, T0 + 2000 * SECOND),
			invoicePayment(T0 + 10 * SECOND),
			...activity(50, T0 - 10 * MINUTE),
		])
		const invoice = makeInvoice()

		const evidence = await fetchSettlementEvidence(invoice, horizonSim)
		expect(evidence).toEqual({
			transactions: [],
			complete: false,
			scanned: MAX_TRANSACTION_PAGES * HORIZON_PAGE_LIMIT,
		})
		expect(horizonSim.transactionCalls).toHaveLength(MAX_TRANSACTION_PAGES)

		// Neither before nor after expiry does the result claim absence.
		expect(await verifySettlement(invoice, T0, horizonSim)).toEqual({
			settled: false,
			reason: "incomplete",
		})
		expect(
			await verifySettlement(invoice, invoice.expiresAt + MINUTE, horizonSim),
		).toEqual({ settled: false, reason: "incomplete" })
	})

	it("stops after one page once it reaches transactions older than the invoice", async () => {
		const horizonSim = new SimulatedHorizon([
			...activity(50, T0 + 100 * SECOND),
			...activity(1200, T0 - 10 * MINUTE),
		])

		const evidence = await fetchSettlementEvidence(makeInvoice(), horizonSim)

		expect(evidence.complete).toBe(true)
		expect(horizonSim.transactionCalls).toHaveLength(1)
		expect(await verifySettlement(makeInvoice(), T0, horizonSim)).toEqual({
			settled: false,
			reason: "no_match",
		})
	})

	it("keeps scanning within the clock skew margin before the invoice creation", async () => {
		// The browser clock ran ahead: the ledger closed the payment two
		// minutes before the stored createdAt.
		const payment = invoicePayment(T0 - 2 * MINUTE)
		const horizonSim = new SimulatedHorizon([
			...activity(250, T0 + 300 * SECOND),
			payment,
			...activity(300, T0 - 10 * MINUTE),
		])

		expect(await verifySettlement(makeInvoice(), T0, horizonSim)).toMatchObject(
			{ settled: true, txHash: payment.record.hash },
		)
	})

	it("treats an exactly full last page followed by an empty one as complete", async () => {
		const horizonSim = new SimulatedHorizon(
			activity(HORIZON_PAGE_LIMIT, T0 + 300 * SECOND),
		)

		const evidence = await fetchSettlementEvidence(makeInvoice(), horizonSim)

		expect(evidence.complete).toBe(true)
		expect(evidence.scanned).toBe(HORIZON_PAGE_LIMIT)
		expect(horizonSim.transactionCalls).toHaveLength(2)
	})
})

describe("Horizon evidence rules", () => {
	it("never settles when the payment operation source is the merchant", async () => {
		const horizonSim = new SimulatedHorizon([
			invoicePayment(T0 + MINUTE, {
				source: CUSTOMER,
				operations: [paymentOp({ source_account: MERCHANT, to: MERCHANT })],
			}),
		])

		expect(await verifySettlement(makeInvoice(), T0, horizonSim)).toEqual({
			settled: false,
			reason: "no_match",
		})
	})

	it("identifies the satisfying operation inside a multi-operation transaction", async () => {
		const payment = invoicePayment(T0 + MINUTE, {
			operations: [
				paymentOp({ id: "700001", to: OTHER, amount: "2.0000000" }),
				paymentOp({ id: "700002" }),
			],
		})
		const horizonSim = new SimulatedHorizon([payment])

		expect(await verifySettlement(makeInvoice(), T0, horizonSim)).toEqual({
			settled: true,
			txHash: payment.record.hash,
			operationId: "700002",
			ledgerClosedAt: payment.record.created_at,
		})
	})

	it("does not settle when Horizon returns fewer operations than declared", async () => {
		const horizonSim = new SimulatedHorizon([
			invoicePayment(T0 + MINUTE, { operationCount: 3 }),
		])

		expect(await verifySettlement(makeInvoice(), T0, horizonSim)).toEqual({
			settled: false,
			reason: "no_match",
		})
	})

	it("settles a payment confirmed before expiry when queried days later", async () => {
		const invoice = makeInvoice()
		const payment = invoicePayment(invoice.expiresAt - 10 * SECOND)
		const horizonSim = new SimulatedHorizon([
			...activity(20, invoice.expiresAt + 2 * 24 * 60 * MINUTE),
			payment,
		])

		expect(
			await verifySettlement(
				invoice,
				invoice.expiresAt + 3 * 24 * 60 * MINUTE,
				horizonSim,
			),
		).toMatchObject({ settled: true, txHash: payment.record.hash })
	})

	it("does not settle a payment confirmed after expiry", async () => {
		const invoice = makeInvoice()
		const horizonSim = new SimulatedHorizon([
			invoicePayment(invoice.expiresAt + 5 * SECOND),
		])

		expect(
			await verifySettlement(invoice, invoice.expiresAt + MINUTE, horizonSim),
		).toEqual({ settled: false, reason: "expired" })
	})

	it("resolves Horizon failures to network_error", async () => {
		const failing: EvidenceSource = {
			transactions: () => Promise.reject(new Error("503")),
			operations: () => Promise.reject(new Error("503")),
		}

		expect(await verifySettlement(makeInvoice(), T0, failing)).toEqual({
			settled: false,
			reason: "network_error",
		})
	})
})

describe("verification flow with local persistence", () => {
	const storage = new Map<string, string>()

	beforeEach(() => {
		storage.clear()
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => {
				storage.set(key, value)
			},
		})
		vi.useFakeTimers({ toFake: ["Date"] })
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it("persists the settlement of a valid payment", async () => {
		vi.setSystemTime(T0 + 2 * MINUTE)
		const invoice = makeInvoice()
		saveInvoice(MERCHANT, invoice)
		const payment = invoicePayment(T0 + MINUTE)

		const outcome = await verifyAndUpdate(
			invoice,
			new SimulatedHorizon([payment]),
		)

		expect(outcome.kind).toBe("settled")
		expect(getInvoice(MERCHANT, invoice.id)).toMatchObject({
			status: "settled",
			txHash: payment.record.hash,
		})
	})

	it("never lets one transaction hash settle two invoices of the same store", async () => {
		vi.setSystemTime(T0 + 2 * MINUTE)
		const sharedHash = "c".repeat(64)
		const first = makeInvoice({
			id: "2f6b5f8e-0000-4000-8000-0000000000aa",
			reference: "ISQFIRSTREF23",
			status: "settled",
			txHash: sharedHash,
		})
		const second = makeInvoice()
		saveInvoice(MERCHANT, first)
		saveInvoice(MERCHANT, second)
		// Evidence that would otherwise satisfy the second invoice reuses the
		// hash already claimed by the first one.
		const horizonSim = new SimulatedHorizon([
			invoicePayment(T0 + MINUTE, { hash: sharedHash }),
		])

		const outcome = await verifyAndUpdate(second, horizonSim)

		expect(outcome).toEqual({
			kind: "unchanged",
			result: { settled: false, reason: "no_match" },
		})
		expect(getInvoice(MERCHANT, second.id)?.status).toBe("active")
	})

	it("manually settles an expired invoice paid in time", async () => {
		const invoice = makeInvoice()
		saveInvoice(MERCHANT, invoice)
		vi.setSystemTime(invoice.expiresAt + 24 * 60 * MINUTE)

		const outcome = await verifyAndUpdate(
			invoice,
			new SimulatedHorizon([invoicePayment(invoice.expiresAt - SECOND)]),
		)

		expect(outcome.kind).toBe("settled")
		expect(getInvoice(MERCHANT, invoice.id)?.status).toBe("settled")
	})

	it("keeps monitoring for the grace period after expiry, then stops", async () => {
		const invoice = makeInvoice()
		saveInvoice(MERCHANT, invoice)
		const horizonSim = new SimulatedHorizon([
			invoicePayment(invoice.expiresAt - SECOND),
		])

		vi.setSystemTime(invoice.expiresAt + EXPIRY_GRACE_MS + 1)
		expect(await verifyPending([invoice], horizonSim)).toEqual([invoice])
		expect(horizonSim.transactionCalls).toHaveLength(0)

		vi.setSystemTime(invoice.expiresAt + EXPIRY_GRACE_MS - 1)
		const [updated] = await verifyPending([invoice], horizonSim)
		expect(updated?.status).toBe("settled")
	})
})

describe("horizonEvidenceSource", () => {
	afterEach(() => vi.restoreAllMocks())

	it("pages the recipient's transactions newest first with the Horizon cursor", async () => {
		const calls: [string, unknown][] = []
		const builder = {
			forAccount: (value: string) => (
				calls.push(["forAccount", value]),
				builder
			),
			order: (value: string) => (calls.push(["order", value]), builder),
			limit: (value: number) => (calls.push(["limit", value]), builder),
			cursor: (value: string) => (calls.push(["cursor", value]), builder),
			call: () => Promise.resolve({ records: [] }),
		}
		vi.spyOn(horizon, "transactions").mockReturnValue(builder as never)

		await horizonEvidenceSource.transactions(MERCHANT, undefined, 200)
		await horizonEvidenceSource.transactions(MERCHANT, "12345", 200)

		expect(calls).toEqual([
			["forAccount", MERCHANT],
			["order", "desc"],
			["limit", 200],
			["forAccount", MERCHANT],
			["order", "desc"],
			["limit", 200],
			["cursor", "12345"],
		])
	})

	it("keeps each operation's own effective source and credited fields", async () => {
		const records = [
			{
				...paymentOp({ id: "1", source_account: MERCHANT }),
				from: MERCHANT,
				transaction_hash: "a".repeat(64),
			},
			{
				id: "2",
				type: "create_account",
				source_account: CUSTOMER,
				transaction_successful: true,
				account: MERCHANT,
				starting_balance: "5.0000000",
			},
		]
		const builder = {
			forTransaction: () => builder,
			limit: (value: number) => {
				expect(value).toBe(200)
				return builder
			},
			call: () => Promise.resolve({ records }),
		}
		vi.spyOn(horizon, "operations").mockReturnValue(builder as never)

		const operations = await horizonEvidenceSource.operations(
			"a".repeat(64),
			200,
		)

		expect(operations).toEqual([
			{
				id: "1",
				type: "payment",
				source_account: MERCHANT,
				transaction_successful: true,
				to: MERCHANT,
				account: undefined,
				into: undefined,
				asset_type: "native",
				amount: "12.5000000",
			},
			{
				id: "2",
				type: "create_account",
				source_account: CUSTOMER,
				transaction_successful: true,
				to: undefined,
				account: MERCHANT,
				into: undefined,
				asset_type: undefined,
				amount: undefined,
			},
		])
	})
})
