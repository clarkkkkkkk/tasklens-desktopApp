# Developer 2 — Application Logic / Persistence / Native Foundation

## Role and owned modules
Own `src/types/`, `src/lib/`, `src/repositories/`, `src/services/`, application context/composition in `src/app/`, `src-tauri/`, architecture documentation and integration tests. Coordinate product-facing semantics with Developer 1.

## Current sprint
Phase 1 contracts, durable local data, mock extraction, reminder data model and minimal native shell. Real AI is Phase 2 and must not be imported in this sprint.

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
- [ ] Build and launch native Linux package. P0 · BLOCKED · dependency: WebKitGTK/JavaScriptCoreGTK 4.1 and libsoup 3 development packages · done when cargo and Tauri builds succeed and the capture workflow survives an actual native restart.
- [x] Run Windows native acceptance. P1 · DONE · dependency: equipped Windows host · done when platform builds and smoke checks pass. Evidence: `npm run test:native:win` (8/8) on the release exe and the NSIS-installed app.
- [ ] Run macOS native acceptance. P1 · BACKLOG · dependency: equipped macOS host · done when platform builds and smoke checks pass.

## Integration dependencies
Developer 1 consumes the shared interfaces; constructor changes belong in `src/app/services.ts`. Keep repository methods asynchronous so SQLite can replace the implementation. Schema changes must document migration behavior. Source preview is a bounded local data URL, never a remote URL. Mock provenance persists on the source.

## Blocked by
Linux: the Fedora host lacks `javascriptcoregtk-4.1.pc`, `webkit2gtk-4.1.pc`, and `libsoup-3.0.pc`. `cargo check` reaches dependency compilation and fails at the system-library probes. Do not claim a packaged-app pass based on frontend tests.

Windows: native build verified (see Windows host setup). Note that Windows 11 Smart App Control blocks Cargo's locally built, unsigned build scripts (`os error 4551`); it must be off on Windows development hosts.

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
