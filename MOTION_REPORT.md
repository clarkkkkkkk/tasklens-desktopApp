# TaskLens motion implementation

Verified on 2026-10-11.

## Behavior

- Onboarding fades out over 160ms after completion saves. Inbox content enters together over 320ms. The existing first-capture hint remains.
- Workspace headings, cards and controls share one bottom-to-top page entrance: 12px upward travel over 320ms at constant full opacity. Headings use plain text without word staggering. Onboarding retains its 300ms word reveal. Assistive technology receives the complete heading once.
- Sidebar and topbar stay stationary. Typing, saving preferences and refreshing data do not replay page entrances. Inbox handoff uses the same single page entrance, avoiding overlapping shell/section animations.
- Detail panels enter over 220ms and use 140ms visual exits. Review/edit content remains fully visible without separate nested animations.
- Buttons use 120–140ms feedback and a 0.98 pressed scale. New capture content and errors slide upward; toasts receive short entrances; calendar month changes fade with stable grid geometry. Search uses the shared easing.
- Task completion/restoration feedback begins after persistence succeeds. Duplicate actions are guarded while saving.
- Superseded animations are canceled. Exit snapshots are inert, hidden from accessibility, stripped of IDs and unable to receive pointer events. Draft protection, focus restoration and mounted workspace state remain intact.
- Reduced motion removes transforms, stagger and animated waiting, including when the preference changes during an active animation.

## Changed files

- Shared implementation: `src/components/motion/motion.ts`, `motion.css`, `MotionHeading.tsx`, `MotionToast.tsx`; stylesheet registration in `src/main.tsx`.
- Integration: `src/App.tsx`, `src/features/onboarding/OnboardingFlow.tsx`, `src/features/inbox/Inbox.tsx`, `src/features/settings/SettingsView.tsx`, `src/features/tasks/TaskViews.tsx`, `TaskList.tsx`, `src/features/calendar/CalendarView.tsx`, `src/features/extraction/ActionEditor.tsx`, `DetailsPanel.tsx`, `src/styles/tokens.css`.
- Verification: `tests/motion.spec.ts`, `tests/motion-helpers.ts`, and motion settling before accessibility audits in `tests/onboarding.spec.ts`, `tests/search.spec.ts`, `tests/workflows.spec.ts`.
- Documentation: `DESIGN_SKILL.md`, `ARCHITECTURE.md`, `TASK_TRACKER.md`, this report.

The existing TaskLens logo and Solar icons are preserved. No dependencies, persisted settings, schemas or public service interfaces were added or changed.

## Verification

- `npm run check`: TypeScript and lint passed.
- `npm run format:check`: passed.
- `npm test`: 16 tests passed across four files.
- `npm run build`: passed.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome npm run test:e2e -- --workers=1`: all 20 browser tests passed.

Browser coverage includes onboarding completion/replay and storage recovery, rapid navigation, accessible headings, draft preservation, focus restoration, reduced-motion changes during animation, capture cancellation/results, calendar, task persistence, search dismissal, offline behavior, narrow layouts and axe audits. Finite entrances settle before contrast audits.

Packaged native WebView behavior and operating-system reduced-motion integration have not been verified. Browser checks do not establish native-runtime acceptance; those remain a separate follow-up.

## Workspace text refinement verification

After replacing workspace word reveals with the single page fade, TypeScript/lint, formatting and production build passed again. All eight focused motion/onboarding browser tests passed, including rapid page changes, heading text, reduced motion and replay. The 16-unit/20-browser suite results above describe the preceding full motion verification.

## Bottom-to-top refinement

Workspace pages and panels now enter from below at constant full opacity. Nested entrances on upload cards, empty states, rows and review/editor content were removed to prevent repeated fading and overlapping text effects. Processing/errors slide without fading. The app shell stays stationary.

Superseded entrances continue from their current position rather than snapping back to the starting offset. TypeScript/lint, formatting and production build passed for this refinement. All 11 focused motion/workflow browser tests passed on the final rerun. An earlier capture test saw a page reload during concurrent development/build activity; it passed when rerun against the settled source. Native runtime verification remains pending.

## Inbox result dialog

Inbox extraction and Open result now show the shared review/editor inside a centered native dialog. It reuses the search overlay's width, radius, shadow and 12px backdrop blur. Toolbar/actions stay available while content scrolls. The existing panel entrance slides upward at constant opacity. Manual item creation and other views keep their panel presentation.

Escape/outside click protects dirty edits; pending writes block dismissal. Native modal semantics contain focus, background paste is suspended, and closing restores the original opener or Open result when capture has replaced the original button. No sample is saved until the user chooses a save action.

Changed: `src/App.tsx`, `src/features/inbox/Inbox.tsx`, `src/features/extraction/DetailsPanel.tsx`, `ActionEditor.tsx`, new `result-dialog.css`, new `tests/inbox-result.spec.ts`, adapted `tests/motion.spec.ts`/`tests/workflows.spec.ts`, design/architecture/tracker documentation.

Verification: 16 unit tests and the full 21-test browser suite passed. Dialog screenshots inspected at 1440×920 and 600×640; automated centering, viewport bounds, actions, focus and axe checks also passed at 900×640. Initial verification exposed a focus fallback issue after the capture button was replaced; this was fixed and the final suite passes. Packaged native WebView verification remains separate and unverified.

## Completion brand transition

After Start using TaskLens successfully saves completion, the unchanged `public/TaskLens.png` enters at center, reveals the TaskLens name, pauses, then travels into the measured top-left sidebar brand position. The final timing uses a 400ms entrance, 650ms reveal, 450ms hold and 1100ms docking movement with gentle ease-in/out: approximately 2.8 seconds including onboarding exit. The workspace uncovers during docking. Its real brand remains hidden until arrival to avoid duplication.

The workspace remains mounted and inert during the handoff. Search shortcuts cannot interrupt it; Inbox receives focus afterward. Skip, returning launches and reduced motion bypass the sequence. Resizing or enabling reduced motion settles an active transition immediately. Failed persistence never starts it. Replay completion shows the transition without repeating the first-capture hint. No storage schema, service interface or animation dependency changes.

Changed files: `src/components/motion/BrandHandoff.tsx`, `src/components/motion/brand-handoff.css`, `src/App.tsx`, `src/features/onboarding/OnboardingFlow.tsx`, `tests/brand-handoff.spec.ts`, `DESIGN_SKILL.md`, `ARCHITECTURE.md`, `TASK_TRACKER.md` and this report.

Verification: TypeScript/lint, formatting, production build and all 16 unit tests passed. The full 26-test browser suite passed; after the timing refinement, all five brand tests passed again, covering 1440px, 900px and 600px widths, focus/keyboard isolation, reduced motion, reloads and failed completion saves. Centered and docked desktop screenshots were visually inspected. Packaged native WebView verification remains unverified.
