import { type ReactNode } from "react"

export type TrustIconName = "direct" | "network" | "checklist"

const PATHS: Record<TrustIconName, ReactNode> = {
	// Funds go straight from one account to another.
	direct: (
		<>
			<circle cx="5" cy="12" r="2.5" />
			<path d="M8.5 12H19M15 8l4 4-4 4" />
		</>
	),
	// Data read from the network.
	network: (
		<>
			<circle cx="12" cy="5" r="2.25" />
			<circle cx="5" cy="18" r="2.25" />
			<circle cx="19" cy="18" r="2.25" />
			<path d="M10.9 7l-4.8 9M13.1 7l4.8 9M7.25 18h9.5" />
		</>
	),
	// Each field of the request is checked.
	checklist: (
		<>
			<path d="M3.5 6.5l1.25 1.25L7 5.5M3.5 12.5l1.25 1.25L7 11.5M3.5 18.5l1.25 1.25L7 17.5" />
			<path d="M10.5 6.5H20M10.5 12.5H20M10.5 18.5H20" />
		</>
	),
}

/** Small line icon for the trust strip. Decorative: hidden from AT. */
export function TrustIcon({ name }: { name: TrustIconName }) {
	return (
		<svg
			viewBox="0 0 24 24"
			width="20"
			height="20"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			{PATHS[name]}
		</svg>
	)
}
