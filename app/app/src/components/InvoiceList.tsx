import { useState } from "react"
import { Link } from "react-router-dom"
import {
	derivedStatus,
	remainingMs,
	type DerivedStatus,
	type Invoice,
} from "../domain/invoice"
import {
	countByFilter,
	filterInvoices,
	INVOICE_FILTERS,
	isVerifiedSettlement,
	type InvoiceFilter,
} from "../domain/summary"
import { stellarExpertTxUrl } from "../lib/stellar"
import styles from "./InvoiceList.module.css"
import { StatusBadge } from "./StatusBadge"

interface InvoiceListProps {
	invoices: Invoice[]
	/** Current time from the parent's display clock (epoch milliseconds). */
	now: number
}

const FILTER_LABELS: Record<InvoiceFilter, string> = {
	all: "Todas",
	active: "Activas",
	verification_failed: "Verificación fallida",
	settled: "Liquidadas",
	expired: "Expiradas",
}

const EMPTY_FILTER_LABELS: Record<Exclude<InvoiceFilter, "all">, string> = {
	active: "No hay facturas activas.",
	verification_failed: "No hay facturas con verificación fallida.",
	settled: "Todavía no hay facturas liquidadas.",
	expired: "No hay facturas expiradas.",
}

/** Status glyph paths on a 16px grid, drawn with currentColor. */
const STATUS_ICONS: Record<DerivedStatus, string> = {
	settled: "M3.5 8.5l3 3 6-7",
	active: "M8 4.5V8l2.5 1.5M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0z",
	verification_failed: "M8 4.5v4M8 11.2v.3",
	expired: "M4.5 8h7",
}

function formatShortDate(epochMs: number): string {
	return new Date(epochMs).toLocaleString("es-419", {
		day: "numeric",
		month: "short",
		hour: "numeric",
		minute: "2-digit",
	})
}

function formatRemaining(ms: number): string {
	const totalSeconds = Math.ceil(ms / 1000)
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	if (hours > 0) return `${hours} h ${minutes} min`
	if (minutes > 0) return `${minutes} min`
	return `${totalSeconds} s`
}

function timing(invoice: Invoice, status: DerivedStatus, now: number): string {
	if (status === "settled") {
		return invoice.verifiedAt
			? `Confirmada ${formatShortDate(invoice.verifiedAt)}`
			: "Liquidada"
	}
	if (status === "expired")
		return `Expiró ${formatShortDate(invoice.expiresAt)}`
	return `Vence en ${formatRemaining(remainingMs(invoice, now))}`
}

const shortHash = (hash: string) => `${hash.slice(0, 6)}…${hash.slice(-4)}`

/**
 * Recent activity: the merchant's invoices with live status (FR-06).
 * Status, filters and countdowns are derived from `now` on every render,
 * so an invoice past its window reads as expired without reloading. Purely
 * presentational: it never changes stored invoices or triggers
 * verification. Evidence links appear only for verified settlements.
 */
export function InvoiceList({ invoices, now }: InvoiceListProps) {
	const [filter, setFilter] = useState<InvoiceFilter>("all")

	if (invoices.length === 0) {
		return (
			<section className={styles.empty} aria-labelledby="iq-invoices-title">
				<span className={styles.emptyIcon} aria-hidden="true">
					<svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
						<path
							d="M7 3h10a1 1 0 0 1 1 1v16l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1zm2 5h6m-6 4h6"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.6"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</span>
				<h2 id="iq-invoices-title">Aún no hay actividad</h2>
				<p>
					Crea la primera factura para recibir un pago. Cada factura tiene un
					enlace y un código QR que puedes compartir con tu cliente.
				</p>
			</section>
		)
	}

	const counts = countByFilter(invoices, now)
	const visible = filterInvoices(invoices, filter, now)

	return (
		<section className={styles.list} aria-labelledby="iq-invoices-title">
			<div className={styles.head}>
				<div>
					<h2 id="iq-invoices-title">Actividad reciente</h2>
					<p className={styles.subtitle}>
						Facturas de este navegador, la más reciente primero.
					</p>
				</div>
				<div
					className={styles.filters}
					role="group"
					aria-label="Filtrar por estado"
				>
					{INVOICE_FILTERS.map((option) => (
						<button
							key={option}
							type="button"
							className={styles.filter}
							aria-pressed={filter === option}
							onClick={() => setFilter(option)}
						>
							{FILTER_LABELS[option]}
							<span className={styles.count}>{counts[option]}</span>
						</button>
					))}
				</div>
			</div>

			{visible.length === 0 ? (
				<div className={styles.filterEmpty}>
					<p>{filter !== "all" && EMPTY_FILTER_LABELS[filter]}</p>
					<button type="button" onClick={() => setFilter("all")}>
						Ver todas las facturas
					</button>
				</div>
			) : (
				<ul className={styles.items}>
					{visible.map((invoice) => {
						const status = derivedStatus(invoice, now)
						const evidence =
							isVerifiedSettlement(invoice) && invoice.txHash
								? invoice.txHash
								: null
						return (
							<li
								key={invoice.id}
								className={`${styles.item} ${styles[status] ?? ""}`}
							>
								<span className={styles.marker} aria-hidden="true">
									<svg viewBox="0 0 16 16" width="16" height="16">
										<path
											d={STATUS_ICONS[status]}
											fill="none"
											stroke="currentColor"
											strokeWidth="1.8"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</span>
								<div className={styles.main}>
									<p className={styles.title}>
										{invoice.note ?? "Sin concepto"}
									</p>
									<p className={styles.sub}>
										<code>{invoice.reference}</code>
										<span>{timing(invoice, status, now)}</span>
									</p>
								</div>
								<div className={styles.figure}>
									<p className={styles.amount}>
										{invoice.amount} <span>{invoice.asset}</span>
									</p>
									<StatusBadge status={status} />
								</div>
								<div className={styles.actions}>
									{evidence && (
										<a
											href={stellarExpertTxUrl(evidence)}
											target="_blank"
											rel="noreferrer"
											className={styles.evidence}
											aria-label={`Ver la transacción ${evidence} en stellar.expert (se abre en otra pestaña)`}
										>
											<span className={styles.evidenceLabel}>Evidencia</span>
											<code>{shortHash(evidence)}</code>
											<svg
												viewBox="0 0 16 16"
												width="12"
												height="12"
												aria-hidden="true"
											>
												<path
													d="M6 3h7v7M13 3L6.5 9.5M11 9.5V13H3V5h3.5"
													fill="none"
													stroke="currentColor"
													strokeWidth="1.6"
													strokeLinecap="round"
													strokeLinejoin="round"
												/>
											</svg>
										</a>
									)}
									<Link
										to={`/factura/${invoice.recipient}/${invoice.id}`}
										className={styles.action}
									>
										Ver factura y QR
									</Link>
								</div>
							</li>
						)
					})}
				</ul>
			)}
		</section>
	)
}
