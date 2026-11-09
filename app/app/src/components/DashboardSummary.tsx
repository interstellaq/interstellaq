import { formatXlm, type InvoiceSummary } from "../domain/summary"
import styles from "./DashboardSummary.module.css"

interface DashboardSummaryProps {
	summary: InvoiceSummary
}

const invoicesLabel = (count: number) =>
	count === 1 ? "1 factura" : `${count} facturas`

/**
 * Dashboard metrics. Issued and verified amounts are separate tiles on
 * purpose: issuing a request is not collecting it, and only settlements
 * confirmed against Horizon count as verified (domain/summary.ts).
 */
export function DashboardSummary({ summary }: DashboardSummaryProps) {
	const { issued, verified, open, awaitingConfirmation, expired } = summary

	return (
		<section className={styles.summary} aria-label="Resumen de facturas">
			<dl className={styles.tiles}>
				<div className={styles.tile}>
					<dt>Emitido</dt>
					<dd className={styles.value}>
						<span className={styles.number}>{formatXlm(issued.stroops)}</span>{" "}
						<span className={styles.unit}>XLM</span>
					</dd>
					<dd className={styles.meta}>{invoicesLabel(issued.count)}</dd>
				</div>

				<div className={`${styles.tile} ${styles.verified}`}>
					<dt>Verificado en Horizon</dt>
					<dd className={styles.value}>
						<span className={styles.number}>{formatXlm(verified.stroops)}</span>{" "}
						<span className={styles.unit}>XLM</span>
					</dd>
					<dd className={styles.meta}>
						{verified.count === 1
							? "1 liquidación confirmada"
							: `${verified.count} liquidaciones confirmadas`}
					</dd>
				</div>

				<div className={styles.tile}>
					<dt>Por cobrar</dt>
					<dd className={styles.value}>
						<span className={styles.number}>{formatXlm(open.stroops)}</span>{" "}
						<span className={styles.unit}>XLM</span>
					</dd>
					<dd className={styles.meta}>
						{awaitingConfirmation.count > 0
							? `${invoicesLabel(open.count)} · ${awaitingConfirmation.count} sin confirmar`
							: invoicesLabel(open.count)}
					</dd>
				</div>

				<div className={styles.tile}>
					<dt>Expirado sin pago</dt>
					<dd className={styles.value}>
						<span className={styles.number}>{formatXlm(expired.stroops)}</span>{" "}
						<span className={styles.unit}>XLM</span>
					</dd>
					<dd className={styles.meta}>{invoicesLabel(expired.count)}</dd>
				</div>
			</dl>

			{summary.unverifiedSettled.count > 0 && (
				<p className={styles.gap} role="note">
					{summary.unverifiedSettled.count === 1
						? "1 factura figura como liquidada en este navegador sin evidencia de verificación; no se suma a lo verificado."
						: `${summary.unverifiedSettled.count} facturas figuran como liquidadas en este navegador sin evidencia de verificación; no se suman a lo verificado.`}
				</p>
			)}
		</section>
	)
}
