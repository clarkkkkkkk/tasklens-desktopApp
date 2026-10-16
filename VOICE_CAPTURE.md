# Local voice capture

TaskLens captures information, transcribes it locally, extracts structured actions locally, and asks the user to review and save each action. It does not listen in the background or provide conversational assistance.

## Setup

Use the desktop application. Browser builds preserve the screenshot demo and manual editing, but voice/text inference reports that a desktop runtime is required. Browser integration fixtures are separate test entrypoints and are not included in the production build.

Desktop releases bundle and automatically verify Whisper Small, Qwen3-4B, their native runtimes and OCR. No manual model setup is needed. During background validation TaskLens shows “Preparing local intelligence…” and then “Local AI is ready.” Validation receipts live in application data; models load directly from installed read-only resources.

For development run `npm run prepare:models`, `npm run build:runtimes`, `npm run prepare:notices`, then `npm run tauri dev`. Native CMake/C++/Rust and Tauri prerequisites are developer requirements only. See [LOCAL_AI.md](LOCAL_AI.md) for exact pins, storage paths, release commands and distribution size limits. Developer mode exposes optional supported-model overrides.

## Capture and review

Choose Voice in Inbox to request microphone access and start a compact recorder. Done stops recording and begins local transcription. Cancel stops processing. The system-default microphone is used; selecting Voice is the only permission-request trigger. macOS includes its microphone usage description and the audio-input entitlement for hardened-runtime signing ([Apple](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.audio-input), [Tauri configuration](https://v2.tauri.app/distribute/macos-application-bundle/)). Windows/Linux use system device/privacy access and show permission/device failures without blocking manual work.

Import audio through the picker or drop audio into Inbox. Accepted containers/codecs: WAV/PCM, MP3, M4A with AAC-LC or ALAC, OGG with Vorbis. WebM, Opus and unsupported variants are rejected. Validation uses extension/MIME, a 100 MB transfer limit, decoding, sample-rate/channel bounds and decoded duration. Recordings stop at five minutes; imports are limited to fifteen minutes.

Audio is decoded on a native worker, downmixed and resampled to mono 16 kHz 16-bit PCM. whisper.cpp returns original-language text and timestamped segments. No translation option is enabled. Voice transcripts, typed text and screenshots use the same LocalAIExtractionService, Qwen3 non-thinking prompt and validator.

The centered result dialog lists all extracted actions. Switching actions preserves mounted editors and drafts. Saving/confirming affects only the selected action. Source Transcript exposes segment times and an export action. Evidence links reveal supported quotations/segment IDs. Invalid references are dropped, and evidence is hidden when the corresponding value has been edited. Evidence is model attribution and still requires human review.

Captured speech carries its recording timestamp/timezone. Imported audio does not assume that file modification time is its recording time. Supply the recording date and retry extraction to resolve relative dates. Unknown dates/times and contextless corrections remain review ambiguities. Empty-action results display their ambiguities in Inbox.

## Privacy, cancellation and limits

Raw recordings and converted import copies are temporary. Transcription success/failure and cancellation clean the application-owned job directory. Original imported files are never deleted. Successful transcripts survive extraction failure in memory for retry/export; saving an action explicitly persists its transcript, segments, provenance and validated evidence with the existing local repository. No audio playback/retention is provided.

Each job has an opaque identifier and cancellation flag. Cancellation stops capture, interrupts inference and discards late UI results. Navigation during processing requires stop/discard confirmation. Startup cleans orphaned temporary jobs; a single-instance guard prevents another TaskLens instance from removing active jobs.

Speech and extraction share a native inference gate. TaskLens stops its reused loopback-only llama-server before loading Whisper; Whisper exits before extraction restarts. Neither model is loaded during asset preparation. There is no remote fallback. Build-time preparation downloads verified pinned assets; installed inference uses local files, IPC and the private loopback extraction server only. Source content is never shell-interpolated or written to application logs.

Transcripts are bounded at 100,000 characters/3,000 segments. The extraction runtime uses an 8,192-token context with context shifting disabled; prompts that exceed it fail instead of discarding earlier content. Initial extraction accepts at most 20,000 UTF-8 bytes of source text and at most 20 actions. Longer transcripts remain inspectable/exportable and require shorter passages. Persistent transcripts share the existing localStorage quota; storage failures keep edits available for retry/export.

## Languages and troubleshooting

English, Tagalog, Cebuano and English-mixed fixtures are included. Whisper has a Tagalog language token but no dedicated Cebuano token; Cebuano/mixed-language accuracy must be evaluated with real speech and is not guaranteed. Automatic detection does not silently force English. Always inspect recognition output before confirming.

- Missing model/runtime: install a build with both bundled executables, then import the exact supported model in Settings.
- Checksum/size mismatch: select the pinned model file, not another quantization or an English-only Whisper model.
- Microphone denied/unavailable: enable microphone access for TaskLens in system privacy/device settings, retry or import audio instead.
- Unsupported audio: export WAV/PCM, MP3, AAC-LC/ALAC M4A or Vorbis OGG.
- No clear speech: record again closer to the microphone or choose another file.
- Extraction failure: keep/export the transcript, validate the extraction model and retry.
- Storage full: export the transcript/backup, free storage and retry the save.

## Verification

The independent Linux Whisper smoke run used a 6.7-second synthetic English recording, produced timestamped English transcription locally, took 27.38 seconds and peaked at 768,196 KiB RSS while builds were running. This is an initial measurement, not a real-microphone, language-quality or quiet-machine benchmark.

Automated frontend checks, 30 unit tests, all 32 browser tests, seven Rust tests and Linux debug Debian packaging pass. All six supplied text-extraction cases have passing results across the full sweep and two focused corrections; see TASK_TRACKER.md for the original failures and scope. The focused pictorial and mixed-language Qwen runs took 383.1 and 153.3 seconds, respectively, with approximately 5.24 GiB peak subprocess RSS. General model accuracy remains a human-review requirement. Final evidence and remaining platform acceptance are recorded in TASK_TRACKER.md. Real microphone tests, quiet/noisy multilingual recognition, disconnected-network restart/save tests, and packaged Windows/macOS voice acceptance require their actual platforms; browser mocks never count as native verification.

For optional native codec verification, install ffmpeg, run `node scripts/generate-audio-fixtures.mjs`, then run `TASKLENS_CODEC_FIXTURES="$PWD/.local-ai/codec-fixtures" cargo test --manifest-path src-tauri/Cargo.toml --features tauri/custom-protocol -- --include-ignored`. The generated sine-wave fixtures are ignored by Git. They test real PCM, MP3, AAC-LC, ALAC and Vorbis decoding and Opus/WebM rejection, not speech recognition quality. Linux requires the ALSA/Tauri development environment described above.
