# Architecture

## Current
Screenshot → local OCR (Tesseract) → OCR regions → source units → local Qwen3-4B (llama.cpp) → structured JSON → schema, evidence, date/time and confidence validation → Review (Source Trace, open questions) → Confirm → ActionRepository → localStorage → UI.

Voice notes (whisper.cpp) and typed text join the same pipeline at the source-unit step. `MockExtractionService` implements the same `ExtractionService` contract for browser development, tests, onboarding and demo mode. See [LOCAL_AI.md](LOCAL_AI.md) for setup, privacy and limitations.

Layers are intentionally small:
- `src/components`, `src/features`, `src/layouts`: accessible UI consuming application hooks.
- `src/app`: application state, repository orchestration, dependency injection and user-visible failures.
- `src/types`, `src/lib`: domain schemas, date helpers, selectors and validation.
- `src/services/extraction`: ExtractionService interface, deterministic MockExtractionService and LocalAIExtractionService. `prompts/` holds the versioned system prompt, output schema and prompt builder; `validation/` holds the output validator and deterministic date/time helpers; `evaluation/` holds the opt-in real-model regression suite.
- `src/services/ocr`: OcrService contract, OCR document schema and the native Tesseract client.
- `src/services/localai`: LocalModelManager (model status, import, validation, load/unload, completion) and the native IPC/error layer.
- `src/repositories`: ActionRepository interface and versioned LocalStorageRepository implementation.
- `src/services/reminders`: ReminderScheduler interface and configuration-only implementation.
- `src-tauri`: native window and security policy, plus `platform.rs` (the only place that resolves runtime binaries, language data and hidden child processes per OS), `ocr.rs` (Tesseract), `local_ai/` (model manager, managed llama-server, loopback-only HTTP client), `jobs.rs` (request-ID cancellation) and `voice/` (whisper.cpp). No remote API, plugin or network client.

Dependencies are composed in `src/app/services.ts`; components never instantiate a mock service or hardwire extracted values. Browser tests inject explicit doubles; browser production never silently substitutes mock voice results.

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

## Local AI pipeline
**Services.** `src/app/services.ts` builds `LocalAIExtractionService(NativeOcrService, NativeLocalModelManager, settings)` in the desktop app and `MockExtractionService` in browsers or when `VITE_TASKLENS_EXTRACTION=mock`. `demoExtraction` is always the mock, so onboarding and samples work before a model is installed. AppProvider pushes saved settings (default reminders, context size, threads) into the services.

**OCR.** The webview sends the screenshot bytes as a raw IPC body with a UUID job header (it has no path for dropped or pasted files). Rust validates type and size, decodes with limits and EXIF orientation, prepares a temporary grayscale copy behind the `Preprocessor` trait (small screenshots are upscaled), and runs the Tesseract CLI with `eng+ceb+tgl` and TSV output. Words become line regions `r1…` with mean confidence, bounding boxes in original pixels and Tesseract block/paragraph numbers. The temporary folder is removed after each job.

**Source units.** `unitsFromOcr` rejoins lines wrapped from one statement (same left edge, line spacing, previous line nearly full width) and never merges labels, list items or chat timestamps. A unit keeps its first line's ID and all member line IDs. Transcript segments (`s*`) and typed sentences (`t*`) are units directly.

**Model runtime.** `local_ai::server::Runtime` owns one `llama-server` process: started on demand (warm-up begins while OCR runs), reused across extractions, restarted when context/thread settings change, killed on `RunEvent::Exit`. It binds `127.0.0.1` on a free port with a random per-launch API key and `--no-webui`. Rust reaches it through `local_ai/http.rs`, which only accepts a port and always connects to IPv4 loopback. Completions stream (SSE) so cancellation drops the connection and generation stops. Requests are serialized; status changes are emitted as `local-ai-status` events.

**Model manager.** `resources/models.json` pins models, native source archives, OCR data and licenses. Shared `assets.rs` discovers bundled weights and streams integrity checks into fingerprinted receipts under application data. Explicit developer imports use staging and rollback before activating an override. Normal launches never copy or download weights. Background readiness verifies both models/data and probes executables without loading inference models.


**Prompt and schema.** `buildExtractionPrompt` produces the Qwen3 non-thinking chat prompt: a constant, versioned system prompt (cached by llama.cpp) and a user turn with SOURCE_METADATA (current local time, timezone, file/capture time and an explicit statement that file time is not a sending date) and `[id] text` units. The JSON schema is generated per request: evidence arrays are enums of the present unit IDs, times carry both the as-written text and HH:MM, dates carry the original expression and a basis.

**Validation.** `validateExtraction` never trusts raw output: JSON → Zod schema → unknown evidence IDs removed → times re-derived from their written form → relative dates resolved deterministically from a visible timestamp or capture date, otherwise left empty with an open question → arrival/start de-duplication → requirement/note clean-up → repeated-section check → confidence capped by support (never raised) → `actionSchema`. Invalid output gets one repair attempt; then a retryable `VALIDATION_FAILED` error. Nothing invalid is saved.

**Domain additions (additive, no envelope version change).** `endTime`; per-field confidence for title, endTime and arrivalTime; evidence fields include `endTime`; `ambiguities` are `{ id, field, question, options, segmentIds }` (legacy string entries are upgraded on read); `source.ocr` stores regions and image size for Source Trace; settings gain `localAI { developerMode, contextSize, threads }` with defaults. Drafts (`needs_review`) may hold a time without a date while the date is an open question; confirmation still requires a date.

**Review UI.** Inbox shows real stages and a Cancel action, keeps a generation counter so stale results never replace newer work, opens one result in the dialog or several in the bundle review, and maps error codes to Try again / Choose another image / Open AI Settings. DetailsPanel shows per-field confidence, a Source button per cited field (Source Trace highlights OCR boxes on the screenshot) and “Needs your answer” questions whose options apply as unsaved edits. Developer mode adds OCR and raw-output diagnostics.

## Future (not implemented)
SQLite repository, native reminder delivery, GPU acceleration, macOS crash-safe runtime supervision, and broader multilingual evaluation. ReminderScheduler currently computes upcoming enabled configurations. It does not run timers, request permissions or deliver notifications. A future native implementation must define restart recovery, clock/timezone changes, deduplication, permission refusal and rescheduling before enabling OS delivery.

## Security and offline behavior
Bundled fonts/assets only; no runtime external network calls. Tauri CSP restricts connections to its IPC origin and local development websocket in dev mode. Local AI adds no webview network access: OCR and model calls are Tauri commands, and the only socket TaskLens opens is Rust → `127.0.0.1:<random port>` to its own llama-server. Native commands accept only the main window, UUID job IDs and bounded inputs; child processes get argument lists, never shell strings. Browser file APIs support chosen/dropped/pasted images; native drag interception is disabled so the webview receives HTML drag/drop. No filesystem-wide capabilities, remote URLs, authentication, telemetry or secrets.

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
App records whether selection came from Inbox extraction or its Open result action. These selections use DetailsPanel's native modal presentation with a centered, blurred backdrop; manual items keep the side panel; search results also open in the centered dialog. Voice/text use BundleReview with the shared DetailsPanel and a retained editor per action. Review/editor components and save operations are shared. The Inbox stays mounted behind the modal and its global paste handler is suspended while either overlay is open. Native modal focus containment, guarded Escape/outside dismissal and a fallback to Open result preserve keyboard access when the original capture control no longer exists. Editor writes report pending state so modal dismissal cannot interrupt a save.

## Completion brand handoff
Onboarding reports complete versus skip only after settings persist. Complete mounts the local BrandHandoff overlay while the workspace stays mounted, inert and aria-hidden. It measures the real sidebar image/name, reveals a centered copy, then animates it into those exact positions while uncovering the workspace. The real brand stays visually hidden until overlay removal, so the swap is continuous. Skip and reduced motion use the direct Inbox path; returning launches do not mount the overlay.

Browser animation promises sequence the finite stages; unmount cancels all work. Reduced-motion changes and window resizing settle immediately. Inbox focus is applied in a layout effect after inertness is removed. Search/paste are suspended during handoff, and the six-second first-capture hint begins afterward. Replay completion can show the brand animation but never repeats the first-capture hint. No persisted setting, asset or service contract changes.

## Local voice and text pipeline
Native CPAL recording and bounded file transfer feed Symphonia/Rubato preprocessing, then a pinned whisper.cpp subprocess. TranscriptDocument retains full text, stable segment IDs, timestamps, language, duration and model identity. Voice/text join the shared LocalAIExtractionService (transcript segments or typed sentences as source units) and use the same Qwen3 non-thinking prompt, managed llama-server and validator as screenshots. ExtractionService now returns an action/ambiguity bundle. All voice/text actions share a centered review dialog with mounted editors and explicit per-action saves. Legacy action/settings envelopes retain their storage key/version and accept additive source/evidence metadata.

Native commands are main-window scoped. Inputs use opaque job IDs; paths/executable names are generated by native code. Cancellation flags, subprocess interruption, bounded input/output and frontend generations prevent stale results. Job directories are cleaned after transcription/cancellation and on startup; imported originals are never removed. A single-instance plugin protects active jobs. Models resolve from bundled read-only resources with application-data verification receipts. Whisper is short-lived; extraction reuses a private loopback-only llama-server. A shared gate stops extraction before speech loads. Setup and limitations: VOICE_CAPTURE.md.

## All-in-one release assets — 2026-10-16

The versioned model manifest pins Qwen3-4B Q4_K_M, Whisper Small multilingual, llama.cpp, whisper.cpp, Tesseract/Leptonica and eng/ceb/tgl trained data. Build-time scripts stream/hash/validate assets, compile native CPU sidecars and collect notices. Tauri externalBin handles target-suffixed executables; explicit resource mappings ship weights/data/notices. Release paths use Tauri resources and the executable directory, with repository fallback only in debug builds.

`assets.rs` centralizes model resolution, format/hash checks, fingerprinted receipts and background initialization. Query/event revisions prevent startup status races. Readiness means verified files and runnable executables, while inference stays on demand. Models are never copied on normal first launch, downloaded at runtime or substituted with mock extraction after failure. Explicit developer imports leave bundled resources and legacy user files untouched.

Screenshot inputs still decode in Rust; their temporary grayscale copy is BMP so the pinned static Leptonica build needs no separate PNG/JPEG/TIFF runtime. Text/speech/screenshots retain the existing validator, review and persistence contracts. Prompt version 2 uses Qwen3 non-thinking markers and manifest stop tokens. LocalStorage and onboarding versions are unchanged.

Linux x86_64, Windows x86_64 and Apple Silicon macOS are the release targets; Intel macOS is deferred. Windows uses a single Inno offline installer with an offline WebView2 payload; oversized files require hosting outside GitHub Releases. See LOCAL_AI.md and OFFLINE_AI_IMPLEMENTATION_REPORT.md for commands, measurements and actual acceptance status.

### CPU runtime selection and responsive first launch

Runtime recipe 2 bundles separate static baseline and AVX2 x86_64 llama.cpp/Whisper sidecars. `platform::bundled_binary` checks CPU and OS support before selecting AVX2, retaining baseline fallback. Model lifecycle, inference serialization and persistence are unchanged. Onboarding completion updates navigation immediately and uses a disposable visual exit snapshot; paused background-window animations cannot hold the workspace in a saving state.
