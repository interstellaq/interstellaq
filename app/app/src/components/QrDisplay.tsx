import { QRCodeSVG } from "qrcode.react"
import { useNotification } from "../hooks/useNotification"

interface QrDisplayProps {
	/** The payment request rendered as QR. */
	value: string
	/** Short human description shown under the QR. */
	caption: string
}

/**
 * QR rendering of a payment request with its text equivalent (FR-03,
 * NFR-06): the full payload is always readable and copyable without
 * scanning, so the core flow never depends on the QR alone.
 */
export function QrDisplay({ value, caption }: QrDisplayProps) {
	const { addNotification } = useNotification()

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value)
			addNotification("Enlace de pago copiado.", "success")
		} catch {
			addNotification("No se pudo copiar el enlace.", "error")
		}
	}

	return (
		<div className="iq-qr">
			<QRCodeSVG
				value={value}
				size={220}
				bgColor="#ffffff"
				fgColor="#080814"
				level="M"
				marginSize={2}
			/>
			<p className="iq-qr__caption">{caption}</p>
			<code className="iq-qr__text">{value}</code>
			<button type="button" onClick={() => void copy()}>
				Copiar enlace de pago
			</button>
		</div>
	)
}
