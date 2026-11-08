import { beforeEach, describe, expect, it, vi } from "vitest"
import { type Invoice } from "../../domain/invoice"
import { isTxHashUsed, saveInvoice } from "../persistence"
import { verifySettlement } from "../stellar"
import { EXPIRY_GRACE_MS, verifyPending } from "../verify"

vi.mock("../stellar", () => ({
	verifySettlement: vi.fn(),
}))
vi.mock("../persistence", () => ({
	isTxHashUsed: vi.fn(() => false),
	saveInvoice: vi.fn(() => true),
}))

const verifySettlementMock = vi.mocked(verifySettlement)

const NOW = Date.now()

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
	id: "2f6b5f8e-0000-4000-8000-000000000001",
	reference: "ISQABCDEFGHIJ",
	recipient: "GMERCHANTADDRESSEXAMPLE0000000000000000000000000000",
	asset: "XLM",
	amount: "12.5000000",
	createdAt: NOW,
	expiresAt: NOW + 30 * 60_000,
	status: "active",
	...overrides,
})

beforeEach(() => {
	vi.clearAllMocks()
})

describe("verifyPending", () => {
	it("settles pending invoices and leaves the resolved ones untouched", async () => {
		const pending = makeInvoice()
		const alreadySettled = makeInvoice({
			id: "2f6b5f8e-0000-4000-8000-000000000002",
			status: "settled",
			txHash: "a".repeat(64),
		})
		verifySettlementMock.mockResolvedValue({
			settled: true,
			txHash: "b".repeat(64),
			operationId: "1001",
			ledgerClosedAt: new Date(NOW).toISOString(),
		})

		const result = await verifyPending([pending, alreadySettled])

		expect(result[0]?.status).toBe("settled")
		expect(result[0]?.txHash).toBe("b".repeat(64))
		expect(result[1]).toBe(alreadySettled)
		// Settled invoices never reach Horizon again.
		expect(verifySettlementMock).toHaveBeenCalledTimes(1)
		expect(saveInvoice).toHaveBeenCalledTimes(1)
	})

	it("returns the same list when no payment matches yet", async () => {
		const invoices = [makeInvoice()]
		verifySettlementMock.mockResolvedValue({
			settled: false,
			reason: "no_match",
		})

		const result = await verifyPending(invoices)

		expect(result).toBe(invoices)
		expect(saveInvoice).not.toHaveBeenCalled()
	})

	it("skips settled invoices and those expired beyond the grace period", async () => {
		const settled = makeInvoice({
			status: "settled",
			txHash: "a".repeat(64),
		})
		const expired = makeInvoice({
			expiresAt: NOW - EXPIRY_GRACE_MS - 1_000,
		})

		const result = await verifyPending([settled, expired])

		expect(result[0]).toBe(settled)
		expect(result[1]).toBe(expired)
		expect(verifySettlementMock).not.toHaveBeenCalled()
	})

	it("still checks an invoice that expired within the grace period", async () => {
		const recentlyExpired = makeInvoice({ expiresAt: NOW - 1_000 })
		verifySettlementMock.mockResolvedValue({
			settled: false,
			reason: "expired",
		})

		const result = await verifyPending([recentlyExpired])

		expect(result[0]).toBe(recentlyExpired)
		expect(verifySettlementMock).toHaveBeenCalledTimes(1)
	})

	it("keeps a verification_failed invoice pending until it matches", async () => {
		const retry = makeInvoice({ status: "verification_failed" })
		verifySettlementMock.mockResolvedValue({
			settled: false,
			reason: "no_match",
		})

		const result = await verifyPending([retry])

		expect(result[0]?.status).toBe("verification_failed")
		expect(verifySettlementMock).toHaveBeenCalledTimes(1)
	})

	it("never settles with a transaction another invoice already claimed", async () => {
		const invoice = makeInvoice()
		verifySettlementMock.mockResolvedValue({
			settled: true,
			txHash: "c".repeat(64),
			operationId: "1001",
			ledgerClosedAt: new Date(NOW).toISOString(),
		})
		vi.mocked(isTxHashUsed).mockReturnValue(true)

		const result = await verifyPending([invoice])

		expect(result[0]?.status).toBe("active")
		expect(saveInvoice).not.toHaveBeenCalled()
	})
})
