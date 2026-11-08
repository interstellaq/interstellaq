export interface WalletActionContext {
	address?: string
	isPending: boolean
}

export type WalletNetworkReader = () => Promise<{
	supported: boolean
	networkPassphrase?: string
}>

export interface TestnetWalletFailure {
	ok: false
	status: "checking" | "disconnected" | "mismatch" | "unverified"
	message: string
}

export type TestnetWalletCheck = { ok: true } | TestnetWalletFailure

const TESTNET_MESSAGE =
	"No se puede continuar porque la wallet no confirmó Stellar Testnet. Selecciona Testnet en tu wallet, vuelve a conectarla e inténtalo de nuevo."

/**
 * Check the wallet network immediately before asking it to sign.
 *
 * The reactive wallet state is useful to reject a known disconnected or
 * loading session, but it is not sufficient evidence of the wallet's current
 * network. `readNetwork` therefore performs a fresh Wallets Kit query for
 * every protected action. Wallets that cannot report their network fail
 * closed rather than relying on the configured dApp network.
 */
export async function checkTestnetWallet(
	context: WalletActionContext,
	expectedNetworkPassphrase: string,
	readNetwork: WalletNetworkReader,
): Promise<TestnetWalletCheck> {
	if (context.isPending) {
		return {
			ok: false,
			status: "checking",
			message:
				"La wallet todavía se está comprobando. Espera un momento e inténtalo de nuevo.",
		}
	}
	if (!context.address) {
		return {
			ok: false,
			status: "disconnected",
			message: "Conecta una wallet en Stellar Testnet antes de continuar.",
		}
	}

	try {
		const network = await readNetwork()
		if (!network.supported || !network.networkPassphrase) {
			return { ok: false, status: "unverified", message: TESTNET_MESSAGE }
		}
		if (network.networkPassphrase !== expectedNetworkPassphrase) {
			return { ok: false, status: "mismatch", message: TESTNET_MESSAGE }
		}
		return { ok: true }
	} catch {
		return { ok: false, status: "unverified", message: TESTNET_MESSAGE }
	}
}

/**
 * Run a signing request only after a fresh, fail-closed Testnet check.
 *
 * This narrows the time between the network read and the signature request;
 * it cannot prevent a wallet from changing networks afterwards. Callers must
 * still pass the Testnet passphrase to Wallets Kit when requesting a signature.
 */
export async function signWithConfirmedTestnet<T>(
	context: WalletActionContext,
	expectedNetworkPassphrase: string,
	sign: () => Promise<T>,
	readNetwork: WalletNetworkReader,
): Promise<TestnetWalletFailure | { ok: true; value: T }> {
	const check = await checkTestnetWallet(
		context,
		expectedNetworkPassphrase,
		readNetwork,
	)
	if (!check.ok) return check
	return { ok: true, value: await sign() }
}
