import { Link } from "react-router-dom"

/**
 * Home: the pitch in one screen (criterio "claridad del pitch"): what
 * InterstellaQ does, for whom, and why Stellar, plus the two entry points
 * of the demo flow.
 */
export default function Home() {
	return (
		<div className="iq-home">
			<section className="iq-hero">
				<p className="iq-hero__tag">Pagos abiertos sin fronteras</p>
				<h1>
					Cobra con QR en Stellar, sin custodiar el dinero de tus clientes
				</h1>
				<p className="iq-hero__lead">
					InterstellaQ permite a un comercio publicar una factura con monto fijo
					y expiración. El cliente escanea, revisa los datos en su wallet y
					autoriza el pago. La liquidación se verifica en Testnet contra la
					transacción real, con evidencia pública en stellar.expert.
				</p>
				<div className="iq-hero__actions">
					<Link to="/comercio" className="iq-btn">
						Crear una factura
					</Link>
					<a
						href="https://stellar.expert/testnet"
						target="_blank"
						rel="noreferrer"
						className="iq-btn iq-btn--ghost"
					>
						Ver la red en stellar.expert
					</a>
				</div>
				<p className="iq-muted">
					Demo sobre Stellar Testnet. Ninguna clave privada pasa por la
					aplicación.
				</p>
			</section>

			<section className="iq-grid">
				<div className="card">
					<h2>El problema</h2>
					<p>
						Los pagos transfronterizos para comercios siguen siendo lentos,
						costosos y difíciles de integrar. Cada transferencia pierde tiempo,
						pierde dinero y pierde contexto.
					</p>
				</div>
				<div className="card">
					<h2>La solución</h2>
					<p>
						Una solicitud de pago Stellar nativa: factura pública con referencia
						única, QR con los datos completos y liquidación verificada on-chain.
						El comercio nunca toca los fondos del cliente.
					</p>
				</div>
				<div className="card">
					<h2>Por qué Stellar</h2>
					<p>
						La red liquida transacciones en segundos por una fracción de
						centavo, con operaciones nativas, memos para correlación y wallets
						compatibles con SEP-7.
					</p>
				</div>
			</section>

			<section className="card iq-steps">
				<h2>Cómo funciona</h2>
				<ol>
					<li>
						El comercio conecta su cuenta, se registra con una firma en Testnet
						y crea una factura con monto y expiración.
					</li>
					<li>
						Comparte el código QR. El cliente revisa destinatario, monto,
						referencia y expiración antes de autorizar.
					</li>
					<li>
						La wallet del cliente firma el pago. InterstellaQ verifica la
						transacción en Horizon y marca la factura como liquidada con su
						evidencia.
					</li>
				</ol>
				<Link to="/comercio" className="iq-btn">
					Abrir panel del comercio
				</Link>
			</section>
		</div>
	)
}
