import { Link } from "react-router-dom"
import { HeroVisual } from "../components/landing/HeroVisual"
import { ProductPreview } from "../components/landing/ProductPreview"
import { TrustIcon, type TrustIconName } from "../components/landing/TrustIcon"
import styles from "./Home.module.css"

const STEPS = [
	{
		title: "Crea la solicitud",
		body: "Conecta tu wallet y define el monto en XLM y el vencimiento.",
	},
	{
		title: "Comparte el QR",
		body: "El cliente revisa los datos del pago y lo autoriza desde su wallet.",
	},
	{
		title: "Verifica el pago",
		body: "InterstellaQ lo confirma en Horizon y marca la factura como liquidada.",
	},
]

// Each claim maps to the code: buildPaymentTransaction (payment straight to
// invoice.recipient, signed by the payer's wallet), the Horizon scan, and
// evaluateTransaction (memo, recipient, exact amount, expiry).
const TRUST: { icon: TrustIconName; title: string; body: string }[] = [
	{
		icon: "direct",
		title: "Sin custodia",
		body: "El pago va directo de la wallet del cliente a la cuenta Stellar del comercio.",
	},
	{
		icon: "network",
		title: "Verificación en Horizon",
		body: "La liquidación se comprueba con las transacciones registradas en la red.",
	},
	{
		icon: "checklist",
		title: "Control de la solicitud",
		body: "Memo, destinatario, monto y plazo deben coincidir para darlo por verificado.",
	},
]

const SPECS = [
	{ term: "Red", value: "Stellar Testnet" },
	{ term: "Activo", value: "XLM nativo" },
	{ term: "Facturas", value: "Guardadas en tu navegador" },
	{ term: "Arquitectura", value: "No custodial" },
]

/**
 * Landing: what InterstellaQ does and one entry point to the app. Styles
 * live in Home.module.css and the landing components so nothing here leaks
 * into the merchant panel or the invoice page.
 */
export default function Home() {
	return (
		<div className={styles.landing}>
			<section className={styles.hero} aria-labelledby="landing-title">
				<div className={styles.heroContent}>
					<p className={styles.eyebrow}>
						<span className={styles.eyebrowDot} aria-hidden="true" />
						Pagos no custodiales en Stellar Testnet
					</p>
					<h1 id="landing-title" className={styles.title}>
						Cobra con Stellar. <span>Verifica cada pago.</span>
					</h1>
					<p className={styles.lead}>
						Crea solicitudes de pago en XLM, compártelas por QR y verifica su
						liquidación sin custodiar fondos.
					</p>
					<div className={styles.actions}>
						<Link to="/comercio" className={styles.cta}>
							Abrir aplicación
							<svg
								viewBox="0 0 16 16"
								width="16"
								height="16"
								aria-hidden="true"
								focusable="false"
							>
								<path
									d="M3 8h10M9 4l4 4-4 4"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</Link>
					</div>
					<p className={styles.note}>
						Demo sobre Stellar Testnet: no mueve dinero real. InterstellaQ nunca
						te pide claves privadas; tu wallet firma cada transacción.
					</p>
				</div>

				<HeroVisual label="Vista previa del producto">
					<ProductPreview />
				</HeroVisual>
			</section>

			<section className={styles.section} aria-labelledby="landing-steps">
				<h2 id="landing-steps" className={styles.sectionTitle}>
					Cómo funciona
				</h2>
				<ol className={styles.steps}>
					{STEPS.map((step, index) => (
						<li key={step.title} className={styles.step}>
							<span className={styles.stepNumber} aria-hidden="true">
								{index + 1}
							</span>
							<h3>{step.title}</h3>
							<p>{step.body}</p>
						</li>
					))}
				</ol>
			</section>

			<section className={styles.section} aria-labelledby="landing-features">
				<h2 id="landing-features" className={styles.sectionTitle}>
					Confianza verificable
				</h2>
				<ul className={styles.trust}>
					{TRUST.map((item) => (
						<li key={item.title} className={styles.trustItem}>
							<span className={styles.trustIcon}>
								<TrustIcon name={item.icon} />
							</span>
							<h3>{item.title}</h3>
							<p>{item.body}</p>
						</li>
					))}
				</ul>
			</section>

			<section className={styles.scope} aria-labelledby="landing-scope">
				<div className={styles.scopeIntro}>
					<h2 id="landing-scope" className={styles.sectionTitle}>
						Una demo completa sobre Testnet
					</h2>
					<p>
						Recorre el flujo de cobro de principio a fin con XLM de prueba, sin
						mover dinero real.
					</p>
				</div>
				<dl className={styles.specs}>
					{SPECS.map((spec) => (
						<div key={spec.term} className={styles.spec}>
							<dt>{spec.term}</dt>
							<dd>{spec.value}</dd>
						</div>
					))}
				</dl>
			</section>
		</div>
	)
}
