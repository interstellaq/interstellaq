/**
 * Verification flow shared by the merchant dashboard and the payment panel:
 * check Testnet evidence, then persist the transition to `settled` only when
 * no other invoice already claims the same transaction (FR-05, SECURITY.md
 * replay protection).
 */

import { type Invoice } from "../domain/invoice"
import { isTxHashUsed, saveInvoice } from "./persistence"
import { verifySettlement, type VerifyResult } from "./stellar"

export type VerificationOutcome =
	| { kind: "settled"; invoice: Invoice }
	| { kind: "unchanged"; result: VerifyResult }

/**
 * Run settlement verification for an invoice and, on success, update the
 * stored record. The update is idempotent: re-verifying a settled invoice
 * returns it unchanged, and a transaction already used by another invoice
 * never settles this one.
 */
export async function verifyAndUpdate(
	invoice: Invoice,
): Promise<VerificationOutcome> {
	if (invoice.status === "settled") {
		return { kind: "settled", invoice }
	}
	const result = await verifySettlement(invoice)
	if (!result.settled) {
		return { kind: "unchanged", result }
	}
	if (isTxHashUsed(invoice.recipient, result.txHash, invoice.id)) {
		return {
			kind: "unchanged",
			result: { settled: false, reason: "no_match" },
		}
	}
	const updated: Invoice = {
		...invoice,
		status: "settled",
		txHash: result.txHash,
		verifiedAt: Date.now(),
	}
	saveInvoice(invoice.recipient, updated)
	return { kind: "settled", invoice: updated }
}
