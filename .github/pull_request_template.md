## What & why

<!-- What does this change, and why? Link an issue if there is one. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Security fix
- [ ] Refactor / architecture / performance
- [ ] Docs / infra / tooling only

## Checklist

- [ ] `pnpm run typecheck` passes (app + `-p config/tsconfig.electron.json`)
- [ ] `pnpm run lint` passes with no new warnings
- [ ] `pnpm test` passes, and a co-located `*.test.ts` was added/updated for
      any new `core/`-level logic (see CLAUDE.md's Testing section)
- [ ] `pnpm run build` succeeds
- [ ] If this touches `src/core/vault/`, `src/core/totp/`, `src/core/password/`,
      `src/electron/`, or `extension/`: I've re-read CLAUDE.md's
      "Architectural invariants" section and this doesn't violate any of them
- [ ] If this changes user-visible behavior: `CHANGELOG.md` updated
- [ ] If this changes a magic number or cross-boundary constant: it lives in
      `src/constants/index.ts` (or `src/constants/shared.json` if the
      extension needs it too), not inline

## Security-relevant?

<!--
If this touches crypto, auth/unlock, IPC, or the extension's message-passing
surface, say so explicitly — it should get a security-focused look, not just
a general code review. See CODEOWNERS and SECURITY.md.
-->

- [ ] This PR touches security-sensitive code (see above) — flagging for a
      security-focused review, not just a general one.
