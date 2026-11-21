# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io),
certificate by [SignPath Foundation](https://signpath.org).

## What is signed

Only release builds of Vaultkin for Windows, produced by the `CI` workflow in
this repository (`.github/workflows/ci.yml`) from a version tag on `master`:

- the installer and the app executable (`Vaultkin.exe`);
- the browser-extension native-messaging host
  (`resources/bridge-host/vaultkin-bridge-host.exe`).

Nothing built on a developer machine is signed. Each signing request is tied
to the GitHub Actions run that built the artifact, so the signed binary can be
traced to a public commit.

## Team roles

| Role      | Members                                           |
| --------- | ------------------------------------------------- |
| Committer | [DrummingBird1](https://github.com/DrummingBird1) |
| Reviewer  | [DrummingBird1](https://github.com/DrummingBird1) |
| Approver  | [DrummingBird1](https://github.com/DrummingBird1) |

Every change reaches `master` through a pull request. All members use
multi-factor authentication on GitHub and on SignPath.

## Privacy

Vaultkin does not send any data to the project or to third parties. The only
network requests it makes are the ones the user turns on: the optional
breach check (5 hex characters of a SHA-1 hash, k-anonymity, to
`api.pwnedpasswords.com`), the user's own WebDAV or folder sync, and the
update check against this repository's GitHub Releases. See
[PRIVACY.md](PRIVACY.md).
