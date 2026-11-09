import { useId } from "react"
import { type Invoice } from "../domain/invoice"
import { dailyVerifiedReceipts, formatXlm } from "../domain/summary"
import styles from "./ReceiptsChart.module.css"

interface ReceiptsChartProps {
	invoices: Invoice[]
	/** Current time from the parent's display clock (epoch milliseconds). */
	now: number
}

const DAYS = 14
const WIDTH = 280
const HEIGHT = 96
const SLOT = WIDTH / DAYS
const BAR = SLOT * 0.62

const dayLabel = (epochMs: number) =>
	new Date(epochMs).toLocaleDateString("es-419", {
		day: "numeric",
		month: "short",
	})

const receiptsLabel = (count: number) =>
	count === 1 ? "1 pago confirmado" : `${count} pagos confirmados`

/**
 * Confirmed XLM receipts per day for the last two weeks, drawn as plain
 * SVG. Data comes from the invoices already in memory and the same
 * verified-settlement rule as the summary; it never queries Horizon.
 */
export function ReceiptsChart({ invoices, now }: ReceiptsChartProps) {
	const titleId = useId()
	// useId() may contain ":" or "«»", which break url(#…) references.
	const gradientId = `iq-receipts-${useId().replace(/[^\w-]/g, "")}`
	const days = dailyVerifiedReceipts(invoices, now, DAYS)
	const total = days.reduce((sum, day) => sum + day.stroops, 0n)
	const count = days.reduce((sum, day) => sum + day.count, 0)
	const max = days.reduce(
		(top, day) => (day.stroops > top ? day.stroops : top),
		0n,
	)
	const best = days.find((day) => day.stroops === max && max > 0n)
	const first = days[0]
	const last = days[days.length - 1]

	return (
		<section className={styles.chart} aria-labelledby={titleId}>
			<div className={styles.head}>
				<div>
					<h2 id={titleId} className={styles.kicker}>
						Pagos confirmados · últimos {DAYS} días
					</h2>
					<p className={styles.total}>
						{formatXlm(total)} <span>XLM</span>
					</p>
				</div>
				<p className={styles.meta}>
					{receiptsLabel(count)}
					<br />
					por día de verificación en Horizon
				</p>
			</div>

			{count === 0 ? (
				<div className={styles.empty}>
					<p>Aún no hay pagos confirmados en los últimos {DAYS} días.</p>
					<p>
						Cuando Horizon confirme el pago de una factura, aparecerá aquí con
						su monto exacto.
					</p>
				</div>
			) : (
				<>
					<svg
						className={styles.svg}
						viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
						preserveAspectRatio="none"
						role="img"
						aria-label={`Total confirmado en ${DAYS} días: ${formatXlm(total)} XLM${
							best
								? `. Día con más ingresos: ${dayLabel(best.dayStart)}, ${formatXlm(best.stroops)} XLM`
								: ""
						}.`}
					>
						<defs>
							<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="#33c9ef" />
								<stop offset="100%" stopColor="#00bceb" stopOpacity="0.55" />
							</linearGradient>
						</defs>
						{days.map((day, index) => {
							// Bar height is a display ratio only; totals stay exact.
							const ratio =
								max > 0n ? Number((day.stroops * 1000n) / max) / 1000 : 0
							const height =
								day.stroops > 0n ? Math.max(3, ratio * (HEIGHT - 4)) : 1.5
							return (
								<rect
									key={day.dayStart}
									x={index * SLOT + (SLOT - BAR) / 2}
									y={HEIGHT - height}
									width={BAR}
									height={height}
									className={day.stroops > 0n ? styles.bar : styles.barEmpty}
									fill={day.stroops > 0n ? `url(#${gradientId})` : undefined}
								>
									<title>
										{`${dayLabel(day.dayStart)}: ${formatXlm(day.stroops)} XLM (${receiptsLabel(day.count)})`}
									</title>
								</rect>
							)
						})}
					</svg>
					<div className={styles.axis} aria-hidden="true">
						<span>{first && dayLabel(first.dayStart)}</span>
						<span>{last && "Hoy"}</span>
					</div>
				</>
			)}
		</section>
	)
}
