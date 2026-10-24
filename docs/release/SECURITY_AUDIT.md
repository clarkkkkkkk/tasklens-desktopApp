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

- Exact source `0d678fc`: [quality/security CI 40067961958](https://github.com/clarkkkkkkk/tasklens-desktopApp/actions/runs/40067961958) passed full-history, source and production-frontend Gitleaks scans with `--redact=100`. No genuine credential finding was identified. Local history/source scans also completed; raw reports stay ignored.
- Fresh `npm audit --json` initially identified high-severity Zod `GHSA-mrhx-c7xc-m3w5`. Pinned Zod 4.6.7, nested-default compatibility handling and stored-data regression tests remediate it. Subsequent local and exact-source CI npm audit report **zero vulnerabilities**. Vitest is 4.1.12, preserving its earlier security fix.
- Exact-source CI Cargo audit 0.22.2 scanned 629 locked crates: **eight upstream warnings**, including seven maintenance entries and GLib `RUSTSEC-2024-0429` unsoundness. The zero vulnerability-entry count does not close those warnings or establish production approval. Application code has no direct `VariantStrIter` usage; transitive reachability has not been disproved.
- Asset verification passed: **3,062,001,808 pinned payload bytes** before application/system WebView and supplemental notices. Both models remain exact pins; no smaller weights or first-launch downloads were substituted. 850 dependency notices were collected.
- Extracted RPM Gitleaks scan: **64,547,354 bytes scanned**, one generic-api-key false positive in `usr/lib/TaskLens/resources/notices/dependencies/linux-system-licenses/linux-firmware-whence/WHENCE:3123`. The match is a public firmware symlink filename (`bananapi-m64.txt`), not a credential. The bundled file matches Fedora package `linux-firmware-whence-20260309-1.fc44.noarch`, SHA256 `b763b1df1341d86664e8e881f5214333d5f904c31e8cc58bb5302774f0369630`. No broad scanner exception was added. The 2.497 GB and 487 MB model files were explicitly excluded from regex scanning by the 64 MB limit and are checked by their pinned cryptographic hashes instead.
- Native transport scripts pass synthetic corruption/missing-part/whole-hash/overwrite checks on Ubuntu, Windows PowerShell and both macOS architectures. Actual uploaded-package download/reconstruction remains a separate gate.
- Windows packaging inputs: immutable Inno 6.5.2 executable SHA256 `8582879760b6e0e42e00f2e28ce904afac0d739941a130d3da3573c3cbf2d75b` matched GitHub's immutable official release digest. The Microsoft standalone x64 WebView2 installer SHA256 is `9b0142e22e8daa92855d746ae4d1e9eeef561ccaf67d1dd452165c4af3df3191`; its official immutable download URL/hash are configured as public repository variables. Microsoft Authenticode verification is required on the Windows packaging runner and is not inferred from a Linux download/hash.

Raw logs are in ignored `.local-ai/release-audit/`; committed summaries contain no API key values. No real Groq key was supplied, read from the production account, transmitted or bundled. The extracted native test uses private XDG directories and private D-Bus; Secret Service fails closed inside that namespace, so it is not proof of successful production credential persistence.

The confirmed Fedora-build/Ubuntu GLIBC mismatch is an availability/distribution blocker. Do not publish those files as Ubuntu-compatible packages. Public installer publication remains blocked even though the website instructions were deployed and verified independently.

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

## Native and transport availability blockers

Real native tests found wrong exam classification and a missing required screenshot arrival. Conservative bounded repair checks now reject those omissions for repair rather than silently rewriting fields; new real-model/package acceptance is pending. The old compiled candidate is not release-approved.

Manual installer CI failed on a truncated macOS ARM native-input tar. The handoff now uses approximately 1 GiB parts with complete SHA-256 reconstruction checks and asset verification after extraction. A new CI run must pass; no transport error is suppressed or converted into an installer pass.

## Approval policy

A genuine credential finding stops release approval: report category/location/severity with the value redacted, require revocation/rotation, and remove active exposure safely. Never rewrite shared history without explicit approval. No genuine credential exposure has been identified in the executed history scan.

Keep unresolved security warnings, signing limitations, distribution ownership and native platform gates visible. Do not interpret zero scanner vulnerability counts as a production-readiness verdict.

## Final observed handoff: 2026-10-24

**NOT READY.** Latest implementation source `dfef55578349ed74d41ede73355d140dcbf57524` was pushed to main. Its optimized production application compiled, but installer packaging was interrupted during RPM creation; no final installer inventory exists for that source. The staged production binary passed startup and native OCR, then **FAIL**: screenshot extraction reported that the local model did not respond. Later checks in that sequence were **NOT RUN**. This does not certify a clean install or successful real-model repair.

Quality run [40078422617](https://github.com/clarkkkkkkk/tasklens-desktopApp/actions/runs/40078422617) initially failed the screenshot-result modal visibility test: **111 browser tests passed, 1 failed**. Repeated local full-modal tests recorded 2 passes and 1 overall test timeout; that is not a resolved CI failure. Rerun/current native-run status could not be verified reliably because GitHub access intermittently failed DNS/routing. No pending run is counted as passed.

The last verified GitHub release remained a draft with no installer assets attached; no public installer was published by this work. Do not promote the earlier failed 0d678fc artifacts. Website source `98e6cc1` is independently deployed and HTTPS content-verified. See the [machine-readable handoff](../evaluation/release-handoff-2026-10-24.json). Source compilation, local transport verification, website deployment and desktop production acceptance remain separate results.

## Linux ABI promotion guard

The release wrapper now checks ELF x86_64 architecture and glibc symbol requirements in all five sidecars before packaging, and checks the compiled main executable before creating the distribution inventory. Inputs requiring glibc newer than 2.39 or private glibc symbols fail closed. The [executed preflight](../evaluation/linux-abi-preflight-2026-10-24.json) rejected all five local Fedora inputs (2.43), matching the earlier Ubuntu runtime failure. This is an availability/promotion guard; it does not establish C++ ABI, GTK/WebKit or native workflow compatibility.

## Linux process-lifetime continuation

A repeat on staged `dfef555` passed strict screenshot extraction/save (292.98 seconds), including unresolved date/start and confirmed arrival. Subsequent text extraction and an explicitly assisted UI retry failed with signal 9; submitted text was retained. The test session was deliberately closed after those observed terminal errors; later steps are NOT RUN. Its final invalid-session harness error is cleanup evidence, not the original model failure.

The spawning-thread bug was reproduced independently: Linux parent-death signals track the thread that created the process. The source fix starts reusable models from a permanent launcher thread, preserves checked OS parent-death cleanup, and passes worker-retirement plus abrupt-parent-crash regressions. Full Rust tests: 78 passed, 9 ignored; focused final process tests: 3 passed, 2 fixture tests ignored. Native acceptance of a rebuilt fixed binary is still NOT RUN. See [sanitized evidence](../evaluation/linux-process-lifetime-2026-10-24.json). Status remains NOT READY.
