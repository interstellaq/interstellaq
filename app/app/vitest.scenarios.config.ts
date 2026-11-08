import { defineConfig } from "vitest/config"

// Live Testnet scenarios (issue #3). Excluded from `npm test` and from
// `npm run test:net`. The suite is skipped unless the run is explicitly
// authorized with INTERSTELLAQ_TESTNET_SCENARIOS=authorized.
export default defineConfig({
	test: {
		include: ["src/lib/__tests__/live.scenarios.testnet.test.ts"],
		exclude: [],
		testTimeout: 600_000,
		hookTimeout: 120_000,
		// Show the evidence log (accounts, hashes, results) of passing tests.
		silent: false,
		provide: {
			testnetScenariosAuthorized:
				process.env.INTERSTELLAQ_TESTNET_SCENARIOS === "authorized",
		},
	},
})
