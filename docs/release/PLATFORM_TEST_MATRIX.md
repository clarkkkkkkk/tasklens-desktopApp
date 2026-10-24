# Platform acceptance matrix

Date: 2026-10-24 (Asia/Manila). Compiled candidate: `0d678fca743fa62f253389d666528ae4f3d20352`, version 0.1.0 prerelease preparation.

**PASS** = executed successfully within its stated scope; **FAIL** = executed assertion/compatibility failed; **BLOCKED** = required host, credential or prerequisite unavailable; **NOT RUN** = no completed current-candidate execution. A passing source build or browser suite is not installed-app acceptance.

| Platform    | Build                  | Fresh install                         | OCR                 | Local AI                             | Voice                     | Groq                    | Ready |
| ----------- | ---------------------- | ------------------------------------- | ------------------- | ------------------------------------ | ------------------------- | ----------------------- | ----- |
| Fedora x64  | PASS: production build | BLOCKED: clean desktop VM             | PASS: extracted RPM | FAIL: semantic fields; pipeline runs | PASS: Whisper import only | BLOCKED: authorized key | NO    |
| Ubuntu x64  | PASS: source CI        | BLOCKED: final Ubuntu-built installer | BLOCKED             | BLOCKED                              | BLOCKED                   | BLOCKED                 | NO    |
| Windows x64 | PASS: source CI        | BLOCKED: clean Windows 10/11          | BLOCKED             | BLOCKED                              | BLOCKED                   | BLOCKED                 | NO    |
| macOS ARM64 | PASS: source CI        | BLOCKED: clean macOS                  | BLOCKED             | BLOCKED                              | BLOCKED                   | BLOCKED                 | NO    |
| macOS Intel | PASS: source CI        | BLOCKED: clean macOS                  | BLOCKED             | BLOCKED                              | BLOCKED                   | BLOCKED                 | NO    |

## Separate build and packaging evidence

| Gate                                            | Fedora 44 x64          | Ubuntu 24.04 x64      | Windows Server 2022 x64 | macOS ARM64           | macOS Intel           |
| ----------------------------------------------- | ---------------------- | --------------------- | ----------------------- | --------------------- | --------------------- |
| Native assets/model hashes                      | PASS                   | PASS CI               | PASS CI                 | PASS CI               | PASS CI               |
| Rust source tests                               | PASS: 76, 8 ignored    | PASS: 76, 8 ignored   | PASS: 75, 8 ignored     | PASS: 76, 8 ignored   | PASS: 76, 8 ignored   |
| Production Tauri compilation                    | PASS                   | NOT RUN to completion | NOT RUN to completion   | NOT RUN to completion | NOT RUN to completion |
| Installer generation                            | PASS: RPM/DEB/AppImage | NOT RUN to completion | NOT RUN to completion   | NOT RUN to completion | NOT RUN to completion |
| Native transport-script regression              | PASS shell             | PASS shell CI         | PASS PowerShell CI      | PASS shell CI         | PASS shell CI         |
| Complete downloaded real-package reconstruction | NOT RUN                | NOT RUN               | NOT RUN                 | NOT RUN               | NOT RUN               |
| Native GUI from final installed package         | BLOCKED                | BLOCKED               | BLOCKED                 | BLOCKED               | BLOCKED               |

Source CI: [40067961937](https://github.com/clarkkkkkkk/tasklens-desktopApp/actions/runs/40067961937). Manual installer pipeline: [40071624829](https://github.com/clarkkkkkkk/tasklens-desktopApp/actions/runs/40071624829); no pending job is counted as passed. Windows Server compilation does not certify Windows 10/11 installation. macOS Intel compilation/architecture assertions passed; Intel DMG and runtime support remain unverified.

**Confirmed Ubuntu failure:** all five Fedora-built sidecars fail on a clean Ubuntu 24.04 container with `GLIBC_2.43 not found`. The local DEB and AppImage are Fedora-built candidates, not Ubuntu-compatible downloads. Use the Ubuntu build baseline and test actual packages on both distributions before advertising Linux compatibility.

## Available native/container checks

Fedora host: Intel Core i5-10210U, 8 logical CPUs, 16,017,944 KiB RAM, AVX2. The test app ran from an extracted RPM in a path containing spaces and `ñ`, with a new XDG profile, private D-Bus and a network namespace exposing loopback only. No everyday profile was cleared or uninstalled.

| Check                                                           | Result / scope                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DNF install in disposable Fedora 44 container                   | PASS; standard runtime packages resolved without building TaskLens                                                                                                                                                                                 |
| RPM payload verification and main-program libraries             | PASS; no unresolved libraries                                                                                                                                                                                                                      |
| Baseline/AVX2 llama and Whisper sidecars plus Tesseract help    | PASS: all five launch; this CPU supports AVX2, so a truly non-AVX2 CPU remains BLOCKED                                                                                                                                                             |
| OCR language discovery                                          | PASS: eng, ceb, tgl; optional Leptonica TIFF/font diagnostics emitted, PNG OCR separately passed                                                                                                                                                   |
| Desktop launcher and notices present                            | PASS: package inventory/files checked                                                                                                                                                                                                              |
| RPM uninstall and retained local-data sentinel                  | PASS in disposable container; not a full saved-task upgrade test                                                                                                                                                                                   |
| First native launch and models ready without imports            | PASS: 44.0 seconds in first run                                                                                                                                                                                                                    |
| Onboarding skip and real native OCR                             | PASS: 12 regions, 300 characters, 10.2 seconds in first run                                                                                                                                                                                        |
| Screenshot → OCR → Qwen → real source IDs → review → draft save | PASS: one saved local action; 784.7 seconds under concurrent packaging workload, not an established performance baseline                                                                                                                           |
| Following typed-save check in first run                         | FAIL: harness left the saved screenshot draft review open and selected a stale save button. App intentionally keeps draft review open. Fix closes the current review explicitly and scopes saving to the current dialog; rerun recorded separately |
| Complete corrected native sequence                              | NOT RUN to completion at this evidence checkpoint                                                                                                                                                                                                  |
| Real microphone permission/recording                            | NOT RUN; synthetic imported audio does not certify microphone acceptance                                                                                                                                                                           |
| Authorized live Groq                                            | BLOCKED: no test key supplied; mock failure tests are not real inference                                                                                                                                                                           |

The original failing native/browser results remain in ignored logs. A corrected test or focused rerun does not retroactively turn an earlier failure into a pass. The corrected first sequence reached save, then **FAIL**: the exam was `deadline`, expected `event`. Reading only the isolated synthetic profile also confirmed the screenshot's `arrivalTime` was absent, despite an explicit 13:30 requirement. Both defects are now covered by conservative bounded-repair regression tests; rebuilt native verification is pending. Do not promote the old artifact.

A separate component-only native run passed five groups: first launch, real OCR, real Whisper WAV transcription, manual task save, and exact stored-envelope equality after closing/relaunching the app. It skipped Qwen and cannot pass the full voice extraction row. No microphone was recorded.

Manual installer run `40071624829` **FAIL**: macOS ARM archive extraction reported truncation, before Rust tests or packaging. The chunked/checksummed native-input handoff fix is awaiting CI.

Native screenshot extraction is real Qwen inference; labelled browser demos remain mock evidence.

## Real installer transport check

Local shell reconstruction of the actual 3.13 GB RPM: initial **FAIL** on a `.parts.json` checksum-inventory parsing bug, then **PASS** after correcting both platform scripts and adding the metadata-layout regression fixture. The original complete RPM SHA256 matches. Windows/macOS updated-fixture CI and authenticated draft-download/reconstruction remain **NOT RUN**. No installer was automatically executed and no user file was overwritten.

## Required clean-machine protocol

Use disposable accounts/VM snapshots. For each target record OS build, CPU flags, RAM, source commit, installer size/hash, commands, exit status and sanitized evidence. Never modify the developer's personal data to perform destructive tests.

| Acceptance check                                               | Fedora                           | Ubuntu        | Windows | macOS ARM64 | macOS Intel |
| -------------------------------------------------------------- | -------------------------------- | ------------- | ------- | ----------- | ----------- |
| Official release download and checksum                         | NOT RUN                          | NOT RUN       | NOT RUN | NOT RUN     | NOT RUN     |
| Graphical install with no development tools                    | BLOCKED                          | BLOCKED       | BLOCKED | BLOCKED     | BLOCKED     |
| Complete onboarding and all guided-tour steps                  | NOT RUN                          | BLOCKED       | BLOCKED | BLOCKED     | BLOCKED     |
| Installed screenshot/text/voice confirmation and save          | NOT RUN                          | BLOCKED       | BLOCKED | BLOCKED     | BLOCKED     |
| Unknown/incorrect dates, separate actions, real Source Trace   | NOT RUN comprehensively          | BLOCKED       | BLOCKED | BLOCKED     | BLOCKED     |
| Real microphone and supported import formats                   | NOT RUN comprehensively          | BLOCKED       | BLOCKED | BLOCKED     | BLOCKED     |
| Saved tasks/settings/sidebar/calendar after process restart    | NOT RUN to completion            | BLOCKED       | BLOCKED | BLOCKED     | BLOCKED     |
| Offline startup and inference                                  | PASS component scope only        | BLOCKED       | BLOCKED | BLOCKED     | BLOCKED     |
| Groq consent, secure credentials, invalid keys, disconnect/429 | BLOCKED live; unit mocks PASS    | BLOCKED       | BLOCKED | BLOCKED     | BLOCKED     |
| Native reminder permission and visible notification            | NOT RUN                          | BLOCKED       | BLOCKED | BLOCKED     | BLOCKED     |
| Export and failed-save draft preservation                      | NOT RUN natively                 | BLOCKED       | BLOCKED | BLOCKED     | BLOCKED     |
| Cancellation, recovery and safe close                          | NOT RUN comprehensively          | BLOCKED       | BLOCKED | BLOCKED     | BLOCKED     |
| Upgrade preserves existing task data                           | BLOCKED                          | BLOCKED       | BLOCKED | BLOCKED     | BLOCKED     |
| Clean desktop uninstall preserving personal data               | BLOCKED; container sentinel PASS | BLOCKED       | BLOCKED | BLOCKED     | BLOCKED     |
| Spaces/non-ASCII resource paths                                | PASS extracted-app startup/OCR   | BLOCKED       | BLOCKED | BLOCKED     | BLOCKED     |
| Non-AVX2 hardware                                              | BLOCKED                          | BLOCKED       | BLOCKED | N/A: ARM64  | BLOCKED     |
| SmartScreen/Gatekeeper/signing/notarization                    | N/A: unsigned local candidate    | N/A: unsigned | BLOCKED | BLOCKED     | BLOCKED     |

No platform is production-ready from these results. Clean-machine GUI, microphone, notification and upgrade evidence cannot be replaced with container or browser checks.

## Final observed handoff: 2026-10-24

**NOT READY.** Latest implementation source `dfef55578349ed74d41ede73355d140dcbf57524` was pushed to main. Its optimized production application compiled, but installer packaging was interrupted during RPM creation; no final installer inventory exists for that source. The staged production binary passed startup and native OCR, then **FAIL**: screenshot extraction reported that the local model did not respond. Later checks in that sequence were **NOT RUN**. This does not certify a clean install or successful real-model repair.

Quality run [40078422617](https://github.com/clarkkkkkkk/tasklens-desktopApp/actions/runs/40078422617) initially failed the screenshot-result modal visibility test: **111 browser tests passed, 1 failed**. Repeated local full-modal tests recorded 2 passes and 1 overall test timeout; that is not a resolved CI failure. Rerun/current native-run status could not be verified reliably because GitHub access intermittently failed DNS/routing. No pending run is counted as passed.

The last verified GitHub release remained a draft with no installer assets attached; no public installer was published by this work. Do not promote the earlier failed 0d678fc artifacts. Website source `98e6cc1` is independently deployed and HTTPS content-verified. See the [machine-readable handoff](../evaluation/release-handoff-2026-10-24.json). Source compilation, local transport verification, website deployment and desktop production acceptance remain separate results.
