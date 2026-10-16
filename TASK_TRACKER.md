# TaskLens shared tracker

Phase 1 implementation tracker, updated 2026-10-08. Owners are responsibility assignments for the two-developer team; no extra agents or separate developer sessions were created. Checkboxes represent completed implementation/verification, not speculative future progress.

## BACKLOG
- [ ] Replace localStorage with SQLite and a tested migration.
  - Owner: Developer 2
  - Priority: P1
  - Status: BACKLOG
  - Dependency: Verified native build and migration plan
  - Definition of done: Existing actions/settings/previews migrate without data loss; repository consumers remain unchanged.
- [ ] Bundle Tesseract and llama-server for macOS and Linux packages; GPU builds.
  - Owner: Developer 2
  - Priority: P1
  - Status: BACKLOG
  - Dependency: Platform hosts; pinned per-platform archives already in models.json
  - Definition of done: Packaged apps find runtimes without system installs; offline procedure in LOCAL_AI.md passes on each OS.
- [ ] Supervise llama-server against crashes (Windows job object / process group).
  - Owner: Developer 2
  - Priority: P2
  - Status: BACKLOG
  - Dependency: none
  - Definition of done: Killing TaskLens never leaves the model runtime running.
- [ ] Grow the multilingual evaluation set and tune prompt v2.
  - Owner: Developer 1 + Developer 2
  - Priority: P1
  - Status: BACKLOG
  - Dependency: Real, consented sample screenshots without personal data
  - Definition of done: More than 30 cases; report tracked per prompt version; no regression on pictorial/midterm.
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

## DONE — Phase 2: real local intelligence (2026-10-12)
- [x] Merge local voice input (origin/main) into the Phase 2 branch; resolve 5 conflicts. Owner: Developer 2.
- [x] Native Tesseract OCR service (eng+ceb+tgl) with regions, confidence, bounding boxes and isolated preprocessing; verified on six rendered screenshots. Owner: Developer 2.
- [x] Centralised platform/runtime resolution (`platform.rs`). Owner: Developer 2.
- [x] Model manager: pinned Phi-4-mini-instruct Q4_K_M, SHA-256 verified import, cached verification. Owner: Developer 2.
- [x] Managed llama-server lifecycle: on demand, reused, 127.0.0.1 only, per-launch key, stopped on exit; loopback-only HTTP client; streamed cancellable completion. Owner: Developer 2.
- [x] LocalAIExtractionService behind ExtractionService; mock kept for browser, tests, onboarding and demo. Owner: Developer 2.
- [x] Versioned prompt (v1), per-request JSON schema with evidence enums, validator (schema, evidence, dates/times, confidence, sections), one repair retry. Owner: Developer 2.
- [x] Cancellation and stale-result protection (request IDs, generation counter). Owner: Developer 1 + Developer 2.
- [x] Processing stages, error recovery, Action Bundle review, Source Trace, per-field confidence, open questions UI. Owner: Developer 1.
- [x] Settings › Local AI (status, path, size, OCR languages, import/validate/reload, developer options) and sidebar indicator. Owner: Developer 1.
- [x] Regression fixtures (pictorial, midterm, bundle, Cebuano/Tagalog/mixed text and voice), unit tests and real-model evaluation report. Shared.
- [x] LOCAL_AI.md, THIRD_PARTY_NOTICES.md, architecture/tech stack/README updates. Shared.

## IN PROGRESS
No frontend implementation tasks remain in progress. Native acceptance is explicitly blocked below.

## Native acceptance pending
- [ ] Compile and launch the native Linux application.
  - Owner: Developer 2; UI smoke test by Developer 1
  - Priority: P0
  - Status: BUILD VERIFIED · INSTALLED ACCEPTANCE IN PROGRESS
  - Dependency: Installed-package runtime acceptance
  - Definition of done: `cargo check` and `npm run tauri build` pass; upload/drop/paste and persistence after native restart are verified.
  - Current evidence (2026-10-16): Fedora release executable builds successfully and 14 Rust tests pass; earlier system-library blockers are resolved. RPM packaging and installed-window/inference checks are in progress. Historical failures below remain historical.

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

- [x] Keep overdue confirmed items in Today until completed.
  - Owner: Developer 2 (selector), UI section with Developer 1 review
  - Priority: P0
  - Status: DONE (2026-10-11)
  - Dependency: Selectors
  - Definition of done: Past-dated confirmed items appear in an Overdue section in Today and in its sidebar count; drafts and completed items are excluded. Covered by unit and browser tests.
- [x] Add a versioned schema migration pipeline.
  - Owner: Developer 2
  - Priority: P0
  - Status: DONE (2026-10-11)
  - Dependency: Snapshot schema
  - Definition of done: Ordered pure steps upgrade old data in memory; newer, unsupported and corrupt data stay intact with distinct messages; first upgraded write keeps a best-effort pre-migration backup. Prerequisite for the SQLite migration and backup import.

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

### Workspace motion validation — 2026-10-11

- [x] Shared motion tokens, heading reveals, onboarding handoff, navigation, panels, controls, capture, calendar and task/toast feedback — Developer 1.
- [x] Reduced motion, inert exits, focus restoration and rapid-navigation cancellation — Developer 1.
- [x] Persistence/recovery and existing workflow regressions — Developer 2.
- [x] TypeScript/lint, formatting, build, 16 unit tests and 20 browser tests pass.
- [ ] Packaged native WebView motion and platform reduced-motion verification — Developer 1 + Developer 2.
- Behavior, changed files and verification details: MOTION_REPORT.md.

### Inbox result dialog — 2026-10-11

- [x] Center Inbox extraction review in a floating dialog with the search backdrop blur — Developer 1.
- [x] Responsive review/editor scrolling, focus containment/restoration, guarded dismissal and background paste isolation — Developer 1.
- [x] Shared save behavior, storage regressions, 16 unit tests and all 21 browser tests verified — Developer 2.
- [ ] Packaged native WebView modal/backdrop verification — Developer 1 + Developer 2.

### Completion brand transition — 2026-10-11

- [x] Centered unchanged TaskLens logo/name reveal and smooth travel to the actual sidebar brand; approximately 2.8 seconds including onboarding exit — Developer 1.
- [x] Responsive positioning, inert workspace, focus restoration, shortcut isolation and reduced-motion settlement — Developer 1.
- [x] Completion-save failure protection, unchanged stored data and browser regression verification — Developer 2.
- [x] TypeScript/lint, formatting, build and 16 unit tests; full 26 browser tests before timing refinement and all five brand tests after slowing the transition.
- [ ] Packaged native WebView animation verification — Developer 1 + Developer 2.

### Local voice/text capture — 2026-10-12

- [x] Recorder/import/text UI, centered multi-action review, retained drafts, transcript/evidence inspection and explicit per-action saving — Developer 1.
- [x] Injected capture/preprocessing/transcription/model contracts; CPAL, bounded Symphonia/Rubato conversion, timestamped Whisper output, shared Qwen bundle extraction and additive persistence — Developer 2.
- [x] Pinned model import/hash/load validation, local subprocess packaging, opaque job cancellation, finalization/cleanup coordination and startup orphan cleanup — Developer 2.
- [x] TypeScript, lint, formatting, frontend build and 30 unit tests — Developer 1 + Developer 2. The real-model test is opt-in and separate.
- [x] Native format/check and seven Rust tests, including generated PCM/MP3/AAC-LC/ALAC/Vorbis fixtures, Opus/WebM rejection, silence, hash corruption, timestamps and untouched originals — Developer 2.
- [x] Linux debug Debian packaging with both inference executables, pinned manifest and runtime licenses; no bundled model weights — Developer 2. This is a package-build check, not manual microphone acceptance.
- [x] Final 32-test browser regression run after close-guard integration — Developer 1. Includes five voice scenarios, axe, reduced motion, native-close choices through injected services and existing workspace regressions.
- [x] Local Qwen text-extraction fixture checks — shared. Four cases passed the six-case sweep; the omitted campus location and invalid empty reminder-time entry were corrected, and both focused reruns pass. The final mixed-language action is a task with no fabricated reminder time. This is not real-speech or general multilingual-quality acceptance.
- [ ] Real microphone capture, all imported codecs through the packaged UI, native permission recovery and native focus/close behavior — Developer 1 + Developer 2.
- [ ] Real quiet/noisy English, Tagalog, Cebuano and both mixed-language recognition evaluations — shared. Cebuano remains an explicit acceptance risk.
- [ ] Disconnected-network packaged restart/transcribe/extract/review/save/reload and full latency/RSS/cancellation/cleanup measurements on the 16 GB baseline — Developer 2.
- [ ] Windows/macOS voice packages and actual-platform microphone verification; added CI matrix has not run in this session — Developer 2.

All 32 final browser tests pass; native-close choice coverage uses injected services. macOS includes microphone usage metadata and the hardened-runtime audio-input entitlement; actual-platform permission verification remains pending. Screenshots were inspected at 1440×920, 900×640 and 600×640, including centered review, stable actions and scrollable content. The independent synthetic-English Whisper run took 27.38 seconds for 6.7 seconds of audio, peaking at 768,196 KiB RSS. The six-case Qwen evaluation peaked at 5,484,236 KiB RSS; completed cases took 154.5–403.9 seconds while builds were running. The corrected focused pictorial run took 383.1 seconds and peaked at 5,490,096 KiB RSS; the mixed-language task rerun took 153.3 seconds and peaked at 5,470,212 KiB RSS. The final prompt was verified with focused reruns after the original six-case sweep, not a second complete six-case sweep. These are subprocess smoke measurements, not clean end-to-end platform benchmarks. Model output can omit details or introduce unnecessary warnings; every action requires review.

Setup, supported codecs, retention, troubleshooting and limitations: VOICE_CAPTURE.md. File inventory and delivery evidence: VOICE_IMPLEMENTATION_REPORT.md.

## All-in-one offline intelligence — 2026-10-16

Current work supersedes manual model-import setup and the stale claim that screenshots remain mock-only. Real OCR and local extraction are implemented; samples/onboarding remain explicitly mock. Historical Windows installers and Qwen/Phi smoke measurements do not certify this release.

- [x] Versioned central manifest for official Qwen3-4B Q4_K_M, Whisper Small multilingual, native source archives, Tesseract/Leptonica and eng/ceb/tgl data; exact sizes/SHA-256 pins.
- [x] Build-only streaming asset preparation, format validation and native target-suffixed sidecar configuration. Weights remain ignored by Git.
- [x] Shared bundled-resource resolver, application-data validation receipts, background readiness query/events, repair errors and developer-only model import controls.
- [x] Qwen3 non-thinking prompt version 2 and model stop tokens; existing schema/evidence/temporal validation retained.
- [x] Shared model gate: stop the reused extraction server before Whisper loads. Startup loads neither model.
- [x] Frontend TypeScript/lint and 54 unit tests; two asset-preparation tests. Rust tests: 14 passed, two opt-in checks skipped (sidecar packaging excluded while runtimes compile).
- [ ] Complete native sidecar dependency audit and Fedora release packaging/inference acceptance; current evidence is in OFFLINE_AI_IMPLEMENTATION_REPORT.md.
- [ ] Windows x86_64 single offline installer and native acceptance. Inno staging/script prepared; actual Windows host, offline WebView2 payload and signing remain needed.
- [ ] Apple Silicon app/DMG, signing/notarization and native acceptance on macOS. Intel macOS deferred.
- [ ] Actual-microphone language/noise quality and clean end-to-end latency/RSS acceptance; synthetic speech checks are distinct.

Full browser run: 30 passed, three failed during concurrent native builds and development-server changes. Focused reruns and final results must be recorded before claiming an existing-test pass. No user task storage or schema version was changed.
