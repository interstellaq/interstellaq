/**
 * Verification flow shared by the merchant dashboard and the payment panel:
 * check Testnet evidence, then persist the transition to `settled` only when
 * no other invoice already claims the same transaction (FR-05, SECURITY.md
 * replay protection).
 */

import { type Invoice } from "../domain/invoice"
import { isTxHashUsed, saveInvoice } from "./persistence"
import {
	type EvidenceSource,
	verifySettlement,
	type VerifyResult,
} from "./stellar"

/**
 * How long after expiry the background monitor keeps checking an unsettled
 * invoice, so a payment confirmed just before the deadline and indexed late
 * still settles without user action. Manual verification has no such limit.
 */
export const EXPIRY_GRACE_MS = 5 * 60_000

/**
 * True while the background monitor should query Horizon for an invoice:
 * it is not settled and its expiry is less than EXPIRY_GRACE_MS ago.
 */
export function awaitsSettlement(
	invoice: Invoice,
	now: number = Date.now(),
): boolean {
	return (
		invoice.status !== "settled" && now < invoice.expiresAt + EXPIRY_GRACE_MS
	)
}

export type VerificationOutcome =
	| { kind: "settled"; invoice: Invoice }
	| { kind: "unchanged"; result: VerifyResult }

/**
 * Run settlement verification for an invoice and, on success, update the
 * stored record. The update is idempotent: re-verifying a settled invoice
 * returns it unchanged, and a transaction already used by another invoice
 * never settles this one. Expired invoices are still verified: on-chain
 * ledger time decides whether the payment arrived in time.
 */
export async function verifyAndUpdate(
	invoice: Invoice,
	source?: EvidenceSource,
): Promise<VerificationOutcome> {
	if (invoice.status === "settled") {
		return { kind: "settled", invoice }
	}
	const result = await verifySettlement(invoice, Date.now(), source)
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

/**
 * Verify every invoice that still awaits settlement and return the list with
 * the confirmed transitions applied. Settled invoices and invoices expired
 * for longer than EXPIRY_GRACE_MS are skipped, so a background poll never
 * re-queries evidence the UI already resolved.
 *
 * Returns the same array reference when nothing changed, which lets callers
 * compare identities to decide whether a re-render is needed.
 */
export async function verifyPending(
	invoices: Invoice[],
	source?: EvidenceSource,
): Promise<Invoice[]> {
	const now = Date.now()
	const pending = invoices.filter((invoice) => awaitsSettlement(invoice, now))
	if (pending.length === 0) return invoices
	const outcomes = await Promise.all(
		pending.map((invoice) => verifyAndUpdate(invoice, source)),
	)
	const confirmed = new Map<string, Invoice>()
	pending.forEach((invoice, index) => {
		const outcome = outcomes[index]
		if (outcome?.kind === "settled") confirmed.set(invoice.id, outcome.invoice)
	})
	if (confirmed.size === 0) return invoices
	return invoices.map((invoice) => confirmed.get(invoice.id) ?? invoice)
}
