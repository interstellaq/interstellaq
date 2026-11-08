import {
	connectWallet,
	errorMessage,
	getWalletNetwork,
	networkPassphrase,
} from "@stellar-scaffold/app-lib"
import { useState } from "react"
import { type Invoice } from "../domain/invoice"
import { useNotification } from "../hooks/useNotification"
import { useWallet } from "../hooks/useWallet"
import { saveInvoice } from "../lib/persistence"
import {
	buildPaymentTransaction,
	stellarExpertTxUrl,
	submitSignedTransaction,
} from "../lib/stellar"
import { verifyAndUpdate } from "../lib/verify"
import { signWithConfirmedTestnet } from "../lib/walletNetwork"

interface PayPanelProps {
	invoice: Invoice
	onUpdated: (invoice: Invoice) => void
}

/** Horizon may need a moment to index a submitted transaction. */
const VERIFY_ATTEMPTS = 3
const VERIFY_DELAY_MS = 2500

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Customer payment flow (FR-04): the payer connects their own wallet, the
 * app builds the exact payment for the reviewed invoice, the wallet signs
 * it, and the app submits it and verifies settlement against Testnet. No
 * private key ever enters the application.
 */
export function PayPanel({ invoice, onUpdated }: PayPanelProps) {
	const { address, isPending, signTransaction } = useWallet()
	const { addNotification } = useNotification()
	const [working, setWorking] = useState(false)
	const [lastTxHash, setLastTxHash] = useState<string | null>(null)

	if (isPending) return null

	if (!address) {
		return (
			<div className="iq-pay card">
				<h2>Pagar factura</h2>
				<p>
					Conecta tu wallet de Stellar para revisar el pago y firmarlo. La
					wallet, y solo la wallet, controla tus fondos.
				</p>
				<button type="button" onClick={() => void connectWallet()}>
					Conectar wallet para pagar
				</button>
			</div>
		)
	}

	if (address === invoice.recipient) {
		return (
			<div className="iq-pay card">
				<h2>Pagar factura</h2>
				<p className="iq-note">
					Esta factura fue creada por tu cuenta. Un pago no puede liquidar una
					factura enviada por el propio destinatario.
				</p>
			</div>
		)
	}

	const pay = async () => {
		setWorking(true)
		try {
			const unsigned = await buildPaymentTransaction(address, invoice)
			const signed = await signWithConfirmedTestnet(
				{ address, isPending },
				networkPassphrase,
				() =>
					signTransaction(unsigned, {
						address,
						networkPassphrase,
					}),
				getWalletNetwork,
			)
			if (!signed.ok) {
				addNotification(signed.message, "error")
				return
			}
			const hash = await submitSignedTransaction(signed.value.signedTxXdr)
			setLastTxHash(hash)
			addNotification(
				"Pago enviado a Testnet. Verificando liquidación.",
				"success",
			)

			for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
				const outcome = await verifyAndUpdate(invoice)
				if (outcome.kind === "settled") {
					onUpdated(outcome.invoice)
					addNotification("Pago verificado y liquidado.", "success")
					return
				}
				if (outcome.kind === "not_persisted") {
					addNotification(
						"El pago está confirmado en Testnet, pero no se pudo guardar la liquidación en este navegador. Usa Verificar estado cuando haya espacio de almacenamiento.",
						"error",
					)
					return
				}
				if (
					!outcome.result.settled &&
					(outcome.result.reason === "expired" ||
						outcome.result.reason === "invalid_invoice")
				) {
					break
				}
				if (attempt < VERIFY_ATTEMPTS - 1) await sleep(VERIFY_DELAY_MS)
			}

			const failed: Invoice = { ...invoice, status: "verification_failed" }
			saveInvoice(invoice.recipient, failed)
			onUpdated(failed)
			addNotification(
				"El pago se envió pero aún no se refleja. Usa Verificar estado en unos segundos.",
				"warning",
			)
		} catch (error) {
			addNotification(errorMessage(error), "error")
		} finally {
			setWorking(false)
		}
	}

	return (
		<div className="iq-pay card">
			<h2>Pagar factura</h2>
			<p>
				Vas a pagar <strong>{invoice.amount} XLM</strong>
				{invoice.note ? ` por ${invoice.note}` : ""} a la cuenta del comercio.
				La wallet te pedirá confirmar el pago con la referencia{" "}
				<code>{invoice.reference}</code>.
			</p>
			<button type="button" onClick={() => void pay()} disabled={working}>
				{working ? "Firmando en la wallet..." : "Pagar ahora"}
			</button>
			{lastTxHash && (
				<p className="iq-evidence">
					<a
						href={stellarExpertTxUrl(lastTxHash)}
						target="_blank"
						rel="noreferrer"
					>
						Ver transacción en stellar.expert
					</a>
				</p>
			)}
		</div>
	)
}
