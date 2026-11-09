import { connectWallet, shortAddress } from "@stellar-scaffold/app-lib"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { DashboardSummary } from "../components/DashboardSummary"
import { InvoiceForm } from "../components/InvoiceForm"
import { InvoiceList } from "../components/InvoiceList"
import { MerchantRegister } from "../components/MerchantRegister"
import { ReceiptsChart } from "../components/ReceiptsChart"
import { type Invoice } from "../domain/invoice"
import { type MerchantProfile } from "../domain/merchant"
import { summarizeInvoices } from "../domain/summary"
import { useNow } from "../hooks/useNow"
import {
	MONITOR_INTERVAL_MS,
	useSettlementMonitor,
} from "../hooks/useSettlementMonitor"
import { useWallet } from "../hooks/useWallet"
import { loadInvoices, loadMerchant } from "../lib/persistence"
import { verifyRegistrationEvidence } from "../lib/registration"
import { canCreateInvoices } from "../lib/registrationGate"
import { stellarExpertTxUrl } from "../lib/stellar"
import theme from "../styles/product.module.css"
import styles from "./Merchant.module.css"

function formatDate(epochMs: number): string {
	return new Date(epochMs).toLocaleString("es-419", {
		dateStyle: "medium",
		timeStyle: "short",
	})
}

const PAGE_CLASS = `${theme.product} ${styles.page}`

const SETUP_STEPS = ["Conectar wallet", "Registrar comercio", "Crear facturas"]

function CheckIcon() {
	return (
		<svg
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

/** Onboarding progress in the ProductPreview stage style. */
function SetupSteps({ current }: { current: number }) {
	return (
		<ol className={styles.steps} aria-label="Pasos para empezar">
			{SETUP_STEPS.map((label, index) => {
				const state =
					index < current
						? styles.done
						: index === current
							? styles.current
							: ""
				return (
					<li
						key={label}
						className={`${styles.step} ${state}`}
						aria-current={index === current ? "step" : undefined}
					>
						<span className={styles.stepMarker} aria-hidden="true">
							{index < current ? <CheckIcon /> : index + 1}
						</span>
						<span className={styles.stepLabel}>{label}</span>
					</li>
				)
			})}
		</ol>
	)
}

/**
 * Placeholder in the shape of the registered dashboard, so the layout does
 * not jump when the wallet or the registration check resolves.
 */
function DashboardSkeleton({ message }: { message: string }) {
	return (
		<div className={PAGE_CLASS} aria-busy="true">
			<p className={styles.loadingMessage} role="status">
				<span className={styles.spinner} aria-hidden="true" />
				{message}
			</p>
			<div className={`${theme.panel} ${styles.skeletonHeader}`}>
				<span className={theme.skeleton} style={{ width: "8rem" }} />
				<span
					className={theme.skeleton}
					style={{ width: "min(16rem, 70%)", height: "2rem" }}
				/>
				<span className={theme.skeleton} style={{ width: "min(22rem, 90%)" }} />
			</div>
			<div className={styles.skeletonTiles} aria-hidden="true">
				{[0, 1, 2, 3].map((tile) => (
					<span key={tile} className={theme.skeleton} />
				))}
			</div>
			<div className={styles.workspace} aria-hidden="true">
				<span className={`${theme.skeleton} ${styles.skeletonBlock}`} />
				<span className={`${theme.skeleton} ${styles.skeletonBlock}`} />
			</div>
		</div>
	)
}

/**
 * Metrics, invoice form and history. Owns the display clock, so its
 * one-second re-renders stay inside this subtree: Merchant (which calls
 * useSettlementMonitor) never re-renders because of the clock, and the
 * monitor's lifecycle stays driven by invoice state alone. `aside` is an
 * element created by Merchant; the clock re-renders do not recreate it.
 */
function InvoiceOverview({
	invoices,
	aside,
}: {
	invoices: Invoice[]
	aside: ReactNode
}) {
	const now = useNow()
	// DOM order is the phone order (create first); wide screens place the
	// chart beside the form and the activity list across the full width.
	return (
		<div className={styles.overview}>
			<div className={styles.areaSummary}>
				<DashboardSummary summary={summarizeInvoices(invoices, now)} />
			</div>
			<div className={styles.areaForm}>{aside}</div>
			<div className={styles.areaChart}>
				<ReceiptsChart invoices={invoices} now={now} />
			</div>
			<div className={styles.areaActivity}>
				<InvoiceList invoices={invoices} now={now} />
			</div>
		</div>
	)
}

/**
 * Merchant dashboard: connect the receiving account, register it with an
 * on-chain proof (FR-01), create invoices (FR-02) and follow their status.
 */
export default function Merchant() {
	const { address, isPending } = useWallet()
	const [merchant, setMerchant] = useState<MerchantProfile | null>(null)
	const [invoices, setInvoices] = useState<Invoice[]>([])
	const [checkingRegistration, setCheckingRegistration] = useState(false)
	const [registrationError, setRegistrationError] = useState<string | null>(
		null,
	)
	const [registrationUnavailable, setRegistrationUnavailable] = useState(false)
	const [registrationRevision, setRegistrationRevision] = useState(0)
	const verificationRequest = useRef(0)
	const currentWalletAddress = useRef(address)
	currentWalletAddress.current = address
	const monitoring = useSettlementMonitor(invoices, setInvoices)
	const [lastCreatedId, setLastCreatedId] = useState<string | null>(null)

	useEffect(() => {
		let cancelled = false
		const request = ++verificationRequest.current
		if (!address) {
			setMerchant(null)
			setInvoices([])
			setCheckingRegistration(false)
			setRegistrationError(null)
			setRegistrationUnavailable(false)
			return
		}
		setInvoices(loadInvoices(address))
		const stored = loadMerchant(address)
		if (!stored) {
			setMerchant(null)
			setCheckingRegistration(false)
			setRegistrationError(null)
			setRegistrationUnavailable(false)
			return
		}
		setCheckingRegistration(true)
		setRegistrationError(null)
		void verifyRegistrationEvidence(address, stored.registrationTxHash).then(
			(result) => {
				if (
					cancelled ||
					request !== verificationRequest.current ||
					currentWalletAddress.current !== address
				)
					return
				setMerchant(result.kind === "invalid" ? null : stored)
				setRegistrationError(
					result.kind !== "invalid"
						? null
						: "No se pudo validar el registro guardado en Stellar Testnet. Registra el comercio nuevamente.",
				)
				setRegistrationUnavailable(result.kind === "unavailable")
				setCheckingRegistration(false)
			},
		)
		return () => {
			cancelled = true
		}
	}, [address, registrationRevision])

	const reload = () => {
		if (!address) return
		verificationRequest.current++
		setInvoices(loadInvoices(address))
		setRegistrationRevision((revision) => revision + 1)
	}

	const retryRegistrationVerification = () => {
		if (!address) return
		const stored = loadMerchant(address)
		if (!stored) return
		setCheckingRegistration(true)
		setRegistrationUnavailable(false)
		const request = ++verificationRequest.current
		void verifyRegistrationEvidence(address, stored.registrationTxHash).then(
			(result) => {
				if (
					request !== verificationRequest.current ||
					currentWalletAddress.current !== address
				)
					return
				setMerchant(result.kind === "invalid" ? null : stored)
				setRegistrationError(
					result.kind !== "invalid"
						? null
						: "No se pudo validar el registro guardado en Stellar Testnet. Registra el comercio nuevamente.",
				)
				setRegistrationUnavailable(result.kind === "unavailable")
				setCheckingRegistration(false)
			},
		)
	}

	if (isPending) {
		return <DashboardSkeleton message="Cargando wallet..." />
	}

	if (!address) {
		return (
			<div className={PAGE_CLASS}>
				<section className={`${theme.panel} ${styles.onboarding}`}>
					<p className={styles.kicker}>
						<span className={styles.kickerDot} aria-hidden="true" />
						Stellar Testnet
					</p>
					<h1>Panel del comercio</h1>
					<p className={styles.lead}>
						Conecta la cuenta Stellar que va a recibir los pagos. InterstellaQ
						nunca pide tus claves: la wallet firma cada transacción.
					</p>
					<SetupSteps current={0} />
					<button
						type="button"
						className={theme.primary}
						onClick={() => void connectWallet()}
					>
						Conectar wallet
					</button>
				</section>
			</div>
		)
	}

	if (checkingRegistration) {
		return (
			<DashboardSkeleton message="Validando registro del comercio en Testnet..." />
		)
	}

	if (!merchant) {
		return (
			<div className={`${PAGE_CLASS} ${styles.registerLayout}`}>
				<section className={`${theme.panel} ${styles.onboarding}`}>
					<p className={styles.kicker}>
						<span className={styles.kickerDot} aria-hidden="true" />
						Stellar Testnet
					</p>
					<h1>Panel del comercio</h1>
					<p className={styles.lead}>
						Cuenta conectada: <code>{shortAddress(address)}</code>. Registra el
						comercio para empezar a crear facturas.
					</p>
					<SetupSteps current={1} />
				</section>
				<div className={styles.registerColumn}>
					{registrationError && (
						<p className="iq-error" role="alert">
							{registrationError}
						</p>
					)}
					<MerchantRegister onRegistered={reload} />
				</div>
			</div>
		)
	}

	const created = lastCreatedId
		? invoices.find((invoice) => invoice.id === lastCreatedId)
		: undefined

	return (
		<div className={PAGE_CLASS}>
			<header className={`${theme.panel} ${styles.header}`}>
				<div className={styles.identity}>
					<p className={styles.kicker}>Panel del comercio</p>
					<h1>{merchant.displayName}</h1>
					<div className={styles.meta}>
						<span
							className={`${styles.pill} ${registrationUnavailable ? styles.pillPending : styles.pillOk}`}
						>
							<span className={styles.pillDot} aria-hidden="true" />
							{registrationUnavailable
								? "Registro pendiente de confirmación en Testnet"
								: "Registro verificado en Testnet"}
						</span>
						<span>
							Cuenta <code>{shortAddress(merchant.address)}</code>
						</span>
						{!registrationUnavailable && (
							<span>Registrado el {formatDate(merchant.registeredAt)}</span>
						)}
					</div>
				</div>
				<div className={styles.headerSide}>
					<a
						href={stellarExpertTxUrl(merchant.registrationTxHash)}
						target="_blank"
						rel="noreferrer"
						className={styles.headerLink}
					>
						{registrationUnavailable
							? "Ver transacción enviada en stellar.expert"
							: "Ver registro en stellar.expert"}
					</a>
					{monitoring && (
						<p className="iq-monitor">
							Monitoreo automático activo: Testnet se consulta cada{" "}
							{MONITOR_INTERVAL_MS / 1000} segundos para confirmar pagos.
						</p>
					)}
				</div>
			</header>

			{created && (
				<div className={styles.created} role="status">
					<span className={styles.createdIcon} aria-hidden="true">
						<CheckIcon />
					</span>
					<div className={styles.createdBody}>
						<p className={styles.createdTitle}>
							Factura creada: {created.amount} {created.asset}
						</p>
						<p className={styles.createdText}>
							Referencia <code>{created.reference}</code>. Comparte su enlace o
							código QR para cobrar.
						</p>
					</div>
					<div className={styles.createdActions}>
						<Link
							to={`/factura/${created.recipient}/${created.id}`}
							className={`${theme.primary} ${styles.buttonLink}`}
						>
							Abrir factura y QR
						</Link>
						<button
							type="button"
							className={styles.dismiss}
							onClick={() => setLastCreatedId(null)}
							aria-label="Cerrar aviso de factura creada"
						>
							<span aria-hidden="true">×</span>
						</button>
					</div>
				</div>
			)}

			<InvoiceOverview
				invoices={invoices}
				aside={
					canCreateInvoices(merchant, registrationUnavailable) ? (
						<InvoiceForm
							recipient={merchant.address}
							recipientName={merchant.displayName}
							onCreated={(invoice) => {
								setLastCreatedId(invoice.id)
								reload()
							}}
						/>
					) : (
						<div className={`${theme.panel} ${styles.blocked}`} role="alert">
							<h2>Creación de facturas en pausa</h2>
							<p>
								No se pudo verificar temporalmente este registro en Testnet. No
								se crearán nuevas facturas hasta confirmarlo; tus datos locales
								se conservan.
							</p>
							<button
								type="button"
								onClick={() => void retryRegistrationVerification()}
							>
								Reintentar verificación
							</button>
						</div>
					)
				}
			/>

			<p className={styles.footnote}>
				Las facturas se guardan solo en este navegador. Comparte el enlace o el
				código QR de cada factura para cobrar.{" "}
				<Link to="/" className="iq-link">
					Volver al inicio
				</Link>
			</p>
		</div>
	)
}
