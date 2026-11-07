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
	TransactionBuilder,
} from "@stellar/stellar-sdk"
import { type MerchantProfile } from "../domain/merchant"
import { horizon, submitSignedTransaction } from "./stellar"

/** Memo attached to every registration transaction (28 byte limit). */
export const REGISTRATION_MEMO = "InterstellaQ:registro"

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
): Promise<MerchantProfile> {
	const hash = await submitSignedTransaction(signedXdr)
	return {
		address,
		displayName: displayName.trim(),
		registeredAt: Date.now(),
		registrationTxHash: hash,
	}
}
