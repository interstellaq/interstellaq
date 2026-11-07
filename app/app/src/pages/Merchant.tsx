import { connectWallet, shortAddress } from "@stellar-scaffold/app-lib"
import { useEffect, useState } from "react"
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
	const monitoring = useSettlementMonitor(invoices, setInvoices)

	useEffect(() => {
		if (!address) {
			setMerchant(null)
			setInvoices([])
			return
		}
		setMerchant(loadMerchant(address))
		setInvoices(loadInvoices(address))
	}, [address])

	const reload = () => {
		if (!address) return
		setMerchant(loadMerchant(address))
		setInvoices(loadInvoices(address))
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
						Registrado el {formatDate(merchant.registeredAt)} · Cuenta{" "}
						<code>{shortAddress(merchant.address)}</code>
					</p>
				</div>
				<a
					href={stellarExpertTxUrl(merchant.registrationTxHash)}
					target="_blank"
					rel="noreferrer"
					className="iq-link"
				>
					Ver registro en stellar.expert
				</a>
			</header>

			<InvoiceForm
				recipient={merchant.address}
				recipientName={merchant.displayName}
				onCreated={reload}
			/>
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
