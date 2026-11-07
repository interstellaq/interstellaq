import { defineConfig } from "vitest/config"

// Separate config for the live Testnet suite: the default `npm test` run
// excludes it (see vite.config.ts), and `npm run test:net` runs only this
// file against the public network.
export default defineConfig({
	test: {
		include: ["src/lib/__tests__/live.testnet.test.ts"],
		exclude: [],
		testTimeout: 120_000,
		hookTimeout: 120_000,
	},
})
