import { type RefObject, useEffect, useRef, useState } from "react"
import styles from "./HeroMedia.module.css"
import { ProductPreview } from "./ProductPreview"
import { useMediaQuery } from "./useMediaQuery"

type VariantName = "desktop" | "mobile"

interface Variant {
	/** First playable source wins; only that one is downloaded. */
	sources: { src: string; type: string }[]
	poster: string
	width: number
	height: number
}

/**
 * Pre-rendered Remotion V2 output (interstellaq-motion/out/v2), copied
 * without re-encoding. MP4 (H.264 High) comes first: it is the smaller file
 * for these renders and plays everywhere, hardware-decoded. WebM (VP9) is
 * the fallback for browsers built without H.264.
 */
const VARIANTS: Record<VariantName, Variant> = {
	desktop: {
		sources: [
			{
				src: "/landing/hero-desktop-v2.mp4",
				type: 'video/mp4; codecs="avc1.640028"',
			},
			{
				src: "/landing/hero-desktop-v2.webm",
				type: 'video/webm; codecs="vp9"',
			},
		],
		poster: "/landing/hero-desktop-poster-v2.jpg",
		width: 1048,
		height: 1148,
	},
	mobile: {
		sources: [
			{
				src: "/landing/hero-mobile-v2.mp4",
				type: 'video/mp4; codecs="avc1.64001F"',
			},
			{ src: "/landing/hero-mobile-v2.webm", type: 'video/webm; codecs="vp9"' },
		],
		poster: "/landing/hero-mobile-poster-v2.jpg",
		width: 750,
		height: 1000,
	},
}

/**
 * Below 600px the hero card is too narrow for the desktop composition's
 * text, so the simplified 3:4 mobile composition is used. 600px is an
 * existing landing breakpoint.
 */
const DESKTOP_QUERY = "(min-width: 600px)"
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

const DESCRIPTION =
	"Animación ilustrativa con datos ficticios: un comercio de ejemplo crea una solicitud de 25.00 XLM, la comparte por QR, el cliente la autoriza en su wallet y la aplicación verifica el pago en Horizon, en Stellar Testnet."

const CAPTION =
	"Ejemplo ilustrativo con datos ficticios, no una transacción real."

/**
 * Animated hero preview.
 *
 * - One variant only, chosen by viewport width. Crossing 600px swaps the
 *   variant: the old <video> unmounts (its download stops) and the new one
 *   mounts. A manual pause carries over.
 * - The <video> mounts only when the frame is within 200px of the viewport;
 *   until then the poster holds the space. Off screen, playback pauses.
 * - Reduced motion: no video at all, just the poster.
 * - If the video fails, the poster stays; if the poster fails too, the
 *   static HTML preview is shown.
 */
export function HeroMedia() {
	const variantName: VariantName = useMediaQuery(DESKTOP_QUERY, true)
		? "desktop"
		: "mobile"
	const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY, true)
	const variant = VARIANTS[variantName]

	const frameRef = useRef<HTMLDivElement>(null)
	const videoRef = useRef<HTMLVideoElement>(null)
	const { near, visible } = useViewportProximity(frameRef)

	const [videoFailed, setVideoFailed] = useState<
		Partial<Record<VariantName, boolean>>
	>({})
	const [posterFailed, setPosterFailed] = useState<
		Partial<Record<VariantName, boolean>>
	>({})
	const [userPaused, setUserPaused] = useState(false)
	const [playing, setPlaying] = useState(false)

	const staticOnly = reducedMotion || videoFailed[variantName] === true
	const showVideo = !staticOnly && near

	// Start (or resume) playback when the video is on screen and the user has
	// not paused it; pause it while it is off screen.
	useEffect(() => {
		const video = videoRef.current
		if (!showVideo || !video) return
		video.muted = true
		video.defaultMuted = true
		if (visible && !userPaused) {
			video.play().catch(() => setPlaying(false))
		} else if (!visible && !video.paused) {
			video.pause()
		}
	}, [showVideo, visible, userPaused, variantName])

	if (posterFailed[variantName] && staticOnly) return <ProductPreview />

	const failVideo = () =>
		setVideoFailed((failed) => ({ ...failed, [variantName]: true }))
	const failPoster = () =>
		setPosterFailed((failed) => ({ ...failed, [variantName]: true }))

	const togglePlayback = () => {
		const video = videoRef.current
		if (!video) return
		if (playing) {
			setUserPaused(true)
			video.pause()
		} else {
			setUserPaused(false)
			video.play().catch(() => setPlaying(false))
		}
	}

	return (
		<figure className={`${styles.figure} ${styles[variantName]}`}>
			<div ref={frameRef} className={styles.frame}>
				{showVideo ? (
					<video
						key={variantName}
						ref={videoRef}
						className={styles.media}
						width={variant.width}
						height={variant.height}
						poster={variant.poster}
						autoPlay={!userPaused}
						muted
						loop
						playsInline
						preload="metadata"
						aria-hidden="true"
						onPlay={() => setPlaying(true)}
						onPause={() => setPlaying(false)}
						// React bubbles a <source> error up to here; only the video's
						// own errors (e.g. decoding) count. Source failures are
						// handled on the last <source>, after every candidate was tried.
						onError={(event) => {
							if (event.target === event.currentTarget) failVideo()
						}}
					>
						{variant.sources.map((source, index) => (
							<source
								key={source.src}
								src={source.src}
								type={source.type}
								// When the last candidate fails, no source is left.
								onError={
									index === variant.sources.length - 1 ? failVideo : undefined
								}
							/>
						))}
					</video>
				) : (
					<img
						key={variantName}
						className={styles.media}
						src={variant.poster}
						width={variant.width}
						height={variant.height}
						alt={staticOnly ? DESCRIPTION : ""}
						decoding="async"
						loading={variantName === "desktop" ? "eager" : "lazy"}
						onError={failPoster}
					/>
				)}
			</div>
			{staticOnly ? null : <p className={styles.srOnly}>{DESCRIPTION}</p>}
			<figcaption
				// Same alignment before and after the video mounts, so the caption
				// does not move when the control appears.
				className={`${styles.footer} ${staticOnly ? styles.footerSolo : ""}`}
			>
				<span className={styles.caption}>{CAPTION}</span>
				{showVideo ? (
					<button
						type="button"
						className={styles.toggle}
						onClick={togglePlayback}
					>
						<PlaybackIcon playing={playing} />
						{playing ? "Pausar animación" : "Reproducir animación"}
					</button>
				) : null}
			</figcaption>
		</figure>
	)
}

/**
 * `near`: the frame came within 200px of the viewport at least once (then
 * the video may load). `visible`: it is within that range right now.
 */
function useViewportProximity(ref: RefObject<HTMLElement | null>) {
	const [state, setState] = useState({ near: false, visible: false })

	useEffect(() => {
		const element = ref.current
		if (!element) return
		if (typeof IntersectionObserver === "undefined") {
			setState({ near: true, visible: true })
			return
		}
		const observer = new IntersectionObserver(
			(entries) => {
				const intersecting = entries.some((entry) => entry.isIntersecting)
				setState((previous) => ({
					near: previous.near || intersecting,
					visible: intersecting,
				}))
			},
			{ rootMargin: "200px 0px" },
		)
		observer.observe(element)
		return () => observer.disconnect()
	}, [ref])

	return state
}

function PlaybackIcon({ playing }: { playing: boolean }) {
	return (
		<svg
			viewBox="0 0 16 16"
			width="14"
			height="14"
			aria-hidden="true"
			focusable="false"
		>
			{playing ? (
				<path
					d="M5 3.5v9M11 3.5v9"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
				/>
			) : (
				<path d="M5 3.25v9.5L12.5 8z" fill="currentColor" />
			)}
		</svg>
	)
}
