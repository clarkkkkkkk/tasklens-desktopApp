# Security audit — 23 October 2026

Scope/base and severity findings are recorded in [RELEASE_AUDIT](RELEASE_AUDIT.md). Evidence here is redacted. No credentials, raw provider error bodies, personal profiles or scanner secrets are committed.


## Dependency follow-up — 2026-10-24

A fresh advisory database reported **RUSTSEC-2026-0386** in Tokio 1.53.2 (`AsyncFd` I/O safety). The lockfile was updated to the advisory's patched 1.53.3 release; Cargo also normalized dependency edges during resolution without changing other package versions. No advisory suppression or audit threshold was added. Run locked Rust tests and the exact-commit Cargo audit before release approval. The previously documented upstream maintenance/GTK warnings remain separate from this fixed advisory. [Tokio upstream fix](https://github.com/tokio-rs/tokio/pull/8587).

## Executed discovery

- Gitleaks 8.30.1, official archive checksum verified (`551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`): all reachable history (`--all --full-history`, 45 commits) and scoped working tree/generated frontend scan: **zero findings**. Supplemented default rules with a Groq BYOK detector. Historical refs unavailable locally are outside scope.
- npm audit: initially two moderate Vitest/mocker advisories (`GHSA-qxg6-89mg-rqv8`, `GHSA-xp26-3454-mjgp`); after exact Vitest 4.1.12 update: **zero vulnerabilities**.
- cargo-audit 0.22.2: **zero vulnerabilities, eight warnings** against advisory database `640bf5a9f06e66d8721e8772766531fe77c8630d` (22 October 2026). Warnings: unsound `glib 0.18.5` (`RUSTSEC-2024-0429`); unmaintained `proc-macro-error 1.0.4` (`RUSTSEC-2024-0370`), two `zbus_names` versions (`RUSTSEC-2026-0371`), two `zvariant` versions (`RUSTSEC-2026-0370`), two `zvariant_derive` versions (`RUSTSEC-2026-0372`). These remain open; no blanket ignore was introduced.
- Fixture review found a developer home-directory prefix in one historical microphone receipt. Prefix redacted; no measurement rewritten. Synthetic fixtures and source generators remain available. Automated token scanning is not a comprehensive personal-data classifier.

## Boundaries reviewed

| Boundary                  | Finding / decision                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Groq keys                 | Native Windows Credential Manager/Fedora Secret Service with session-only fallback; no plaintext file fallback. UI submission does not return the key. Acceptance identity now has its own credential namespace. Production namespace stays compatible. |
| Cloud consent and routing | Fixed native Groq HTTPS URLs, normal certificate validation, redirects disabled, native mode/consent/credential/budget gates. Local mode does not silently escalate to Groq. Connection verification is distinct from source consent.                   |
| Cloud quotas              | One active session, bounded pending queue, per-attempt local limits, bounded 429 retry and cancellation. Advisory local counters do not replace provider account limits or prevent user tampering.                                                      |
| Webview / IPC             | Main-window restrictions and explicit Tauri command permissions; no general shell/filesystem plugin. CSP does not permit direct Groq access. No caller-supplied authenticated endpoint.                                                                 |
| Rendering                 | Source/model strings use React text rendering; no production arbitrary HTML/eval path found in reviewed code. This is not a formal XSS proof.                                                                                                           |
| Native execution          | Structured subprocess arguments, bounded lifetimes/output, local model provenance and hashes; no shell interpolation for source content.                                                                                                                |
| Temporary captures        | OCR directories hardened on Unix with private permissions and symlink rejection. Voice job storage already uses private directories. Windows ACL behavior needs native acceptance.                                                                      |
| Local parsers             | Bounded Ollama NDJSON pending buffer and HTTP status/header/chunk lines added. Tests reject oversized input.                                                                                                                                            |
| Local data/backups        | Tasks and exported backups are unencrypted. SQLite is only the reminder delivery journal. OS account access can expose source text and tasks; backups require user care. No claim of application-level encryption.                                      |
| Build environment         | Production blocks forced mock extraction and credential-like public `VITE_` variables. Runtime models remain included; CI uses no real Groq key.                                                                                                        |
| CI artifacts              | Public binaries/resources/receipts only; no app profiles, credentials or raw secret reports intended for artifact upload. Pinned actions, read-only token and bounded retention added.                                                                  |

## Repository controls requiring owner action

Read-only GitHub inspection found public visibility and MIT detection, no published release, no topics, unprotected main, private vulnerability reporting disabled, secret scanning/push protection disabled and dependency security updates disabled. Enable available controls, add truthful local-plus-optional-cloud description/topics and designate private vulnerability reporting. No remote administration settings were changed.

If a real exposed credential is later discovered: stop release approval, report category/location with redacted evidence, revoke/rotate it, remove active exposure, then request explicit approval before any shared-history rewrite. No such credential was detected in this audit.

## Verification limits

No live Groq account request was performed. A successful mocked response is not credential persistence, platform security or cloud accuracy evidence. Current Windows store/ACL behavior and Fedora locked/unavailable Secret Service behavior need isolated native acceptance. Upstream advisory warnings, unencrypted local data, and incomplete current installer/runtime verification remain material release limitations.

## Completed Fedora acceptance

The isolated native application passed 12 command/UI checks without a live Groq request. A unique synthetic Secret Service entry passed write/read/remove/absence across separate processes. This validates the available unlocked Fedora store only; locked/unavailable-store and Windows acceptance are still pending. The complete local browser run recorded 68 passes and 29 failures; it is not a fully passed security or release gate.
