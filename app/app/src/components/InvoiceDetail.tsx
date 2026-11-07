import { shortAddress } from "@stellar-scaffold/app-lib"
import { useEffect, useState } from "react"
import { derivedStatus, remainingMs, type Invoice } from "../domain/invoice"
import { useNotification } from "../hooks/useNotification"
import {
	MONITOR_INTERVAL_MS,
	useSettlementMonitor,
} from "../hooks/useSettlementMonitor"
import { buildInvoiceUrl, buildSep7PayUri } from "../lib/handoff"
import { stellarExpertTxUrl } from "../lib/stellar"
import { verifyAndUpdate } from "../lib/verify"
import { PayPanel } from "./PayPanel"
import { QrDisplay } from "./QrDisplay"
import { StatusBadge } from "./StatusBadge"

interface InvoiceDetailProps {
	invoice: Invoice
	onUpdated: (invoice: Invoice) => void
}

function formatRemaining(ms: number): string {
	const totalSeconds = Math.ceil(ms / 1000)
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const seconds = totalSeconds % 60
	if (hours > 0) return `${hours} h ${minutes} min`
	if (minutes > 0) return `${minutes} min ${seconds} s`
	return `${seconds} s`
}

function formatDate(epochMs: number): string {
	return new Date(epochMs).toLocaleString("es-419", {
		dateStyle: "medium",
		timeStyle: "short",
	})
}

/**
 * The reviewed payment request (FR-03, FR-04): every field the customer
 * must see before authorizing, the QR payload with its text equivalent,
 * settlement verification with public evidence, and the SEP-7 handoff.
 */
export function InvoiceDetail({ invoice, onUpdated }: InvoiceDetailProps) {
	const { addNotification } = useNotification()
	const [now, setNow] = useState(() => Date.now())
	const [verifying, setVerifying] = useState(false)
	const monitoring = useSettlementMonitor([invoice], (list) => {
		const updated = list.find((item) => item.id === invoice.id)
		if (updated) onUpdated(updated)
	})

	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(timer)
	}, [])

	const status = derivedStatus(invoice, now)
	const qrValue = buildInvoiceUrl(invoice)

	const verify = async () => {
		setVerifying(true)
		try {
			const outcome = await verifyAndUpdate(invoice)
			if (outcome.kind === "settled") {
				onUpdated(outcome.invoice)
				addNotification("Liquidación confirmada en Testnet.", "success")
				return
			}
			if (outcome.result.settled) return
			switch (outcome.result.reason) {
				case "expired":
					addNotification("La factura ya expiró.", "warning")
					break
				case "network_error":
					addNotification(
						"No se pudo consultar Testnet. Intenta de nuevo.",
						"error",
					)
					break
				default:
					addNotification(
						"Todavía no hay un pago coincidente con esta factura.",
						"primary",
					)
			}
		} finally {
			setVerifying(false)
		}
	}

	const openSep7 = () => {
		addNotification(
			"Solicitando el pago a tu wallet compatible con SEP-7.",
			"primary",
		)
		window.location.href = buildSep7PayUri(invoice)
	}

	return (
		<article className="iq-detail">
			<header className="iq-detail__header card">
				<div>
					<p className="iq-detail__amount">
						{invoice.amount} <span>{invoice.asset}</span>
					</p>
					<p className="iq-muted">{invoice.note ?? "Sin concepto"}</p>
				</div>
				<StatusBadge status={status} />
			</header>

			<div className="iq-detail__grid">
				<section className="card">
					<h2>Datos del pago</h2>
					<dl className="iq-details">
						<dt>Red</dt>
						<dd>Stellar Testnet</dd>
						<dt>Destinatario</dt>
						<dd>
							{invoice.recipientName ?? "Comercio"}{" "}
							<code>{shortAddress(invoice.recipient)}</code>
						</dd>
						<dt>Referencia (memo)</dt>
						<dd>
							<code>{invoice.reference}</code>
						</dd>
						<dt>Monto</dt>
						<dd>{invoice.amount} XLM</dd>
						<dt>Creada</dt>
						<dd>{formatDate(invoice.createdAt)}</dd>
						<dt>Expira</dt>
						<dd>
							{formatDate(invoice.expiresAt)}
							{status !== "settled" && status !== "expired" && (
								<span className="iq-countdown">
									{" "}
									(restantes: {formatRemaining(remainingMs(invoice, now))})
								</span>
							)}
						</dd>
					</dl>
					<div className="iq-detail__actions">
						<button
							type="button"
							onClick={() => void verify()}
							disabled={verifying || status === "expired"}
						>
							{verifying ? "Verificando..." : "Verificar estado"}
						</button>
						{status === "active" && (
							<button type="button" onClick={openSep7}>
								Abrir en wallet SEP-7
							</button>
						)}
					</div>
					{monitoring && (
						<p className="iq-monitor">
							Monitoreo automático activo: Testnet se consulta cada{" "}
							{MONITOR_INTERVAL_MS / 1000} segundos.
						</p>
					)}
					{invoice.txHash && (
						<p className="iq-evidence">
							Liquidada con evidencia en{" "}
							<a
								href={stellarExpertTxUrl(invoice.txHash)}
								target="_blank"
								rel="noreferrer"
							>
								stellar.expert
							</a>
							{invoice.verifiedAt ? ` (${formatDate(invoice.verifiedAt)})` : ""}
						</p>
					)}
					{status === "verification_failed" && (
						<p className="iq-warning">
							El pago se envió pero la verificación aún no lo confirma. El
							monitoreo automático lo confirmará en unos segundos, o pulsa
							Verificar estado.
						</p>
					)}
					{status === "expired" && (
						<p className="iq-warning">
							Esta factura expiró y ya no puede pagarse.
						</p>
					)}
				</section>

				<section className="card">
					<h2>Código de pago</h2>
					<QrDisplay
						value={qrValue}
						caption="Escanea para abrir esta factura en otro dispositivo"
					/>
				</section>
			</div>

			{status === "active" && (
				<PayPanel invoice={invoice} onUpdated={onUpdated} />
			)}
		</article>
	)
}
