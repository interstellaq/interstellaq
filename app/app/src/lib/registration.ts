/**
 * Merchant registration flow (FR-01).
 *
 * A merchant registers by submitting an on-chain registration transaction
 * from the declared account: a no-op sequence bump with a fixed memo. Only
 * the account that holds the secret can sign it, so a confirmed transaction
 * proves control of the public key before its display metadata is trusted
 * (SECURITY.md, authorization requirements).
 *
 * The proof is cheap, visible on stellar.expert and requires no Soroban
 * contract (docs/adr/0002-invoice-correlation.md).
 */

import {
	BASE_FEE,
	Memo,
	Networks,
	Operation,
	Transaction,
	TransactionBuilder,
} from "@stellar/stellar-sdk"
import { type MerchantProfile } from "../domain/merchant"
import { horizon, submitSignedTransaction } from "./stellar"

/** Memo attached to every registration transaction (28 byte limit). */
export const REGISTRATION_MEMO = "InterstellaQ:registro"

interface RegistrationTransactionRecord {
	hash: string
	successful: boolean
	source_account: string
	memo_type: string
	memo?: string
	operation_count: number
}

interface RegistrationOperationRecord {
	type: string
	source_account: string
	transaction_successful: boolean
}

/** Read-only Testnet evidence required to trust a registration. */
export interface RegistrationEvidenceSource {
	transaction(hash: string): Promise<RegistrationTransactionRecord>
	operations(hash: string): Promise<RegistrationOperationRecord[]>
}

export type RegistrationEvidenceResult =
	| { kind: "confirmed" }
	| { kind: "invalid" }
	| { kind: "unavailable" }

/** A submitted registration whose Testnet evidence is temporarily unavailable. */
export class RegistrationConfirmationUnavailableError extends Error {
	constructor(readonly profile: MerchantProfile) {
		super(
			"No se pudo confirmar el registro en Testnet todavía. Espera un momento e inténtalo de nuevo sin volver a firmar.",
		)
		this.name = "RegistrationConfirmationUnavailableError"
	}
}

export interface RegistrationEvidenceOptions {
	/**
	 * A just-submitted transaction can briefly be absent while Horizon indexes
	 * it. A 404 in this grace window is unavailable, not contradictory proof.
	 */
	registeredAt?: number
}

/** Horizon's submission index is normally immediate; this only classifies errors. */
export const REGISTRATION_INDEX_GRACE_MS = 60_000
const TRANSACTION_HASH_PATTERN = /^[0-9a-f]{64}$/i

export const horizonRegistrationEvidence: RegistrationEvidenceSource = {
	transaction(hash) {
		return horizon.transactions().transaction(hash).call()
	},
	async operations(hash) {
		const page = await horizon.operations().forTransaction(hash).limit(2).call()
		return page.records.map((operation) => ({
			type: operation.type,
			source_account: operation.source_account,
			transaction_successful: operation.transaction_successful,
		}))
	},
}

function isExpectedBump(
	operation: { type: string; source?: string; bumpTo?: string },
	transactionSequence: string,
): boolean {
	return (
		operation.type === "bumpSequence" &&
		operation.source === undefined &&
		operation.bumpTo === (BigInt(transactionSequence) - 1n).toString()
	)
}

function parseSignedRegistrationXdr(
	address: string,
	signedXdr: string,
): { transaction: Transaction } | { error: string } {
	try {
		const transaction = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET)
		if (!(transaction instanceof Transaction)) {
			return { error: "La transacción de registro no puede usar fee bump." }
		}
		if (transaction.source !== address) {
			return { error: "La transacción no pertenece a la cuenta conectada." }
		}
		if (
			transaction.memo.type !== "text" ||
			transaction.memo.value === null ||
			transaction.memo.value.toString() !== REGISTRATION_MEMO
		) {
			return { error: "La transacción no contiene el memo de registro esperado." }
		}
		const [operation] = transaction.operations
		if (
			transaction.operations.length !== 1 ||
			operation === undefined ||
			!isExpectedBump(operation, transaction.sequence)
		) {
			return { error: "La transacción no contiene la operación de registro esperada." }
		}
		return { transaction }
	} catch {
		return { error: "La wallet devolvió una transacción de registro inválida." }
	}
}

/**
 * Decode a wallet response before broadcasting it. XDR has no embedded
 * network identifier, so parsing uses Testnet and confirmation below is the
 * evidence that the transaction was actually included on Testnet.
 */
export function validateSignedRegistrationXdr(
	address: string,
	signedXdr: string,
): string | null {
	const result = parseSignedRegistrationXdr(address, signedXdr)
	return "error" in result ? result.error : null
}

/** Canonical lowercase Testnet hash of a previously validated XDR. */
export function signedRegistrationHash(
	address: string,
	signedXdr: string,
): string | null {
	const result = parseSignedRegistrationXdr(address, signedXdr)
	return "error" in result ? null : result.transaction.hash().toString("hex")
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"response" in error &&
		typeof error.response === "object" &&
		error.response !== null &&
		"status" in error.response &&
		error.response.status === 404
	)
}

function notFoundIsDefinitive(options: RegistrationEvidenceOptions): boolean {
	return (
		typeof options.registeredAt === "number" &&
		Date.now() - options.registeredAt >= REGISTRATION_INDEX_GRACE_MS
	)
}

/**
 * Confirm that a successful Testnet transaction is the exact registration
 * proof for `address`. Successful submission alone is not confirmation.
 */
export async function verifyRegistrationEvidence(
	address: string,
	hash: string,
	source: RegistrationEvidenceSource = horizonRegistrationEvidence,
	options: RegistrationEvidenceOptions = {},
): Promise<RegistrationEvidenceResult> {
	let transaction: RegistrationTransactionRecord
	try {
		transaction = await source.transaction(hash)
	} catch (error) {
		return isNotFound(error) && notFoundIsDefinitive(options)
			? { kind: "invalid" }
			: { kind: "unavailable" }
	}
	if (
		transaction.hash !== hash ||
		!transaction.successful ||
		transaction.source_account !== address ||
		transaction.memo_type !== "text" ||
		transaction.memo !== REGISTRATION_MEMO ||
		transaction.operation_count !== 1
	) {
		return { kind: "invalid" }
	}
	try {
		const operations = await source.operations(hash)
		return operations.length === 1 &&
			operations[0]?.type === "bump_sequence" &&
			operations[0].source_account === address &&
			operations[0].transaction_successful
			? { kind: "confirmed" }
			: { kind: "invalid" }
	} catch {
		return { kind: "unavailable" }
	}
}

/**
 * Build the unsigned registration transaction for `address`: a bump to its
 * current sequence number, which changes no state but must be signed by the
 * account holder.
 */
export async function buildRegistrationTransaction(
	address: string,
): Promise<string> {
	const account = await horizon.loadAccount(address)
	const transaction = new TransactionBuilder(account, {
		fee: BASE_FEE,
		networkPassphrase: Networks.TESTNET,
	})
		.addOperation(Operation.bumpSequence({ bumpTo: account.sequenceNumber() }))
		.addMemo(Memo.text(REGISTRATION_MEMO))
		.setTimeout(600)
		.build()
	return transaction.toXDR()
}

/**
 * Submit a wallet-signed registration transaction and persist the resulting
 * profile only after Horizon confirms it.
 */
export async function submitRegistration(
	address: string,
	displayName: string,
	signedXdr: string,
	dependencies: {
		submit?: (xdr: string) => Promise<string>
		evidence?: RegistrationEvidenceSource
	} = {},
): Promise<MerchantProfile> {
	const xdrError = validateSignedRegistrationXdr(address, signedXdr)
	if (xdrError) throw new Error(xdrError)
	const expectedHash = signedRegistrationHash(address, signedXdr)
	if (expectedHash === null) throw new Error(xdrError ?? "XDR inválido.")
	const submittedHash = await (dependencies.submit ?? submitSignedTransaction)(
		signedXdr,
	)
	if (!TRANSACTION_HASH_PATTERN.test(submittedHash)) {
		throw new Error("La respuesta de envío no contiene un hash de transacción válido.")
	}
	const hash = submittedHash.toLowerCase()
	if (hash !== expectedHash) {
		throw new Error("La respuesta de envío no coincide con la transacción firmada.")
	}
	const profile: MerchantProfile = {
		address,
		displayName: displayName.trim(),
		registeredAt: Date.now(),
		registrationTxHash: hash,
	}
	const confirmed = await verifyRegistrationEvidence(
		address,
		hash,
		dependencies.evidence,
		{ registeredAt: profile.registeredAt },
	)
	if (confirmed.kind === "invalid") {
		throw new Error(
			"Testnet no confirmó la transacción de registro esperada. Intenta de nuevo.",
		)
	}
	if (confirmed.kind === "unavailable") {
		throw new RegistrationConfirmationUnavailableError(profile)
	}
	return profile
}
