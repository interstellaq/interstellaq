import { type ReactNode } from "react"
import styles from "./HeroVisual.module.css"

export interface HeroVisualProps {
	/** Accessible name of the visual region. */
	label: string
	/** Visual content: today the static product preview. */
	children: ReactNode
}

/**
 * Right-hand column of the hero. It frames the static product preview and
 * is the single place where a future pre-rendered animation (Remotion
 * output) would plug in, without changing the hero layout.
 */
export function HeroVisual({ label, children }: HeroVisualProps) {
	return (
		<div className={styles.root} role="group" aria-label={label}>
			{children}
		</div>
	)
}
