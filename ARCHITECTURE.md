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

Today lists confirmed items dated today plus confirmed overdue items (`isOverdue`: a past local date, not completed, not a draft), shown in their own Overdue section until completed. Upcoming stays today-and-future, so an overdue item is never silently dropped from every agenda.

Confirmation acknowledges all fields after human review. Inferred confidence is retained for provenance; needs_review fields become confirmed when the user explicitly confirms. Completing/restoring preserves reviewed status. Completed items are excluded from Needs Review and scheduled reminders. A draft can be saved without confirmation and recovered through Needs Review.

The repository stores a versioned JSON envelope under `tasklens:data:v1`, including actions and settings. Every read and write is schema-validated. Corrupt/unsupported data is never silently overwritten: initialization fails with a recovery/export path. No automatic seed data. Source images are downsampled for local persistence; only a bounded thumbnail is retained. The original remains untouched on disk. LocalStorage is chosen for Phase 1 because the repository started with no native/database infrastructure; it has a small quota and is not encrypted. Storage failures retain in-memory edits and allow retry. The API is asynchronous so SQLite can replace it without changing UI consumers.

The pictorial fixture intentionally uses Thursday, October 8, 2026, 13:30 arrival. It is not derived from uploaded pixels. Date views respect the actual local date; Upcoming includes today and future dates. If demoing after that date, edit the fixture date in the review UI. Calendar opens to the current month and can navigate to the saved item's month.

## Schema migration
`SNAPSHOT_VERSION` (in `src/types/action.ts`) is the stored envelope version; `snapshotSchema` validates only that version. The storage key `tasklens:data:v1` is stable across versions; the envelope's `version` field drives upgrades.

`src/repositories/migrations.ts` holds `snapshotMigrations`, keyed by the version each step upgrades from (`N → N + 1`). Steps are pure and lossless: they keep IDs, timestamps, source previews and reminder selections. `migrateSnapshot` runs the steps in order and validates the result against the current schema. Reads classify failures: data from a **newer** app version gets its own message asking the user to update; a missing or failing step, or a result that fails validation, is **unsupported**; malformed current-version data is **corrupt**. In every case the stored data is left intact with the existing recovery/export path.

Loading never writes. The upgraded snapshot is persisted by the next normal write. Immediately before that write the original JSON is copied to `tasklens:backup:pre-migration:v<from>`. The backup is best effort: if there is no room for it the validated upgrade is still saved (Settings export remains available); if the main write fails the backup is removed so it cannot consume the quota needed for a retry.

To change the schema: bump `SNAPSHOT_VERSION`, update `snapshotSchema`, add the `[old version]` step, and add a fixture test with real data from the old version. Never edit a released step. Purely additive optional fields with Zod defaults (such as `onboardingCompletedVersion`) may stay in the same version.

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
