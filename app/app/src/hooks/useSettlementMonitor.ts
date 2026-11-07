import { useEffect, useRef, useState } from "react"
import { isPayable, type Invoice } from "../domain/invoice"
import { verifyPending } from "../lib/verify"

/** How often the background monitor queries Horizon for pending invoices. */
export const MONITOR_INTERVAL_MS = 20_000

/**
 * Background settlement monitor (FR-05): while at least one invoice is still
 * pending, query Horizon on a fixed interval and push confirmed transitions
 * back to the caller.
 *
 * The poll runs only while the document is visible and never overlaps two
 * queries, so it cannot hammer Testnet or race the manual verification
 * button. Horizon failures are swallowed here: the manual button is the
 * surface that reports network errors to the user (NFR-05).
 */
export function useSettlementMonitor(
	invoices: Invoice[],
	onInvoices: (invoices: Invoice[]) => void,
): boolean {
	const [active, setActive] = useState(false)
	const invoicesRef = useRef(invoices)
	const onInvoicesRef = useRef(onInvoices)
	invoicesRef.current = invoices
	onInvoicesRef.current = onInvoices

	const hasPending = invoices.some((invoice) => isPayable(invoice))

	useEffect(() => {
		if (!hasPending) return
		setActive(true)
		let cancelled = false
		let running = false

		const poll = async () => {
			if (running || cancelled || document.hidden) return
			running = true
			try {
				const next = await verifyPending(invoicesRef.current)
				if (!cancelled && next !== invoicesRef.current) {
					onInvoicesRef.current(next)
				}
			} catch {
				// Silent by design; the manual verification button reports errors.
			} finally {
				running = false
			}
		}

		void poll()
		const timer = setInterval(() => void poll(), MONITOR_INTERVAL_MS)
		return () => {
			cancelled = true
			clearInterval(timer)
			setActive(false)
		}
	}, [hasPending])

	return active
}
