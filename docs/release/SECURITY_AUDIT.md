# Release security audit

Date: 2026-10-24 (Asia/Manila). Baseline: `374f692afe22de55bb80472035006e67919ddf44` plus the preserved candidate changes. This is a scoped engineering audit, not a security certification. Production approval remains **NOT READY**.

## Results and findings

| Severity      | Finding                                                                               | Result / disposition                                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High          | Full native acceptance and verified distribution are incomplete                       | BLOCKED; no production support or verified download claims                                                                                                                                                                    |
| Medium        | GLib `RUSTSEC-2024-0429` unsound iterator implementation in transitive GTK dependency | OPEN; Cargo classifies it as an `unsound` warning, not in its vulnerability count. Review reachability/upstream fix before production approval. Do not blindly upgrade incompatible GTK bindings.                             |
| Medium        | macOS native credential backend previously returned unavailable                       | Native Keychain backend added using keyring 3.6.3 `apple-native`; compilation/locked-store/persistence/removal acceptance on macOS remains BLOCKED                                                                            |
| High          | Zod `GHSA-mrhx-c7xc-m3w5` collection-validation resource exhaustion                   | Found by fresh npm audit; upgraded from Zod 3 to pinned 4.6.7. Preserve nested defaults and legacy questions through explicit compatibility handling and migration regression coverage. Final validation recorded separately. |
| Medium        | Vitest development-tool advisory `GHSA-qxg6-89mg-rqv8`                                | Remediated by collaborator's preserved 4.1.12 update; subsequent npm audit reports zero vulnerabilities                                                                                                                       |
| Medium        | Oversized installers and unverified signing infrastructure                            | BLOCKED; GitHub-only split delivery selected; draft download/native reconstruction and Windows signing/Apple notarization remain unverified                                                                                   |
| Low           | Cargo maintenance advisories                                                          | proc-macro-error (`RUSTSEC-2024-0370`), zbus_names (`RUSTSEC-2026-0371`), zvariant (`RUSTSEC-2026-0370`), zvariant_derive (`RUSTSEC-2026-0372`). Some occur at multiple versions; retain in risk register.                    |
| Informational | Local task data, reminder journal and exports are unencrypted                         | Disclosed; no encryption, backup import or primary SQLite task-storage claim                                                                                                                                                  |

## Executed automated evidence

- Gitleaks 8.30.1 binary downloaded from its official release and verified against upstream SHA-256 checksums. `gitleaks git --redact --report-format json --report-path ... --log-opts='--all'` scanned 37 commits and approximately 2.95 MB with no leaks found at the initial baseline. Repeat before source push, including newly fetched history.
- `npm audit --json`: initial report had two moderate development dependency entries; after Vitest 4.1.12, zero reported vulnerabilities. A clean audit is time-bound and does not certify application security.
- `cargo-audit 0.22.2 audit --file src-tauri/Cargo.lock --json`: zero vulnerability entries, seven unmaintained-package entries and one GLib unsoundness entry. These warnings are not suppressed.
- `npm run verify:assets`: all manifest-pinned models, language data, notices and native runtime provenance passed on Fedora. Verified payload: 3,062,001,808 bytes before TaskLens/system WebView and supplemental dependency notices.
- Working-tree, final frontend and extracted artifact scans must be recorded with final candidate evidence before release approval. Reports contain redaction, never discovered credential values.

Raw logs remain in ignored `.local-ai/release-audit/`; only sanitized summaries belong in Git. No real Groq key was requested, read, transmitted or bundled for this audit. Native credential tests use an isolated synthetic service identifier and must not touch the production account.

## Reviewed controls and changes

- Production Vite/release builds reject mock provider selection and credential-like `VITE_*` variables, since Vite embeds those variables into public frontend JavaScript. Labelled samples and browser fixtures remain available.
- Groq uses native HTTPS and OS credential storage. Production service identity remains `app.tasklens.desktop.groq`; isolated acceptance identifiers receive different credential services. There is no plaintext persistent-key fallback. Keychain availability on macOS is not claimed until tested.
- Main-window capabilities enumerate native commands. The CSP limits frontend network access to Tauri IPC; Groq requests remain native. Review and explicit cloud consent are retained.
- Preserved collaborator fixes bound loopback/Ollama response headers and OCR input handling. Limits and cancellation are checked by Rust regression tests. No local error silently invokes cloud extraction.
- Model sources, revisions, sizes and hashes remain pinned. Runtime receipt hashes are verified before packaging; final installer hashes are calculated after signing. Hashes provide integrity only when obtained from a trusted source.
- Windows packaging validates an approved offline WebView2 hash and Microsoft signature, rejects small bootstrapper payloads, and checks installation failure. The correct x64 runtime payload must still be verified natively. Optional Authenticode signing covers staged executables, setup and uninstaller.
- macOS sidecar verification checks native architecture and system-only dynamic-library dependencies. Developer ID builds require codesign/Gatekeeper/stapled-ticket checks; a Linux source edit does not establish those passes.
- CI uses pinned action commits, read-only contents permission and committed lockfiles. PR jobs contain no Groq or signing secrets. Packaging is manual; no push-triggered publication exists.
- Installer staging clears generated paths only. App identity, localStorage keys, user model overrides, journal and personal files are preserved. No update/uninstall data deletion is introduced.

## Approval policy

A genuine credential finding stops release approval: report category/location/severity with the value redacted, require revocation/rotation, and remove active exposure safely. Never rewrite shared history without explicit approval. No genuine credential exposure has been identified in the executed history scan.

Keep unresolved security warnings, signing limitations, distribution ownership and native platform gates visible. Do not interpret zero scanner vulnerability counts as a production-readiness verdict.
