import { describe, expect, it } from "vitest"
import {
	createReference,
	isValidReference,
	MAX_MEMO_BYTES,
	REFERENCE_PREFIX,
} from "../reference"

describe("createReference", () => {
	it("builds a memo-safe reference with the ISQ prefix", () => {
		const reference = createReference()
		expect(reference.startsWith(REFERENCE_PREFIX)).toBe(true)
		expect(isValidReference(reference)).toBe(true)
	})

	it("fits inside a Stellar text memo", () => {
		for (let i = 0; i < 100; i++) {
			const reference = createReference()
			expect(new TextEncoder().encode(reference).length).toBeLessThanOrEqual(
				MAX_MEMO_BYTES,
			)
		}
	})

	it("generates unique references", () => {
		const references = new Set(
			Array.from({ length: 1000 }, () => createReference()),
		)
		expect(references.size).toBe(1000)
	})
})

describe("isValidReference", () => {
	it("accepts a generated reference", () => {
		expect(isValidReference(createReference())).toBe(true)
	})

	it("rejects malformed values", () => {
		expect(isValidReference("")).toBe(false)
		expect(isValidReference("ISQ")).toBe(false)
		expect(isValidReference("XYZABCDEFGHIJ")).toBe(false)
		// lowercase and characters outside the base32 alphabet
		expect(isValidReference("isqabcdefghij")).toBe(false)
		expect(isValidReference("ISQABCDEF1GHI")).toBe(false)
		// too long for a 28 byte text memo
		expect(isValidReference("ISQABCDEFGHIJEXTRA")).toBe(false)
	})
})
