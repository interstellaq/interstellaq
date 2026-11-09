import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { InvoiceDetail } from "../components/InvoiceDetail"
import { type Invoice } from "../domain/invoice"
import { decodePayload } from "../lib/handoff"
import { getInvoice } from "../lib/persistence"
import theme from "../styles/product.module.css"
import styles from "./InvoicePage.module.css"

/** Product theme root: restyles the invoice components without changing them. */
const PAGE_CLASS = `${theme.product} ${styles.page}`

/**
 * Invoice view at `/factura/:address/:id`.
 *
 * Same device: the invoice loads from local storage. Another device: the QR
 * payload travels in the URL fragment, so the payment request renders
 * anywhere without a backend, and settlement is verified against public
 * Horizon data.
 */
export default function InvoicePage() {
	const { address, id } = useParams<{ address: string; id: string }>()
	const [invoice, setInvoice] = useState<Invoice | null>(null)
	const [loaded, setLoaded] = useState(false)

	useEffect(() => {
		if (!address || !id) {
			setInvoice(null)
			setLoaded(true)
			return
		}
		let found = getInvoice(address, id)
		if (!found && window.location.hash.startsWith("#p=")) {
			const payload = decodePayload(window.location.hash.slice(3))
			if (payload && payload.recipient === address && payload.id === id) {
				found = { ...payload, status: "active" }
			}
		}
		setInvoice(found)
		setLoaded(true)
	}, [address, id])

	if (!loaded) return null

	if (!invoice) {
		return (
			<div className={PAGE_CLASS}>
				<div className={`card iq-empty ${styles.notFound}`} role="alert">
					<h1>Factura no encontrada</h1>
					<p>
						Esta factura se creó en otro navegador y el enlace no incluye los
						datos del pago. Pide al comercio un enlace nuevo o escanea su código
						QR.
					</p>
					<Link to="/" className="iq-link">
						Volver al inicio
					</Link>
				</div>
			</div>
		)
	}

	return (
		<div className={PAGE_CLASS}>
			<InvoiceDetail invoice={invoice} onUpdated={setInvoice} />
		</div>
	)
}
