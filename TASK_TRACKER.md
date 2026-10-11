# TaskLens shared tracker

Phase 1 implementation tracker, updated 2026-10-08. Owners are responsibility assignments for the two-developer team; no extra agents or separate developer sessions were created. Checkboxes represent completed implementation/verification, not speculative future progress.

## BACKLOG
- [ ] Replace localStorage with SQLite and a tested migration.
  - Owner: Developer 2
  - Priority: P1
  - Status: BACKLOG
  - Dependency: Verified native build and migration plan
  - Definition of done: Existing actions/settings/previews migrate without data loss; repository consumers remain unchanged.
- [ ] Implement on-device OCR and local AI extraction (PHASE 2).
  - Owner: Developer 2, integration by Developer 1
  - Priority: P2
  - Status: BACKLOG
  - Dependency: Stable Phase 1 release and agreed local model/runtime
  - Definition of done: Offline inference returns validated actions through ExtractionService; user review remains mandatory.
- [ ] Implement native notification delivery and startup registration.
  - Owner: Developer 2
  - Priority: P2
  - Status: BACKLOG
  - Dependency: Native runtime/permission strategy
  - Definition of done: Scheduling survives restarts, handles time changes, avoids duplicates and reports permission failures.
- [ ] Add backup import with validation and data reconciliation.
  - Owner: Developer 2
  - Priority: P1
  - Status: BACKLOG
  - Dependency: Schema migration design
  - Definition of done: Exported files can be restored safely with clear conflict handling.
- [ ] Verify packaged macOS and Windows builds (Windows done; macOS remaining).
  - Owner: Developer 1 + Developer 2
  - Priority: P1
  - Status: BACKLOG
  - Dependency: Equipped platform hosts
  - Definition of done: Capture/edit/save/restart flow, focus, resize and original icons pass native smoke tests.
  - Progress (2026-10-11): Windows DONE. MSI and NSIS bundles build; the NSIS-installed app passes `npm run test:native:win` 8/8 (capture via picker/drop/paste, edit/confirm/save, graceful restart persistence, Ctrl+K/Escape focus, 900×640 minimum size, original icons). Gaps: MSI install, Explorer file drag, >100% display scaling, unsigned installers. macOS not started.

## IN PROGRESS
No frontend implementation tasks remain in progress. Native acceptance is explicitly blocked below.

## BLOCKED
- [ ] Compile and launch the native Linux application.
  - Owner: Developer 2; UI smoke test by Developer 1
  - Priority: P0
  - Status: BLOCKED
  - Dependency: WebKitGTK/JavaScriptCoreGTK 4.1 and libsoup 3 development libraries
  - Definition of done: `cargo check` and `npm run tauri build` pass; upload/drop/paste and persistence after native restart are verified.
  - Evidence: `cargo check --manifest-path src-tauri/Cargo.toml` fails in javascriptcore-rs-sys and soup3-sys pkg-config probes; GTK 3 and Rust are present.

## REVIEW
- [ ] Product/team review of Phase 1 and the design contract.
  - Owner: Developer 1 + Developer 2
  - Priority: P1
  - Status: REVIEW
  - Dependency: Working browser demo and project documentation
  - Definition of done: Both owners review workflow, scope, accessibility, shared interfaces and known limitations before integrating to develop/main.

## DONE
- [x] Inspect repository, identify branding, and state implementation plan before changes.
  - Owner: Developer 1 + Developer 2
  - Priority: P0
  - Status: DONE
  - Dependency: None
  - Definition of done: Confirm original `TaskLens.png`, no existing app/Git/docs, record architecture plan.
- [x] Establish documentation, MIT license, design contract and reusable tokens.
  - Owner: Developer 1 + Developer 2
  - Priority: P0
  - Status: DONE
  - Dependency: Inspection
  - Definition of done: All requested root documentation exists; UI follows authoritative palette and original logo.
- [x] Build desktop shell and all navigation destinations.
  - Owner: Developer 1
  - Priority: P0
  - Status: DONE
  - Dependency: Tokens and typed frontend setup
  - Definition of done: Sidebar/topbar/details and responsive desktop layout render every requested view.
- [x] Build screenshot capture, preview, removal and cancellable mock extraction.
  - Owner: Developer 1 + Developer 2
  - Priority: P0
  - Status: DONE
  - Dependency: ExtractionService and validated image handling
  - Definition of done: Browse/drop/paste actual image files; show honest mock progress; removal cancels pending results.
- [x] Build review, edit, confirm/save and manual item creation.
  - Owner: Developer 1
  - Priority: P0
  - Status: DONE
  - Dependency: Action schema and repository
  - Definition of done: All requested fields and reminders editable; draft/confirmed states persist and failures preserve edits.
- [x] Build repository and state integration.
  - Owner: Developer 2
  - Priority: P0
  - Status: DONE
  - Dependency: Versioned domain model
  - Definition of done: Data survives reload/new repository; corruption/quota/concurrent saves have meaningful checks.
- [x] Build task management, search, agendas and local month calendar.
  - Owner: Developer 1 + Developer 2
  - Priority: P0
  - Status: DONE
  - Dependency: Selectors/persistence
  - Definition of done: Today/Upcoming/Calendar/All Tasks/Completed/Needs Review, filters, completion/restoration and deletion work.
- [x] Build settings and reminder configuration abstraction.
  - Owner: Developer 1 + Developer 2
  - Priority: P1
  - Status: DONE
  - Dependency: Settings schema and reminder model
  - Definition of done: Preferences persist, reminders rebase on edits, future native/AI work is explicitly labeled.

- [x] Complete frontend acceptance and documentation reconciliation.
  - Owner: Developer 1 + Developer 2
  - Priority: P0
  - Status: DONE
  - Dependency: Completed frontend implementation
  - Definition of done: Build, lint, typecheck, format, unit/browser tests pass; original logo verified; accurate limitations and handoff report included.

## Verification evidence — 2026-10-08

| Check | Result |
| --- | --- |
| `npm run check` | PASS: strict TypeScript + ESLint |
| `npm run format:check` | PASS |
| `npm test` | PASS: 14 tests in 3 files |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome npm run test:e2e` | PASS: 9 browser tests |
| Targeted final regression run | PASS: 2 tests for unsaved edits/reminders/search and keyboard/contrast/offline/narrow layout after final adjustments |
| `npm run build` | PASS: frontend production bundle |
| `npm audit` | PASS: 0 reported vulnerabilities, including development dependencies |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | PASS |
| `cargo check --manifest-path src-tauri/Cargo.toml` | BLOCKED: missing JavaScriptCoreGTK 4.1 / libsoup 3 development libraries; WebKitGTK 4.1 prerequisite also missing |
| Native dependency installation | BLOCKED: system installation requires a sudo password unavailable to this session |
| Original/logo UI copy SHA-256 | MATCH: `340de572aed4426785595711095038c1d69a1aeadd3086cb231b7e99aa85d9d9` |
| Accessibility | Zero axe violations in Inbox, extracted details, editor, Calendar and Settings; hover contrast and narrow layout checked |
| Responsive behavior | 1440px desktop and 900px narrow desktop tested; 600px browser resize has no page overflow |
| Persistence | Reload, fresh repository, and actual close/reopen of an isolated Chromium process verified |
| Visual QA | Inbox, review, Calendar and Settings inspected; captures in `docs/screenshots/` |

Browser tests cover actual file selection, HTML drag/drop and clipboard image events; invalid files; removal/cancellation; all requested navigation; manual creation and type filters; review/edit/confirm; draft persistence; Today/Upcoming/Calendar; completion/restoration; source preview after reload; search; deletion; settings; quota failure with edit retention; corrupt data preservation; unsaved-edit guards; reminder rebasing; offline workflow; focus and accessibility.

Native execution remains separately blocked; browser-process restart coverage is not a native restart claim. Final implementation/file inventory and limitations are in DEVELOPMENT_REPORT.md.

## Workspace search update — 2026-10-10

- [x] Replace page-level search with a smooth floating search dialog.
  - Owner: Developer 1
  - Priority: P1
  - Status: DONE
  - Dependency: Existing local search selector and TaskLens design tokens
  - Definition of done: Reference-inspired compact panel, blurred backdrop, restrained motion, cross-workspace results, keyboard selection/open/dismiss, focus containment/restoration, and preservation of unsaved edits.
  - Validation: Build, strict TypeScript, lint and 14 unit tests pass. All 8 existing workflow tests passed with the new interaction. All 3 dedicated search tests pass after correcting selection-transition contrast; axe checks report zero violations for empty input, results and no matches. Narrow layouts, reduced motion, both shortcut modifiers, backdrop dismissal and unsaved-editor protection are covered. The design contract documents the search-specific dimensions and motion exception.

## Onboarding Experience - Added: 2026-10-10

### P0 — Phase 1

- [x] Build first-launch onboarding shell
  - Owner: Developer 1
  - Priority: P0
  - Done when: onboarding follows DESIGN_SKILL.md and works at all supported window sizes

- [x] Welcome screen
  - Owner: Developer 1
  - Includes:
    - existing TaskLens logo
    - “Turn information into action. Privately.”
    - concise privacy/local-first explanation

- [x] Interactive workflow explanation
  - Owner: Developer 1
  - Flow:
    - Capture
    - Review
    - Remember
  - Animation must respect prefers-reduced-motion

- [x] Reminder preference screen
  - Owner: Developer 1 + Developer 2
  - Options:
    - night before
    - 1 hour before
    - 15 minutes before
  - Preferences must persist locally

- [x] Interactive demo extraction
  - Owner: Developer 1
  - Use existing MockExtractionService
  - Clearly label extraction as demo/mock during Phase 1
  - Do not hardcode extraction data inside the onboarding component

- [x] Persist onboarding completion
  - Owner: Developer 2
  - Store:
    onboardingCompletedVersion: 1

- [x] Add onboarding versioning
  - Owner: Developer 2
  - Current version: 1
  - Do not show full onboarding again after completion
  - Future versions may trigger a smaller “What’s New” experience

- [x] Add “Replay onboarding”
  - Owner: Developer 1 + Developer 2
  - Location:
    Settings → General → Replay onboarding

- [x] Handle Skip
  - Owner: Developer 2
  - Skip should mark onboarding version 1 as completed

- [x] First-run handoff to Inbox
  - Owner: Developer 1
  - After onboarding:
    - open Inbox
    - briefly emphasize screenshot dropzone
    - no extra modal


- [x] Subtle progress indicator, 300ms motion and reduced-motion support — Developer 1
- [x] Keyboard focus and responsive layouts — Developer 1
- [x] Persistence/state and browser regression tests — Developer 2
- [x] Focused architecture/design/ownership documentation — Developer 1 + Developer 2

### P1 — Native Follow-up

- [ ] Ask for notification permission contextually
  - Owner: Developer 2
  - Only after native notifications are implemented
  - Never request permission immediately on app launch

- [ ] Add launch-at-startup preference
  - Owner: Developer 2
  - Only after native startup registration works

### Acceptance Criteria

- [x] First launch shows onboarding
- [x] Returning users go directly to TaskLens
- [x] Skip works
- [x] Back/Continue work
- [x] Keyboard navigation works
- [x] Reminder preferences persist
- [x] Replay onboarding works from Settings
- [x] Existing TaskLens logo is used unchanged
- [x] UI strictly follows DESIGN_SKILL.md
- [x] Reduced-motion preference is respected
- [x] No cloud service is required
- [x] Phase 1 does not falsely claim real AI processing

### Onboarding validation — 2026-10-10
- DONE: `npm run check` (TypeScript + lint), `npm run format:check`, `npm test` (16 tests), `npm run build`.
- DONE: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome npm run test:e2e -- --workers=1` — all 17 browser tests pass, including five onboarding scenarios and existing workflow/search/restart regressions.
- DONE: axe audits in onboarding and workspace checks; visual review at 1440×920 and 900×640, automated 600px resilience and reduced-motion checks.
- Fixed during verification: the first-capture hint originally dismissed on pointer-down and moved the sample button before its click; dismissal now happens after click dispatch. Highlight helper text also uses accessible contrast.
- Original logo verified byte-identical. No sample tasks are saved by onboarding.
- Packaged native WebView acceptance remains unverified for this feature; do not infer a native pass from browser results.
- Full file inventory and behavior report: ONBOARDING_REPORT.md.
