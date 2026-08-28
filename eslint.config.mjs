// @ts-check
/**
 * @file eslint.config.mjs
 * Flat config (ESLint 9+). `.mjs` extension so it's parsed as ESM regardless
 * of the project's package.json `"type"` field.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/**", "release/**", "coverage/**", "node_modules/**", "extension/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
        chrome: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // eslint-plugin-react-hooks v7's "recommended" preset bundles the full
      // React Compiler rule suite (set-state-in-effect, purity, etc.) — this
      // codebase doesn't use the React Compiler, and several of those rules
      // flag legitimate manual-memoization patterns as errors. We only want
      // the two classic, universally-applicable hook rules.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // TypeScript strictness we actually want, tuned for this codebase:
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
      // The codebase intentionally uses `interface Foo {}` merging patterns
      // and empty catch blocks are used deliberately (best-effort cleanup).
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // Electron main process runs under Node, not the browser.
    files: ["src/electron/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Plain CJS scripts (tailwind/postcss configs, scripts/*.cjs) run under Node's CJS loader.
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      // require() is the correct, idiomatic way to import in a .cjs file.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Node-run ESM tooling scripts (lockfile linting, extension bundling,
    // manifest validation, ...) — not part of the browser/Electron bundle.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  // Must stay last: turns off ESLint stylistic rules that would otherwise
  // conflict with Prettier's formatting (this repo has no stylistic ESLint
  // rules enabled today, but this keeps it that way if any get added later).
  eslintConfigPrettier,
);
