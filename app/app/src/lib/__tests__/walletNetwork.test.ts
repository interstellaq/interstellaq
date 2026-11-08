import { describe, expect, it, vi } from "vitest"
import { signWithConfirmedTestnet } from "../walletNetwork"

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015"
const connected = {
	address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
	isPending: false,
}

describe("signWithConfirmedTestnet", () => {
	it("permite firmar cuando una lectura fresca confirma Testnet", async () => {
		const sign = vi.fn().mockResolvedValue("signed-xdr")
		const readNetwork = vi.fn().mockResolvedValue({
			supported: true,
			networkPassphrase: TESTNET_PASSPHRASE,
		})

		await expect(
			signWithConfirmedTestnet(
				connected,
				TESTNET_PASSPHRASE,
				sign,
				readNetwork,
			),
		).resolves.toEqual({ ok: true, value: "signed-xdr" })
		expect(readNetwork).toHaveBeenCalledOnce()
		expect(sign).toHaveBeenCalledOnce()
	})

	it("bloquea una wallet en Mainnet sin solicitar firma", async () => {
		const sign = vi.fn()
		const readNetwork = vi.fn().mockResolvedValue({
			supported: true,
			networkPassphrase: "Public Global Stellar Network ; September 2015",
		})

		await expect(
			signWithConfirmedTestnet(
				connected,
				TESTNET_PASSPHRASE,
				sign,
				readNetwork,
			),
		).resolves.toMatchObject({
			ok: false,
			status: "mismatch",
		})
		expect(sign).not.toHaveBeenCalled()
	})

	it("bloquea una wallet que no puede informar su red", async () => {
		const sign = vi.fn()
		const readNetwork = vi.fn().mockResolvedValue({ supported: false })

		await expect(
			signWithConfirmedTestnet(
				connected,
				TESTNET_PASSPHRASE,
				sign,
				readNetwork,
			),
		).resolves.toMatchObject({
			ok: false,
			status: "unverified",
		})
		expect(sign).not.toHaveBeenCalled()
	})

	it("bloquea una respuesta de red incompleta o desconocida", async () => {
		const sign = vi.fn()
		const readNetwork = vi.fn().mockResolvedValue({ supported: true })

		await expect(
			signWithConfirmedTestnet(
				connected,
				TESTNET_PASSPHRASE,
				sign,
				readNetwork,
			),
		).resolves.toMatchObject({
			ok: false,
			status: "unverified",
		})
		expect(sign).not.toHaveBeenCalled()
	})

	it("bloquea errores al consultar la red", async () => {
		const sign = vi.fn()
		const readNetwork = vi
			.fn()
			.mockRejectedValue(new Error("wallet unavailable"))

		await expect(
			signWithConfirmedTestnet(
				connected,
				TESTNET_PASSPHRASE,
				sign,
				readNetwork,
			),
		).resolves.toMatchObject({
			ok: false,
			status: "unverified",
		})
		expect(sign).not.toHaveBeenCalled()
	})

	it("bloquea una wallet desconectada o todavía comprobándose", async () => {
		const sign = vi.fn()
		const readNetwork = vi.fn()

		await expect(
			signWithConfirmedTestnet(
				{ isPending: false },
				TESTNET_PASSPHRASE,
				sign,
				readNetwork,
			),
		).resolves.toMatchObject({ ok: false, status: "disconnected" })
		await expect(
			signWithConfirmedTestnet(
				{ address: connected.address, isPending: true },
				TESTNET_PASSPHRASE,
				sign,
				readNetwork,
			),
		).resolves.toMatchObject({ ok: false, status: "checking" })
		expect(readNetwork).not.toHaveBeenCalled()
		expect(sign).not.toHaveBeenCalled()
	})

	it("usa la red fresca aunque el renderizado anterior fuera Testnet", async () => {
		const sign = vi.fn()
		const readNetwork = vi.fn().mockResolvedValue({
			supported: true,
			networkPassphrase: "Public Global Stellar Network ; September 2015",
		})

		await expect(
			signWithConfirmedTestnet(
				connected,
				TESTNET_PASSPHRASE,
				sign,
				readNetwork,
			),
		).resolves.toMatchObject({
			ok: false,
			status: "mismatch",
		})
		expect(sign).not.toHaveBeenCalled()
	})
})
