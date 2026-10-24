# TaskLens release audit — 23 October 2026

**Verdict: NOT READY for public production release.** The security fixes and documentation are suitable for review; unresolved native inference, installer, platform and release-commit CI evidence prevent release approval. No release, tag or deployment is authorized by this report.

## Scope and repository safety

Audited base: `374f692afe22de55bb80472035006e67919ddf44`, version `0.1.0`. Audit work is isolated on `codex/release-security-audit`. Another task's `codex/production-release-preparation` checkout is excluded. Guided-tour work was initially excluded; its subsequent published main commit was preserved during final integration (see below). This report describes the base plus the audit patch, not those concurrent changes. The containing Git commit identifies the final report revision; later code changes require revalidation.

Inventory included 379 tracked files at baseline and 45 reachable commits, source, native commands, permissions, build scripts, documentation, test fixtures and generated frontend output. Automated scans cover the complete enumerated corpus; manual review concentrated on security boundaries and release paths. This is a bounded engineering audit, not a proof that every possible defect is absent.

## Severity-ranked findings

| ID  | Severity | Finding and evidence                                                                                                                                                                                              | Resolution / remaining action                                                                                                                                                                    |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | High     | Current real Qwen probe failed with `MODEL_LOAD_FAILED`; model load took 206,284 ms.                                                                                                                              | Unresolved. Repeat on a suitably resourced machine, diagnose the load failure and record successful current end-to-end inference before release.                                                 |
| R2  | High     | Current Windows installer/runtime and clean-machine installation are unverified. Initial Fedora packages predated the audit; f0f1c60 packages were subsequently built, but fresh installation remains unverified. | Unresolved release gate; build and inspect exact-commit packages, install on disposable Windows/Fedora environments, verify restart and offline startup.                                         |
| R3  | High     | No successful CI run for audited base `374f692` existed at initial inspection. Main was unprotected; secret scanning, push protection and dependency security updates were disabled.                              | CI coverage broadened and hardened. Owner must enable repository protections and require exact release-commit checks. Older PR checks are not evidence for this revision.                        |
| R4  | High     | Complete installers exceed GitHub's individual release-asset limit; old tooling only reported ineligibility.                                                                                                      | Added validated 1 GiB splitting/reassembly without removing models. Actual installer distribution and Windows reassembly acceptance remain gates. See [release instructions](docs/RELEASING.md). |
| S1  | Medium   | Acceptance builds shared the production Groq credential namespace.                                                                                                                                                | Fixed: namespace derives from application identifier; production namespace unchanged, tests/acceptance isolated.                                                                                 |
| S2  | Medium   | OCR temporary parent permissions depended on the process umask.                                                                                                                                                   | Fixed: private Unix directory, symlink rejection and scoped temporary-job cleanup. Windows ACL acceptance remains unverified.                                                                    |
| S3  | Medium   | Local Ollama NDJSON and loopback HTTP header lines could accumulate without an explicit bound.                                                                                                                    | Fixed bounded parsing with regression tests.                                                                                                                                                     |
| S4  | Medium   | Two npm development-tool advisories affected the prior Vitest graph.                                                                                                                                              | Updated Vitest to 4.1.12; npm audit returned zero vulnerabilities.                                                                                                                               |
| S5  | Medium   | Public frontend environment variables and forced mock mode lacked a shared production-build guard.                                                                                                                | Added production guard and release tests; credential-like `VITE_` names and forced mock releases are rejected.                                                                                   |
| S6  | Medium   | Cargo audit reports an unsound `glib 0.18.5` advisory and seven unmaintained dependency entries.                                                                                                                  | Unresolved upstream graph. No direct use of the affected API was established; that is not evidence of immunity. Track upstream Tauri/GTK-compatible remediation.                                 |
| D1  | Medium   | Current docs contradicted implemented Groq, task storage and model selection.                                                                                                                                     | Updated current overview/security/contribution docs; historical evaluation retained and labelled.                                                                                                |
| D2  | Low      | A historical microphone receipt contained a developer home path.                                                                                                                                                  | Redacted path prefix only; measurements retained.                                                                                                                                                |
| D3  | Low      | No approved one-minute native demo or published release existed.                                                                                                                                                  | Added reproducible demo checklist; recording/link awaits owner review.                                                                                                                           |

No Critical finding or exposed live credential was detected. This does not constitute a guarantee that no secret has ever existed outside the scanned refs or files. See [security audit](SECURITY_AUDIT.md).

## Technical evidence and limitations

The existing architecture remains: local OCR/Whisper → selected provider → semantic/source validation → human review → local storage. Groq remains BYOK, opt-in and native-only. Screenshot/audio bytes are not the normal Groq payload. Source Trace, date/time checks, ambiguity handling and Needs Review remain required even for schema-valid output.

Current real inference attempt: the synthetic `simple-english` Qwen probe failed before producing a usable extraction. Available host RAM was approximately 2.7 GiB with swap full; resource pressure is a plausible contributor, not a confirmed diagnosis. The test process failed after approximately 220 seconds. No current multilingual accuracy or cloud latency is inferred from this failure.

Historical [14-case evaluation](docs/evaluation/reliability-v10-full.md) records **110/128 checks**, including English, Cebuano, Tagalog and mixed-language inputs. It also records action-coverage and mixed-language failures. That is prompt-version-10 historical evidence, not a new benchmark or proof of current production accuracy. Real Groq evaluation was not run: no explicitly configured test credential was supplied.

| Workflow / platform                                         | Evidence classification                             | Release status                                     |
| ----------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| Typed/screenshot/voice UI, review, calendar, persistence    | Automated browser coverage uses controlled services | Does not prove native inference or OS integrations |
| Native Rust transport, budgets, cancellation and parsing    | Unit/mocked HTTP tests                              | See executed results in checklist                  |
| Qwen current synthetic English                              | Real native inference attempt                       | FAIL: model load                                   |
| English/Cebuano/Tagalog accuracy                            | Historical real evaluation                          | Retained; current rerun not passed                 |
| Groq real authentication/extraction                         | Live provider                                       | NOT RUN                                            |
| Windows installation, Credential Manager, notifications     | Real OS acceptance                                  | NOT RUN                                            |
| Fedora clean installation / physical touchpad               | Real OS acceptance                                  | NOT RUN                                            |
| Current microphone/device, reminder delivery across restart | Real device acceptance                              | NOT RUN for this isolated candidate                |

## Judging evidence map

No judge's score is assigned.

| Criterion                   | Weight | Evidence and source                                                     | Gap / recommended action                                           | Status                                            |
| --------------------------- | ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| Documentation Completeness  | 15%    | README, ARCHITECTURE, SECURITY, LOCAL_AI, VOICE_CAPTURE, Groq guide     | Keep current-commit verification matrix with release               | Improved; review pending                          |
| Progress Documentation      | 5%     | CHANGELOG, TASK_TRACKER, docs/evaluation                                | Retain dated failures and distinguish prompt versions              | Historical evidence preserved                     |
| Contribution Readiness      | 5%     | CONTRIBUTING, CODE_OF_CONDUCT, issue/PR templates, MIT LICENSE          | Enable private reporting and protected checks                      | Partial                                           |
| Demonstration Quality       | 5%     | DEMO_CHECKLIST, synthetic fixture workflow                              | Record a real successful native run and approve video              | NOT RUN                                           |
| Implementation Completeness | 15%    | RoutedExtractionService, OCR/voice/native services, AppProvider         | Resolve current inference failure and complete native acceptance   | Partial / release blocked                         |
| Solution Fit                | 10%    | Local-first capture-to-review architecture; optional Groq               | Demonstrate useful extraction on target hardware                   | Source reviewed; current inference failed         |
| User Experience and Design  | 10%    | DESIGN_SKILL, Settings, Inbox, review, sidebar                          | Native keyboard/small-window/device checks                         | Browser evidence only where executed              |
| Security Adherence          | 10%    | SECURITY_AUDIT, native credential/IPC/transport boundaries              | Upstream advisories and GitHub protections                         | Fixes implemented; open gaps                      |
| Code Quality and Structure  | 5%     | Existing provider contracts, shared validation, bounded native parsers  | Preserve focused scope; review patch                               | Automated checks recorded separately              |
| Codebase Tooling            | 5%     | npm checks, Rust tests, pinned CI actions, docs/secret/release checks   | Require exact intended commit green                                | CI pending                                        |
| Testability                 | 5%     | Vitest, Playwright, Rust mocks, isolated native profiles                | Expand current real-device results                                 | Strong automated harness; native gaps             |
| Deployment                  | 5%     | Pinned assets, release script, split/hash verification                  | Build/install/sign exact candidate; no published artifacts yet     | NOT READY                                         |
| Scalability                 | 5%     | Per-device local storage, native bounded queue and Groq advisory quotas | No server scalability claim; measure local capacity/large datasets | Architecture reviewed; capacity benchmark not run |

Best Use of AI evidence should show source-backed review and honest unresolved fields, not claim cloud superiority. Best Easter Egg recognition has no verified submission evidence in this audit; no new feature was added to pursue it.

## Changed-file inventory

Security/runtime: `src-tauri/src/ai/groq/{credentials.rs,mod.rs}`, `src-tauri/src/main.rs`, `src-tauri/src/ocr.rs`, `src-tauri/src/ai/ollama.rs`, `src-tauri/src/local_ai/http.rs`.

Tooling/dependencies: `package.json`, `package-lock.json`, `vite.config.ts`, `.gitleaks.toml`, `.github/workflows/{quality.yml,native-voice.yml}`, `scripts/{check-docs.mjs,release-desktop.mjs,release-parts.mjs,release-policy.mjs,release-policy.d.mts,release-tools.test.mjs}`.

Documentation/contribution: README, ARCHITECTURE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG, LOCAL_AI, VOICE_CAPTURE, PROJECT_SUMMARY, MVP, TECH_STACK, docs/GROQ_BYOK, this report, SECURITY_AUDIT, RELEASE_CHECKLIST, DEMO_CHECKLIST, docs/RELEASING, issue/PR templates and the redacted `docs/evaluation/microphone-device.json`. Use `git show --stat` on the containing audit commit for the authoritative inventory.

## Current isolated automated checks

TypeScript, ESLint, Prettier, Rust formatting, production Vite build and local Markdown link checks passed. Vitest: 138 passed and 2 opt-in skipped. Rust: 76 passed and 8 ignored. Release tooling: 2 passed. Asset tooling: 3 passed. Full payload verification passed (3,062,001,808 bytes). Browser/native checks are recorded separately in the checklist; ignored real-inference tests are not counted as passed. The production frontend emits a non-blocking 500 kB chunk-size warning (main JavaScript approximately 601 kB uncompressed).

Current history, scoped source and production-bundle Gitleaks scans found zero leaks. The current scan reports 39 commits with scanned changes; `git rev-list --all` includes 47 reachable commits after fetching concurrent refs. Those counts differ from the initial inventory and do not mean unrelated task changes were incorporated.

## Completed native, browser and packaging evidence

The clean audit commit `f0f1c60e70b20f175c49530f514184ce11b89b48` completed its production Rust/Tauri build, RPM and AppImage packaging, split generation and checksum report. The version remains 0.1.0. RPM: **3,132,677,361 bytes**, SHA256 `dace7fbeff276b613f9343c5f56b0fac32937057f67e3fbcf0165808959ab82c`. AppImage: **3,024,558,584 bytes**, SHA256 `cfa0c690f3c0d4eedbf806f2d96c942078a9ec8eb0c917d92ffaccf55806d4c6`. Both exceed the single GitHub asset limit. The generated receipt is preserved in [machine-readable evidence](docs/evaluation/release-audit-2026-10-23.json). No installer was published or installed into the user's production profile.

The historical October 17 RPM inventory includes Qwen, Whisper, all three trained-data languages, baseline/AVX2 sidecars and license notices; RPM internal digests passed. Its AppImage split/reassembly matched independent SHA256 hashes byte for byte (3,020,552,696 bytes). This tests real installer-sized data, while current-package fresh installation and Windows reassembly remain unverified.

Fedora's isolated native Tauri acceptance passed **12 checks** covering native command access, Local/consent gates, key redaction, Settings controls and scroll containment, masked/cancellable modal setup, passive connectivity, fixed browser destinations, sample review persistence, sidebar keyboard/navigation behavior and sidebar preference across a new process. The sample review is labelled mock evidence, not real inference. A separate real OCR smoke passed with meaningful text and 13 regions; eng/ceb/tgl language data was available. Synthetic Secret Service write/read/remove/absence passed across separate processes. Locked/unavailable store behavior and Windows remain unverified.

The full browser run completed with **68 passed / 29 failed** in 21.1 minutes under concurrent builds on an alternate port. One restart test hardcodes port 1420 and failed because the audit used port 1492; its targeted standard-port rerun passed (43.3 seconds). Other failed timed interactions, motion assertions and workflow assertions remain unresolved. They are not excused as resource failures without successful reruns. This is an additional release gate.

During completion, main advanced to guided-tour commit `a37d2df`. It was merged without conflicts to preserve already published collaborator work and permit a normal main push. The separate release-preparation branch remains excluded. Initial audit/native/package evidence above applies to f0f1c60; the later guided-tour frontend is outside that package's acceptance. Final integrated installers and full native workflows require revalidation.

After integrating published main, TypeScript, ESLint, formatting and **144 unit tests** passed (2 opt-in skipped). New audit RPM inventory was verified to contain both models, eng/ceb/tgl trained data, native runtimes and notices. The final history scan examined 47 commits with scanned changes and found zero leaks; the production frontend scan also found zero leaks. CI for the final pushed commit remains a separate gate; these local checks do not replace it.

## Exact-commit CI result

[Quality run 39941856615](https://github.com/clarkkkkkkk/tasklens-desktopApp/actions/runs/39941856615) tested pushed commit `7862ba64343864cb2453ad2f8f32cc33628f9d61`. Rust security, frontend checks, unit/release/asset tests, npm audit, production build and history/bundle scans passed. Playwright recorded **110 passed / 1 failed** in 3.6 minutes. The failing case checks guided-tour target/card geometry at 600 px. This confirms an unresolved narrow-window verification issue in the newly integrated tour; it must not be dismissed as the earlier alternate-port problem. Local diagnostic traversal of all 12 steps did not reproduce overlap. Native matrix run 39941856575 was still in progress when this evidence was written. No fully successful exact-commit workflow is claimed here. Later README-only commits require their own CI result.

README screenshots were refreshed from current application components with synthetic data and labelled browser-preview provenance. They are not substituted for the pending native demo video.

The 600 px guided-tour browser case subsequently passed a targeted local rerun (all 12 steps plus accessibility checks, 31.6 seconds). This establishes intermittency; it does not erase the failed CI run or establish a fix. The README follow-up changes documentation and screenshots only.
