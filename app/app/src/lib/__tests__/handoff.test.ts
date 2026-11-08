import {
	Account,
	Keypair,
	MuxedAccount,
	Networks,
	type Operation,
	StrKey,
	type Transaction,
	TransactionBuilder,
} from "@stellar/stellar-sdk"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type Invoice, toStroops } from "../../domain/invoice"
import {
	buildInvoiceUrl,
	buildSep7PayUri,
	decodePayload,
	encodePayload,
	SEP7_MIN_REMAINING_MS,
	toPayload,
} from "../handoff"
import { createReference } from "../reference"
import { buildPaymentTransaction, horizon } from "../stellar"
import { isValidSep7Uri, parseSep7Uri, Sep7Pay } from "./sep7Oracle"

const NOW = 1_760_000_000_000
const RECIPIENT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
	id: "2f6b5f8e-0000-4000-8000-000000000001",
	reference: "ISQABCDEFGHIJ",
	recipient: RECIPIENT,
	recipientName: "Café Andes",
	asset: "XLM",
	amount: "12.5000000",
	note: "Pedido 1042",
	createdAt: NOW,
	expiresAt: NOW + 30 * 60_000,
	status: "active",
	...overrides,
})

describe("invoice payload codec", () => {
	it("round trips a payment request", () => {
		const invoice = makeInvoice()
		const decoded = decodePayload(encodePayload(toPayload(invoice)))
		expect(decoded).toEqual(toPayload(invoice))
	})

	it("rejects malformed or incomplete payloads", () => {
		expect(decodePayload("")).toBeNull()
		expect(decodePayload("not-base64!!")).toBeNull()
		expect(decodePayload(encodePayload({} as never))).toBeNull()
		const missingAmount = { ...toPayload(makeInvoice()) } as Record<
			string,
			unknown
		>
		delete missingAmount.amount
		expect(decodePayload(encodePayload(missingAmount as never))).toBeNull()
	})

	it("rejects a non-XLM asset in a tampered payload", () => {
		const tampered = { ...toPayload(makeInvoice()), asset: "USDC" }
		expect(decodePayload(encodePayload(tampered as never))).toBeNull()
	})

	it("rejects structurally invalid QR data", () => {
		const invoice = makeInvoice()
		for (const tampered of [
			{ ...toPayload(invoice), recipient: "GABC" },
			{ ...toPayload(invoice), reference: "invalid" },
			{ ...toPayload(invoice), amount: "0" },
			{ ...toPayload(invoice), expiresAt: invoice.createdAt },
			{ ...toPayload(invoice), expiresAt: invoice.createdAt + 17 * 60_000 },
			{ ...toPayload(invoice), id: "not-a-uuid" },
		]) {
			expect(decodePayload(encodePayload(tampered))).toBeNull()
		}
	})
})

describe("buildInvoiceUrl", () => {
	it("embeds the full request in the URL fragment", () => {
		const invoice = makeInvoice()
		const url = buildInvoiceUrl(invoice, "https://interstellaq.app")
		expect(url.startsWith("https://interstellaq.app/factura/")).toBe(true)
		expect(url).toContain(invoice.recipient)
		expect(url).toContain(invoice.id)
		const fragment = url.split("#p=")[1] ?? ""
		const decoded = decodePayload(fragment)
		expect(decoded?.reference).toBe(invoice.reference)
		expect(decoded?.amount).toBe(invoice.amount)
		expect(decoded?.expiresAt).toBe(invoice.expiresAt)
	})
})

describe("buildInvoiceUrl keeps the primary QR", () => {
	it("encodes the app invoice URL, never a SEP-7 URI", () => {
		const invoice = makeInvoice()
		const url = buildInvoiceUrl(invoice, "https://interstellaq.app")
		expect(url).toBe(
			`https://interstellaq.app/factura/${invoice.recipient}/${invoice.id}#p=${encodePayload(toPayload(invoice))}`,
		)
		expect(url).not.toContain("web+stellar")
		expect(decodePayload(url.split("#p=")[1] ?? "")).toEqual(toPayload(invoice))
	})
})

/** Literal Testnet passphrase, written out instead of read from the SDK. */
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015"

/** Every parameter SEP-0007 v2.1.0 defines for the `pay` operation. */
const SEP7_PAY_PARAMS = new Set([
	"destination",
	"amount",
	"asset_code",
	"asset_issuer",
	"memo",
	"memo_type",
	"callback",
	"msg",
	"network_passphrase",
	"origin_domain",
	"signature",
])

/**
 * Independent structural parser: splits on the SEP-0007 grammar
 * `web+stellar:pay?k=v&k=v` and decodes each value with decodeURIComponent,
 * keeping duplicates so an injected parameter cannot hide.
 */
function parsePayUri(uri: string): [string, string][] {
	const prefix = "web+stellar:pay?"
	if (!uri.startsWith(prefix)) throw new Error(`not a SEP-7 pay URI: ${uri}`)
	return uri
		.slice(prefix.length)
		.split("&")
		.map((pair) => {
			const at = pair.indexOf("=")
			if (at <= 0) throw new Error(`malformed parameter: ${pair}`)
			return [
				decodeURIComponent(pair.slice(0, at)),
				decodeURIComponent(pair.slice(at + 1)),
			]
		})
}

/** The URI for a payable invoice; fails the test when none is produced. */
function sep7(invoice: Invoice, now = NOW): string {
	const uri = buildSep7PayUri(invoice, now)
	if (uri === null) throw new Error("expected a SEP-7 URI")
	return uri
}

describe("buildSep7PayUri", () => {
	it("produces the SEP-0007 pay URI for a reference invoice", () => {
		// Written by hand from SEP-0007 v2.1.0, not captured from the code.
		expect(sep7(makeInvoice())).toBe(
			"web+stellar:pay" +
				"?destination=GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" +
				"&amount=12.5000000" +
				"&memo=ISQABCDEFGHIJ" +
				"&memo_type=MEMO_TEXT" +
				"&network_passphrase=Test%20SDF%20Network%20%3B%20September%202015" +
				"&msg=Pedido%201042",
		)
	})

	it("uses the web+stellar:pay scheme without forward slashes", () => {
		const uri = sep7(makeInvoice())
		expect(uri.startsWith("web+stellar:pay?")).toBe(true)
		expect(uri).not.toContain("//")
		const url = new URL(uri)
		expect(url.protocol).toBe("web+stellar:")
		expect(url.host).toBe("")
		expect(url.pathname).toBe("pay")
	})

	it("only carries SEP-7 pay parameters, each once, for native XLM", () => {
		const keys = parsePayUri(sep7(makeInvoice())).map(([key]) => key)
		expect(keys).toEqual([
			"destination",
			"amount",
			"memo",
			"memo_type",
			"network_passphrase",
			"msg",
		])
		for (const key of keys) expect(SEP7_PAY_PARAMS.has(key)).toBe(true)
		for (const absent of [
			"asset",
			"network",
			"asset_code",
			"asset_issuer",
			"callback",
			"origin_domain",
			"signature",
		]) {
			expect(keys).not.toContain(absent)
		}
	})

	it("always names Testnet, identically under both decoders", () => {
		for (const invoice of [makeInvoice(), makeInvoice({ note: undefined })]) {
			const uri = sep7(invoice)
			expect(uri).toContain(
				"network_passphrase=Test%20SDF%20Network%20%3B%20September%202015",
			)
			expect(uri.split("?")[1]).not.toContain("+")
			const decoded = new Map(parsePayUri(uri))
			const searchParams = new URLSearchParams(uri.split("?")[1])
			expect(decoded.get("network_passphrase")).toBe(TESTNET_PASSPHRASE)
			expect(searchParams.get("network_passphrase")).toBe(TESTNET_PASSPHRASE)
			expect(TESTNET_PASSPHRASE).toBe(Networks.TESTNET)
		}
	})

	it("carries the invoice reference as a MEMO_TEXT memo", () => {
		const invoice = makeInvoice()
		const decoded = new Map(parsePayUri(sep7(invoice)))
		expect(decoded.get("memo_type")).toBe("MEMO_TEXT")
		expect(decoded.get("memo")).toBe(invoice.reference)
	})

	it("keeps references of maximum length intact", () => {
		for (const reference of ["ISQ7777777777", createReference()]) {
			const decoded = new Map(parsePayUri(sep7(makeInvoice({ reference }))))
			expect(reference).toHaveLength(13)
			expect(decoded.get("memo")).toBe(reference)
		}
	})

	it("keeps destination and amount exactly as invoiced", () => {
		for (const amount of [
			"12.5000000",
			"0.0000001",
			"9999999999.9999999",
			"7",
			"0012.5",
		]) {
			const invoice = makeInvoice({ amount })
			const decoded = new Map(parsePayUri(sep7(invoice)))
			expect(decoded.get("destination")).toBe(invoice.recipient)
			expect(decoded.get("amount")).toBe(amount)
			expect(toStroops(decoded.get("amount") ?? "")).toBe(toStroops(amount))
		}
	})

	it("encodes concepts with spaces, accents and reserved characters", () => {
		const note = "Café & té = 3; 50% ñandú+más #1 ?x"
		const uri = sep7(makeInvoice({ note }))
		const query = uri.split("?").slice(1).join("?")
		expect(query.split("&")).toHaveLength(6)
		expect(query).not.toMatch(/[ #+;]/)
		expect(new Map(parsePayUri(uri)).get("msg")).toBe(note)
		expect(new URLSearchParams(query).get("msg")).toBe(note)
	})

	it("cannot be extended through the concept", () => {
		const note = "x&network_passphrase=Public&memo=OTHER"
		const pairs = parsePayUri(sep7(makeInvoice({ note })))
		const values = (key: string) =>
			pairs.filter(([name]) => name === key).map(([, value]) => value)
		expect(values("network_passphrase")).toEqual([TESTNET_PASSPHRASE])
		expect(values("memo")).toEqual(["ISQABCDEFGHIJ"])
		expect(values("msg")).toEqual([note])
	})

	it("omits msg without a concept and trims it otherwise", () => {
		for (const note of [undefined, "", "   "]) {
			const keys = parsePayUri(sep7(makeInvoice({ note }))).map(([k]) => k)
			expect(keys).not.toContain("msg")
		}
		const decoded = new Map(parsePayUri(sep7(makeInvoice({ note: "  A  " }))))
		expect(decoded.get("msg")).toBe("A")
	})

	it("rejects a valid muxed account as destination", () => {
		// Invoices only admit G accounts; a well-formed M address of the same
		// account is still rejected rather than passed to the wallet.
		const muxed = new MuxedAccount(new Account(RECIPIENT, "0"), "1").accountId()
		expect(StrKey.isValidMed25519PublicKey(muxed)).toBe(true)
		expect(buildSep7PayUri(makeInvoice({ recipient: muxed }), NOW)).toBeNull()
	})

	it("rejects structurally invalid invoices", () => {
		for (const overrides of [
			{ recipient: "GABC" },
			{ reference: "invalid" },
			{ reference: "ISQABCDEFGHIJ&x=1" },
			{ amount: "0" },
			{ amount: "-1" },
			{ amount: "1e3" },
			{ amount: "1.12345678" },
			{ amount: "12.5&amount=99" },
			{ asset: "USDC" as never },
			{ id: "not-a-uuid" },
			{ expiresAt: NOW + 17 * 60_000 },
			{ note: "x".repeat(61) },
		]) {
			expect(buildSep7PayUri(makeInvoice(overrides), NOW)).toBeNull()
		}
	})

	it("omits msg when the concept could render misleadingly", () => {
		for (const note of [
			"Pedido \u202E2401 ognip", // right-to-left override
			"Pedido \u2066oculto\u2069", // bidi isolate
			"Pedido\u200F 42", // right-to-left mark
			"Pedido\nRed: Mainnet", // line break forging a second line
			"Pedido\u2028Red: Mainnet", // line separator
			"Pedido\u0000 42", // NUL
			"Pedido\u0085 42", // C1 control (next line)
			"Pe\u200Bdido", // zero-width space
		]) {
			const invoice = makeInvoice({ note })
			const snapshot = structuredClone(invoice)
			const pairs = parsePayUri(sep7(invoice))
			expect(pairs.map(([key]) => key)).toEqual([
				"destination",
				"amount",
				"memo",
				"memo_type",
				"network_passphrase",
			])
			expect(new Map(pairs)).toEqual(
				new Map(parsePayUri(sep7(makeInvoice({ note: undefined })))),
			)
			expect(invoice).toEqual(snapshot)
		}
	})

	it("rejects a concept that cannot be URL encoded", () => {
		const invoice = makeInvoice({ note: "lone \ud800 surrogate" })
		expect(() => buildSep7PayUri(invoice, NOW)).not.toThrow()
		expect(buildSep7PayUri(invoice, NOW)).toBeNull()
	})

	it("rejects settled and expired invoices", () => {
		const invoice = makeInvoice()
		expect(buildSep7PayUri({ ...invoice, status: "settled" }, NOW)).toBeNull()
		expect(buildSep7PayUri(invoice, invoice.expiresAt)).toBeNull()
		expect(buildSep7PayUri(invoice, invoice.expiresAt + 1)).toBeNull()
	})

	it("stops offering SEP-7 when little time is left before expiry", () => {
		const invoice = makeInvoice()
		const cutoff = invoice.expiresAt - SEP7_MIN_REMAINING_MS
		expect(SEP7_MIN_REMAINING_MS).toBe(5 * 60_000)
		expect(buildSep7PayUri(invoice, cutoff)).not.toBeNull()
		expect(buildSep7PayUri(invoice, cutoff + 1)).toBeNull()
	})
})

describe("buildSep7PayUri against the Stellar wallet SDK parser", () => {
	it("parses as a pay request for native XLM on Testnet", () => {
		const invoice = makeInvoice({ note: "Café & té = 3; 50%" })
		const uri = sep7(invoice)
		expect(isValidSep7Uri(uri)).toEqual({ result: true })
		const parsed = parseSep7Uri(uri)
		expect(parsed).toBeInstanceOf(Sep7Pay)
		const pay = parsed as InstanceType<typeof Sep7Pay>
		expect(pay.operationType).toBe("pay")
		expect(pay.destination).toBe(invoice.recipient)
		expect(pay.amount).toBe(invoice.amount)
		expect(pay.assetCode).toBeUndefined()
		expect(pay.assetIssuer).toBeUndefined()
		expect(pay.memo).toBe(invoice.reference)
		expect(pay.memoType).toBe("MEMO_TEXT")
		expect(pay.networkPassphrase).toBe(Networks.TESTNET)
		expect(pay.msg).toBe(invoice.note)
		expect(pay.callback).toBeUndefined()
		expect(pay.originDomain).toBeUndefined()
	})

	it("rejects the former web+stellar://pay format", () => {
		const legacy =
			"web+stellar://pay?destination=GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF&amount=12.5000000&asset=XLM&memo=ISQABCDEFGHIJ&memo_type=text&network=TESTNET"
		expect(isValidSep7Uri(legacy).result).toBe(false)
	})

	it("reads a URI without network_passphrase as Mainnet", () => {
		// Why the passphrase is mandatory here: SEP-0007 defaults to the public
		// network, and so does the reference parser.
		const withoutNetwork = sep7(makeInvoice()).replace(
			/&network_passphrase=[^&]*/,
			"",
		)
		const pay = parseSep7Uri(withoutNetwork) as InstanceType<typeof Sep7Pay>
		expect(pay.networkPassphrase).toBe(Networks.PUBLIC)
	})
})

describe("SEP-7 and the Wallets Kit payment describe the same request", () => {
	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("matches the in-app payment destination, amount, memo and network", async () => {
		const invoice = makeInvoice({ amount: "0.0000001" })
		const payer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey()
		vi.useFakeTimers({ toFake: ["Date"] })
		vi.setSystemTime(NOW)
		vi.spyOn(horizon, "loadAccount").mockResolvedValue(
			new Account(payer, "100") as never,
		)
		const xdr = await buildPaymentTransaction(payer, invoice)
		const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction
		const [payment] = tx.operations as Operation.Payment[]

		const decoded = new Map(parsePayUri(sep7(invoice)))
		expect(tx.networkPassphrase).toBe(decoded.get("network_passphrase"))
		expect(tx.memo.type).toBe("text")
		expect(tx.memo.value?.toString()).toBe(decoded.get("memo"))
		expect(tx.operations).toHaveLength(1)
		expect(payment?.type).toBe("payment")
		expect(payment?.asset.isNative()).toBe(true)
		expect(payment?.destination).toBe(decoded.get("destination"))
		expect(toStroops(payment?.amount ?? "")).toBe(
			toStroops(decoded.get("amount") ?? ""),
		)
		expect(Number(tx.timeBounds?.maxTime)).toBeGreaterThan(0)
	})
})
