# Native reliability implementation checkpoint

Branch: `codex/native-reliability`, starting at `af0a68f80e9d9433931a5445ac38fcb4fa3c5876`. No push or main merge is authorized. This is an unfinished Milestone A checkpoint, not completion of the approved A–E plan.

## Implemented in Milestone A

- A serialized Rust storage/deadline worker, SQLite **delivery journal only**, opt-in device preferences, main-window-only IPC and revisioned status events. Authoritative tasks/settings remain under the unchanged `tasklens:data:v1` key.
- Journal path: Tauri `app_data_dir()/storage/tasklens.sqlite3` (normally `$XDG_DATA_HOME/app.tasklens.desktop/storage/tasklens.sqlite3` on Linux). It stores identities, UTC instants, IANA zones, fingerprints, outcomes, summary coverage and consent. It does not contain screenshots, transcripts, notes or source evidence. Task titles remain in memory unless the user explicitly permits a title notification.
- Rollback journaling and FULL synchronization for this initial single-worker journal; foreign keys enabled. Unix storage directories are 0700 and database files 0600. SQLite primary task storage, WAL policy, live database backups and Windows ACL hardening belong to D and are not claimed here.
- Startup begins paused. `ReminderSafeRepository` serializes durable pause → validated localStorage mutation → native reconciliation. A failed pause prevents the task write. A successful task save followed by failed registration remains a successful save with a separate, persistent reminder warning. A failed canonical read never becomes an empty workspace.
- Notification activation is separate from the legacy `remindersEnabled` preference. A revision-bound preview requires approval. Deactivation cancels pending schedules; future reactivation reconciles current tasks first. Initial activation never produces catch-up notifications for historical triggers.
- Night-before means previous local day at 20:00. Arrival time precedes start time; event end is never used. New date-only configurations contain no invented 9 AM anchor. Relative reminders need a confirmed anchor. Old values remain untouched until the user edits them; mismatched schedules and legacy custom schedules are listed for confirmation and are not silently delivered. An explicit editor save approves the exact displayed custom instant; merely loading/activating legacy preferences does not.
- DST gaps reject relative schedules. Repeated local times require an explicit first/second occurrence in the editor, recorded as additive optional reminder approval metadata. Existing approved instants retain their original timezone and do not move with the device timezone.
- Stable fingerprints ignore titles, notes and update timestamps. Pending/dispatching/submitted/failed/cancelled/missed/unknown are durable; unapproved/historical are non-delivering states. Dispatch claims precede OS calls. Interrupted claims become unknown and never automatically replay.
- Newly identified misses within 24 hours are covered by one private recovery-summary claim; older misses remain reviewable. The summary coverage is committed before submission. A crash or uncertain OS result can lose a visible notification; there is no exactly-once-visible guarantee and no automatic replay of ambiguous submissions.
- Linux/Windows submission uses notify-rust with error propagation, not the Tauri notification plugin's fire-and-forget API. Linux permission remains system-managed/unknown even when the D-Bus service is present. Windows uses the native notification setting query. macOS source uses UserNotifications for authorization and acknowledged submission; native compilation/delivery/interaction acceptance is pending.
- Generic notification text by default. Title inclusion is explicit; notes, screenshots, evidence and transcripts are never payloads. Linux notification actions reopen the application and retain a task target until recording/review/edit guards allow opening. Deleted targets produce a safe message. Windows/macOS task-activation callbacks remain incomplete.
- Background mode defaults off. Native window close routes through shared guards, then quits or hides according to device preference. Explicit Quit stops the coordinator. Tray Open/Quit and launcher reopening are available; desktops without tray icons must use the launcher or in-app Quit. Native tray creation is best effort, not a guarantee that GNOME displays an icon.
- Coordinator waits for the nearest deadline, capped at 30 seconds for clock-change checks; no React timer delivers notifications. No additional model loading, inference, remote endpoint or cloud fallback is introduced.
- `ActionRepository.exportRaw()` is asynchronous and repository subscriptions are available. Browser development retains localStorage and explicitly reports desktop-only delivery/background behavior.

## Verification commands

```bash
npm run check
npm run format:check
npm test
npm run build
npx playwright test --workers=1
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo build --locked --manifest-path src-tauri/Cargo.toml
TASKLENS_TAURI_DRIVER=/path/to/tauri-driver node scripts/linux-reliability-acceptance.mjs /absolute/path/to/debug/tasklens
```

The native script uses synthetic tasks and a fresh temporary XDG profile. Debug automation has a separate fixed Linux single-instance identity so it cannot focus/write to an already-running normal development window. Release identity is unchanged. Generated logs/screenshots/profiles remain untracked; preserve them locally for review.

The initial complete Fedora run passed nine checks: default-off activation, eligible preview, completion cancellation, actual OS test submission, actual deadline submission, background preference, launcher reopening, global disabling and restart preservation. This certifies OS submission, not a visible banner, user acknowledgment or notification-center interaction. The expanded complete Fedora run passed ten checks, including the real native window-close/hide/reopen path and one real submitted summary after a deadline elapsed with TaskLens closed; a further restart did not create another summary. The final full native run passed all eleven checks, including actual unsaved-editor Quit protection, explicit discard and successful explicit Quit. Screenshots of the native Settings and close guard were observed. Native banner visibility, notification-center interaction and system suspend/denial behavior remain unverified.

Frontend verification passed: TypeScript/lint, formatting, production build, 71 unit tests (one real-model evaluation skipped), and all 46 browser tests on the frozen snapshot before the final custom-approval addition. After the custom-approval addition, all 15 existing focused voice/task/browser-settings checks passed; the new custom-approval browser case also passed after fixing test selectors for sidebar counts and the separate Complete button. The final two-case reminder-settings/custom-approval rerun passed. Native end-to-end delivery of custom reminders has not yet been exercised; native eligibility and frontend approval are covered independently. Rust check/build/format and all 34 ordinary tests passed; two pre-existing opt-in OCR/codec tests remain ignored. The final browser suite ran against a frozen source copy at `/tmp/tasklens-frontend-final-6talz31_` with a separate Vite port/cache and the same source/tests/public assets, to avoid the already-running development server. Its JSON report records 46 expected, zero unexpected, zero flaky, zero skipped in 289.036 seconds.

Diagnostic history is retained: an initial concurrent browser run had 39 passes/six failures during hot reload; another was interrupted. The first frozen harness lacked a root upload fixture and a dependency/font allowlist, so its failures do not establish an application regression. After fixing the harness (no production assertions weakened), the complete final suite passed. A native guard-harness selector quoting error was fixed and the full native suite subsequently passed. No expensive LLM evaluation, AI runtime rebuild or installer rebuild was performed.

## Gate before Milestone B

Milestone A remains partial until Fedora acceptance covers native notification visibility/interaction, native notification-center task activation, system suspend/resume and platform permission-denial behavior. The unavailable-service failure path passed on a real isolated session bus. Real close/hide/Quit and recovery-summary submission/deduplication have passed. Unit tests alone do not establish desktop behavior. Windows and Apple Silicon macOS native compilation and acceptance remain unverified. Windows/macOS notification activation callbacks are incomplete; native platform acceptance remains pending. The banner-observation question remains unanswered, and this run did not suspend the user’s active desktop.

Do not begin backup import/restore, autostart registration or canonical SQLite migration before the applicable A gate is satisfied. Current backup export remains the existing raw version-1 snapshot; import, backup envelopes, conflict previews, pre-restore recovery snapshots, autostart and primary SQLite migration have **not** been implemented. No migration receipt/canonical marker exists and there are no dual writes of tasks to SQLite.

## Security and encryption follow-up

The SQLite journal, localStorage and JSON exports are **unencrypted**. Unix permissions limit casual access by other users but do not defend against a compromised same-user account or a stolen unlocked device. Do not put private content in diagnostics. Never copy real microphone identifiers or task snapshots into Git.

A separate encryption design must cover SQLCipher build/distribution, OS-backed key storage on each platform, key loss and user recovery, encrypted export format/compatibility, authenticated metadata, rotation and a verified transactional migration with recoverable plaintext handling. Merely enabling a SQLite pragma does not add encryption. Native Windows user ACL enforcement and all-platform restore/storage failure acceptance remain required work.

## Milestone status at this checkpoint

| Milestone | Status |
| --- | --- |
| A: native reminder journal, scheduling, Settings, close/background | Implemented with eleven Fedora native checks; still partial because the remaining OS visibility/interaction/suspend gates are incomplete |
| B: backup import/restore | Not implemented; gated by A |
| C: autostart | Not implemented; gated by A/B |
| D: canonical SQLite tasks and migration | Not implemented; gated by preceding milestones |
| E: broader acceptance and before/after scale measurements | Partial regression checks only; scale/performance and native Windows/macOS acceptance pending |

No installer or completed all-platform acceptance, 100/1,000/5,000-task performance result, canonical migration or encryption outcome is implied by the successful tests above.

### Additional native failure-path acceptance

A real isolated `dbus-run-session` without an `org.freedesktop.Notifications` service passed two checks: honest unavailable-service status with propagated OS submission failure, and guarded editor close followed by explicit Quit. This did not disable or modify the user's normal desktop notification service. Linux still reports system-managed/unknown permission, rather than inventing a granted state. The status-event cache preserves the platform availability result so a later journal event cannot overwrite a denied/unavailable query with a generic unknown label.

```bash
dbus-run-session -- env TASKLENS_RELIABILITY_NO_SERVICE=1 TASKLENS_TAURI_DRIVER=/path/to/tauri-driver node scripts/linux-reliability-acceptance.mjs /absolute/path/to/debug/tasklens
```

The journal indexes occurrence signatures so repeated reconciliation does not scan the entire delivery history for every task. Full primary-storage performance measurements remain a later milestone; no benchmark numbers are invented here.
