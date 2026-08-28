# Changesets

This project is `"private": true` and never published to npm — Changesets is
used here purely for **structured changelog entries + automated version
bumps**, not package publishing.

## Workflow

1. Made a change worth a changelog entry? `pnpm changeset` — picks a bump
   type (patch/minor/major) and writes a short description. Answer "no" to
   any "which packages" prompt beyond `securevault` itself; this isn't a
   monorepo. Commit the generated `.changeset/*.md` file alongside your
   change.
2. When ready to cut a release: `pnpm changeset version` — consumes every
   pending changeset file, bumps `package.json`'s `version`, and writes the
   consolidated entries into `CHANGELOG.md`.
3. `git tag v$(node -p "require('./package.json').version")` and push the
   tag — that's what `.github/workflows/ci.yml`'s release job (Electron
   builds + draft GitHub Release) triggers on.

No `pnpm changeset publish` step — there's nothing to publish to a registry.

See <https://github.com/changesets/changesets> for the full docs.
