# Developer 2 — Application Logic / Persistence / Native Foundation

## Role and owned modules
Own `src/types/`, `src/lib/`, `src/repositories/`, `src/services/`, application context/composition in `src/app/`, `src-tauri/`, architecture documentation and integration tests. Coordinate product-facing semantics with Developer 1.

## Current sprint
Local voice/text capture, native model/runtime lifecycle, shared structured extraction, temporal/evidence validation and additive persistence. Screenshot extraction remains a demo. Real platform and language-quality acceptance stays separate from automated checks.

## Task checklist
- [x] Define and validate shared action/settings/snapshot schemas. P0 · DONE · dependency: product contract · done when malformed dates/times and source previews are rejected.
- [x] Implement ExtractionService, deterministic mock and abort/progress behavior. P0 · DONE · dependency: domain schema · done when UI consumes injected service and tests prove cancellation.
- [x] Implement async repository, versioned localStorage, serialized writes, corruption/quota recovery and backup export. P0 · DONE · dependency: snapshot schema · done when a fresh repository instance reads saved data and failed writes preserve state.
- [x] Implement date/search/status selectors and completion/restoration orchestration. P0 · DONE · dependency: action model · done when agenda membership and confidence rules are tested.
- [x] Implement reminder presets, rebasing and configuration-only scheduler. P1 · DONE · dependency: date model · done when selected reminders track edited dates/arrival times and completed/disabled items are excluded.
- [x] Implement file validation and bounded local thumbnails. P0 · DONE · dependency: browser file APIs · done when supported images preview and unsupported inputs fail safely.
- [x] Add Tauri config, Rust entry point, constrained CSP and original-logo desktop icons. P0 · DONE · dependency: original branding · done when native project/config exists with no unnecessary capabilities.
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

## Voice/native responsibilities
Own CPAL permissions/capture, Symphonia/Rubato preprocessing, pinned whisper.cpp/llama.cpp packaging, checksum/model lifecycle, timestamped transcription, shared extraction bundle contracts, job cancellation/stale-result protection and safe temporary-file cleanup. Preserve legacy storage and recoverable quota errors. Measure latency/RSS on the 16 GB baseline and verify offline processing and real microphone workflows on Linux, Windows and macOS. Source manifest/build setup and acceptance limitations are documented in VOICE_CAPTURE.md.
