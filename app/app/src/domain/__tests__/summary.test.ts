import { describe, expect, it } from "vitest"
import { type Invoice } from "../invoice"
import {
	countByFilter,
	dailyVerifiedReceipts,
	filterInvoices,
	formatXlm,
	isVerifiedSettlement,
	matchesFilter,
	summarizeInvoices,
} from "../summary"

const NOW = 1_760_000_000_000
const RECIPIENT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
const TX_HASH = "b".repeat(64)

let sequence = 0
const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => {
	sequence += 1
	return {
		id: `2f6b5f8e-0000-4000-8000-${sequence.toString().padStart(12, "0")}`,
		reference: "ISQABCDEFGHIJ",
		recipient: RECIPIENT,
		asset: "XLM",
		amount: "1",
		createdAt: NOW - 60_000,
		expiresAt: NOW + 30 * 60_000,
		status: "active",
		...overrides,
	}
}

const settled = (overrides: Partial<Invoice> = {}): Invoice =>
	makeInvoice({
		status: "settled",
		txHash: TX_HASH,
		verifiedAt: NOW - 1_000,
		...overrides,
	})

describe("isVerifiedSettlement", () => {
	it("accepts a settled invoice with hash and verification time", () => {
		expect(isVerifiedSettlement(settled())).toBe(true)
	})

	it("never treats a stored transaction hash alone as proof of payment", () => {
		expect(
			isVerifiedSettlement(makeInvoice({ status: "active", txHash: TX_HASH })),
		).toBe(false)
		expect(
			isVerifiedSettlement(
				makeInvoice({
					status: "verification_failed",
					txHash: TX_HASH,
					verifiedAt: NOW,
				}),
			),
		).toBe(false)
	})

	it("rejects a settled status without complete evidence", () => {
		expect(isVerifiedSettlement(settled({ txHash: undefined }))).toBe(false)
		expect(isVerifiedSettlement(settled({ verifiedAt: undefined }))).toBe(false)
		expect(isVerifiedSettlement(settled({ txHash: "not-a-hash" }))).toBe(false)
		expect(isVerifiedSettlement(settled({ txHash: "b".repeat(63) }))).toBe(
			false,
		)
		expect(isVerifiedSettlement(settled({ verifiedAt: 0 }))).toBe(false)
		expect(isVerifiedSettlement(settled({ verifiedAt: 1.5 }))).toBe(false)
	})
})

describe("summarizeInvoices", () => {
	it("returns zero totals for no invoices", () => {
		const summary = summarizeInvoices([], NOW)
		expect(summary.issued).toEqual({ count: 0, stroops: 0n })
		expect(summary.verified).toEqual({ count: 0, stroops: 0n })
		expect(summary.open).toEqual({ count: 0, stroops: 0n })
	})

	it("sums amounts exactly in stroops, without floating point error", () => {
		// 0.1 + 0.2 is 0.30000000000000004 as a JS number.
		const summary = summarizeInvoices(
			[
				makeInvoice({ amount: "0.1" }),
				makeInvoice({ amount: "0.2" }),
				makeInvoice({ amount: "0.0000001" }),
			],
			NOW,
		)
		expect(summary.issued.stroops).toBe(3_000_001n)
		expect(formatXlm(summary.issued.stroops)).toBe("0.3000001")
	})

	it("keeps issued amounts apart from verified settlements", () => {
		const summary = summarizeInvoices(
			[
				settled({ amount: "10" }),
				makeInvoice({ amount: "2.5" }),
				makeInvoice({ amount: "4", status: "verification_failed" }),
				makeInvoice({
					amount: "7",
					createdAt: NOW - 31 * 60_000,
					expiresAt: NOW - 60_000,
				}),
			],
			NOW,
		)
		expect(summary.issued).toEqual({ count: 4, stroops: 235_000_000n })
		expect(summary.verified).toEqual({ count: 1, stroops: 100_000_000n })
		expect(summary.open).toEqual({ count: 2, stroops: 65_000_000n })
		expect(summary.awaitingConfirmation).toEqual({
			count: 1,
			stroops: 40_000_000n,
		})
		expect(summary.expired).toEqual({ count: 1, stroops: 70_000_000n })
	})

	it("excludes settled records without evidence from verified totals", () => {
		const summary = summarizeInvoices(
			[settled({ amount: "3" }), settled({ amount: "5", txHash: undefined })],
			NOW,
		)
		expect(summary.verified).toEqual({ count: 1, stroops: 30_000_000n })
		expect(summary.unverifiedSettled).toEqual({
			count: 1,
			stroops: 50_000_000n,
		})
		expect(summary.issued.count).toBe(2)
	})

	it("does not count a hash on an unsettled invoice as collected", () => {
		const summary = summarizeInvoices(
			[makeInvoice({ amount: "9", txHash: TX_HASH, verifiedAt: NOW })],
			NOW,
		)
		expect(summary.verified.count).toBe(0)
		expect(summary.open.stroops).toBe(90_000_000n)
	})

	it("moves an unpaid invoice from open to expired exactly at expiry", () => {
		const invoice = makeInvoice({ amount: "1" })
		expect(summarizeInvoices([invoice], invoice.expiresAt - 1).open.count).toBe(
			1,
		)
		const atExpiry = summarizeInvoices([invoice], invoice.expiresAt)
		expect(atExpiry.open.count).toBe(0)
		expect(atExpiry.expired.count).toBe(1)
	})

	it("keeps a verified settlement settled after its expiry", () => {
		const invoice = settled({ amount: "1" })
		const later = summarizeInvoices([invoice], invoice.expiresAt + 86_400_000)
		expect(later.verified.count).toBe(1)
		expect(later.expired.count).toBe(0)
	})
})

describe("formatXlm", () => {
	it("formats stroops as exact decimals without trailing zeros", () => {
		expect(formatXlm(0n)).toBe("0")
		expect(formatXlm(1n)).toBe("0.0000001")
		expect(formatXlm(125_000_000n)).toBe("12.5")
		expect(formatXlm(10_000_000n)).toBe("1")
	})

	it("groups the whole part with narrow no-break spaces", () => {
		expect(formatXlm(12_345_678_900_000n)).toBe("1\u202F234\u202F567.89")
		expect(formatXlm(99_999_999_999_999_999n)).toBe(
			"9\u202F999\u202F999\u202F999.9999999",
		)
	})
})

describe("status filters", () => {
	const active = makeInvoice()
	const failed = makeInvoice({ status: "verification_failed" })
	const paid = settled()
	const expired = makeInvoice({
		createdAt: NOW - 31 * 60_000,
		expiresAt: NOW - 60_000,
	})
	const expiredAfterFailure = makeInvoice({
		status: "verification_failed",
		createdAt: NOW - 31 * 60_000,
		expiresAt: NOW - 1,
	})
	const all = [active, failed, paid, expired, expiredAfterFailure]

	it("returns every invoice for 'all', preserving order", () => {
		expect(filterInvoices(all, "all", NOW)).toEqual(all)
	})

	it("filters by derived status, the same status the badge shows", () => {
		expect(filterInvoices(all, "active", NOW)).toEqual([active])
		expect(filterInvoices(all, "verification_failed", NOW)).toEqual([failed])
		expect(filterInvoices(all, "settled", NOW)).toEqual([paid])
		expect(filterInvoices(all, "expired", NOW)).toEqual([
			expired,
			expiredAfterFailure,
		])
	})

	it("re-evaluates expiry against the clock", () => {
		expect(matchesFilter(active, "active", active.expiresAt - 1)).toBe(true)
		expect(matchesFilter(active, "active", active.expiresAt)).toBe(false)
		expect(matchesFilter(active, "expired", active.expiresAt)).toBe(true)
	})

	it("counts every filter, and the buckets add up to the total", () => {
		const counts = countByFilter(all, NOW)
		expect(counts).toEqual({
			all: 5,
			active: 1,
			verification_failed: 1,
			settled: 1,
			expired: 2,
		})
		expect(
			counts.active +
				counts.verification_failed +
				counts.settled +
				counts.expired,
		).toBe(counts.all)
	})
})

describe("dailyVerifiedReceipts", () => {
	// Local calendar times, so the assertions hold in any time zone.
	const at = (day: number, hour: number) =>
		new Date(2026, 10, day, hour, 0, 0).getTime()
	const today = at(8, 20)
	const receipt = (amount: string, verifiedAt: number) =>
		settled({ amount, verifiedAt })

	it("returns one bucket per day, oldest first, ending today", () => {
		const days = dailyVerifiedReceipts([], today, 14)
		expect(days).toHaveLength(14)
		expect(days[0]?.dayStart).toBe(new Date(2026, 9, 26).getTime())
		expect(days[13]?.dayStart).toBe(new Date(2026, 10, 8).getTime())
		expect(days.every((day) => day.stroops === 0n && day.count === 0)).toBe(
			true,
		)
	})

	it("groups verified settlements by local day with exact sums", () => {
		const days = dailyVerifiedReceipts(
			[
				receipt("0.1", at(8, 0)),
				receipt("0.2", at(8, 23)),
				receipt("5", at(7, 12)),
			],
			today,
			14,
		)
		expect(days[13]).toMatchObject({ stroops: 3_000_000n, count: 2 })
		expect(formatXlm(days[13]?.stroops ?? 0n)).toBe("0.3")
		expect(days[12]).toMatchObject({ stroops: 50_000_000n, count: 1 })
	})

	it("uses the verified-settlement rule: a hash alone is not a receipt", () => {
		const days = dailyVerifiedReceipts(
			[
				makeInvoice({ amount: "9", txHash: TX_HASH, verifiedAt: at(8, 10) }),
				makeInvoice({
					amount: "9",
					status: "verification_failed",
					txHash: TX_HASH,
					verifiedAt: at(8, 10),
				}),
				settled({ amount: "9", txHash: undefined, verifiedAt: at(8, 10) }),
			],
			today,
			14,
		)
		expect(days.some((day) => day.count > 0)).toBe(false)
	})

	it("ignores receipts outside the window", () => {
		const days = dailyVerifiedReceipts(
			[
				receipt("1", at(1, 12)),
				receipt("1", new Date(2026, 9, 25, 23).getTime()),
				receipt("1", at(9, 9)),
			],
			today,
			7,
		)
		expect(days).toHaveLength(7)
		expect(days.reduce((total, day) => total + day.count, 0)).toBe(0)
	})
})
