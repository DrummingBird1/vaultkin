/**
 * @file config/lighthouserc.cjs
 * Lighthouse CI — audits the built app shell (index.html + the unlock/
 * create-vault screen, since that's the only thing an anonymous crawl can
 * ever see; Lighthouse can't unlock a vault). Advisory only ("warn", not
 * "error" assertions) — there's no established baseline yet, so this starts
 * by *reporting* Core Web Vitals over time rather than blocking PRs on a
 * threshold nobody has validated is achievable. Tighten to "error" once a
 * few runs establish what's actually normal for this app.
 */
const path = require("path");

module.exports = {
  ci: {
    collect: {
      // staticDistDir spins up its own local static server against the
      // production build — no need to run `vite preview` ourselves first.
      // Absolute path (via __dirname), not "../dist/renderer" — LHCI
      // resolves relative collect/upload paths against the *process's*
      // working directory, not this config file's directory. Since
      // `pnpm run lighthouse` runs from the project root, a relative
      // "../dist/renderer" silently resolved one level ABOVE the project
      // (a sibling directory that doesn't exist) instead of into it —
      // every audit failed with a 404 until this was made absolute.
      staticDistDir: path.resolve(__dirname, "..", "dist", "renderer"),
      url: ["http://localhost/index.html"],
      numberOfRuns: 3,
    },
    assert: {
      // no-pwa: this app does have a real PWA manifest/service worker
      // (config/vite.config.ts's VitePWA plugin — see CLAUDE.md's PWA
      // gotcha), but PWA installability audits are finicky under LHCI's
      // plain-HTTP local static server in ways unrelated to whether the app
      // itself is configured correctly (see the service-worker-registration
      // gotcha in CLAUDE.md for a related environment quirk found this
      // session). Keeping this preset avoids CI noise from that, at the
      // cost of not tracking PWA-category scores here.
      preset: "lighthouse:no-pwa",
      assertions: {
        "categories:performance": ["warn", { minScore: 0.8 }],
        "categories:accessibility": ["warn", { minScore: 0.9 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": "off",
        // The preset makes these two hard errors, which broke the "advisory
        // only" intent above on the first CI run. Both are expected for an
        // SPA shell that loads one bundle; keep them visible as warnings.
        "network-dependency-tree-insight": "warn",
        "unused-javascript": "warn",
        // @lhci/cli 0.16 made this a preset error; same advisory intent.
        "valid-source-maps": "warn",
      },
    },
    upload: {
      // filesystem, not temporary-public-storage — the latter uploads the
      // full HTML report to a Google-hosted public URL. Nothing in a
      // performance report is secret, but this project defaults to
      // local-only wherever there's a choice (see invariant #1 in
      // CLAUDE.md) and there's no reason to make an exception here.
      target: "filesystem",
      outputDir: path.resolve(__dirname, "..", "lighthouse-report"),
    },
  },
};
