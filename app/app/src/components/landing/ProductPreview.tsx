import { QRCodeSVG } from "qrcode.react"
import styles from "./ProductPreview.module.css"

/**
 * The QR in the preview encodes plain text, not a payment link: scanning
 * the landing must never start a payment.
 */
const PREVIEW_QR_TEXT =
	"InterstellaQ: ejemplo ilustrativo. Esto no es una solicitud de pago."

const STAGES = ["Solicitud creada", "QR compartido", "Pago verificado"]

const CHECKS = [
	"Memo igual a la referencia",
	"Destinatario correcto",
	"Monto exacto en XLM",
	"Antes del vencimiento",
]

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 16 16"
			width="16"
			height="16"
			aria-hidden="true"
			focusable="false"
		>
			<path
				d="M3.5 8.5l3 3 6-7"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}

/**
 * Static product view for the hero: one payment request through its three
 * stages (created, shared by QR, verified), ending on the checks
 * InterstellaQ runs against Horizon. Fictitious data, labelled as such, and
 * no interactive elements, so it can't be mistaken for a real invoice or
 * take keyboard focus.
 */
export function ProductPreview() {
	const last = STAGES.length - 1

	return (
		<figure className={styles.preview}>
			<div className={styles.card}>
				<div className={styles.header}>
					<span className={styles.merchant}>Comercio de ejemplo</span>
					<span className={styles.network}>
						<span className={styles.networkDot} aria-hidden="true" />
						Testnet
					</span>
				</div>

				<ol className={styles.stages} aria-label="Etapas del ejemplo">
					{STAGES.map((stage, index) => (
						<li
							key={stage}
							className={index === last ? styles.stageFinal : styles.stage}
						>
							<span className={styles.stageMarker} aria-hidden="true">
								{index === last ? <CheckIcon /> : index + 1}
							</span>
							<span className={styles.stageLabel}>{stage}</span>
						</li>
					))}
				</ol>

				<div className={styles.body}>
					<div className={styles.request}>
						<p className={styles.kicker}>Solicitud de pago</p>
						<p className={styles.amount}>
							25.00 <span className={styles.asset}>XLM</span>
						</p>
						<dl className={styles.details}>
							<div>
								<dt>Referencia (memo)</dt>
								<dd className={styles.mono}>ISQK7M2QP4XRA</dd>
							</div>
							<div>
								<dt>Vence en</dt>
								<dd>15 minutos</dd>
							</div>
						</dl>
					</div>
					<div className={styles.qrBlock} aria-hidden="true">
						<div className={styles.qr}>
							<QRCodeSVG
								value={PREVIEW_QR_TEXT}
								size={152}
								bgColor="#f7f9fc"
								fgColor="#090b16"
								level="L"
								marginSize={2}
							/>
						</div>
						<span className={styles.qrLabel}>QR de ejemplo</span>
					</div>
				</div>

				<div className={styles.verified}>
					<div className={styles.verifiedHead}>
						<span className={styles.verifiedIcon} aria-hidden="true">
							<CheckIcon />
						</span>
						<div>
							<p className={styles.verifiedTitle}>Pago verificado</p>
							<p className={styles.verifiedMeta}>
								{/* No-break spaces keep "Horizon · Testnet" on one line. */}
								Confirmado en {"Horizon · Testnet"}
							</p>
						</div>
					</div>
					<ul className={styles.checks}>
						{CHECKS.map((check) => (
							<li key={check}>
								<CheckIcon className={styles.checkIcon} />
								{check}
							</li>
						))}
					</ul>
				</div>
			</div>
			<figcaption className={styles.caption}>
				Ejemplo ilustrativo con datos ficticios, no una transacción real.
			</figcaption>
		</figure>
	)
}
