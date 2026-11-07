import {
	errorMessage,
	networkPassphrase,
	shortAddress,
} from "@stellar-scaffold/app-lib"
import { useState, type FormEvent } from "react"
import { validateDisplayName, type MerchantProfile } from "../domain/merchant"
import { useNotification } from "../hooks/useNotification"
import { useWallet } from "../hooks/useWallet"
import { saveMerchant } from "../lib/persistence"
import {
	buildRegistrationTransaction,
	submitRegistration,
} from "../lib/registration"

interface MerchantRegisterProps {
	onRegistered: (profile: MerchantProfile) => void
}

/**
 * Merchant registration form (FR-01). The declared account signs an
 * on-chain registration transaction with its own wallet, proving control
 * before the display name is stored. No secret is ever collected (NFR-02).
 */
export function MerchantRegister({ onRegistered }: MerchantRegisterProps) {
	const { address, signTransaction } = useWallet()
	const { addNotification } = useNotification()
	const [displayName, setDisplayName] = useState("")
	const [formError, setFormError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)

	const submit = async (event: FormEvent) => {
		event.preventDefault()
		if (!address) return
		const validationError = validateDisplayName(displayName)
		if (validationError) {
			setFormError(validationError)
			return
		}
		setFormError(null)
		setSubmitting(true)
		try {
			const unsigned = await buildRegistrationTransaction(address)
			const { signedTxXdr } = await signTransaction(unsigned, {
				address,
				networkPassphrase,
			})
			const profile = await submitRegistration(
				address,
				displayName,
				signedTxXdr,
			)
			if (!saveMerchant(profile)) {
				throw new Error("No se pudo guardar el registro en este navegador.")
			}
			addNotification("Comercio registrado en Testnet.", "success")
			onRegistered(profile)
		} catch (error) {
			setFormError(errorMessage(error))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<form className="iq-form card" onSubmit={(event) => void submit(event)}>
			<h2>Registrar comercio</h2>
			<p>
				Conecta la cuenta que recibirá los pagos y firma una transacción de
				registro en Testnet. La red verifica que controlas la cuenta antes de
				mostrar tu nombre como comercio.
			</p>
			<label htmlFor="iq-merchant-name">Nombre del comercio</label>
			<input
				id="iq-merchant-name"
				type="text"
				value={displayName}
				onChange={(event) => setDisplayName(event.target.value)}
				placeholder="Ej: Café Andes"
				maxLength={40}
				autoComplete="organization"
			/>
			{formError && <p className="iq-error">{formError}</p>}
			<button type="submit" disabled={submitting || !address}>
				{submitting ? "Firmando en la wallet..." : "Registrar en Testnet"}
			</button>
			{address && (
				<p className="iq-muted">
					Cuenta: <code>{shortAddress(address)}</code>
				</p>
			)}
		</form>
	)
}
