import { Networks } from "@creit.tech/stellar-wallets-kit"
import { networkPassphrase, stellarNetwork } from "./env"

/** Shorten a Stellar address/contract id: first 4 + last 4, ellipsised. */
export const shortAddress = (addr: string): string =>
	`${addr.slice(0, 4)}...${addr.slice(-4)}`

/** Human-friendly network label (STANDALONE → Local; otherwise capitalized). */
export const formatNetworkName = (name: string): string =>
	name === "STANDALONE"
		? "Local"
		: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()

/** Reverse lookup of a network passphrase to its `Networks` enum key. */
const passphraseToName: Record<string, string> = Object.fromEntries(
	Object.entries(Networks).map(([name, passphrase]) => [passphrase, name]),
)

export type NetworkState = "disconnected" | "mismatch" | "ok" | "unverified"

/**
 * Compare the app's configured network against the connected wallet's network
 * using passphrase. Most wallets don't report their network (Wallets Kit issue
 * #62) — a connected wallet with no passphrase is `unverified`, not a mismatch.
 * Keep pure, let component decide how to present state.
 */
export function networkStatus(
	address: string | null | undefined,
	walletPassphrase: string | null | undefined,
): {
	appNetwork: string
	walletNetwork: string
	state: NetworkState
	title: string
} {
	const appNetwork = formatNetworkName(stellarNetwork)
	// Label, in priority order: blank when there's no passphrase (disconnected);
	// the app's own label when the wallet matches the configured passphrase (so a
	// custom/standalone passphrase still reads as e.g. "Local" rather than
	// "Unknown" in the `ok` case); the known `Networks` name; else "Unknown".
	const walletNetwork = !walletPassphrase
		? ""
		: walletPassphrase === networkPassphrase
			? appNetwork
			: passphraseToName[walletPassphrase]
				? formatNetworkName(passphraseToName[walletPassphrase])
				: "Unknown"

	if (!address) {
		return {
			appNetwork,
			walletNetwork,
			state: "disconnected",
			title: "Conecta tu wallet para verificar la red.",
		}
	}
	if (!walletPassphrase) {
		return {
			appNetwork,
			walletNetwork,
			state: "unverified",
			title: `Esta wallet no reporta su red. Asegúrate de que esté en ${appNetwork}.`,
		}
	}
	if (walletPassphrase !== networkPassphrase) {
		return {
			appNetwork,
			walletNetwork,
			state: "mismatch",
			title: `La wallet está en ${walletNetwork}. Conéctala a ${appNetwork}.`,
		}
	}
	return { appNetwork, walletNetwork, state: "ok", title: "" }
}

/**
 * A short, readable message for anything a wallet, RPC or contract call threw.
 * Wallets reject with plain `{ code, message }` objects rather than `Error`s,
 * and SDK errors can carry a long event log after the first line, so this
 * keeps only the first line of whichever message it finds.
 */
export const errorMessage = (error: unknown): string => {
	const message =
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof error.message === "string"
			? error.message
			: String(error)
	const [firstLine = ""] = message.split("\n")
	return firstLine.trim() || "Error desconocido"
}
