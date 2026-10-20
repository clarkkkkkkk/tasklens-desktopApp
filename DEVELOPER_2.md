# Developer 2 — Application Logic / Persistence / Native Foundation

## Role and owned modules
Own `src/types/`, `src/lib/`, `src/repositories/`, `src/services/`, application context/composition in `src/app/`, `src-tauri/`, architecture documentation and integration tests. Coordinate product-facing semantics with Developer 1.

## Current sprint
Local voice/text capture, native model/runtime lifecycle, shared structured extraction, temporal/evidence validation and additive persistence. Real screenshot OCR/extraction is implemented; onboarding and samples remain labelled demos. Real platform and language-quality acceptance stays separate from automated checks.

## Task checklist
- [x] Define and validate shared action/settings/snapshot schemas. P0 · DONE · dependency: product contract · done when malformed dates/times and source previews are rejected.
- [x] Implement ExtractionService, deterministic mock and abort/progress behavior. P0 · DONE · dependency: domain schema · done when UI consumes injected service and tests prove cancellation.
- [x] Implement async repository, versioned localStorage, serialized writes, corruption/quota recovery and backup export. P0 · DONE · dependency: snapshot schema · done when a fresh repository instance reads saved data and failed writes preserve state.
- [x] Implement date/search/status selectors and completion/restoration orchestration. P0 · DONE · dependency: action model · done when agenda membership and confidence rules are tested.
- [x] Implement reminder presets, rebasing and configuration-only scheduler. P1 · DONE · dependency: date model · done when selected reminders track edited dates/arrival times and completed/disabled items are excluded.
- [x] Implement file validation and bounded local thumbnails. P0 · DONE · dependency: browser file APIs · done when supported images preview and unsupported inputs fail safely.
- [x] Add Tauri config, Rust entry point, constrained CSP and original-logo desktop icons. P0 · DONE · dependency: original branding · done when native project/config exists with no unnecessary capabilities.
- [x] Keep overdue items visible. P0 · DONE · dependency: selectors · done when confirmed past-dated items stay in Today (own section, sidebar count) until completed, and drafts/completed items never count as overdue.
- [x] Add versioned schema migration pipeline. P0 · DONE · dependency: snapshot schema · done when ordered `N → N + 1` steps upgrade stored data in memory, newer/unsupported/corrupt data is kept intact with distinct messages, and the first upgraded write keeps a pre-migration backup.
- [ ] Build and launch native Linux package. P0 · MANUAL ACCEPTANCE PENDING · Linux Rust tests and debug Debian packaging pass; actual microphone capture and native restart/save behavior still need verification.
- [x] Run Windows native acceptance. P1 · DONE · dependency: equipped Windows host · done when platform builds and smoke checks pass. Evidence: `npm run test:native:win` (8/8) on the release exe and the NSIS-installed app.
- [ ] Run macOS native acceptance. P1 · BACKLOG · dependency: equipped macOS host · done when platform builds and smoke checks pass.

## Integration dependencies
Developer 1 consumes the shared interfaces; constructor changes belong in `src/app/services.ts`. Keep repository methods asynchronous so SQLite can replace the implementation. Schema changes must document migration behavior. Source preview is a bounded local data URL, never a remote URL. Mock provenance persists on the source.

## Blocked by
Linux: prior system-library blockers are resolved for automated builds. This session uses a local ALSA development sysroot. Real microphones, multilingual recordings, offline packaged restart and performance acceptance remain pending. Do not infer a manual runtime pass from automation.

Windows: the earlier screenshot-workflow native build was verified (see Windows host setup); new voice commands, models and microphone permissions remain pending. Note that Windows 11 Smart App Control blocks Cargo's locally built, unsigned build scripts (`os error 4551`); it must be off on Windows development hosts.

## Handoff expectations
Document schema additions, timezone assumptions, reminder anchoring, persistence version and failure recovery. Supply contract tests and coordinate breaking changes. Future SQLite migration must preserve previews, IDs, reminder selections and timestamps; import/backup restore needs its own validation and acceptance work.

## Testing expectations
Run frontend checks and unit/integration suites. Test corruption, unsupported storage version, quota/denied storage, concurrent writes, impossible dates, timezone boundaries, reminder rebasing, mock cancellation and reload persistence. Run Rust format/check and a native smoke test on an equipped host.

## Definition of done
Stable typed interfaces, validation at boundaries, no silent data loss, no hidden network access, passing meaningful tests, documented replacement paths and honest platform limitations.

## Progress notes
- 2026-10-08: Chose localStorage because inspection found no native/database foundation and missing native system prerequisites.
- 2026-10-08: Added serialized repository writes, bounded previews and source mock provenance; original files remain untouched.
- 2026-10-08: Native `cargo check` blocked by missing system development libraries. Unit/browser evidence is tracked separately.
- 2026-10-08: Updated test tooling to remove reported npm dependency advisories; lockfiles are included.

- Final frontend checks (2026-10-08): TypeScript/lint/format/build pass; 14 unit tests and 9 browser tests pass, plus targeted final regressions. Zero axe violations in the inspected screens. Native build remains blocked.

## Onboarding — 2026-10-10
Onboarding version persistence, legacy settings defaults, immediate preference saves, startup gate, Settings replay and persistence/state tests are implemented. Completion preserves higher versions and demo results never enter task storage. Browser verification is recorded in TASK_TRACKER.md.

## Overdue items and schema migration — 2026-10-11
- `isOverdue` in `src/lib/actions.ts` is the single overdue rule (confirmed, dated before the local day). The `today` selector, sidebar count and task-row label all use it. Today renders an Overdue section above "Your plan". Previously a confirmed item one day late appeared only in All Tasks and Calendar.
- `SNAPSHOT_VERSION` + `src/repositories/migrations.ts`: ordered, pure upgrade steps, final validation against the current schema and classified read errors (newer / unsupported / corrupt). See ARCHITECTURE.md → Schema migration for the procedure to add a version.
- Repository storage contract now includes `removeItem` (used to roll back a pre-migration backup when the upgraded write fails). `LocalStorageRepository` accepts migrations as an optional constructor argument for tests.
- No schema change in this work: `SNAPSHOT_VERSION` stays 1 and existing data loads unchanged.
- Checks: typecheck, lint, format, build pass; 27 unit tests (11 new) and 18 browser tests (1 new overdue workflow) pass.
- Observed flake (pre-existing, not changed): `HTML drag/drop and paste accept actual image files` timed out once in a loaded full run and once in 3 repeats, waiting ~2 s of mock extraction against a 5 s expect timeout; 10/10 isolated repeats passed with and without these changes.

## Windows host setup — 2026-10-11
- Set up a Windows 11 host: `npm ci` (0 vulnerabilities), Playwright Chromium, Rust 1.99 stable-msvc, VS 2022 Build Tools.
- Frontend: typecheck, lint, format, build pass; 16 unit tests and 17 browser tests pass. `cargo fmt --check` passes.
- Added `.gitattributes` (LF) so Prettier checks pass on Windows checkouts with `core.autocrlf=true`.
- Tauri `devUrl` now uses `http://127.0.0.1:1420` to match the Vite host binding (avoids `localhost` resolving to IPv6 first).
- Smart App Control initially blocked Cargo build scripts (`os error 4551`); passed after it was turned off.
- `cargo check` and `npm run tauri build -- --no-bundle` pass (release `tasklens.exe`, 9.6 MB, WebView2 154).
- Native smoke test (Playwright over WebView2 CDP against the release exe): first launch shows onboarding, Skip → New item → save, process exit and relaunch, onboarding not repeated and the item persists. No console or page errors. Superseded by the acceptance pass below.

## Windows native acceptance — 2026-10-11
- `npm run tauri build` produces `TaskLens_0.1.0_x64_en-US.msi` (3.8 MB) and `TaskLens_0.1.0_x64-setup.exe` (2.8 MB, NSIS).
- NSIS silent per-user install: `%LOCALAPPDATA%\TaskLens\tasklens.exe`, Start Menu shortcut and Apps & features entry; silent uninstall removes all three.
- Added `scripts/windows-native-acceptance.mjs` (`npm run test:native:win [-- <exe>]`): Playwright over WebView2 CDP against the real window. It refuses to run when TaskLens app data exists and removes only the data it created; screenshots go to `test-results/native-windows/`.
- 8/8 passed against the installed app and the release exe: window title and first-launch onboarding; file picker (rejects non-images, previews PNG, removal cancels); HTML drop and paste; sample review → edit → confirm & save; Ctrl+K focus, Escape and focus restoration, visible Tab focus; minimum size (WM_GETMINMAXINFO 916×679 px → 900×640 viewport at 100% scale, no horizontal scroll) and growth; graceful WM_CLOSE and relaunch preserving item, edits and source preview; zero console/page errors.
- Icons: exe, taskbar and Start Menu use the original TaskLens logo; `public/TaskLens.png` is byte-identical to `TaskLens.png`.
- Not covered: MSI install (per-machine, needs elevation), OS-level drag of a file from Explorer (drop is exercised as an HTML DragEvent), display scaling above 100%, code signing (installers are unsigned, so SmartScreen will warn).

## Phase 2 sprint — local intelligence engine (2026-10-12)
- [x] Tesseract OCR (`src-tauri/src/ocr.rs`): raw-bytes IPC, decode limits, EXIF orientation, `Preprocessor` trait, TSV → line regions with boxes/confidence/layout; `cargo test -- --ignored ocr_fixtures` runs real OCR. P0 · DONE.
- [x] `platform.rs`: bundled/system binary and tessdata resolution, hidden child processes, bounded runner. P0 · DONE.
- [x] `local_ai/`: model manifest and verification, llama-server lifecycle, loopback HTTP/SSE client, completion and cancellation commands. P0 · DONE.
- [x] `LocalAIExtractionService`, `NativeOcrService`, `NativeLocalModelManager`, error codes. P0 · DONE.
- [x] Prompt v1, output schema, prompt builder, line grouping, validator, temporal helpers. P0 · DONE.
- [x] Domain: `endTime`, per-field confidence, structured ambiguities (legacy strings upgraded), `source.ocr`, `settings.localAI`; drafts may keep a time while the date is unresolved. P0 · DONE.
- [x] Unit tests (prompt, grouping, validator, service retry/cancel) and the opt-in real-model evaluation. P0 · DONE.
- [x] Privacy review: no fetch/axios/telemetry in the app; only Rust → 127.0.0.1. P0 · DONE.
- [ ] Runtime crash supervision; macOS/Linux runtime packaging. P1 · BACKLOG.

## Voice/native responsibilities
Own CPAL permissions/capture, Symphonia/Rubato preprocessing, pinned whisper.cpp/llama.cpp packaging, checksum/model lifecycle, timestamped transcription, shared extraction bundle contracts, job cancellation/stale-result protection and safe temporary-file cleanup. Preserve legacy storage and recoverable quota errors. Measure latency/RSS on the 16 GB baseline and verify offline processing and real microphone workflows on Linux, Windows and macOS. Source manifest/build setup and acceptance limitations are documented in VOICE_CAPTURE.md.

## Built-in intelligence migration — 2026-10-16

The current implementation bundles Qwen3-4B Q4_K_M and Whisper Small, uses pinned native source archives and target-suffixed Tauri sidecars, and includes Tesseract/Leptonica plus eng/ceb/tgl data. `assets.rs` owns resource discovery, hash/format checks, fingerprinted application-data receipts and non-blocking readiness. Model imports are optional developer overrides; legacy Phi files and task/settings storage are preserved.

Qwen uses non-thinking chat markers and manifest stop tokens. Speech takes the extraction runtime gate and unloads llama-server before Whisper loads; the server remains reused across text/screenshot extractions. Native setup, packaging commands and exact pins: LOCAL_AI.md. Fedora and actual-platform acceptance are reported in OFFLINE_AI_IMPLEMENTATION_REPORT.md; do not infer inference success from compilation or browser mocks.

### 2026-10-17 efficiency follow-up

The initial conservative runtime build disabled all x86 vector extensions and was prohibitively slow on the i5-10210U. Recipe 2 adds CPU-gated static AVX2 variants while retaining baseline compatibility. Native feature-selection/fallback tests pass (16 Rust tests total); 54 frontend unit tests pass. Nine onboarding/motion browser tests pass, including a paused-animation first-launch regression. Prompt v3 retains all rules and removes verbose examples to reduce cold prefill work; full offline real-model evaluation is running and must pass before release acceptance. See the implementation report for measured throughput, application timing, packaging and outstanding platform gates.

2026-10-17 follow-up: 56 frontend unit tests pass, including unsupported date/time removal and genuine midnight preservation. Prompt v3 failed the first real-model fixture; v4 was stopped after partial output repeated an announce-later task; v5 restores one structured example and awaits full offline evaluation with strict expectations unchanged. AppImage remounts previously forced a full model rehash; stable container identities and remount/upgrade coverage are implemented, pending native repeated-launch timing. Do not mark complete inference acceptance until the full suite and installed workflows pass.

Packaged AppImage remount caching is verified: readiness coordinator 49.866 s full validation → 309 ms cached. Native disconnected component acceptance passes OCR, real audio import/transcription (16.051 s for 11 s English audio) and isolated-profile restart persistence; extraction was deliberately skipped. Standalone AVX2 Whisper: 17.39 s, 768,364 KiB RSS. Full extraction and actual microphone/multilingual quality remain pending; see the performance JSON reports.

Extraction diagnosis: v5 passed 14/15 checks on the first case in 205.677 s, fixing extra actions/start time but missing the arrival place. V6 adds a general arrival-place rule; full accuracy acceptance remains pending. A separate native offline run saved a manual task through the UI and verified unchanged persisted data after restarting.

### 2026-10-18 extraction verification

The complete v6 disconnected evaluation finished all ten cases in 994 seconds: 64/77 checks passed. Pictorial and midterm cases pass; omissions of separate actions, cancellation and stated times remain accuracy failures. V7 uses two complete demonstrations as Qwen chat turns; focused results were 15/18. It recovered separate actions/times, but still generated a cancelled seminar. V8 adds an unrelated cancelled workshop to the demonstration with no resulting action; greedy pictorial still failed 2/15 checks. The upstream sampling diagnostic also failed pictorial 2/15; neither v7/v8 prompts nor experimental sampling were promoted. Before main integration, production retained v6/greedy decoding. Invalid/silent audio is now rejected before evicting the warm extraction server; final native verification follows the rebuild. All 58 ordinary frontend unit tests pass; real-model acceptance is separate. Existing packaged artifacts contain v4 and must be rebuilt after the final prompt is accepted. Archived results: docs/evaluation/qwen3-v6-eval.md.

### Main integration — 2026-10-18

Remote main cf09166 adds compact-output prompt v7, persisted static-prefix prewarming, the 60-second Inbox waiting/cancel notice, evaluation instrumentation and packaging fixes. The protected integration branch retains the local silent-audio lifecycle change, repair-text sanitization, all evaluation archives and both developers’ regression tests. Local archived chat-demonstration v7/v8 are distinct from main’s compact-output v7. Full integrated real-model/native acceptance remains pending; model pins, the offline boundary and persistence schema are unchanged.

### Integrated verification record — 2026-10-18

Main integration merge `8f32047` preserves checkpoint `8713545` and upstream `cf09166`. Integrated checks passed: TypeScript/lint, formatting, frontend build, Cargo check/format, 62 frontend unit tests, 17 Rust tests, two asset tests and six targeted browser tests. One real-model test and two native opt-in tests remained skipped/ignored. Full integrated real-model and installed platform acceptance remain open. See [the integration record](docs/MAIN_INTEGRATION_2026-10-18.md) for conflict decisions, commands and limitations.

## Native reliability branch — 2026-10-20

`codex/native-reliability` implements an unfinished Milestone A: opt-in native reminders, a SQLite delivery journal (tasks stay in localStorage), Settings activation/privacy/background controls, durable scheduling fences and shared close guards. Notifications require explicit activation after upgrade. No automatic autostart, task migration or backup import is included yet. Fedora OS submission checks have run; visibility, broader lifecycle/recovery and Windows/macOS native acceptance are tracked separately. See [implementation and gate status](docs/NATIVE_RELIABILITY.md) for commands, ownership boundaries, storage paths, unencrypted-data disclosure and remaining A–E work. No push/main merge is included.
