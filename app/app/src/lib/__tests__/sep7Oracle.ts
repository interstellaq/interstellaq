/**
 * Independent SEP-7 oracle for tests: the URI parser maintained by Stellar in
 * @stellar/typescript-wallet-sdk (dev dependency only, never bundled).
 *
 * The SDK bundle loads `jws` for SEP-10 at import time, and its
 * `buffer-equal-constant-time` dependency reads `buffer.SlowBuffer`, which
 * Node 25 removed. A placeholder is installed before the import so the bundle
 * loads; it is only read by that SEP-10 code path and never by the SEP-7
 * parser under test.
 */
import { createRequire } from "node:module"

const nodeBuffer = createRequire(import.meta.url)("buffer") as {
	SlowBuffer?: unknown
}
if (nodeBuffer.SlowBuffer === undefined) {
	nodeBuffer.SlowBuffer = function SlowBuffer() {}
}

const sdk = await import("@stellar/typescript-wallet-sdk")

export const { isValidSep7Uri, parseSep7Uri, Sep7Pay } = sdk
