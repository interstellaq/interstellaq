import { type ReactNode } from "react"
import styles from "./HeroVisual.module.css"

export interface HeroVisualProps {
	/** Accessible name of the visual region. */
	label: string
	/** Visual content: the animated preview (HeroMedia). */
	children: ReactNode
}

/**
 * Right-hand column of the hero: the accessible region that holds the
 * product preview (HeroMedia, with the static ProductPreview as fallback).
 */
export function HeroVisual({ label, children }: HeroVisualProps) {
	return (
		<div className={styles.root} role="group" aria-label={label}>
			{children}
		</div>
	)
}
