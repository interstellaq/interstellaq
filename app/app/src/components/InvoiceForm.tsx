import { useState, type FormEvent } from "react"
import {
	createInvoice,
	EXPIRY_OPTIONS_MINUTES,
	type Invoice,
} from "../domain/invoice"
import { saveInvoice } from "../lib/persistence"
import { createReference } from "../lib/reference"

interface InvoiceFormProps {
	recipient: string
	recipientName?: string
	onCreated: (invoice: Invoice) => void
}

const EXPIRY_LABELS: Record<number, string> = {
	15: "15 minutos",
	30: "30 minutos",
	60: "1 hora",
	1440: "24 horas",
}

/**
 * Fixed-amount invoice creation (FR-02). The reference is generated here so
 * it can never repeat inside the merchant store, and the created invoice is
 * immutable afterwards (NFR-03).
 */
export function InvoiceForm({
	recipient,
	recipientName,
	onCreated,
}: InvoiceFormProps) {
	const [amount, setAmount] = useState("")
	const [note, setNote] = useState("")
	const [expiryMinutes, setExpiryMinutes] = useState<number>(30)
	const [formError, setFormError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)

	const submit = (event: FormEvent) => {
		event.preventDefault()
		setSubmitting(true)
		try {
			const result = createInvoice({
				recipient,
				recipientName,
				amount,
				note,
				expiryMinutes,
				reference: createReference(),
			})
			if ("error" in result) {
				setFormError(result.error)
				return
			}
			if (!saveInvoice(recipient, result)) {
				setFormError(
					"No se pudo guardar la factura en este navegador. Intenta de nuevo.",
				)
				return
			}
			setFormError(null)
			setAmount("")
			setNote("")
			onCreated(result)
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<form className="iq-form card" onSubmit={submit}>
			<h2>Nueva factura</h2>
			<label htmlFor="iq-invoice-amount">Monto en XLM</label>
			<input
				id="iq-invoice-amount"
				type="text"
				inputMode="decimal"
				value={amount}
				onChange={(event) => setAmount(event.target.value)}
				placeholder="12.5000000"
				required
			/>

			<label htmlFor="iq-invoice-note">Concepto (opcional)</label>
			<input
				id="iq-invoice-note"
				type="text"
				value={note}
				onChange={(event) => setNote(event.target.value)}
				placeholder="Ej: Pedido 1042"
				maxLength={60}
			/>

			<label htmlFor="iq-invoice-expiry">Expira en</label>
			<select
				id="iq-invoice-expiry"
				value={expiryMinutes}
				onChange={(event) => setExpiryMinutes(Number(event.target.value))}
			>
				{EXPIRY_OPTIONS_MINUTES.map((minutes) => (
					<option key={minutes} value={minutes}>
						{EXPIRY_LABELS[minutes]}
					</option>
				))}
			</select>

			{formError && <p className="iq-error">{formError}</p>}
			<button type="submit" disabled={submitting}>
				{submitting ? "Creando..." : "Crear factura"}
			</button>
		</form>
	)
}
