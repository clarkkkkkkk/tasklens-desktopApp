# TaskLens production readiness

**Status: NOT READY**

Version: **0.1.0 prerelease candidate**. Date: 2026-10-24 (Asia/Manila). The owner authorized source push and requested a GitHub-only draft with verified parts. Publication remains blocked until required security, checksum and platform acceptance pass.

## Baseline and preservation

Initial HEAD and live remote main: `374f692afe22de55bb80472035006e67919ddf44` (onboarding refinement). Latest merge in its history: `0bb4b72` (PR #4). Remote collaborator branch `frenzzy` points to `76bebcf23ffaebfef043dab9ff91afa804e5c0df`; its history is already contained in main.

The initial worktree contained runtime/security fixes and guided-tour changes. The user selected inclusion of all of them. A binary patch, untracked archive, status and live remote-ref snapshot were saved outside the repository before creating `codex/production-release-preparation`. Other active chats subsequently edited the shared checkout; the combined candidate was copied into a managed isolated worktree on `codex/production-release-candidate` to prevent further build interference. No contributor work was reset or discarded.

The recovery snapshot is local-only at `/home/clark/tasklens-release-baseline-20261023/`. It is not part of a public release. Final artifact manifests identify their exact source commit and Git tree; later documentation-only commits must not be confused with the compiled candidate.

## Implemented release preparation

- Extend the existing Tauri/Inno infrastructure: RPM, DEB, AppImage, Windows EXE and per-architecture DMG names; clean generated staging; strict matching versions; exact expected output set; manifest and SHA-256 generation; automatic GitHub-sized parts and no automatic publication.
- Preserve Qwen3-4B, Whisper Small, OCR languages, local-first defaults, optional Groq consent, existing design and storage identity.
- Add Windows publisher metadata, optional desktop shortcut, offline WebView2 signature/hash checks, explicit installation failure handling and optional Authenticode setup/uninstaller/application signing.
- Add macOS Intel mapping/sidecar overlay, native architecture checks and Keychain credential backend. Native macOS validation is blocked by missing hosts.
- Prepare separate static, frontend, browser, native preparation, Rust, packaging and artifact verification jobs with pinned actions/toolchains. Manual packaging remains distinct from publication.
- Preserve collaborator security fixes, guided tour, production environment guard and patched Vitest dependency. Use the existing split utilities for the owner-selected GitHub-only flow and provide system shell/PowerShell reconstruction.

## Evidence register

The audit commands below were actually invoked. Initial shared-checkout failures are retained rather than converted into passes. Final isolated results and artifact inventory are recorded as they complete.

| Command / check                                                                                           | Result and boundary                                                                                             |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `git status --short --branch`, `git log`, `git ls-remote --heads origin`, collaborator history comparison | PASS: baseline/remote refs inspected; work preserved                                                            |
| `npm ci`                                                                                                  | PASS after dependency update; initial checks raced another chat's installation and reported missing executables |
| `npm run check`                                                                                           | PASS on shared candidate; repeat in isolated candidate pending                                                  |
| `npm run format:check`                                                                                    | PASS on shared candidate after focused formatting; isolated rerun pending                                       |
| `npm test`                                                                                                | PASS: 144 passed, 2 opt-in tests skipped; isolated rerun pending                                                |
| `npm run test:assets`                                                                                     | PASS: preparation tests; see ignored command logs                                                               |
| `npm run test:release`                                                                                    | PASS: 3 tests, including tampering/missing installer/path traversal checks                                      |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check`                                                  | PASS after formatting                                                                                           |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml`                                                | PASS: 76 passed, 8 explicitly ignored native/real-inference tests                                               |
| `cargo check --manifest-path src-tauri/Cargo.toml`                                                        | PASS; Keychain dependency lock entries resolved, Linux compilation only                                         |
| `npm run verify:assets`                                                                                   | PASS on Fedora: 3,062,001,808 pinned payload bytes; does not prove inference quality                            |
| `npm run prepare:notices`                                                                                 | PASS in isolated worktree: 850 dependency notices collected, including new Keychain dependencies                |
| `npm run test:e2e` (shared checkout)                                                                      | Interrupted after timeouts during concurrent rebuilds; no suite PASS claimed                                    |
| `TASKLENS_TEST_PORT=1437 npm run test:e2e -- --workers=1`                                                 | NOT RUN to completion yet; isolated candidate rerun                                                             |
| `npm audit --json`                                                                                        | PASS after Vitest patch: zero vulnerabilities                                                                   |
| `cargo-audit audit --file src-tauri/Cargo.lock --json`                                                    | Zero vulnerability entries; OPEN unsoundness/maintenance warnings                                               |
| `gitleaks git --redact ... --log-opts='--all'`                                                            | PASS: initial 37-commit history scan; final scan pending                                                        |
| Clean-machine native acceptance                                                                           | BLOCKED except available isolated Fedora tests; see platform matrix                                             |
| Hosting/download verification                                                                             | BLOCKED: approved large-file host not selected                                                                  |
| Signing/notarization/real Groq                                                                            | BLOCKED: native hosts/signing credentials/authorized test key unavailable                                       |

A named toolchain installation was initially incomplete while rustup was downloading components; the installed stable toolchain reported the same Rust/Cargo 1.99.0 versions and ran checks. The completed named pin is used for candidate builds. There are no claimed Windows/macOS compilation results from this Fedora host.

## Remaining release blockers

1. Complete local and clean-machine native workflows on each advertised platform, including real inference, permissions, upgrades and uninstall.
2. Build and verify Windows/macOS packages on their actual native hosts; verify baseline CPUs and paths with spaces/non-ASCII characters.
3. Review the transitive GLib unsoundness advisory and Cargo maintenance warnings; complete final artifact secret/license/dependency inspection.
4. Verify GitHub draft asset uploads, all downloaded part hashes and native reconstruction before publishing links.
5. Verify signing/notarization when credentials exist, otherwise explicitly disclose unsigned limitations. Intel remains unverified.
6. Run real Groq with an authorized key and complete secure-store acceptance on each OS; ordinary CI uses synthetic/mocked tests only.
7. Require passing CI on the intended commit and owner approval before any public release. No 1.0.0 or stable claim is justified.

See [platform evidence](PLATFORM_TEST_MATRIX.md), [distribution and installation](DISTRIBUTION.md), [security findings](SECURITY_AUDIT.md) and [release checklist](RELEASE_CHECKLIST.md).
