# TaskLens offline intelligence implementation report

Date: 2026-10-16. Verification remains in progress; pending entries below are not passes.

## 1. Existing model import architecture

Desktop extraction already used real Tesseract OCR, shared source units/validation/review and a managed private llama-server. Extraction weights were Phi-4; Whisper and extraction managers resolved imported weights under application data. OCR required system Tesseract/language setup. Browser/sample/onboarding extraction was explicitly mock. This migration reuses those production services and persistence contracts.

## 2. Bundled models

The versioned central manifest selects official Qwen3-4B Q4_K_M and multilingual Whisper Small. Build-only preparation streams downloads, verifies size/SHA-256 and formats, atomically promotes assets, and reuses verified cache files. No weights are tracked in Git or downloaded by normal startup. Bundled OCR data covers eng/ceb/tgl.

## 3. Native runtime packaging

Tauri externalBin packages target-suffixed TaskLens-prefixed llama-server, whisper-cli and Tesseract executables. Source archives are revision/size/hash pinned; Leptonica is static and OCR uses an internal BMP copy. Linux dependency probes found only libgcc_s, libstdc++, libm and libc. Model/data/notices use explicit resource mappings. Release lookup uses the executable directory and Tauri resources; checkout fallback is debug-only.

## 4. First launch

A background coordinator verifies files and probes executables, publishing revisioned query/events. The UI shows “Preparing local intelligence…” and “Local AI is ready.” Readiness means verified assets/runnable executables; model loading remains on demand. Receipts live in application data, with manifest/path/size/nanosecond modification/hash fingerprints. Force validation rehashes. Missing/corrupt resources fail with repair/reinstall guidance. Developer mode exposes supported-model overrides; legacy Phi files remain untouched. A shared native gate stops llama-server before Whisper loads.

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
- Verified pinned model/data/license/executable payload: **3,043,051,960 bytes**, excluding the application and additional dependency/system notices.
- Release executable builds successfully on Fedora 44 x86_64.
- RPM size: measurement in progress. Compression is disabled to bypass the locked CLI’s rpm 0.16.0 Sha256Writer partial-write bug; gzip/Zstd attempts were stopped. The wrapper hashes the entire input before forwarding a possibly partial write, repeating gigabytes and corrupting the uncompressed archive digest. This is an upstream bundler issue, not model validation.
- AppImage packaging and installed bytes: pending.
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

Windows full offline installer additionally requires Inno Setup 6.5.2+, a verified offline WebView2 payload and the documented environment variables. CI native builds/staging are prepared for Linux x86_64, Windows x86_64 and Apple Silicon macOS.

## 9. Real inference verification

Pending final disconnected installed-app checks and full Qwen regression evaluation. The initial evaluation was explicitly stopped during concurrent packaging memory contention; it is not an accuracy result. Compilation, unit tests and executable --help probes are not inference acceptance. Prompt version 2 uses Qwen3 non-thinking markers/stop tokens with the existing production validator.

## 10. Offline verification and preservation

Network namespace support is available; the recorded test namespace contains only loopback and no route. Final installed native text/transcription/voice-to-action/OCR/review/save/restart acceptance is pending. The native acceptance harness uses isolated XDG data/config/cache paths. Repository schema, application identifier, onboarding completion and task storage remain unchanged.

Automated checks: 54 frontend unit tests passed; one opt-in real-model test skipped in the ordinary suite. Two preparation tests passed. Fourteen Rust tests passed, with two separate OCR/codec opt-in tests skipped. All 33 browser cases passed across a full run and focused reruns after correcting Vite watching of native/generated assets; the last full run had 31 passes and two reload-related failures, then those two passed. Browser mocks do not certify native inference.

## 11. Windows/macOS status

Windows x86_64 and Apple Silicon macOS packaging code and native CI jobs are prepared; actual builds, installed inference, permissions, signing/notarization and installer acceptance remain pending on their native hosts. Existing historical Windows acceptance is not evidence for this all-in-one release. Intel macOS is deferred.

## 12. Remaining blockers and release gates

- Complete Fedora RPM/AppImage installed resource, window and real-inference acceptance and measurements.
- Run the complete real-model fixture suite after packaging and report actual failures without weakening assertions.
- Verify actual microphone capture and multilingual/noise recognition quality; synthetic speech is separate evidence.
- Supply actual Windows/macOS native hosts, offline WebView2 payload, signing credentials and large-file distribution hosting.
- Dependency notices include pinned model/runtime/OCR texts, supplemental license files at upstream VCS revisions, canonical SPDX terms, package metadata/source inventory, and the readable Fedora system license corpus. Confirm actual-platform notices before publishing Windows/macOS artifacts.

The application source remains MIT. No cloud inference, cloud OCR, remote speech service, account, API key or remote fallback was added.
