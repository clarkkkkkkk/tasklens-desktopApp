# Developer 1 — UI / UX / Product Integration

## Role and owned modules
Own `src/components/`, `src/layouts/`, UI in `src/features/`, `src/styles/`, and product integration in `src/App.tsx`. Own sidebar/navigation, capture and preview, extraction review, editing, Today, Upcoming, Calendar, All Tasks, Completed, Needs Review, Settings, search, accessibility and interaction polish.

## Current sprint
Phase 1 foundation and usable offline workflow. Frontend implementation and checks are complete; native acceptance remains blocked as recorded in TASK_TRACKER.md.

## Task checklist
- [x] Build token-driven app shell, original logo and navigation. P0 · DONE · dependency: DESIGN_SKILL.md · done when all destinations are keyboard accessible.
- [x] Build Inbox, selection/drop/paste, preview, cancellation and explicit mock progress. P0 · DONE · dependency: ExtractionService · done when actual image files reach editable results.
- [x] Build details, editing, human confirmation, draft save, deletion confirmation and failure recovery. P0 · DONE · dependency: shared action contract/repository · done when a failed save retains edits.
- [x] Build task views, local calendar, type filters, search, completion/restoration. P0 · DONE · dependency: selectors/persistence · done when saved items appear in appropriate views and survive reload.
- [x] Build settings, reminder selection, backup export and honest future-state labels. P1 · DONE · dependency: settings/reminder contracts · done when preferences persist and no native delivery is implied.
- [x] Review visual consistency, empty/loading/error states, responsive sizing and focus behavior. P0 · DONE · dependency: core screens · done when screenshot inspection and browser checks pass.
- [ ] Verify Linux/macOS/Windows native window behavior. P1 · BLOCKED · dependency: Developer 2/native prerequisites · done when upload/drop/paste, keyboard focus and resizing work in packaged apps.

## Integration dependencies
Consume `useApp()` and shared types; do not instantiate mock/storage implementations in UI. Extraction values come from the service. Coordinate new field shapes or status semantics with Developer 2 before editing schemas. Match every UI change to DESIGN_SKILL.md; update it first for new conventions.

## Blocked by
Packaged native acceptance requires platform system dependencies and a successful Tauri build. Browser tests validate the common frontend, not platform WebView behavior.

## Handoff expectations
Include screenshots for empty Inbox, review, editor and Calendar. Explain interaction changes and storage/error behavior. Keep source preview and mock labels visible; do not claim AI verification or OS notifications. Shared test fixtures must not contain private user information.

## Testing expectations
Run `npm run check`, `npm run format:check`, `npm test`, `npm run test:e2e`, `npm run build`. Inspect desktop at 1440×920 and narrow desktop at 900×640; check browser resilience at 600px. Test keyboard selection, Ctrl/Cmd K, Escape, invalid files and unsaved edits. Run axe on Inbox, extracted details, editor, calendar and settings as appropriate.

## Definition of done
Working implementation, faithful design tokens and logo, meaningful accessible names, useful failure states, no lost edits, tests passing, docs accurate. Platform work is not DONE until verified in its actual runtime.

## Progress notes
- 2026-10-08: Inspected an otherwise empty project with one existing logo; no reusable app code or documentation.
- 2026-10-08: Implemented Phase 1 frontend and explicit mock workflow; initial screenshot review complete.
- 2026-10-08: Accessibility audit identified decorative step-number contrast and unlabeled complementary landmarks; corrected using existing palette and landmark labels.
- Final check evidence and remaining platform limitations are recorded in TASK_TRACKER.md.

- Final frontend checks: TypeScript/lint/format/build pass; 14 unit tests and 9 browser tests pass, plus targeted final regressions. Zero axe violations in the inspected screens. Native build remains blocked.
