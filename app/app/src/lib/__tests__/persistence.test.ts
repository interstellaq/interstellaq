import { Keypair } from "@stellar/stellar-sdk"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type Invoice } from "../../domain/invoice"
import { getInvoice, loadMerchant, saveMerchant } from "../persistence"

const RECIPIENT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
const NOW = 1_760_000_000_000
const INVOICE_ID = "2f6b5f8e-0000-4000-8000-000000000001"
const TX_HASH = "a".repeat(64)

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
	id: INVOICE_ID,
	reference: "ISQABCDEFGHIJ",
	recipient: RECIPIENT,
	asset: "XLM",
	amount: "12.5000000",
	createdAt: NOW,
	expiresAt: NOW + 30 * 60_000,
	status: "active",
	...overrides,
})

describe("getInvoice", () => {
	const storage = new Map<string, string>()
	const address = RECIPIENT
	const key = `interstellaq.invoices.${address}`

	beforeEach(() => {
		storage.clear()
		vi.stubGlobal("localStorage", {
			getItem: (storageKey: string) => storage.get(storageKey) ?? null,
			setItem: (storageKey: string, value: string) => {
				storage.set(storageKey, value)
			},
		})
	})

	afterEach(() => vi.unstubAllGlobals())

	it("returns a structurally valid stored invoice", () => {
		const invoice = makeInvoice()
		storage.set(key, JSON.stringify([invoice]))

		expect(getInvoice(address, invoice.id)).toEqual(invoice)
	})

	it("rejects a manipulated stored invoice before it reaches the payment view", () => {
		const invoice = makeInvoice({ amount: "0" })
		storage.set(key, JSON.stringify([invoice]))

		expect(getInvoice(address, invoice.id)).toBeNull()
	})
})

describe("merchant persistence", () => {
	const storage = new Map<string, string>()
	const address = RECIPIENT
	const key = `interstellaq.merchant.${address}`
	const profile = {
		address,
		displayName: "Café Andes",
		registeredAt: NOW,
		registrationTxHash: TX_HASH,
	}

	beforeEach(() => {
		storage.clear()
		vi.stubGlobal("localStorage", {
			getItem: (storageKey: string) => storage.get(storageKey) ?? null,
			setItem: (storageKey: string, value: string) => {
				storage.set(storageKey, value)
			},
		})
	})

	afterEach(() => vi.unstubAllGlobals())

	it("restores a structurally valid registration for its own account", () => {
		expect(saveMerchant(profile)).toBe(true)
		expect(loadMerchant(address)).toEqual(profile)
	})

	it("rejects manipulated or cross-account registration records on reload", () => {
		storage.set(key, JSON.stringify({ ...profile, registrationTxHash: "not-a-hash" }))
		expect(loadMerchant(address)).toBeNull()
		storage.set(key, JSON.stringify({ ...profile, address: Keypair.random().publicKey() }))
		expect(loadMerchant(address)).toBeNull()
	})
})
