import { type DerivedStatus } from "../domain/invoice"

const LABELS: Record<DerivedStatus, string> = {
	active: "Activa",
	settled: "Liquidada",
	expired: "Expirada",
	verification_failed: "Verificación fallida",
}

/** Human-readable invoice status chip (FR-06, NFR-05). */
export function StatusBadge({ status }: { status: DerivedStatus }) {
	return (
		<span className={`iq-badge iq-badge--${status}`}>{LABELS[status]}</span>
	)
}
