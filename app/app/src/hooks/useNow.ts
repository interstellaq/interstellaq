import { useEffect, useState } from "react"

/**
 * Current time, refreshed every `intervalMs`. Display-only: it re-renders
 * the component that calls it and nothing above it, so place it below any
 * component that owns side effects keyed on time (useSettlementMonitor is
 * called by the merchant page, which never calls this hook).
 */
export function useNow(intervalMs = 1000): number {
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), intervalMs)
		return () => clearInterval(timer)
	}, [intervalMs])
	return now
}
