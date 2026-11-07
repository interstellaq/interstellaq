import { Networks } from "@creit.tech/stellar-wallets-kit"

type NetworkType = "mainnet" | "testnet" | "futurenet" | "local"

interface Network {
	id: NetworkType
	label: string
	passphrase: string
	rpcUrl: string
}

/**
 * The Stellar networks app-lib knows how to link to and fund on, keyed by
 * passphrase. Custom networks that `extends` one of these share its
 * passphrase, so they resolve to it too.
 */
const KNOWN_NETWORKS = {
	[Networks.PUBLIC]: "PUBLIC",
	[Networks.TESTNET]: "TESTNET",
	[Networks.FUTURENET]: "FUTURENET",
	[Networks.STANDALONE]: "LOCAL",
} as const

type StellarNetwork = (typeof KNOWN_NETWORKS)[keyof typeof KNOWN_NETWORKS]

/**
 * The app is fixed to Stellar Testnet for the hackathon MVP (README,
 * "Hackathon status"). These values are declared directly instead of being
 * read from the generated contract clients, so the frontend builds and runs
 * without a contract workspace: the MVP pays with native XLM operations and
 * never calls a Soroban contract (docs/adr/0002-invoice-correlation.md).
 */
export const networkPassphrase = Networks.TESTNET
export const rpcUrl = "https://soroban-testnet.stellar.org"
// Plain HTTP is only allowed where `scaffold.yml` allows it (local by default)
export const allowHttp = false
export const stellarNetwork = "TESTNET" as StellarNetwork

const stellarEncode = (str: string) => {
	return str.replace(/\//g, "//").replace(/;/g, "/;")
}

/**
 * Stellar Lab's network state for a transaction-dashboard link. Lab also wants
 * a Horizon URL: SDF's public instance for the public networks, and the
 * quickstart container's root (where its Horizon is served) for local.
 */
const labNetwork = (): {
	host: string
	id: string
	label: string
	horizonUrl: string
} => {
	switch (stellarNetwork) {
		case "LOCAL":
			return {
				host: "http://localhost:8000/lab",
				id: "custom",
				label: "Custom",
				horizonUrl: new URL(rpcUrl).origin,
			}
		case "PUBLIC":
			return {
				host: "https://lab.stellar.org",
				id: "mainnet",
				label: "Mainnet",
				horizonUrl: "https://horizon.stellar.org",
			}
		case "FUTURENET":
			return {
				host: "https://lab.stellar.org",
				id: "futurenet",
				label: "Futurenet",
				horizonUrl: "https://horizon-futurenet.stellar.org",
			}
		case "TESTNET":
			return {
				host: "https://lab.stellar.org",
				id: "testnet",
				label: "Testnet",
				horizonUrl: "https://horizon-testnet.stellar.org",
			}
	}
}

export const labPrefix = () => {
	const lab = labNetwork()
	return `${lab.host}/transaction-dashboard?$=network$id=${lab.id}&label=${lab.label}&horizonUrl=${stellarEncode(lab.horizonUrl)}&rpcUrl=${stellarEncode(rpcUrl)}&passphrase=${stellarEncode(networkPassphrase)};`
}

const networkToId = (network: StellarNetwork): NetworkType => {
	switch (network) {
		case "PUBLIC":
			return "mainnet"
		case "TESTNET":
			return "testnet"
		case "FUTURENET":
			return "futurenet"
		case "LOCAL":
			return "local"
	}
}

export const network: Network = {
	id: networkToId(stellarNetwork),
	label: stellarNetwork.toLowerCase(),
	passphrase: networkPassphrase,
	rpcUrl: rpcUrl,
}
