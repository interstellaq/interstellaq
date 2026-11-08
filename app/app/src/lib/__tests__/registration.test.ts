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
	REGISTRATION_MEMO,
	REGISTRATION_INDEX_GRACE_MS,
	RegistrationConfirmationUnavailableError,
	signedRegistrationHash,
	submitRegistration,
	validateSignedRegistrationXdr,
	verifyRegistrationEvidence,
	type RegistrationEvidenceSource,
} from "../registration"

const HASH = "a".repeat(64)

function registrationXdr(
	address: string,
	options: { memo?: string; operation?: "bump" | "payment"; bumpTo?: string } = {},
): string {
	const account = new Account(address, "100")
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

function evidence(
	address: string,
	hash: string = HASH,
	overrides: {
		transaction?: Partial<Awaited<ReturnType<RegistrationEvidenceSource["transaction"]>>>
		operations?: Awaited<ReturnType<RegistrationEvidenceSource["operations"]>>
	} = {},
): RegistrationEvidenceSource {
	return {
		transaction: async () => ({
			hash,
			successful: true,
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

	it("accepts and confirms the intended Testnet registration", async () => {
		const xdr = registrationXdr(merchant)
		const hash = signedRegistrationHash(merchant, xdr)
		expect(validateSignedRegistrationXdr(merchant, xdr)).toBeNull()
		expect(hash).not.toBeNull()
		await expect(verifyRegistrationEvidence(merchant, hash!, evidence(merchant, hash!))).resolves.toEqual({ kind: "confirmed" })
		await expect(
			submitRegistration(merchant, "Café Andes", xdr, {
				submit: async () => hash!,
				evidence: evidence(merchant, hash!),
			}),
		).resolves.toMatchObject({ address: merchant, registrationTxHash: hash })
	})

	it("normalizes a canonical-equivalent submission hash before persisting", async () => {
		const xdr = registrationXdr(merchant)
		const hash = signedRegistrationHash(merchant, xdr)!
		await expect(
			submitRegistration(merchant, "Café Andes", xdr, {
				submit: async () => hash.toUpperCase(),
				evidence: evidence(merchant, hash),
			}),
		).resolves.toMatchObject({ registrationTxHash: hash })
	})

	it("rejects a signed XDR for a different merchant, memo, operation, or malformed data", () => {
		expect(validateSignedRegistrationXdr(Keypair.random().publicKey(), registrationXdr(merchant))).not.toBeNull()
		expect(validateSignedRegistrationXdr(merchant, registrationXdr(merchant, { memo: "other" }))).not.toBeNull()
		expect(validateSignedRegistrationXdr(merchant, registrationXdr(merchant, { operation: "payment" }))).not.toBeNull()
		expect(validateSignedRegistrationXdr(merchant, registrationXdr(merchant, { bumpTo: "1000000" }))).not.toBeNull()
		expect(validateSignedRegistrationXdr(merchant, "not-xdr")).not.toBeNull()
	})

	it("rejects fee-bump envelopes to keep the registration proof structure unambiguous", () => {
		expect(validateSignedRegistrationXdr(merchant, feeBumpRegistrationXdr(merchant))).not.toBeNull()
	})

	it("rejects missing, failed, or inconsistent Testnet confirmation evidence", async () => {
		await expect(verifyRegistrationEvidence(merchant, HASH, evidence(merchant, HASH, { transaction: { successful: false } }))).resolves.toEqual({ kind: "invalid" })
		await expect(verifyRegistrationEvidence(merchant, HASH, evidence(merchant, HASH, { transaction: { source_account: Keypair.random().publicKey() } }))).resolves.toEqual({ kind: "invalid" })
		await expect(verifyRegistrationEvidence(merchant, HASH, evidence(merchant, HASH, { transaction: { memo: "other" } }))).resolves.toEqual({ kind: "invalid" })
		await expect(verifyRegistrationEvidence(merchant, HASH, evidence(merchant, HASH, { operations: [] }))).resolves.toEqual({ kind: "invalid" })
		await expect(verifyRegistrationEvidence(merchant, HASH, evidence(merchant, HASH, { operations: [{ type: "payment", source_account: merchant, transaction_successful: true }] }))).resolves.toEqual({ kind: "invalid" })
	})

	it("keeps unavailable Horizon evidence distinct from invalid evidence", async () => {
		const transactionFailure = { ...evidence(merchant), transaction: async () => Promise.reject(new Error("offline")) }
		await expect(verifyRegistrationEvidence(merchant, HASH, transactionFailure)).resolves.toEqual({ kind: "unavailable" })
		const operationFailure = { ...evidence(merchant), operations: async () => Promise.reject(new Error("timeout")) }
		await expect(verifyRegistrationEvidence(merchant, HASH, operationFailure)).resolves.toEqual({ kind: "unavailable" })
		const notFound = { ...evidence(merchant), transaction: async () => Promise.reject({ response: { status: 404 } }) }
		await expect(verifyRegistrationEvidence(merchant, HASH, notFound, { registeredAt: Date.now() })).resolves.toEqual({ kind: "unavailable" })
		await expect(verifyRegistrationEvidence(merchant, HASH, notFound, { registeredAt: Date.now() - REGISTRATION_INDEX_GRACE_MS })).resolves.toEqual({ kind: "invalid" })
	})

	it("rejects a submission hash that does not match the signed Testnet XDR", async () => {
		const xdr = registrationXdr(merchant)
		await expect(
			submitRegistration(merchant, "Café Andes", xdr, {
				submit: async () => HASH,
				evidence: evidence(merchant),
			}),
		).rejects.toThrow("no coincide")
	})

	it("returns a recoverable pending profile when Testnet is temporarily unavailable", async () => {
		const xdr = registrationXdr(merchant)
		const hash = signedRegistrationHash(merchant, xdr)!
		const unavailable = {
			...evidence(merchant, hash),
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
