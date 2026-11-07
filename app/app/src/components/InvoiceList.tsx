import { Link } from "react-router-dom"
import { derivedStatus, type Invoice } from "../domain/invoice"
import { StatusBadge } from "./StatusBadge"

interface InvoiceListProps {
	invoices: Invoice[]
}

function formatDate(epochMs: number): string {
	return new Date(epochMs).toLocaleString("es-419", {
		dateStyle: "short",
		timeStyle: "short",
	})
}

/**
 * Merchant invoice history with live status (FR-06): expiry is evaluated
 * on render, so an invoice past its window always reads as expired.
 */
export function InvoiceList({ invoices }: InvoiceListProps) {
	if (invoices.length === 0) {
		return (
			<div className="card iq-empty">
				<p>Aún no hay facturas. Crea la primera para recibir un pago.</p>
			</div>
		)
	}

	return (
		<div className="card">
			<h2>Facturas</h2>
			<ul className="iq-invoice-list">
				{invoices.map((invoice) => {
					const status = derivedStatus(invoice)
					return (
						<li key={invoice.id} className="iq-invoice-list__item">
							<div className="iq-invoice-list__main">
								<strong>
									{invoice.amount} {invoice.asset}
								</strong>
								<span className="iq-muted">
									{invoice.note ?? "Sin concepto"}
								</span>
								<code>{invoice.reference}</code>
							</div>
							<div className="iq-invoice-list__side">
								<StatusBadge status={status} />
								<span className="iq-muted">
									Expira: {formatDate(invoice.expiresAt)}
								</span>
								<Link
									to={`/factura/${invoice.recipient}/${invoice.id}`}
									className="iq-link"
								>
									Ver factura
								</Link>
							</div>
						</li>
					)
				})}
			</ul>
		</div>
	)
}
