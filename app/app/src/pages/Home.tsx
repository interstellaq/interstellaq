import { Link } from "react-router-dom"
import { HeroVisual } from "../components/landing/HeroVisual"
import { ProductPreview } from "../components/landing/ProductPreview"
import styles from "./Home.module.css"

const STEPS = [
	{
		title: "Crea la solicitud",
		body: "Conecta tu wallet, registra el comercio con una firma en Testnet y fija el monto en XLM y el vencimiento.",
	},
	{
		title: "Compártela por QR",
		body: "El cliente abre el enlace, revisa destinatario, monto y referencia, y autoriza el pago desde su wallet.",
	},
	{
		title: "Verifica la liquidación",
		body: "InterstellaQ consulta Horizon y marca la factura como liquidada, con enlace a la transacción en stellar.expert.",
	},
]

const FEATURES = [
	{
		title: "Sin custodia",
		body: "El pago va de la wallet del cliente a la cuenta del comercio. La aplicación no guarda claves privadas ni fondos.",
	},
	{
		title: "Verificación estricta",
		body: "Solo liquida un pago nativo en XLM con la referencia, el destinatario y el monto exactos, confirmado antes del vencimiento.",
	},
	{
		title: "Evidencia pública",
		body: "Cada registro de comercio y cada factura liquidada enlazan su transacción en el explorador de Testnet.",
	},
]

const SCOPE = [
	"Funciona sobre Stellar Testnet con XLM de prueba, sin valor real.",
	"Solo XLM nativo. Los activos emitidos quedan fuera de esta versión.",
	"Las facturas se guardan en el navegador del comercio, sin backend.",
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
					{STEPS.map((step) => (
						<li key={step.title} className={styles.panel}>
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
				<ul className={styles.features}>
					{FEATURES.map((feature) => (
						<li key={feature.title} className={styles.panel}>
							<h3>{feature.title}</h3>
							<p>{feature.body}</p>
						</li>
					))}
				</ul>
			</section>

			<section
				className={`${styles.section} ${styles.scope}`}
				aria-labelledby="landing-scope"
			>
				<h2 id="landing-scope" className={styles.sectionTitle}>
					Alcance de esta versión
				</h2>
				<ul className={styles.scopeList}>
					{SCOPE.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
			</section>
		</div>
	)
}
