import {
	Account,
	Asset,
	BASE_FEE,
	Keypair,
	Memo,
	Networks,
	Operation,
	TransactionBuilder,
} from "@stellar/stellar-sdk"
import { describe, expect, it } from "vitest"
import {
	REGISTRATION_INDEX_GRACE_MS,
	REGISTRATION_MEMO,
	RegistrationConfirmationUnavailableError,
	signedRegistrationHash,
	submitRegistration,
	validateSignedRegistrationXdr,
	verifyRegistrationEvidence,
	type RegistrationEvidenceSource,
} from "../registration"

type RegistrationFixtureOptions = {
	memo?: string
	operation?: "bump" | "payment"
	bumpTo?: string
	operationSource?: string
	sequence?: string
}

function registrationXdr(
	address: string,
	options: RegistrationFixtureOptions = {},
): string {
	const account = new Account(address, options.sequence ?? "100")
	const transaction = new TransactionBuilder(account, {
		fee: BASE_FEE,
		networkPassphrase: Networks.TESTNET,
	})
		.addOperation(
			options.operation === "payment"
				? Operation.payment({
						destination: Keypair.random().publicKey(),
						asset: Asset.native(),
						amount: "1",
					})
				: Operation.bumpSequence({
						bumpTo: options.bumpTo ?? account.sequenceNumber(),
						source: options.operationSource,
					}),
		)
		.addMemo(Memo.text(options.memo ?? REGISTRATION_MEMO))
		.setTimeout(600)
		.build()
	return transaction.toXDR()
}

function feeBumpRegistrationXdr(address: string): string {
	const inner = new TransactionBuilder(new Account(address, "100"), {
		fee: BASE_FEE,
		networkPassphrase: Networks.TESTNET,
	})
		.addOperation(Operation.bumpSequence({ bumpTo: "100" }))
		.addMemo(Memo.text(REGISTRATION_MEMO))
		.setTimeout(600)
		.build()
	return TransactionBuilder.buildFeeBumpTransaction(
		Keypair.random(),
		BASE_FEE,
		inner,
		Networks.TESTNET,
	).toXDR()
}

function envelopeHash(envelopeXdr: string): string {
	return TransactionBuilder.fromXDR(envelopeXdr, Networks.TESTNET)
		.hash()
		.toString("hex")
}

function evidence(
	address: string,
	envelopeXdr: string,
	overrides: {
		transaction?: Partial<
			Awaited<ReturnType<RegistrationEvidenceSource["transaction"]>>
		>
		operations?: Awaited<ReturnType<RegistrationEvidenceSource["operations"]>>
	} = {},
): RegistrationEvidenceSource {
	const hash = envelopeHash(envelopeXdr)
	return {
		transaction: async () => ({
			hash,
			successful: true,
			envelope_xdr: envelopeXdr,
			source_account: address,
			memo_type: "text",
			memo: REGISTRATION_MEMO,
			operation_count: 1,
			...overrides.transaction,
		}),
		operations: async () =>
			overrides.operations ?? [
				{
					type: "bump_sequence",
					source_account: address,
					transaction_successful: true,
				},
			],
	}
}

describe("merchant registration integrity", () => {
	const merchant = Keypair.random().publicKey()

	it("accepts and confirms a direct Testnet no-op registration", async () => {
		const xdr = registrationXdr(merchant)
		const hash = signedRegistrationHash(merchant, xdr)
		expect(validateSignedRegistrationXdr(merchant, xdr)).toBeNull()
		expect(hash).toBe(envelopeHash(xdr))
		await expect(
			verifyRegistrationEvidence(merchant, hash!, evidence(merchant, xdr)),
		).resolves.toEqual({ kind: "confirmed" })
	})

	it("uses the same validation for submission and accepted Horizon evidence", async () => {
		const xdr = registrationXdr(merchant)
		const hash = envelopeHash(xdr)
		await expect(
			submitRegistration(merchant, "Café Andes", xdr, {
				submit: async () => hash.toUpperCase(),
				evidence: evidence(merchant, xdr),
			}),
		).resolves.toMatchObject({ address: merchant, registrationTxHash: hash })
	})

	it("rejects fee bumps, non-no-op bumps, explicit operation sources, and wrong transaction fields", async () => {
		const feeBump = feeBumpRegistrationXdr(merchant)
		const nonNoop = registrationXdr(merchant, { bumpTo: "1000000" })
		const explicitSource = registrationXdr(merchant, {
			operationSource: Keypair.random().publicKey(),
		})
		const wrongMemo = registrationXdr(merchant, { memo: "other" })
		const wrongSource = registrationXdr(Keypair.random().publicKey())

		for (const xdr of [
			feeBump,
			nonNoop,
			explicitSource,
			wrongMemo,
			wrongSource,
		]) {
			expect(validateSignedRegistrationXdr(merchant, xdr)).not.toBeNull()
			await expect(
				verifyRegistrationEvidence(
					merchant,
					envelopeHash(xdr),
					evidence(merchant, xdr),
				),
			).resolves.toEqual({ kind: "invalid" })
		}
	})

	it("rejects a Horizon envelope that does not match its claimed transaction hash", async () => {
		const xdr = registrationXdr(merchant)
		const otherXdr = registrationXdr(merchant, { sequence: "101" })
		const mismatched = evidence(merchant, otherXdr, {
			transaction: { hash: envelopeHash(xdr) },
		})
		await expect(
			verifyRegistrationEvidence(merchant, envelopeHash(xdr), mismatched),
		).resolves.toEqual({ kind: "invalid" })
	})

	it("rejects failed or inconsistent Horizon summary evidence", async () => {
		const xdr = registrationXdr(merchant)
		const hash = envelopeHash(xdr)
		await expect(
			verifyRegistrationEvidence(
				merchant,
				hash,
				evidence(merchant, xdr, { transaction: { successful: false } }),
			),
		).resolves.toEqual({ kind: "invalid" })
		await expect(
			verifyRegistrationEvidence(
				merchant,
				hash,
				evidence(merchant, xdr, { operations: [] }),
			),
		).resolves.toEqual({ kind: "invalid" })
	})

	it("does not let a future timestamp extend the 404 grace period after reload", async () => {
		const xdr = registrationXdr(merchant)
		const hash = envelopeHash(xdr)
		const notFound = {
			...evidence(merchant, xdr),
			transaction: async () => Promise.reject({ response: { status: 404 } }),
		}
		await expect(
			verifyRegistrationEvidence(merchant, hash, notFound),
		).resolves.toEqual({ kind: "invalid" })
		await expect(
			verifyRegistrationEvidence(merchant, hash, notFound, {
				registeredAt: Date.now() + REGISTRATION_INDEX_GRACE_MS,
			}),
		).resolves.toEqual({ kind: "invalid" })
	})

	it("keeps a current submission and Horizon outages unavailable rather than valid", async () => {
		const xdr = registrationXdr(merchant)
		const hash = envelopeHash(xdr)
		const notFound = {
			...evidence(merchant, xdr),
			transaction: async () => Promise.reject({ response: { status: 404 } }),
		}
		await expect(
			verifyRegistrationEvidence(merchant, hash, notFound, {
				submissionStartedAt: Date.now(),
			}),
		).resolves.toEqual({ kind: "unavailable" })
		const unavailable = {
			...evidence(merchant, xdr),
			transaction: async () => Promise.reject(new Error("offline")),
		}
		await expect(
			verifyRegistrationEvidence(merchant, hash, unavailable),
		).resolves.toEqual({ kind: "unavailable" })
	})

	it("rejects a submission hash that does not match the signed Testnet XDR", async () => {
		const xdr = registrationXdr(merchant)
		await expect(
			submitRegistration(merchant, "Café Andes", xdr, {
				submit: async () => "a".repeat(64),
				evidence: evidence(merchant, xdr),
			}),
		).rejects.toThrow("no coincide")
	})

	it("returns a recoverable pending profile when Testnet is temporarily unavailable", async () => {
		const xdr = registrationXdr(merchant)
		const hash = envelopeHash(xdr)
		const unavailable = {
			...evidence(merchant, xdr),
			transaction: async () => Promise.reject(new Error("offline")),
		}
		await expect(
			submitRegistration(merchant, "Café Andes", xdr, {
				submit: async () => hash,
				evidence: unavailable,
			}),
		).rejects.toBeInstanceOf(RegistrationConfirmationUnavailableError)
	})
})
