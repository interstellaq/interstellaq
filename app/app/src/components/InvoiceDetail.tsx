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
 * settlement verification with public evidence, and the experimental SEP-7
 * handoff. SEP-7 stays collapsed and marked experimental until a wallet
 * passes the Testnet interoperability check (docs/TESTNET-VALIDATION.md);
 * the Wallets Kit payment below is the recommended path.
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
	const sep7Available =
		status === "active" && buildSep7PayUri(invoice, now) !== null

	const verify = async () => {
		setVerifying(true)
		try {
			const outcome = await verifyAndUpdate(invoice)
			if (outcome.kind === "settled") {
				onUpdated(outcome.invoice)
				addNotification("Liquidación confirmada en Testnet.", "success")
				return
			}
			if (outcome.kind === "not_persisted") {
				addNotification(
					"El pago está confirmado en Testnet, pero no se pudo guardar la liquidación en este navegador. Libera espacio de almacenamiento e intenta de nuevo.",
					"error",
				)
				return
			}
			if (outcome.result.settled) return
			switch (outcome.result.reason) {
				case "expired":
					addNotification(
						"La factura expiró sin un pago confirmado antes del vencimiento.",
						"warning",
					)
					break
				case "incomplete":
					addNotification(
						"No se encontró el pago en las transacciones recientes revisadas. La búsqueda en Testnet es acotada y no cubre todo el historial de la cuenta.",
						"warning",
					)
					break
				case "invalid_invoice":
					addNotification(
						"Los datos de esta factura no son válidos y no pueden verificarse.",
						"error",
					)
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
		const uri = buildSep7PayUri(invoice)
		if (uri === null) {
			addNotification(
				"La entrega SEP-7 ya no está disponible para esta factura. Paga con la wallet conectada.",
				"warning",
			)
			return
		}
		addNotification(
			"Solicitando el pago a tu wallet compatible con SEP-7.",
			"primary",
		)
		window.location.href = uri
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
							<code>{invoice.recipient}</code>
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
					<p className="iq-warning">
						Esta aplicación valida la estructura de la solicitud, pero un enlace
						o código QR compartido sin firma no acredita por sí solo quién lo
						creó.
					</p>
					<div className="iq-detail__actions">
						<button
							type="button"
							onClick={() => void verify()}
							disabled={verifying}
						>
							{verifying ? "Verificando..." : "Verificar estado"}
						</button>
					</div>
					{sep7Available && (
						<details className="iq-sep7">
							<summary>Opción experimental: abrir en wallet SEP-7</summary>
							<p className="iq-warning">
								No verificado con ninguna wallet. Se recomienda pagar con la
								wallet conectada.
							</p>
							<ul className="iq-warning">
								<li>
									Antes de firmar, comprueba que tu wallet muestra Stellar
									Testnet. Si muestra la red pública (Mainnet) o no muestra la
									red, no firmes.
								</li>
								<li>
									El memo debe ser exactamente <code>{invoice.reference}</code>{" "}
									y el pago, un envío directo de XLM: un path payment no liquida
									la factura.
								</li>
								<li>
									El pago debe confirmarse antes de{" "}
									{formatDate(invoice.expiresAt)}; este enlace no impone ese
									límite.
								</li>
							</ul>
							<button type="button" onClick={openSep7}>
								Abrir en wallet SEP-7 (experimental)
							</button>
						</details>
					)}
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
							Esta factura expiró y ya no puede pagarse. Si el pago se confirmó
							en Testnet antes del vencimiento, Verificar estado aún puede
							liquidarla.
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
