// @ts-check
/**
 * @file stryker.config.mjs
 * Mutation testing — opt-in via `pnpm run test:mutation`, NOT wired into any
 * CI job that blocks PRs. A full Stryker run re-executes the test suite once
 * per mutant (potentially hundreds of times), so it's minutes-to-tens-of-
 * minutes even scoped narrowly; that's a fine cost for an occasional
 * "how good are our tests, really" check, not for every push.
 *
 * Scope is deliberately narrow: just the crypto/password/totp core, not the
 * whole src/ tree. This is the code where a test suite that's green but
 * doesn't actually *catch* anything is most dangerous — see CLAUDE.md
 * invariants #11 and #12, both cases where 150 passing tests didn't catch a
 * real bug, one of which (#11) lived in exactly this directory. Mutation
 * testing measures that gap directly: it doesn't ask "do the tests pass",
 * it asks "if I break the code on purpose, do the tests notice."
 */
export default {
  packageManager: "pnpm",
  // Explicit, rather than relying on Stryker's "@stryker-mutator/*" default
  // plugin-glob autodiscovery — that glob silently found nothing under
  // pnpm's non-flat node_modules layout (`Cannot find TestRunner plugin
  // "vitest"` even with @stryker-mutator/vitest-runner installed).
  plugins: ["@stryker-mutator/vitest-runner"],
  testRunner: "vitest",
  vitest: {
    configFile: "config/vitest.config.ts",
  },
  mutate: [
    "src/core/vault/engine.ts",
    "src/core/vault/serializer.ts",
    "src/core/totp/totp.ts",
    "src/core/totp/base32.ts",
    "src/core/password/generator.ts",
    "src/core/password/strength.ts",
  ],
  reporters: ["html", "clear-text", "progress"],
  htmlReporter: {
    fileName: "reports/mutation/index.html",
  },
  coverageAnalysis: "perTest",
  thresholds: {
    // Advisory only (nothing consumes these to fail a build) — a baseline to
    // notice drift against next time this is run, not a gate.
    high: 80,
    low: 60,
    break: null,
  },
};
