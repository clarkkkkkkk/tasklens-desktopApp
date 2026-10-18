# TaskLens offline intelligence implementation report

Date: 2026-10-18. Verification remains in progress; pending entries below are not passes.

## 1. Existing model import architecture

Desktop extraction already used real Tesseract OCR, shared source units/validation/review and a managed private llama-server. Extraction weights were Phi-4; Whisper and extraction managers resolved imported weights under application data. OCR required system Tesseract/language setup. Browser/sample/onboarding extraction was explicitly mock. This migration reuses those production services and persistence contracts.

## 2. Bundled models

The versioned central manifest selects official Qwen3-4B Q4_K_M and multilingual Whisper Small. Build-only preparation streams downloads, verifies size/SHA-256 and formats, atomically promotes assets, and reuses verified cache files. No weights are tracked in Git or downloaded by normal startup. Bundled OCR data covers eng/ceb/tgl.

## 3. Native runtime packaging

Tauri externalBin packages target-suffixed TaskLens-prefixed llama-server, whisper-cli and Tesseract executables. Source archives are revision/size/hash pinned; Leptonica is static and OCR uses an internal BMP copy. Performance revision 2 adds CPU-gated static AVX2 variants alongside baseline executables on x86_64. On the i5-10210U, a short four-thread Qwen benchmark measured prompt processing 0.3995 → 20.9434 tokens/s (52.4×), generation 0.4152 → 5.2817 tokens/s (12.7×). See docs/evaluation/cpu-performance.json for command/raw data and limitations. The native runtime status confirms the AVX2 executable is selected. End-to-end checks are in progress. Linux dependency probes found only libgcc_s, libstdc++, libm and libc. Model/data/notices use explicit resource mappings. Release lookup uses the executable directory and Tauri resources; checkout fallback is debug-only.

## 4. First launch

A background coordinator verifies files and probes executables, publishing revisioned query/events. The UI shows “Preparing local intelligence…” and “Local AI is ready.” Readiness means verified assets/runnable executables; model loading remains on demand. Receipts live in application data, with manifest/path/size/nanosecond modification/hash fingerprints. Force validation rehashes. AppImage cache identities now use the verified container path/size/modification time and relative resource path when both executable and asset belong to that mount, so changing temporary mount paths does not invalidate an unchanged container. Remount/upgrade tests pass. The actual packaged AppImage reached readiness in 49.866 seconds on first validation, then **309 ms** on a different mount with the same profile/image. These are coordinator durations, not total window launch times; see docs/evaluation/appimage-startup-performance.json. Missing/corrupt resources fail with repair/reinstall guidance. Developer mode exposes supported-model overrides; legacy Phi files remain untouched. A shared native gate stops llama-server before Whisper loads.

## 5. Exact model pins

| Model | Revision | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Qwen3-4B | `bc640142c66e1fdd12af0bd68f40445458f3869b` | 2,497,280,256 | `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5` |
| Whisper Small (multilingual) | `5359861c739e955e79d9a303bcbc70fb988958b1` | 487,601,967 | `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b` |

Runtime commits:
- llamaCpp: `ff5888f999f24e2f9eaf6537b4eb6b85fd559188`; source archive SHA-256 `a4057a4a396e46de2bf78502300150348bc3704f845ed1de6ca05b2935eceb9b`.
- whisper: `d1be6fde11ac6e0407606b4e42fe72d34add8037`; source archive SHA-256 `645445da884df6dbd52b30f82d7be7c01d1767c938714e477e786b88d529e9f4`.
- tesseract: `3b7c70e34dea179549ed3e995872e2e019eb8477`; source archive SHA-256 `1dabbf429162bdf0c920541bdfa053d5f8eabb901bc1150a5264d678b0e3fa13`.
- leptonica: `63aef18d98432b8582a1565e241f7bd2ee9cc8d9`; source archive SHA-256 `beb4804d5cc9d274986e22b01a9c7e1ad4858d8487bfe9215728eb5e906f07dc`.

## 6. Locations

Prepared assets: `src-tauri/resources/{models,tessdata,notices}`. Installed assets: `resource_dir()/resources/{models,tessdata,notices}`. Executables: beside TaskLens as `tasklens-llama-server`, `tasklens-whisper-cli`, `tasklens-tesseract` with `.exe` on Windows. Receipts/explicit overrides: `app_data_dir()/asset-validation` and `/models`. No normal first-launch weight copy. Tauri resolves platform-specific base directories; LOCAL_AI.md documents examples.

## 7. Distribution sizes

- Two model files: **2,984,882,223 bytes**.
- Verified pinned model/data/license/executable payload with AVX2 variants: **3,062,001,808 bytes**, excluding the application and additional dependency/system notices.
- Release executable builds successfully on Fedora 44 x86_64.
- RPM compression: disabled. Compression is disabled to bypass the locked CLI’s rpm 0.16.0 Sha256Writer partial-write bug; gzip/Zstd attempts were stopped. The wrapper hashes the entire input before forwarding a possibly partial write, repeating gigabytes and corrupting the uncompressed archive digest. This is an upstream bundler issue, not model validation.
- Earlier uncompressed Fedora RPM: **3,098,805,069 bytes (2.89 GiB)**. `rpm -Kv` verifies header SHA-256 and both payload digests. Extracted layout contains `/usr/bin/tasklens{,-llama-server,-whisper-cli,-tesseract}` and `/usr/lib/TaskLens/resources/`. That earlier artifact predates AVX2. The rebuilt AVX2/cache-fix RPM measures **3,117,766,141 bytes**, SHA-256 `befc85410cb3e23f1f36d7fb5dc56e603f2b96f719d671eeb1e34d84e325ac75`, with all three RPM header/payload checks passing; it contains prompt v4, before the retained v6 prompt.
- Rebuilt AppImage with the cache fix and added launcher notices: **3,020,552,696 bytes (2.81 GiB)**, SHA-256 `0f0064717ed67c8cdf0a8d9f98665e1bbe094cf4f5addc1b55a5cb2d13d418b8`. It contains prompt v4, before the retained v6 prompt; a final prompt build remains pending. Installed-byte totals remain pending.
- GitHub Releases permits each asset under 2 GiB; oversized all-in-one installers need external large-file hosting. No hosting publication was performed.

## 8. Commands

```sh
npm ci
npm run prepare:models
npm run build:runtimes
npm run prepare:notices
npm run verify:assets
npm run check
npm run format:check
npm test
npm run test:assets
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri -- build --bundles rpm
npm run tauri -- bundle --bundles appimage
npm run release:desktop
```

Windows full offline installer additionally requires Inno Setup 6.5.2+ (enforced by the script preprocessor), a verified offline WebView2 payload and the documented environment variables. CI native builds/staging are prepared for Linux x86_64, Windows x86_64 and Apple Silicon macOS.

## 9. Real inference verification

Final extraction acceptance remains pending. These real-model runs use the production prompt, output schema and validator with external networking disabled; fixture assertions remain unchanged.

| Run | Observed result | Scope |
| --- | --- | --- |
| V6 complete suite | 64/77 checks, all ten cases completed in 994 s | Pictorial/midterm passed. Other cases missed actions, cancellation, event classification or stated times. Failed accuracy gate. |
| V7 focused suite | 15/18 checks across two cases | English bundle recovered both actions/times (11/12); the ambiguous same-weekday Monday date remained for review. Cebuano recovered the reflection deadline but also generated a cancelled seminar (4/6). Failed gate. |
| V8 greedy diagnostic | 13/15 checks on pictorial; stopped after that completed case | Duplicate announce-later activity and missing arrival place. Not a completed ten-case sweep. |

Archived results: `docs/evaluation/qwen3-v6-eval.md`, `docs/evaluation/qwen3-v7-focused.md` and `docs/evaluation/qwen3-v8-greedy-diagnostic.json`. A sampling diagnostic was stopped after its completed pictorial case again passed 13/15 checks, repeating the duplicate activity and missing place. It was not promoted. Tested settings: temperature 0.7, top-p 0.8, top-k 20, min-p 0, presence penalty 1.5, seed 7. These follow the [pinned upstream model card’s non-thinking guidance](https://huggingface.co/Qwen/Qwen3-4B-GGUF/blob/bc640142c66e1fdd12af0bd68f40445458f3869b/README.md); production retains v6 and greedy decoding. Both rejected v8 diagnostics completed only the first case; neither is a full-suite result. Sampling diagnostic and exact prompt source: docs/evaluation/qwen3-v8-sampling-diagnostic.json. Check counts depend on which actions are found; these small fixtures are regression evidence, not a production accuracy percentage. V7 timings were 466.9 s and 255.1 s under laptop CPU/memory pressure, not a controlled speed comparison. The English fixture says “Consultation is Monday” in a message sent on Monday; the validator preserves the ambiguity instead of accepting the model's wrong calendar date. Its expectation remains enforced and reported as failed.

The earlier conservative runtime was cancelled after 11m51s without an answer. Removing demonstrations in v3 failed four pictorial checks; v4 was stopped after partial output repeated an announce-later task. V5 passed 14/15 on pictorial in 205.677 s; v6 corrected the missing arrival place. The real midterm case exposed a validator bug that collapsed an 8 AM–1 PM range to equal start/end times; distinct range boundaries now have regression coverage. Unsupported dates/times are removed while genuine midnight remains valid. Repair text cannot inject chat roles. The production system prompt/schema and ordinary initial prompt remain byte-for-byte v6; the repair-message boundary is sanitized.

A separate prompt-lookup experiment passed 15 pictorial checks but measured 314.575 s versus 222.079 s for ordinary decoding and produced different JSON. It remains disabled in production; exact raw values and limitations are in `docs/evaluation/prompt-lookup-experiment.json`.

An earlier native v2 typed request reached real review and an isolated draft save: 113.828 s prefill (1,976 tokens), 99.546 s generation (251 tokens), plus about 13 s model loading. That automation exposed an onboarding animation hang and optional compositor screenshot stall, since corrected. A clean complete native extraction flow with the final prompt remains required. Compilation, unit tests and executable probes do not count as real inference acceptance.

## 10. Offline verification and preservation

Network namespace support is available; the recorded test namespace contains only loopback and no route. The extracted RPM native window initializes with networking restricted to loopback, the checkout hidden, and all installed resources read-only. Real screenshot OCR passes. The first packaged AppImage also initializes with the checkout hidden, resources read-only and external networking disabled; full validation measured 58.143 seconds, motivating the remount-cache fix. First validation took 25.9 seconds; an earlier relocated release measured 27.126 seconds, then 338 ms with receipts. Native corrupt-resource recovery passed and the app-data models directory stayed empty. New component-only native acceptance passes onboarding skip, screenshot OCR (2.409 s), audio import/transcription with the expected words (16.051 s for the 11 s public JFK sample), and restart persistence of the isolated profile. A separate native check also saved a real manual task through the UI and verified its unchanged stored data after restart, with both inference steps skipped. Networking was restricted to loopback, resources read-only and the checkout hidden. Extraction was intentionally skipped in this component run; text, screenshot-to-actions and voice-to-actions remain separate pending gates. The standalone AVX2 speech run completed in 17.39 s at 768,364 KiB peak RSS with unchanged model/beam/best-of settings; the conservative baseline was stopped at 190.68 s without a transcript and overlapped asset validation, so no exact speedup ratio is claimed. See docs/evaluation/voice-performance.json. An additional native disconnected check captured 1,450 ms from the actual microphone, cleaned up the temporary recording and passed manual save/restart persistence. This verifies device capture only, not speech or language/noise accuracy (docs/evaluation/microphone-device.json). The native acceptance harness uses isolated XDG data/config/cache paths. Repository schema, application identifier, onboarding completion and task storage remain unchanged.

Automated checks: 58 frontend unit tests passed; one opt-in real-model test skipped in the ordinary suite. Two preparation tests passed. Seventeen Rust tests passed, including AppImage remount/upgrade coverage, with two separate OCR/codec opt-in tests skipped. Nine onboarding/motion browser checks pass after the transition fix, including the new paused-animation regression. Earlier, all 33 browser cases passed across a full run and focused reruns after correcting Vite watching of native/generated assets; the last full run had 31 passes and two reload-related failures, then those two passed. Browser mocks do not certify native inference.

## 11. Windows/macOS status

Windows x86_64 and Apple Silicon macOS packaging code and native CI jobs are prepared; actual builds, installed inference, permissions, signing/notarization and installer acceptance remain pending on their native hosts. Existing historical Windows acceptance is not evidence for this all-in-one release. Intel macOS is deferred.

## 12. Remaining blockers and release gates

- Complete Fedora RPM/AppImage real-inference acceptance and measurements after the AVX2 performance revision. RPM resource/window/OCR and AppImage preparation/remount checks pass; a system RPM transaction and complete packaged inference flows still need verification.
- Run the complete real-model fixture suite after packaging and report actual failures without weakening assertions.
- Verify multilingual/noise recognition quality. Actual native microphone capture and cleanup pass (1,450 ms captured); this is device evidence, not speech accuracy.
- Supply actual Windows/macOS native hosts, offline WebView2 payload, signing credentials and large-file distribution hosting.
- Dependency notices include pinned model/runtime/OCR texts, supplemental license files at upstream VCS revisions, canonical SPDX terms, package metadata/source inventory, and the readable Fedora system license corpus. Confirm actual-platform notices before publishing Windows/macOS artifacts.

The application source remains MIT. No cloud inference, cloud OCR, remote speech service, account, API key or remote fallback was added.

Windows compiler guard follows the official [ISPP predefined version variable](https://jrsoftware.org/ishelp/topic_predefinedvars.htm) and [EncodeVer API](https://jrsoftware.org/ishelp/topic_encodever.htm). Inno 6.5.2 raised the single installer limit to 4 GB; actual native build/install verification remains pending ([revision history](https://jrsoftware.org/files/is6-whatsnew.htm)).
