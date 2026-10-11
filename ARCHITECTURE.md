# Architecture

## Current
Input → MockExtractionService → validated structured result → Review → ActionRepository → localStorage → UI.

Layers are intentionally small:
- `src/components`, `src/features`, `src/layouts`: accessible UI consuming application hooks.
- `src/app`: application state, repository orchestration, dependency injection and user-visible failures.
- `src/types`, `src/lib`: domain schemas, date helpers, selectors and validation.
- `src/services/extraction`: ExtractionService interface and deterministic MockExtractionService.
- `src/repositories`: ActionRepository interface and versioned LocalStorageRepository implementation.
- `src/services/reminders`: ReminderScheduler interface and configuration-only implementation.
- `src-tauri`: native window, security policy and desktop build foundation. No remote API or AI plugin.

Dependencies are composed in `src/app/services.ts`; components never instantiate a mock service or hardwire extracted values. Swap the implementation there to integrate future processing.

## Domain and persistence
ExtractedAction retains the requested action types, confidence map, requirements, notes, reminders, source and status. Additions: source.extractionMode persists mock/local provenance; createdAt/updatedAt for durable ordering and reminder `offsetMinutes` for keeping presets aligned when the event date/time changes. Reminder datetimes are ISO instants; calendar dates are local YYYY-MM-DD strings, not UTC-truncated dates. Arrival time takes precedence over event time when anchoring reminders. Night-before is 20:00 on the previous local day. Date-only items use 09:00 only as their reminder anchor and show that explicitly in the editor.

Confirmation acknowledges all fields after human review. Inferred confidence is retained for provenance; needs_review fields become confirmed when the user explicitly confirms. Completing/restoring preserves reviewed status. Completed items are excluded from Needs Review and scheduled reminders. A draft can be saved without confirmation and recovered through Needs Review.

The repository stores a versioned JSON envelope under `tasklens:data:v1`, including actions and settings. Every read and write is schema-validated. Corrupt/unsupported data is never silently overwritten: initialization fails with a recovery/export path. No automatic seed data. Source images are downsampled for local persistence; only a bounded thumbnail is retained. The original remains untouched on disk. LocalStorage is chosen for Phase 1 because the repository started with no native/database infrastructure; it has a small quota and is not encrypted. Storage failures retain in-memory edits and allow retry. The API is asynchronous so SQLite can replace it without changing UI consumers.

The pictorial fixture intentionally uses Thursday, October 8, 2026, 13:30 arrival. It is not derived from uploaded pixels. Date views respect the actual local date; Upcoming includes today and future dates. If demoing after that date, edit the fixture date in the review UI. Calendar opens to the current month and can navigate to the saved item's month.

## Future (not implemented)
Screenshot → local OCR → local LLM → structured JSON → schema validation → Review → SQLite → ReminderScheduler → native notification.

ExtractionService accepts image/text source metadata and an AbortSignal/progress callback, returns validated actions and can later support multiple results. The current mock returns one result. Removal and unmount abort active work. No OCR/LLM imports, network clients or API credentials belong in this phase.

ReminderScheduler currently computes upcoming enabled configurations. It does not run timers, request permissions or deliver notifications. A future native implementation must define restart recovery, clock/timezone changes, deduplication, permission refusal and rescheduling before enabling OS delivery.

## Security and offline behavior
Bundled fonts/assets only; no runtime external network calls. Tauri CSP restricts connections to its IPC origin and local development websocket in dev mode. Browser file APIs support chosen/dropped/pasted images; native drag interception is disabled so the webview receives HTML drag/drop. No filesystem-wide capabilities, remote URLs, authentication, telemetry or secrets.

## Versioned onboarding
Settings now include `onboardingCompletedVersion`, a nonnegative integer defaulting to 0 when absent in legacy data. This additive migration retains the `tasklens:data:v1` envelope and all existing preferences/actions. `CURRENT_ONBOARDING_VERSION` is 1; release-step selection is separate from presentation so later releases can offer only their new steps. Completion never downgrades a higher version.

App waits for repository loading before deciding between onboarding and the workspace. Load failures retain recovery/export behavior. Settings replay does not reset completion: the existing workspace stays mounted but hidden/inert, workspace search and paste are suspended, and dirty editors must be resolved before replay. Exit restores Settings focus; completion opens Inbox. First-run completion has a six-second dismissible dropzone hint.

Onboarding preferences use the existing saveSettings operation immediately, serialize user interaction while pending, and report failures inline. Finish/Skip wait for a successful completion write. The demo uses the injected extraction service and existing screenshot fixture, cancels on departure, retains successful results across steps, and edits location only in memory. No onboarding path calls saveAction.

## Interface motion
Shared tokens and CSS entrances live in `src/components/motion/motion.css`; `motion.ts` provides cancellable browser animations and visual-only exit snapshots. Page entrances depend on navigation identity, rather than repository refreshes. The workspace remains mounted during onboarding replay. Completion holds the tour through its successful persistence and fade before revealing Inbox.

Exit snapshots are inert, hidden from accessibility, stripped of IDs, and never receive pointer events. Live state and focus updates proceed immediately; newer transitions replace older snapshots. Task success feedback starts only after persistence succeeds. MotionHeading exposes one complete heading to assistive technology while decorative word spans animate. Reduced-motion changes cancel active browser animations, and CSS removes movement and waiting. No animation dependency or persistence/service schema change is involved.

Workspace headings render ordinary text and share one 320ms page entrance with cards and controls: 12px upward travel from below at constant full opacity. Only onboarding opts into decorative word reveals. Inbox handoff uses this same page entrance instead of animating the app shell and individual sections, keeping the sidebar/topbar stationary and avoiding overlapping heading effects. Panels enter from below as well.

Workspace cards, empty states, task rows and editor/review content share their parent entrance rather than starting independent opacity animations. This keeps mounted content visible while navigating or editing. Newly introduced processing/error content uses translation only.

## Inbox extraction review
App records whether selection came from Inbox extraction or its Open result action. These selections use DetailsPanel's native modal presentation with a centered, blurred backdrop; manual items and selections from other views keep the side panel. Review/editor components and save operations are shared. The Inbox stays mounted behind the modal and its global paste handler is suspended while either overlay is open. Native modal focus containment, guarded Escape/outside dismissal and a fallback to Open result preserve keyboard access when the original capture control no longer exists. Editor writes report pending state so modal dismissal cannot interrupt a save.
