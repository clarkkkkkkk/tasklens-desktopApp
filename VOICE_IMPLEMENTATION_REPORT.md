# Local voice implementation report

> **Update (Phase 2 merge, 2026-10-12):** voice and text extraction now use the shared Phi-4-mini-instruct pipeline described in LOCAL_AI.md; the Qwen3-4B figures below are historical measurements of the earlier extractor.

## Behavior

Inbox provides Voice, Import audio and Capture text. Native capture uses the default microphone after an explicit Voice action. Supported imported audio is decoded/resampled locally, then transcribed with multilingual Whisper Small. Voice and text share Qwen3-4B structured extraction, validation and temporal rules. Results appear in the existing centered blurred dialog, with every action selectable, independent drafts, transcript inspection, evidence highlighting and explicit per-action saving. Nothing is automatically saved.

The existing TaskLens logo at `public/TaskLens.png`, Solar icons, screenshot capture and onboarding remain. Screenshot extraction is still a marked demo. Browser production reports native processing unavailable; browser fixtures inject services explicitly.

Model installation is user initiated. The exact model manifest pins hashes, sizes, revisions and runtime commits. Native executables run with argument arrays, controlled temporary paths and no server. Model weights are excluded from Git and application packages. Cancellation uses opaque job IDs, stops workers and prevents stale UI results. Temporary audio is removed after transcription/cancellation/failure; original imports are preserved. Successful transcripts remain in memory for extraction retry/export. Persistence retains the existing storage key, envelope and legacy records.

## Files

Native: `src-tauri/src/voice/{mod,audio,recording}.rs`, `src-tauri/src/main.rs`, `src-tauri/{Cargo.toml,Cargo.lock,Info.plist,Entitlements.plist,tauri.conf.json,capabilities/main.json,resources/models.json}`.

Services/domain: `src/services/voice/{types,NativeVoiceServices}.ts`, `src/services/extraction/{ExtractionService,LocalExtractionService,MockExtractionService,temporal}.ts`, `src/types/action.ts`, `src/app/services.ts`.

UI: `src/features/voice/{VoiceCapture,VoiceSettings,BundleReview,SourceTranscript}.tsx`, `src/features/voice/voice.css`, `src/App.tsx`, `src/features/{inbox/Inbox,extraction/DetailsPanel,onboarding/OnboardingFlow,settings/SettingsView}.tsx`, `src/components/icons.tsx`.

Build/tests: `scripts/build-local-runtimes.mjs`, `scripts/generate-audio-fixtures.mjs`, `.github/workflows/native-voice.yml`, `.gitignore`, `package.json`, `package-lock.json`, `eslint.config.js`; voice/extraction unit tests, native tests, `tests/voice.spec.ts`, injected harness and fixtures.

Documentation: `VOICE_CAPTURE.md`, `LOCAL_AI.md`, `README.md`, `ARCHITECTURE.md`, `TECH_STACK.md`, `DESIGN_SKILL.md`, `DEVELOPER_1.md`, `DEVELOPER_2.md`, `TASK_TRACKER.md`, `PROJECT_SUMMARY.md`, `MVP.md`, `THIRD_PARTY_NOTICES.md`, this report. The implementation spans the committed WIP and the current continuation changes.

## Verification

Frontend: TypeScript/lint, formatting, build and 30 unit tests pass. All 32 final browser tests pass, including five voice scenarios, axe, responsive review, reduced motion, unsaved edits and close choices through injected services. Screenshots were inspected at 1440×920, 900×640 and 600×640. Native: Rust format/check and seven tests pass, including real generated codec decoding and unsupported-codec rejection. Linux debug Debian packaging passes and includes both inference binaries, model manifest and runtime licenses. macOS microphone metadata and hardened-runtime audio-input entitlements are configured. Windows/macOS voice builds are unverified; the new CI matrix has not been run.

The independent synthetic-English Whisper run used 6.7 seconds of audio, took 27.38 seconds and peaked at 768,196 KiB RSS. A six-fixture Qwen run peaked at 5,484,236 KiB RSS; completed cases took 154.5–403.9 seconds alongside build activity. It exposed an omitted campus location and an invalid empty reminder-time entry. Four cases passed that sweep. After corrections, both focused reruns pass: pictorial preserves campus/arrival/clothing details, and the English/Cebuano reminder produces a task without an invented reminder time. The final prompt was checked through these focused reruns, not another complete six-case sweep. The corrected pictorial run took 383.1 seconds at 5,490,096 KiB RSS; the mixed-language rerun took 153.3 seconds at 5,470,212 KiB RSS. These are subprocess smoke measurements, not packaged workflow or real-speech quality benchmarks.

## Remaining acceptance and limitations

- Real microphones, real audio imports, quiet/noisy English/Tagalog/Cebuano and both mixed-language recognition combinations need manual evaluation. Synthetic English transcription and text extraction fixtures do not establish real-speech quality. Whisper has no dedicated Cebuano token.
- Windows/macOS packaged voice behavior, OS permission recovery and microphone failure handling need actual-platform tests. The new build matrix is provided but has not been run here.
- Disconnected-network packaged restart → transcribe → extract → save → reload, native accessibility/focus, and full 16 GB latency/memory/cancellation/cleanup measurements remain manual acceptance work.
- CPU inference cold-loads each model and may take minutes. The initial context is 8,192 tokens with context shifting disabled; overly long prompts fail rather than silently lose source text. Source extraction is also bounded at 20,000 UTF-8 bytes, transcripts at 100,000 characters and results at 20 actions.
- Model-generated details and quotations can be missing or inaccurate, and unrelated/overcautious ambiguity warnings can occur. Invalid evidence is unavailable; all model results require review. Relative-date arithmetic for supported English weekday/today/tomorrow and Tagalog/Cebuano today/tomorrow expressions is validated against recording context. Unknown imported recording dates remain warnings.
- Microphone disconnection surfaces when the recording is finalized. The capture UI provides cancellation and import alternatives. There is no playback, trimming, transcript editing, translation, OCR, cloud fallback, background listening or notification delivery.

## Commands and environment

Passed: `npm run check`, `npm run format:check`, `npm test`, `npm run test:e2e -- --workers=1 --max-failures=1`, `npm run build`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, Rust check/tests with `--features tauri/custom-protocol`, and `npm run tauri -- build --debug --bundles deb`. Browser tests used `/usr/bin/google-chrome`. The real-model test is opt-in with `TASKLENS_NATIVE_MODELS=1`; `TASKLENS_NATIVE_FIXTURE=2` and `6` selected the corrected focused reruns. Codec fixtures were generated with `node scripts/generate-audio-fixtures.mjs`; Rust tests used `TASKLENS_CODEC_FIXTURES` and `--include-ignored`.

This Fedora host uses a local ALSA development sysroot through `PKG_CONFIG_PATH`/`LIBRARY_PATH`; normal developer installations need ALSA development headers. No administrator/system package changes were made. Model weights and compiled runtimes remain ignored local build assets.

Linux debug package: `src-tauri/target/debug/bundle/deb/TaskLens_0.1.0_amd64.deb` (79.24 MiB). This does not establish Linux release-build, installer, real-microphone, signing, Windows or macOS acceptance.
