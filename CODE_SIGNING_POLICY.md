# Code signing policy

Vaultkin release builds are **not code-signed**. Windows SmartScreen and macOS
Gatekeeper warn on first run.

## Verifying a download

Release files are built by the `CI` workflow in this repository
(`.github/workflows/ci.yml`) from a version tag. Each release includes:

- `SHA256SUMS.txt`, the SHA-256 checksums of the files;
- build provenance: `gh attestation verify <file> --repo DrummingBird1/vaultkin`;
- `sbom.json`, the CycloneDX software bill of materials.

## Privacy

Vaultkin does not send any data to the project or to third parties. The only
network requests it makes are the ones the user turns on: the optional
breach check (5 hex characters of a SHA-1 hash, k-anonymity, to
`api.pwnedpasswords.com`), the user's own WebDAV or folder sync, and the
update check against this repository's GitHub Releases. See
[PRIVACY.md](PRIVACY.md).
