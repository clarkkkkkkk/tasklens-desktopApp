# Settings and Inbox refinement — implementation report

Implemented on local branch `codex/settings-inbox-ux`, based on clean `46a18e5`. Main was not merged, pushed, or deployed. The existing Groq provider, native credential store, extraction prompt/schema, semantic validator, Source Trace, local storage, reminders, and local/Ollama providers are retained.

## Confirmed scrolling cause and fix

The AI recommendation cards contain absolutely positioned screen-reader labels. With no positioned ancestor inside the workspace, their containing block was the document. Their offscreen static positions enlarged document overflow even though Settings itself used `.main-content` scrolling. Further wheel movement at the Settings boundary scrolled that document and moved the entire sidebar out of view.

The audit reproduced this in Chromium and Fedora WebKit: the native document extended to 2,453px in a 795px viewport. A temporary containing-block fix reduced it to 795px and kept the sidebar at zero. The implemented fix makes `.main-content` positioned, contains vertical overscroll, and reserves its scrollbar gutter. It preserves ordinary content scrolling, accessible labels, and bottom padding. A shared native-dialog observer locks that actual scroller, preserves its offset, and releases it only when the last dialog closes. It does not reset scroll after preference writes.

Browser regressions cover desktop/smaller windows, collapsed/expanded Advanced Settings, wheel boundaries, keyboard actions, and modal locking. Native acceptance checks document/sidebar positions and opening/cancelling setup in actual WebKit.

## Settings before and after

Previously, voice model details appeared before General, with Groq explanations, device recommendations, provider lists, model configuration, and developer diagnostics all expanded in the main page.

The normal page now contains **General → AI Processing → Notifications → Appearance → Data & Privacy → Advanced Settings**. AI Processing exposes concise mode labels, local readiness, connection status/actions, storage lifetime, actual daily usage and reset information. Technical routing, hardware, Ollama selection, model/voice validation, developer controls and upcoming reminder diagnostics remain mounted inside collapsed Advanced Settings. Repeated introductory and provider paragraphs were removed from the default view. Full material disclosure remains available in Data & Privacy and before consent; attribution/license links remain accessible.

Radio inputs no longer inherit full-width text-input styling. Preference updates are serialized; Settings applies only fields changed from its render against the latest committed settings, preserving unrelated concurrent changes.

## First-use and setup behavior

`ai.modeChoiceCompleted` is additive and independent of onboarding completion; snapshot version remains 1. New profiles start incomplete. Existing stored profiles without the marker migrate to complete and retain their saved mode. An automatically chosen effective Local mode does not complete a fresh user's choice.

After onboarding, the first meaningful capture prompts an online/offline choice only when native connectivity is available. A screenshot preview, text draft, or audio file remains in its existing mounted capture workflow while setup runs. Choosing Offline intentionally resumes that workflow when local prerequisites are ready. Escape/cancel selects Local and retains input without beginning processing. If connectivity disappears while the initial chooser is open, it dismisses without completing the choice or starting extraction; restoration does not reopen it automatically. If preference storage fails during cancellation, the dialog still exits to Local for this session and reports that the preference could not be saved. Initialization, navigation, manual tasks, calendar, and reminders do not wait for this setup.

Online setup uses one native modal: introduction, key-creation instructions, masked Connect & verify, explicit privacy permission with full disclosure/provider policy, then Ready. Start using TaskLens resumes the retained intent once. Existing verified keys skip entry; stored keys can be verified without re-entry, and invalid keys can be replaced without resetting the wizard. Verification/network/storage failures remain distinct. Late connection results cannot enable Cloud after cancellation.

### Groq API-key setup

1. Choose Online AI from first capture, or Groq Cloud / Connect API key in Settings.
2. Follow the default-browser link to <https://console.groq.com/keys>, sign in, create and copy your own key.
3. Submit it in the masked field. TaskLens clears that field immediately and verifies through the existing native service.
4. Read and explicitly agree to the disclosure. Connecting/verifying a key alone does not permit source transmission.
5. Select Start using TaskLens. Session-only storage is identified when secure persistence is unavailable.

Never enter a Groq account password in TaskLens. Verify and Disconnect remain available in Settings.

## Connectivity and privacy

The shared mode coordinator separates the saved preference from effective routing. Fedora passively reads NetworkManager D-Bus state/connectivity; Windows uses NetworkInformation and network-status events with balanced WinRT initialization. Positive OS availability is stabilized for two seconds. There is no external connectivity service, Wi-Fi-only test, background Groq polling, or navigator.onLine dependency. OS status can be unknown; explicit, source-free Groq verification can establish provider reachability.

Observed loss immediately disables native cloud admission/transmission, cancels cloud sessions, and durably latches recovery in the existing native metadata file. It changes the effective mode to Local without resubmitting an in-flight job. Input, OCR and transcripts remain available with explicit retry recovery. Internet restoration, credential verification alone, and unrelated preference saves cannot clear the latch or resume uploads. Explicit Cloud activation is required. HTTP 429, authentication/model/schema errors and timeouts remain distinct; timeout alone does not prove offline status.

Native checks run again before each extraction attempt, including retries. The original advisory limits remain: one active session, two pending, two HTTP extraction attempts per rolling minute, ten per local day, bounded input/output and bounded 429 retries. Retries and repairs consume attempts; metadata verification does not. Changing keys does not reset usage. Limits and cooldowns still use the existing atomic native configuration, with no new database or queue service.

Credentials still use Windows Credential Manager/Fedora Secret Service, with memory-only fallback. No key is returned by status, added to backups, logged, or stored in JavaScript persistent storage. Original screenshots/audio stay local; Groq receives the existing minimum text-based extraction payload only after consent. The webview CSP still prevents direct Groq access. The new native browser command permits only the Groq key/policy destinations, requires the main window capability, and rejects caller-supplied URLs. General opener JavaScript interception is disabled.

## Processing and review

Active Inbox capture indicators use a fixed-size 1.2-second linear rotation and restrained text-opacity breathing. Settings/navigation/dialogs remain static. Reduced motion disables decorative effects. Local OCR, transcription, extraction, native sending/response handling, validation and review readiness drive progress; no fabricated percentages or queue positions are displayed. Failed/cancelled work cannot show a success check. Existing elapsed-time recovery and preprocessing checkpoints remain intact. Elapsed ticks are excluded from live announcements; stage changes remain announced.

Save intent is explicit across editor/details callbacks. Synchronous guards prevent duplicate writes, and editor fields stay locked while their write or a batch finish is pending. Confirmation waits for validation and storage, then closes a single floating review and restores focus to its Inbox result control. Draft saves remain open. Storage/validation errors retain edits. Reminder registration warnings remain distinct warning notices after dismissal, without another save or registration call.

A multi-action review keeps every item panel mounted. Confirming advances to the next unconfirmed item; the final confirmation closes only when no unsaved edits remain. Save drafts & finish gathers current editor/question edits, validates them before writing, and saves remaining unconfirmed items to Needs Review while retaining confirmed status for edited confirmed items. A partial failure keeps the dialog open and skips unchanged successful writes on retry. Focus returns to the appropriate retained review control. Fedora native acceptance exposed that requestAnimationFrame can remain suspended in an inactive WebKit window. Single-review focus restoration now runs from a post-commit effect with a short task, after the dialog has actually unmounted, using preventScroll and a stale-focus guard. It does not depend on decorative animation completion.

## Verification

Checks performed on Fedora 44, 2026-10-22. Browser fixtures do not establish cloud accuracy or Windows compatibility.

| Check                                | Result                | Evidence / scope                                                                                                                                                                                                                  |
| ------------------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript and ESLint                | Passed                | `npm run check`                                                                                                                                                                                                                   |
| Prettier and Rust formatting         | Passed                | `npm run format:check`; `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`                                                                                                                                               |
| TypeScript unit tests                | 138 passed, 2 skipped | `npm test`; skipped cases require opt-in resources                                                                                                                                                                                |
| Rust tests                           | 72 passed, 8 ignored  | `cargo test --locked --manifest-path src-tauri/Cargo.toml`; ignored acceptance/live cases remain opt-in                                                                                                                           |
| Chromium browser suite               | 89 passed             | Full isolated final run, 4.4 minutes; scrolling, setup, privacy, retained sources, loss/cancellation, review writes, focus, reduced motion, existing workflows                                                                    |
| Asset unit tests                     | 3 passed              | `npm run test:assets`                                                                                                                                                                                                             |
| Offline payload verification         | Passed                | 3,062,001,808 bytes verified during final native build                                                                                                                                                                            |
| Fedora native debug build            | Passed                | Isolated application identity, task data and WebKit directories                                                                                                                                                                   |
| Fedora native acceptance             | 10 passed             | Native IPC/capability restrictions; Local/consent gates; credential status; Settings boundary scrolling; masked/cancellable modal and scroll lock; OS state; arbitrary-link rejection; actual storage then review dismissal/focus |
| Fedora Secret Service                | 4 phases passed       | Separate processes write/read/remove/absent with an isolated synthetic credential service; primary Groq credential untouched                                                                                                      |
| Native Tesseract                     | Passed                | 13 regions, meaningful English/Cebuano/Tagalog output; local OCR evidence only                                                                                                                                                    |
| Windows native build/runtime         | **Not run**           | No Windows host available                                                                                                                                                                                                         |
| Live Groq and cloud accuracy/latency | **Not run**           | No explicitly configured live test key used                                                                                                                                                                                       |

Final native receipt: `/tmp/TaskLens-acceptance-rECaZ5/acceptance-run.json`. Verification logs are retained under `/tmp/tasklens-ux-*` on this host. These temporary artifacts are not required application files.

One earlier browser run had a five-second timeout in an existing sample-preview test while the native build/GUI checks ran concurrently (88 passed, 1 failed). The complete isolated rerun passed all 89 tests without changing that test or application behavior. Native and browser acceptance should run separately to avoid competition for GUI focus/resources.

Security coverage retains mocked authorization, fixed endpoint, redirect/body limits, quota/retry/cancellation, credential fallback/removal and backup isolation checks. The native fixed-link rejection was exercised; actually launching a default browser was not. Locked Secret Service and Windows credential behavior were not altered/tested on real user storage. No real secret was used in browser fixtures or printed in verification logs.

## Remaining platform/acceptance limits

- Windows runtime/native build acceptance is **not run** on this Fedora host. Windows API bindings and feature selection are implemented, but browser mocks are not Windows evidence.
- Real Groq valid/invalid-key requests and live cloud benchmarks are **not run**: no explicitly configured live test credential was used. Ordinary tests use mocked transport.
- Physical touchpad/mouse hardware testing, real network cable/Wi-Fi disruption and actual microphone recording acceptance and a new real Qwen/Ollama inference benchmark are **not run** in this refinement. Browser input/voice fixtures, native OS-state reads, and controlled loss/cancellation tests are separate evidence.
- Unknown connectivity deliberately starts Local; local model readiness is still required for extraction. Manual task management stays available.
- The build retains Vite's existing large-chunk advisory; no heavy animation package, hosted backend, analytics, provider, or database was introduced.

## Files created

- `docs/SETTINGS_INBOX_UX.md`
- `src-tauri/src/ai/groq/connectivity.rs`
- `src/components/useWorkspaceModalLock.ts`
- `src/features/ai-setup/AISetupDialog.tsx`
- `src/features/settings/settingsPatch.ts`
- `src/services/ai/ProcessingMode.test.ts`
- `src/services/ai/ProcessingMode.ts`
- `tests/ux-refinement.spec.ts`

## Files modified

- `DESIGN_SKILL.md`
- `THIRD_PARTY_NOTICES.md`
- `docs/GROQ_BYOK.md`
- `scripts/groq-native-acceptance.mjs`
- `src-tauri/Cargo.lock`
- `src-tauri/Cargo.toml`
- `src-tauri/permissions/desktop.toml`
- `src-tauri/src/ai/groq/limits.rs`
- `src-tauri/src/ai/groq/mod.rs`
- `src-tauri/src/main.rs`
- `src/App.tsx`
- `src/app/AppProvider.tsx`
- `src/app/context.ts`
- `src/app/services.ts`
- `src/components/motion/MotionToast.tsx`
- `src/features/ai/useAIRouting.ts`
- `src/features/capture/CaptureProgress.tsx`
- `src/features/extraction/ActionEditor.tsx`
- `src/features/extraction/DetailsPanel.tsx`
- `src/features/inbox/Inbox.tsx`
- `src/features/search/SearchDialog.tsx`
- `src/features/settings/GroqSettings.tsx`
- `src/features/settings/SettingsView.tsx`
- `src/features/voice/BundleReview.tsx`
- `src/features/voice/VoiceCapture.tsx`
- `src/features/voice/voice.css`
- `src/layouts/Sidebar.tsx`
- `src/repositories/migrations.ts`
- `src/services/ai/providers/GroqProvider.ts`
- `src/services/ai/types.ts`
- `src/styles/app.css`
- `src/types/action.ts`
- `tests/groq-harness.tsx`
- `tests/groq.spec.ts`
- `tests/motion-refinement.spec.ts`
- `tests/onboarding.spec.ts`
- `tests/voice-harness.tsx`
- `tests/voice.spec.ts`
- `tests/workflows.spec.ts`
