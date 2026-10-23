# Optional Groq Cloud extraction

TaskLens defaults to Local AI. Groq is an explicitly selected online extraction provider using each user's own key. Task creation, saved data, calendar and reminders stay local. There is no TaskLens server, login service, remote queue, or new database.

## Connect a key

1. Create a Groq account and a Free API key in [Groq Console](https://console.groq.com/keys). The account's available models and limits remain controlled by Groq. TaskLens does not select a paid tier, provision hosting, or manage Groq billing.
2. Choose **Online AI** at first capture, or open **Settings → AI Processing → Groq connection → Connect API key**. Follow the guided dialog and use **Connect & verify**. The native application verifies access by querying the fixed Groq model-list endpoint. Verification sends no captured source text. An invalid key or network failure produces an error instead of a successful connection.
3. Read the privacy disclosure, explicitly agree, and select **Start using TaskLens**. Connecting a key alone does not select Cloud mode or authorize sending source text. Existing verified keys skip key entry.
4. Capture a screenshot, type information, or record/import audio. Tesseract OCR and Whisper transcription run locally. Groq extracts from text, then TaskLens validates the response and opens Needs Review. Nothing is saved or confirmed automatically.
5. Use **Verify connection** for an explicit connection check. Use **Disconnect API key** to cancel cloud work, clear consent, disable credential use and remove the stored credential. Selecting **Local AI** explicitly stops outstanding cloud work and restores local routing.

**Local AI — Works offline, runs on this computer.**

**Groq Cloud — Requires internet and your Groq API key.**

The original local model and Ollama integrations remain available. Cloud text extraction does not require Qwen. Screenshot extraction needs the local OCR components; voice capture needs the local Whisper components, even when Qwen is unavailable.

## Security and privacy

- Only Rust constructs authenticated HTTPS requests. The base URL is fixed at `https://api.groq.com/openai/v1`; extraction uses `/chat/completions`, with `openai/gpt-oss-20b`. Verification uses `/models` and checks for that model ID. There is no configurable remote URL, redirect following, relaxed TLS validation, cloud transcription, web search, tool use or automatic resubmission through another provider.
- The webview CSP still permits IPC rather than direct Groq access. Tauri capabilities explicitly allow application commands only in the main window; every Groq command also checks the calling window.
- The password input clears immediately on submission. The key crosses IPC once into native code. It is never returned to JavaScript, included in task settings/backups, or logged. Native key buffers use `Zeroizing<String>`; unavoidable submission-time JavaScript strings are transient, not persisted.
- Windows uses Credential Manager via the `windows-native` keyring backend. Fedora uses the D-Bus Secret Service backend with encrypted secret transport. The OS may request credential-store unlocking.
- If a verified key cannot be saved securely, it is kept only in native process memory and Settings says **Session only — reconnect after restarting TaskLens**. There is no plaintext credential file or keychain file fallback.
- Disconnect first disables use in native configuration. Failed OS removal is reported as incomplete and cannot reactivate that credential on restart. Native deletion is attempted even if local configuration cannot be written. If both storage operations fail, the command reports failure; the user must resolve storage access and retry rather than assuming deletion succeeded.
- Device consent and advisory usage live in native `groq-usage.json` under the existing application-data directory, outside exported task snapshots. The file contains only consent/version and usage/control metadata. Disconnect clears consent; a new disclosure version requires fresh consent.
- Requests contain the existing system prompt, strict output schema, source-unit identifiers, recognized/typed/transcribed text, and necessary date/time context. They omit screenshot bytes, audio, preview URLs, filenames, bounding boxes, device profiles and saved tasks. OCR geometry, previews and transcripts remain available locally for Source Trace and recovery.
- Remote errors are mapped to fixed user-facing messages. Raw HTTP error bodies, headers and credentials are not returned or logged. Developer extraction diagnostics remain in memory and can contain source/output text, as before; they are not application logs or backups.
- Review [Groq's data policies](https://console.groq.com/docs/your-data) before opting in. Text sent for extraction is processed by Groq; local storage does not imply that cloud processing is offline or private to the computer.

## Routing, validation and compatibility

`AIProvider.kind` now includes `cloud`. `GroqProvider` implements the same contract as the existing adapters and uses optional extraction-session hooks to retain its native queue slot through validation and repair. Discovery reads local connection state and fixed metadata; it never probes Groq over the network.

`ai.executionMode` is the saved preference, defaults to `local`, and accepts `local` or `groq`. A shared coordinator supplies the effective mode: offline/unknown connectivity starts Local, while a durable loss latch requires explicit Cloud reactivation after restoration. In-flight content is never automatically retried locally. `ai.modeChoiceCompleted` is separate from onboarding; fresh profiles choose at their first online capture and existing profiles retain their configured mode. Existing automatic/manual local selection, priorities and Ollama preferences are preserved. Local mode excludes cloud candidates; Groq mode includes only Groq and excludes local/mock fallback. Mode changes cannot reroute a capture midway through preprocessing. Native authorization is checked again immediately before transmission. Cloud candidates are not assessed against local RAM/GPU requirements, and the UI labels cloud quality/speed as unmeasured.

The existing extraction prompt, schema builder, compact-field expansion, date/time interpretation, coverage checks, evidence validation, ambiguity handling and review components remain the extraction architecture. The Groq wire-schema projection removes size/pattern/numeric constraint keywords while keeping required fields, closed objects, nullable fields and source-ID enums. The existing local validator still enforces semantic and collection limits. Strict JSON is not evidence that the content is factually correct. All generated actions remain `needs_review`.

The schema additions do not change snapshot version 1. Old snapshots default to Local; cloud provenance round-trips; unknown legacy provenance remains tolerated. Restoring a task backup on another device does not restore API keys or device consent.

## Actual application limits

Limits apply per OS-user application profile and are advisory controls for normal operation, not tamper-proof account enforcement.

| Control              | Behavior                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrency          | One extraction session active; at most two pending, held across validation and repair                                                               |
| Duplicates           | Reject duplicate active/pending IDs or hashed source fingerprints; fingerprints are memory-only                                                     |
| Minute allowance     | Two extraction HTTP attempts in a rolling 60-second window                                                                                          |
| Daily allowance      | Ten extraction HTTP attempts per local calendar day                                                                                                 |
| Counting             | Reserve and atomically persist just before sending. Errors, 429 retries, repairs and already-sent cancellations count. Queued cancellations do not. |
| Restarts/key changes | Counters survive; disconnecting or replacing a key does not reset them                                                                              |
| Input                | Estimated maximum 8,192 tokens including prompt/schema overhead, plus a hard 64 KiB serialized request ceiling; no silent truncation                |
| Output               | Maximum 4,096 completion tokens; actual returned token usage is recorded when supplied                                                              |
| HTTP timeout         | Ten seconds to connect; sixty seconds per attempt                                                                                                   |
| Automatic retries    | Only HTTP 429, at most two retries after the original attempt                                                                                       |
| Backoff              | Two seconds initially, doubling with up to 500 ms jitter, never before applicable local/provider reset times                                        |
| Long reset           | If the required wait exceeds two minutes, return a retry time instead of remaining active indefinitely                                              |
| Semantic repair      | At most one, on the same provider. Skip it when known remaining allowance cannot cover it.                                                          |
| Unknown quota        | Never presented as available tokens. Estimates are not provider-reported account quota.                                                             |
| Persistence failure  | Block cloud submission; preserve capture and local task functionality                                                                               |

`Retry-After` accepts seconds or an HTTP date. Groq request and token reset-duration headers are parsed separately. In particular, Groq's request headers describe account requests per day and token headers describe tokens per minute. Account usage by other applications can exhaust quota sooner than TaskLens predicts; Groq's responses remain authoritative. See [Groq rate-limit documentation](https://console.groq.com/docs/rate-limits).

A screenshot shows local reading, genuine queue/reset waits when applicable, online extraction, validation, and review readiness. There are no invented queue positions or percentages. Cancellation interrupts waits and HTTP response handling and ignores late results. Groq may still charge an already transmitted request against account quota. Failures retain preview/OCR/transcript/input and existing drafts for retry or manual creation.

## Verification and reproducible checks

Linux builds need D-Bus development headers for the Secret Service backend (`dbus-devel` on Fedora, `libdbus-1-dev` on Ubuntu). The existing Linux CI build installs them explicitly.

Ordinary tests use loopback HTTP mocks, synthetic credentials and fixture data. They never contact Groq. Production URLs cannot be overridden; the mock endpoint and clock exist only under Rust `cfg(test)`.

```sh
npm run check
npm test
npm run test:e2e
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run test:assets
npm run verify:assets
npm run test:native:ocr
npm run test:native:groq:credentials
```

Credential acceptance writes an isolated synthetic credential, reads it in a separate Rust process, removes it, and verifies absence in another process. It does not read or modify the normal Groq credential. Run independently on Windows and Fedora; one platform's success does not certify the other.

For native Settings/IPC acceptance, build a disposable application with `node scripts/build-native-acceptance.mjs`, then pass its printed `acceptance-run.json` receipt to `npm run test:native:groq -- /absolute/path/to/acceptance-run.json`. Set `TASKLENS_TAURI_DRIVER` to the installed driver if necessary. This smoke checks actual native capabilities, Local-mode isolation, consent gating, no-key behavior and Settings controls without making a real Groq request.

The table below records the original BYOK integration at `46a18e5`. Current Settings, first-use setup, connectivity, animation, and review verification is recorded in [the UX implementation report](SETTINGS_INBOX_UX.md). Real Groq and Windows checks require separate resources and are never represented by mocks.

| Check                                                   | Result                                                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| TypeScript and ESLint                                   | Passed                                                                                                     |
| TypeScript unit tests                                   | 132 passed; two opt-in evaluation tests skipped                                                            |
| Rust tests                                              | 69 passed; eight explicit native/live tests ignored                                                        |
| Browser tests                                           | 69 passed in the complete final suite, including all six Groq cases                                        |
| Fedora 44 native application                            | Built; five Groq Settings/IPC smoke checks passed in disposable profile                                    |
| Fedora Secret Service                                   | Actual cross-process persistence/read/removal/absence passed with isolated synthetic credential            |
| Locked/unavailable credential storage                   | Mocked native persistent/session/deletion/restart tests passed; real locked-store interaction not run      |
| Native local Tesseract                                  | Synthetic smoke passed: 13 regions, English/Cebuano/Tagalog language data                                  |
| Runtime assets                                          | Asset unit tests and pinned bundled-payload verification passed                                            |
| Windows Credential Manager/build/UI                     | Not run on this machine; Windows backend and acceptance runner provided                                    |
| Real Groq valid/invalid key, account limits and latency | Not run; no explicitly configured live test key                                                            |
| Existing local AI/Ollama                                | Routing, extraction and Rust regression tests passed; live Qwen/Ollama inference not rerun for this change |

### Multilingual evaluation

The opt-in runner reuses the existing fourteen synthetic extraction cases, production prompt, validator, coverage checks and scoring rules. To run, explicitly configure `TASKLENS_GROQ_TEST_KEY` in the environment inherited by Rust, outside source files/backups/logs, then run `npm run eval:groq`. Do not put a key literal into a committed script or shell history. JavaScript never reads the key value; the Rust-only ignored evaluation test consumes it. Ordinary CI does not enable this test.

Evaluation writes `docs/evaluation/groq-eval.json` and `.md` only after an opted-in run. Its usage metadata defaults to the separate persistent evaluation profile at `~/.local/share/tasklens-groq-evaluation/groq-usage.json`; `TASKLENS_GROQ_EVAL_USAGE` can identify another explicit test profile. The same minute/day limits and retry policy apply. Completed rows resume across runs, so fourteen cases plus repairs may require several local days. Never delete counters to bypass the evaluation allowance.

Native HTTP response time is recorded separately from total validation/pipeline time. The fixture harness replays recorded local Tesseract OCR, so its pipeline timing includes the Rust test bridge and is not live screenshot capture latency. Actual application diagnostics also record end-to-end extraction time, including real preprocessing and waits, when users run a capture.

| Fixture language group               | Real Groq quality/latency | Existing local comparison      |
| ------------------------------------ | ------------------------- | ------------------------------ |
| English                              | Not run                   | Existing Qwen report available |
| Cebuano                              | Not run                   | Existing Qwen report available |
| Tagalog                              | Not run                   | Existing Qwen report available |
| Mixed-language text/voice/screenshot | Not run                   | Existing Qwen report available |

The recorded [Qwen baseline](evaluation/reliability-v10-full.md) passed 110/128 checks across fourteen cases, with per-case extraction times of 29.8–251.8 seconds. It uses prompt version 10; the current prompt is newer. Do not claim a controlled performance or accuracy improvement from that historical comparison. Benchmarks cover dates/times, multiple activities, requirements, locations, evidence correspondence, undated announcements and information that must remain unresolved.

## Remaining limitations

- A real Groq connection, exact schema acceptance and model behavior still need a user-configured live test key. Mock tests establish application behavior, not Groq extraction accuracy.
- Windows native build, Credential Manager and installed workflows need Windows execution. Fedora results cannot substitute for these checks.
- Application counters are profile-local and editable by the device owner. Other programs using the same Groq account are outside TaskLens's quota accounting.
- Model availability, Free-plan allowances and provider policies can change. TaskLens reports unavailable models/rate limits instead of silently switching provider or model.
- The initial bundled application still includes local model assets. Selecting Groq removes local inference requirements, not the existing package's disk footprint.
- Consent covers source text for this provider on this device. Disconnect to revoke local consent and remove credentials; this cannot recall text already processed by Groq.

## Files created

- `docs/GROQ_BYOK.md`
- `scripts/evaluate-groq.mjs`
- `scripts/groq-credential-acceptance.mjs`
- `scripts/groq-native-acceptance.mjs`
- `src-tauri/permissions/desktop.toml`
- `src-tauri/src/ai/groq/credentials.rs`
- `src-tauri/src/ai/groq/evaluation.rs`
- `src-tauri/src/ai/groq/http_tests.rs`
- `src-tauri/src/ai/groq/limits.rs`
- `src-tauri/src/ai/groq/mod.rs`
- `src/features/settings/GroqSettings.tsx`
- `src/services/ai/groq.test.ts`
- `src/services/ai/providers/GroqProvider.ts`
- `src/services/extraction/evaluation/groq.eval.test.ts`
- `tests/groq-harness.html`
- `tests/groq-harness.tsx`
- `tests/groq.spec.ts`

## Files modified

- `.github/workflows/native-voice.yml`
- `README.md`
- `docs/AI_ROUTING.md`
- `package.json`
- `src-tauri/Cargo.lock`
- `src-tauri/Cargo.toml`
- `src-tauri/capabilities/main.json`
- `src-tauri/src/ai/mod.rs`
- `src-tauri/src/main.rs`
- `src/app/AppProvider.tsx`
- `src/app/services.ts`
- `src/features/ai/AIRoutingPanel.tsx`
- `src/features/ai/RouteDecisionCard.tsx`
- `src/features/ai/routeLabels.ts`
- `src/features/ai/useAIRouting.ts`
- `src/features/extraction/DetailsPanel.tsx`
- `src/features/inbox/Inbox.tsx`
- `src/features/settings/SettingsView.tsx`
- `src/features/voice/VoiceCapture.tsx`
- `src/features/voice/VoiceSettings.tsx`
- `src/layouts/Sidebar.tsx`
- `src/services/ai/explain.ts`
- `src/services/ai/policy.ts`
- `src/services/ai/router.ts`
- `src/services/ai/scoring.ts`
- `src/services/ai/types.ts`
- `src/services/extraction/ExtractionService.ts`
- `src/services/extraction/RoutedExtractionService.ts`
- `src/services/localai/native.ts`
- `src/types/action.ts`

## Release audit boundary

Production credentials retain the `app.tasklens.desktop.groq` OS service. Isolated acceptance builds derive a different service from their application identifier and cannot address that production entry through the normal store. Current platform verification and open dependency findings are recorded in [SECURITY_AUDIT](../SECURITY_AUDIT.md); no live-key benchmark was performed for this audit.
