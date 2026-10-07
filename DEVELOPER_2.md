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
- [ ] Build and launch native Linux package. P0 · BLOCKED · dependency: WebKitGTK/JavaScriptCoreGTK 4.1 and libsoup 3 development packages · done when cargo and Tauri builds succeed and the capture workflow survives an actual native restart.
- [ ] Run macOS and Windows native acceptance. P1 · BACKLOG · dependency: equipped platform hosts · done when platform builds and smoke checks pass.

## Integration dependencies
Developer 1 consumes the shared interfaces; constructor changes belong in `src/app/services.ts`. Keep repository methods asynchronous so SQLite can replace the implementation. Schema changes must document migration behavior. Source preview is a bounded local data URL, never a remote URL. Mock provenance persists on the source.

## Blocked by
The Fedora host lacks `javascriptcoregtk-4.1.pc`, `webkit2gtk-4.1.pc`, and `libsoup-3.0.pc`. `cargo check` reaches dependency compilation and fails at the system-library probes. Do not claim a packaged-app pass based on frontend tests.

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

- Final frontend checks: TypeScript/lint/format/build pass; 14 unit tests and 9 browser tests pass, plus targeted final regressions. Zero axe violations in the inspected screens. Native build remains blocked.
