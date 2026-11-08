/**
 * Pure builders for the live Testnet settlement scenarios
 * (live.scenarios.testnet.test.ts). They take already loaded `Account`
 * handles and never touch the network, so their structure is unit tested
 * offline in testnetScenarios.test.ts before any transaction is signed.
 */
import {
	type Account,
	Asset,
	BASE_FEE,
	Memo,
	Networks,
	Operation,
	type Transaction,
	TransactionBuilder,
} from "@stellar/stellar-sdk"
import { createInvoice, type Invoice } from "../../domain/invoice"
import { createReference } from "../reference"
import { paymentMaxTime } from "../stellar"

const INVOICE_WINDOW_MINUTES = 15

function builder(source: Account, invoice: Invoice): TransactionBuilder {
	const maxTime = paymentMaxTime(invoice)
	if (maxTime === null) throw new Error("invoice already expired")
	return new TransactionBuilder(source, {
		fee: BASE_FEE,
		networkPassphrase: Networks.TESTNET,
		timebounds: { minTime: 0, maxTime },
	}).addMemo(Memo.text(invoice.reference))
}

/** A regular 15 minute invoice created now. */
export function freshInvoice(recipient: string, amount: string): Invoice {
	return expectInvoice(
		createInvoice({
			recipient,
			amount,
			expiryMinutes: INVOICE_WINDOW_MINUTES,
			reference: createReference(),
		}),
	)
}

/**
 * A structurally valid 15 minute invoice whose creation is backdated so it
 * expires `expiresInMs` from `now` (local clock). Lets the expiry scenarios
 * run in seconds instead of waiting for a full window.
 */
export function expiringInvoice(
	recipient: string,
	amount: string,
	expiresInMs: number,
	now: number = Date.now(),
): Invoice {
	return expectInvoice(
		createInvoice({
			recipient,
			amount,
			expiryMinutes: INVOICE_WINDOW_MINUTES,
			reference: createReference(),
			now: now + expiresInMs - INVOICE_WINDOW_MINUTES * 60_000,
		}),
	)
}

function expectInvoice(created: Invoice | { error: string }): Invoice {
	if ("error" in created) throw new Error(created.error)
	return created
}

/**
 * Scenario 1: the customer submits and pays the fee, but the only payment
 * operation has the merchant as its own source and destination. Needs the
 * signatures of both accounts. Must never settle.
 */
export function merchantSourcedSelfPayment(
	customer: Account,
	invoice: Invoice,
): Transaction {
	return builder(customer, invoice)
		.addOperation(
			Operation.payment({
				source: invoice.recipient,
				destination: invoice.recipient,
				asset: Asset.native(),
				amount: invoice.amount,
			}),
		)
		.build()
}

/**
 * Scenario 2a: an unrelated operation first (funding a new account), then
 * the exact invoice payment. Must settle on the second operation.
 */
export function multiOperationPayment(
	customer: Account,
	invoice: Invoice,
	unrelatedNewAccount: string,
): Transaction {
	return builder(customer, invoice)
		.addOperation(
			Operation.createAccount({
				destination: unrelatedNewAccount,
				startingBalance: "1.5000000",
			}),
		)
		.addOperation(
			Operation.payment({
				destination: invoice.recipient,
				asset: Asset.native(),
				amount: invoice.amount,
			}),
		)
		.build()
}

/**
 * Scenario 2b: two operations that each pay the exact amount to the
 * merchant. Ambiguous by rule; must not settle.
 */
export function ambiguousDoublePayment(
	customer: Account,
	invoice: Invoice,
): Transaction {
	const payment = () =>
		Operation.payment({
			destination: invoice.recipient,
			asset: Asset.native(),
			amount: invoice.amount,
		})
	return builder(customer, invoice)
		.addOperation(payment())
		.addOperation(payment())
		.build()
}
