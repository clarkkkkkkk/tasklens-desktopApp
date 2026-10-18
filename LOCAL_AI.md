# Built-in local intelligence

TaskLens desktop releases include Qwen3-4B, multilingual Whisper Small, llama.cpp, whisper.cpp, Tesseract and English/Cebuano/Tagalog OCR data. Install → open → local AI works, with no model picker, account, Python, Ollama or developer tools. Browser development and the onboarding/sample fixture remain explicitly labelled mock workflows.

## Initialization and privacy

Startup verifies bundled models and OCR data on a background worker and probes all three native executables. The window, onboarding and manual task work remain responsive. The status reads **“Preparing local intelligence…”**, then **“Local AI is ready.”** Ready means assets are verified and executables can start; the extraction model is still loaded on demand. Missing/corrupt resources show repair details, Retry validation and reinstall guidance. No real capture falls back to mock output.

No application-time downloads, remote inference, cloud OCR, remote transcription or telemetry are used. The webview permits only Tauri IPC. Rust communicates with its own llama-server on `127.0.0.1`, a random port, with a per-launch key and no web UI. Prompts travel in request bodies; every native program receives structured arguments. Offline tests must leave loopback enabled.

Extraction keeps the existing evidence/schema/date/time/confidence validator and one bounded repair attempt. Qwen3 uses its non-thinking chat template (compact-output prompt version 7; final accuracy acceptance pending), an empty thought block and model-specific stop tokens. Screenshot OCR is real; the sample screenshot and onboarding demo are mock and retain their provenance labels.

The extraction server is reused between requests. Speech takes the same native model gate, stops llama-server before loading Whisper, and exits before subsequent extraction can load Qwen. Startup does not load either inference model into RAM. Temporary audio/OCR jobs retain their existing cancellation and cleanup behavior.

## Reproducible assets

`src-tauri/resources/models.json` is the versioned source of truth for source URLs, revisions, formats, sizes, SHA-256 hashes, runtime sources, trained data, licenses and prompt compatibility. Weights and compiled assets are ignored by Git.

| Asset | Revision | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Official Qwen/Qwen3-4B-GGUF, Q4_K_M | `bc640142c66e1fdd12af0bd68f40445458f3869b` | 2,497,280,256 | `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5` |
| ggerganov/whisper.cpp, Small multilingual | `5359861c739e955e79d9a303bcbc70fb988958b1` | 487,601,967 | `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b` |

Native source pins: llama.cpp b11505 (`ff5888f999f24e2f9eaf6537b4eb6b85fd559188`), whisper.cpp (`d1be6fde11ac6e0407606b4e42fe72d34add8037`), Tesseract 5.5.1 (`3b7c70e34dea179549ed3e995872e2e019eb8477`), Leptonica 1.85.0 (`63aef18d98432b8582a1565e241f7bd2ee9cc8d9`). Source archives and OCR data at tessdata commit `ced78752cc61322fb554c280d13360b35b8684e4` are SHA-256 pinned in the manifest.

Preparation streams downloads to staging files, checks size/hash and formats, and atomically promotes verified assets. Existing verified local/cache files are reused. GGUF validation checks v3, Qwen3 architecture and Q4_K_M metadata; Whisper checks the multilingual Small header. Native builds disable host-specific CPU tuning and link inference/OCR libraries statically. OCR's internal grayscale copy uses BMP, supported directly by Leptonica, so its separate PNG/JPEG/TIFF libraries are unnecessary. Original screenshot PNG/JPEG/WEBP decoding remains in Rust.

## Paths and storage

- Build inputs: `.local-ai/downloads` and `.local-ai/sources`; optional cached weights `.local-ai/models`.
- Prepared weights: `src-tauri/resources/models/`; data: `resources/tessdata/`; notices: `resources/notices/`.
- Tauri sidecars: `src-tauri/binaries/tasklens-<runtime>-<target-triple>[.exe]`, configured with `bundle.externalBin`.
- Installed weights/data/notices: Tauri `resource_dir()/resources/{models,tessdata,notices}`. Tauri chooses the platform location; no developer home path is compiled into release lookup.
- Installed executable names: `tasklens-llama-server`, `tasklens-whisper-cli`, `tasklens-tesseract` (Windows `.exe`), beside the application executable.
- Validation receipts and explicit developer imports: Tauri `app_data_dir()/asset-validation` and `app_data_dir()/models`. Typical base: Linux `$XDG_DATA_HOME/app.tasklens.desktop` or `~/.local/share/app.tasklens.desktop`; Windows `%APPDATA%/app.tasklens.desktop`; macOS `~/Library/Application Support/app.tasklens.desktop`.

Models load from read-only installed resources, with no first-launch copy. Receipts include manifest version, resolved path, byte count, nanosecond modification metadata and expected hash. Retry validation forces a complete rehash. The cache detects normal file changes; it is not a substitute for installer signing against malicious tampering.

Developer mode exposes imports of the exact supported model only. A successful import writes an explicit override marker; otherwise bundled assets win. Existing obsolete Phi weights remain untouched and unselected. Task/action storage, onboarding version, user preferences and the application identifier remain unchanged.

## Build and release

End users need no build tools. Developers require Node 22.12+, Rust, CMake, a native C/C++ compiler and Tauri platform prerequisites. Build on the target OS/architecture.

```sh
npm ci
npm run prepare:models
npm run build:runtimes
npm run prepare:notices
npm run verify:assets
npm run tauri dev
# Full release preparation and native packaging:
npm run release:desktop
```

`prepare:notices` gathers dependency license files and runtime supplementary notices. `verify:assets` verifies pinned files, native build receipts, executable startup and Linux/macOS dynamic dependency closure. `tauri build` runs asset verification before packaging and fails closed for incomplete assets. Release preparation rejects mock extraction configuration.

RPM payload compression is disabled for the locked Tauri CLI 2.12.1: its rpm 0.16.0 dependency hashes unconsumed input again on partial compression writes, causing quadratic work and an incorrect uncompressed payload digest for these large assets. Uncompressed RPMs avoid that code path; do not re-enable compression without verifying upstream fixes and `rpm -Kv` on the full payload. AppImage compression is independent. Targets: Linux x86_64 (RPM/AppImage), Windows x86_64, macOS Apple Silicon (app/DMG). Intel macOS is deferred. Fedora builds use the installed system's glibc baseline and do not imply compatibility with older distributions. CI uses native hosts; successful CI compilation does not certify microphone, inference or installed-window acceptance.

Windows full offline delivery uses `scripts/windows-offline.iss` with Inno Setup **6.5.2+**, preserving the existing per-user TaskLens installation directory. Standard NSIS's 2 GB size limit is insufficient. Supply `TASKLENS_ISCC`, `TASKLENS_WEBVIEW2_INSTALLER` (offline x64 Microsoft installer) and its verified `TASKLENS_WEBVIEW2_SHA256`. No WebView bootstrap download is permitted. Credentials for signing/notarization and an equipped Windows host remain release prerequisites. macOS Tauri signing must cover all nested sidecars before signing/notarizing the app.

The two model files total **2,984,882,223 bytes**, before OCR, binaries, application or WebView. Installer compression, installation disk use and temporary space must be measured on each platform. GitHub Releases permits each file under **2 GiB**; oversized installers need external large-file hosting, with a link and checksum from the release page. `release:desktop` emits `release-assets.json` with actual sizes/hashes and eligibility. Do not advertise obsolete small installer measurements as all-in-one sizes.

## Verification

```sh
npm run check
npm run format:check
npm test
npm run test:assets
npm run test:e2e
cargo test --locked --manifest-path src-tauri/Cargo.toml
TASKLENS_EVAL=1 npx vitest run src/services/extraction/evaluation
```

The real-model suite resolves the manifest's prepared Qwen and target-native sidecar, runs the production prompt/validator, writes `docs/evaluation/local-ai-eval.{md,json}` and fails when scored expectations fail. `TASKLENS_MODEL` and `TASKLENS_RUNTIME` can point to installed assets for acceptance. Browser mocks and compilation never count as real inference.

For installed offline acceptance use an isolated user-data profile, remove development/system AI dependencies from lookup, disable external networking while retaining loopback, then launch the installed package. Check preparation, text extraction, imported audio transcription, voice-to-actions, actual microphone capture, screenshot OCR/Source Trace, review/save, cancellation and restart persistence. Confirm no extra model copy or concurrent resident inference models. Measure cold/warm latency, peak RSS and resource sizes. Test missing/corrupt resources on a disposable installation only. Preserve the real user's data.

Current run results and pending acceptance are recorded in `OFFLINE_AI_IMPLEMENTATION_REPORT.md` and `TASK_TRACKER.md`. Recognition/extraction accuracy still requires human review; older Phi/Qwen smoke measurements are historical, not acceptance for this build.

### CPU acceleration

Runtime build recipe 2 includes a portable baseline and separate static AVX2 llama-server/Whisper executables on Linux/Windows x86_64. Native CPUID checks require AVX, AVX2, FMA, F16C, BMI2 and SSE4.2 (including OS AVX state support) before selecting the accelerated executable. Older CPUs use the baseline. Neither variant uses `-march=native`; Apple Silicon uses its native ARM backend. Platform Tauri configuration includes the extra x86 sidecars. Diagnostics report the selected binary/CPU variant. Rebuild runtimes and the application to use this optimization; an already-running process retains its old executable. Model weights, schema, decoding quality and user data are unchanged.

Linux AppImage packaging tools are byte-pinned in `scripts/linux-packaging-tools.json`; `prepare:packaging` and the pre-bundle hook verify Tauri's default cache. Do not use `--local-tools-dir` without adapting the verified cache preparation. Moving upstream release URLs are constrained by exact hashes and fail when their contents change. Packaging-tool updates require a reviewed pin update. The artifact report lists installer artifacts only, excluding AppDir/staging files.

AppImage validation receipts identify unchanged containers across temporary remount paths; changing the container metadata invalidates the cache. Explicit validation always rehashes. Unsupported dates/times are cleared rather than stored as invented values. Real-model acceptance remains separate from compilation and unit tests.

The pre-integration v6 suite passed 64/77 checks and failed the accuracy gate. Local v7/v8 chat-demonstration experiments and upstream-recommended sampling also had regressions and were not promoted. Those archived local experiment version numbers refer to different prompts from main's compact-output v7 below; preserve their reports as historical evidence, not acceptance for the integrated prompt. See OFFLINE_AI_IMPLEMENTATION_REPORT.md for exact scope and remaining gates.

Invalid or silent speech is rejected before stopping the reusable extraction server. Valid speech still takes the model gate and stops extraction before Whisper loads. This avoids a model reload after a rejected capture while keeping inference serialized.

### Main's compact-output v7 and prefix cache (2026-10-18)

Prompt v7 generates an absent date/time/end_time/arrival_time/location as `null`; `expandCompactBundle` restores the full raw shape before the existing validator. The validator also derives an end time from a stated range written only in the start time. Each extraction first calls `local_ai_prewarm`, which restores the fixed system-prompt prefix from llama.cpp slot files in `app_data_dir()/prompt-cache` (named by model/path/prefix hash; older files removed) or evaluates and saves it once. llama-server gains `--slot-save-path`; it stays loopback-only with the per-launch key. The Inbox shows a Keep waiting / Cancel notice after 60 s of real processing; nothing is saved automatically. Measurements on the partner's host: `docs/evaluation/performance-optimization.md`. A complete Qwen3-4B suite and installed offline acceptance of the integrated build remain pending.
