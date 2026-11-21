# OpenSSF Best Practices badge: self-assessment

The [OpenSSF Best Practices Badge](https://www.bestpractices.dev/) is applied for
through their site, which needs an account and a project entry — neither can be
created from this repository. This page collects the evidence so the application
is a copy-paste job rather than a research project, and so the answers stay true
as the project changes.

Each row names the file or command that answers the criterion. Where the answer is
no, it says so.

## Basics

| Criterion                               | Status | Evidence                                                                                                              |
| --------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| Public source, versioned                | Yes    | GitHub, git history                                                                                                   |
| Floss license                           | Yes    | [LICENSE](../LICENSE) (MIT)                                                                                           |
| Documentation of what the software does | Yes    | [README](../README.md), [docs/whitepaper.md](whitepaper.md)                                                           |
| Documentation of how to install and run | Yes    | README quick start, [.devcontainer](/.devcontainer/README.md)                                                         |
| Documentation of how to contribute      | Yes    | [CONTRIBUTING.md](../CONTRIBUTING.md), [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)                                    |
| Documentation of how to report bugs     | Yes    | Issue templates, CONTRIBUTING                                                                                         |
| Discussion mechanism                    | Yes    | GitHub Issues; Discussions need enabling in repository settings                                                       |
| Active maintenance                      | Yes    | Commit history, changesets                                                                                            |
| Unique version numbering                | Yes    | Semver via changesets, `APP_VERSION` in `src/config.ts`                                                               |
| Release notes                           | Yes    | The release workflow publishes a changelog generated from changesets (`.changeset/`, `.github/workflows/release.yml`) |

## Change control

| Criterion                              | Status | Evidence                                                                                                   |
| -------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| Public version control                 | Yes    | `main` on GitHub                                                                                           |
| Public, reproducible releases          | Yes    | `.github/workflows/release.yml`, `.github/workflows/deploy.yml`                                            |
| Automated reproducible builds          | Partly | The build is deterministic for a given lockfile; no bit-for-bit rebuild check yet                          |
| Build provenance                       | Yes    | SLSA attestation in `.github/workflows/deploy.yml`                                                         |
| Signed releases                        | Partly | Attested artifacts via `actions/attest-build-provenance`; no GPG-signed tags                               |
| Interposed malicious commit detection  | Yes    | Branch protection on `main` (required reviews, required status checks) — configured in repository settings |
| Commits are reviewed                   | Yes    | PR flow; see CONTRIBUTING                                                                                  |
| Commits are made by authorized parties | Yes    | Repository permissions                                                                                     |
| Commits are cryptographically signed   | No     | Not required; can be turned on in repository settings                                                      |

## Reporting and response

| Criterion                                 | Status | Evidence                                                                      |
| ----------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| Vulnerability reporting process           | Yes    | [SECURITY.md](../SECURITY.md#reporting-a-vulnerability)                       |
| Private reporting channel                 | Yes    | GitHub Private Vulnerability Reporting                                        |
| Published response timeline               | Yes    | SECURITY.md: acknowledgement in 3 days, assessment in 10, fix in 30/90        |
| Vulnerability reports fixed and disclosed | Yes    | Advisories, and a regression test per fix                                     |
| Security review of reports                | Yes    | Single maintainer; the Dependabot and CodeQL queues are triaged with releases |

## Quality

| Criterion                        | Status | Evidence                                                      |
| -------------------------------- | ------ | ------------------------------------------------------------- |
| Working build system             | Yes    | `npm run build`                                               |
| Automated test suite             | Yes    | 1,600+ unit and eval tests, plus a browser suite              |
| Tests are run on change          | Yes    | `.github/workflows/ci.yml`                                    |
| Test coverage is measured        | Yes    | `npm run test:coverage` with thresholds in `vitest.config.js` |
| New functionality has tests      | Yes    | Required in review                                            |
| Warning-free build               | Yes    | TypeScript `--noEmit` and ESLint in CI                        |
| Static analysis                  | Yes    | CodeQL `security-extended`, `.github/workflows/codeql.yml`    |
| Dependency management            | Yes    | Dependabot, `.github/dependabot.yml`; `npm audit` in CI       |
| Known vulnerabilities fixed      | Yes    | Dependabot alerts and updates                                 |
| No unchecked dependency versions | Yes    | `package-lock.json`, `npm ci` everywhere                      |

## Security analysis

| Criterion                    | Status | Evidence                                                                                                          |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| Threat model documented      | Yes    | [SECURITY.md](../SECURITY.md)                                                                                     |
| Attack surface documented    | Yes    | SECURITY.md, [docs/whitepaper.md](whitepaper.md) §8                                                               |
| Cryptographic best practices | Yes    | [docs/whitepaper.md](whitepaper.md) §6: PBKDF2-SHA-256 at 600k, AES-256-GCM, non-extractable keys, per-record AAD |
| No home-grown cryptography   | Yes    | WebCrypto only                                                                                                    |
| Secure defaults              | Yes    | CSP without `unsafe-eval`, Trusted Types enforced, no telemetry, no accounts                                      |
| Input validation             | Yes    | Host allowlists, CSP `connect-src`, escaped retrieval context                                                     |
| Output encoding              | Yes    | One sanitizing Trusted Types policy for every HTML sink                                                           |

## Honest gaps

- **Bit-for-bit reproducible builds** are not verified in CI.
- **Signed git tags** are not used.
- **Two-person review** is not always possible for a single-maintainer project; this
  is a structural limit, not an oversight.
- **Penetration testing** has not been performed by a third party.

Applying for the badge means answering these as they are. A badge that does not
match the code is worse than no badge.
