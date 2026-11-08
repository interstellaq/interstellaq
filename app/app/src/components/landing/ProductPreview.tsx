import { QRCodeSVG } from "qrcode.react"
import styles from "./ProductPreview.module.css"

/**
 * The QR in the preview encodes plain text, not a payment link: scanning
 * the landing must never start a payment.
 */
const PREVIEW_QR_TEXT =
	"InterstellaQ: ejemplo ilustrativo. Esto no es una solicitud de pago."

const CHECKS = [
	"Memo igual a la referencia",
	"Destinatario correcto",
	"Monto exacto en XLM",
	"Confirmado antes del vencimiento",
]

function CheckIcon() {
	return (
		<svg
			className={styles.checkIcon}
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
 * Static product view for the hero: a settled payment request with the
 * checks InterstellaQ runs against Horizon. Fictitious data, labelled as
 * such, and no interactive elements, so it can't be mistaken for a real
 * invoice or take keyboard focus.
 */
export function ProductPreview() {
	return (
		<figure className={styles.preview}>
			<div className={styles.card}>
				<div className={styles.header}>
					<span className={styles.merchant}>Café Aurora</span>
					<span className={styles.network}>
						<span className={styles.networkDot} aria-hidden="true" />
						Testnet
					</span>
				</div>

				<p className={styles.kicker}>Solicitud de pago</p>
				<p className={styles.amount}>
					25.00 <span className={styles.asset}>XLM</span>
				</p>

				<dl className={styles.details}>
					<div className={styles.detailRow}>
						<dt>Referencia (memo)</dt>
						<dd className={styles.mono}>ISQK7M2QP4XRA</dd>
					</div>
					<div className={styles.detailRow}>
						<dt>Vencimiento</dt>
						<dd>15 minutos</dd>
					</div>
				</dl>

				<div className={styles.verify}>
					<div className={styles.qr} aria-hidden="true">
						<QRCodeSVG
							value={PREVIEW_QR_TEXT}
							size={104}
							bgColor="#f7f9fc"
							fgColor="#090b16"
							level="L"
							marginSize={2}
						/>
					</div>
					<ul className={styles.checks}>
						{CHECKS.map((check) => (
							<li key={check}>
								<CheckIcon />
								{check}
							</li>
						))}
					</ul>
				</div>

				<p className={styles.status}>
					<CheckIcon />
					<span>
						<strong>Liquidada</strong> · verificada en Horizon
					</span>
				</p>
			</div>
			<figcaption className={styles.caption}>
				Ejemplo ilustrativo con datos ficticios.
			</figcaption>
		</figure>
	)
}
