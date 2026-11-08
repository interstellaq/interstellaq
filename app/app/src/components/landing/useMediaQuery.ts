import { useCallback, useSyncExternalStore } from "react"

/**
 * Live result of a CSS media query. `fallback` is used when matchMedia is
 * not available. Scoped to the landing so the shared hooks/ stay untouched.
 */
export function useMediaQuery(query: string, fallback: boolean): boolean {
	const subscribe = useCallback(
		(onChange: () => void) => {
			if (typeof window === "undefined" || !window.matchMedia) return () => {}
			const media = window.matchMedia(query)
			media.addEventListener("change", onChange)
			return () => media.removeEventListener("change", onChange)
		},
		[query],
	)
	const getSnapshot = () =>
		typeof window !== "undefined" && window.matchMedia
			? window.matchMedia(query).matches
			: fallback
	return useSyncExternalStore(subscribe, getSnapshot, () => fallback)
}
