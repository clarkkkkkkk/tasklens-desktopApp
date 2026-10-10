# Onboarding implementation report

## Delivered behavior
Four steps introduce TaskLens, let users explore Capture → Review → Remember, configure existing reminder defaults, and edit a temporary sample location. The sample is explicitly labeled, uses the injected MockExtractionService plus the existing screenshot fixture, and never calls the task save API. The demo remains the fixed October 8, 2026 pictorial example; it is not extraction from pixels.

## Files created
- `src/features/onboarding/OnboardingFlow.tsx`: flow controller and focused step components.
- `src/features/onboarding/onboarding.constants.ts`: current version, release selection, monotonic completion.
- `src/features/onboarding/onboarding.css`: token-based layout and restrained motion.
- `src/features/onboarding/onboarding.test.ts`: legacy migration and version contracts.
- `tests/onboarding.spec.ts`: onboarding browser coverage.
- `ONBOARDING_REPORT.md`: this report.

## Files modified
- `src/App.tsx`: startup gate, manual replay, workspace isolation, focus restoration and Inbox handoff.
- `src/types/action.ts`: additive settings version with legacy default 0.
- `src/features/settings/SettingsView.tsx`: General → Replay onboarding.
- `src/features/inbox/Inbox.tsx`: brief first-capture hint and interaction dismissal.
- `tests/workflows.spec.ts`, `tests/search.spec.ts`, `tests/restart.spec.ts`: explicit onboarding completion/setup for existing regressions.
- `DESIGN_SKILL.md`, `ARCHITECTURE.md`, `DEVELOPER_1.md`, `DEVELOPER_2.md`, `TASK_TRACKER.md`: focused design/architecture/ownership and completion notes. Existing tracker additions are preserved.

## Logo
Uses unchanged `public/TaskLens.png`. SHA-256 matches original root `TaskLens.png`: `340de572aed4426785595711095038c1d69a1aeadd3086cb231b7e99aa85d9d9`. Images retain their aspect ratio.

## Startup and persistence
App waits for repository loading. Missing `onboardingCompletedVersion` migrates to 0; values below `CURRENT_ONBOARDING_VERSION = 1` trigger onboarding. Successful Finish/Skip stores at least version 1 using existing settings persistence, without changing the storage key/envelope. Existing actions and preferences survive. A failed write leaves the flow available for retry; unreadable storage shows existing recovery/export tools.

Reminder choices save immediately, including during replay. Pending writes disable conflicting controls. No new storage abstraction or direct localStorage calls are introduced in onboarding UI. Release step selection is independent of presentation, allowing future targeted release steps.

## Replay and handoff
Replay never clears completion. Workspace components remain mounted but hidden/inert, and search/paste handlers are suspended. Dirty editors must be saved or closed before replay. Exit/Escape returns to Settings with focus on the replay button. Finish/Skip goes to Inbox. First-run completion shows a six-second dropzone emphasis, cleared on interaction/navigation; replay does not repeat it. Hint dismissal occurs after click dispatch so layout movement cannot swallow the clicked action.

## Accessibility and interaction
Semantic buttons/checkboxes, persistent labels, step announcements, heading focus, visible control focus rings, keyboard navigation, and native reduced-motion support. Motion is a documented 300ms exception with opacity/12px translation/subtle scale. Narrow layouts stack with vertical scrolling and no horizontal overflow. Demo work cancels on departure; successful results and edits survive Back/Continue. Loading and failure do not block Finish/Skip.

## Verification
All checks pass: `npm run check`, `npm run format:check`, `npm test` (16 unit tests), `npm run build`, and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome npm run test:e2e -- --workers=1` (17 browser tests). `git diff --check` is clean. Browser checks cover onboarding, immediate preferences, replay, reload, storage failure/recovery, keyboard/reduced motion, demo failure/retry/cancellation, zero sample-task writes, and existing capture/edit/search/calendar/restart behavior. Unit tests cover legacy settings and higher-version preservation. Visual inspection covered 1440×920 welcome and 900×640 stacked demo; automated width checks include 600px. Axe audits cover welcome and demo alongside existing workspace audits.

## Limitations and next step
Packaged native WebView behavior was not verified in this change. No AI, OCR, cloud, or native notification delivery was added. Next step: smoke-test the four steps, keyboard focus, capture handoff and restart persistence in the packaged Tauri application on supported platforms.
