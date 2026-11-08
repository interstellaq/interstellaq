import { connectWallet, shortAddress } from "@stellar-scaffold/app-lib"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { InvoiceForm } from "../components/InvoiceForm"
import { InvoiceList } from "../components/InvoiceList"
import { MerchantRegister } from "../components/MerchantRegister"
import { type Invoice } from "../domain/invoice"
import { type MerchantProfile } from "../domain/merchant"
import {
	MONITOR_INTERVAL_MS,
	useSettlementMonitor,
} from "../hooks/useSettlementMonitor"
import { useWallet } from "../hooks/useWallet"
import { loadInvoices, loadMerchant } from "../lib/persistence"
import { verifyRegistrationEvidence } from "../lib/registration"
import { stellarExpertTxUrl } from "../lib/stellar"

function formatDate(epochMs: number): string {
	return new Date(epochMs).toLocaleString("es-419", {
		dateStyle: "medium",
		timeStyle: "short",
	})
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
	const [registrationError, setRegistrationError] = useState<string | null>(null)
	const [registrationUnavailable, setRegistrationUnavailable] = useState(false)
	const [registrationRevision, setRegistrationRevision] = useState(0)
	const verificationRequest = useRef(0)
	const currentWalletAddress = useRef(address)
	currentWalletAddress.current = address
	const monitoring = useSettlementMonitor(invoices, setInvoices)

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
		void verifyRegistrationEvidence(address, stored.registrationTxHash, undefined, {
			registeredAt: stored.registeredAt,
		}).then(
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
		void verifyRegistrationEvidence(address, stored.registrationTxHash, undefined, {
			registeredAt: stored.registeredAt,
		}).then((result) => {
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
		})
	}

	if (isPending) {
		return <p className="iq-muted">Cargando wallet...</p>
	}

	if (!address) {
		return (
			<div className="card iq-onboarding">
				<h1>Panel del comercio</h1>
				<p>
					Conecta la cuenta Stellar que va a recibir los pagos. InterstellaQ
					nunca pide tus claves: la wallet firma cada transacción.
				</p>
				<button type="button" onClick={() => void connectWallet()}>
					Conectar wallet
				</button>
			</div>
		)
	}

	if (checkingRegistration) {
		return <p className="iq-muted">Validando registro del comercio en Testnet...</p>
	}

	if (!merchant) {
		return (
			<div className="iq-stack">
				<div className="card iq-onboarding">
					<h1>Panel del comercio</h1>
					<p>
						Cuenta conectada: <code>{shortAddress(address)}</code>. Registra el
						comercio para empezar a crear facturas.
					</p>
				</div>
				{registrationError && <p className="iq-error">{registrationError}</p>}
				<MerchantRegister onRegistered={reload} />
			</div>
		)
	}

	return (
		<div className="iq-stack">
			<header className="card iq-merchant-header">
				<div>
					<h1>{merchant.displayName}</h1>
					<p className="iq-muted">
						{registrationUnavailable
							? "Registro pendiente de confirmación en Testnet"
							: `Registrado el ${formatDate(merchant.registeredAt)}`} · Cuenta{" "}
						<code>{shortAddress(merchant.address)}</code>
					</p>
				</div>
				<a
					href={stellarExpertTxUrl(merchant.registrationTxHash)}
					target="_blank"
					rel="noreferrer"
					className="iq-link"
				>
					{registrationUnavailable
						? "Ver transacción enviada en stellar.expert"
						: "Ver registro en stellar.expert"}
				</a>
			</header>

			{registrationUnavailable ? (
				<div className="card iq-warning">
					<p>
						No se pudo verificar temporalmente este registro en Testnet. No se
						crearán nuevas facturas hasta confirmarlo; tus datos locales se
						conservan.
					</p>
					<button
						type="button"
						onClick={() => void retryRegistrationVerification()}
					>
						Reintentar verificación
					</button>
				</div>
			) : (
				<InvoiceForm
					recipient={merchant.address}
					recipientName={merchant.displayName}
					onCreated={reload}
				/>
			)}
			{monitoring && (
				<p className="iq-monitor">
					Monitoreo automático activo: Testnet se consulta cada{" "}
					{MONITOR_INTERVAL_MS / 1000} segundos para confirmar pagos.
				</p>
			)}
			<InvoiceList invoices={invoices} />

			<p className="iq-muted">
				Las facturas se guardan solo en este navegador. Comparte el enlace o el
				código QR de cada factura para cobrar.{" "}
				<Link to="/" className="iq-link">
					Volver al inicio
				</Link>
			</p>
		</div>
	)
}
