# Technology decisions

| Layer | Current choice and reason |
| --- | --- |
| UI | React with strict TypeScript: reusable components and checked domain contracts. |
| Build | Vite: small, fast frontend development and static production assets. |
| Desktop | Tauri 2 / Rust: system webview, local app identity, constrained native surface. Native IPC commands are main-window scoped; a single-instance plugin protects temporary jobs. |
| Styling | Tailwind CSS via its Vite plugin plus shared CSS tokens: one authoritative palette and spacing vocabulary. |
| Components | Small semantic local primitives and Solar (Bold Duotone) icons via @solar-icons/react. shadcn/ui is not installed because the initial controls do not need additional headless dependencies. |
| Typography | Bundled Inter via @fontsource/inter; no font network request at runtime. |
| State | React context and hooks; domain operations are independent from presentation. |
| Validation | Zod at form and persistence boundaries. Native form controls for simple inputs. |
| Persistence | Versioned localStorage behind ActionRepository; no existing SQLite/Tauri setup was present. Writes fail visibly and do not optimistically erase current state. |
| Tests | Vitest for domain/storage contracts; Playwright for real-browser workflow, persistence and accessibility checks; ESLint and TypeScript. |
| OCR | Tesseract 5 CLI (Apache-2.0), languages eng+ceb+tgl, run as a separate local process with TSV output: mature, offline, multilingual, and returns per-word confidence and boxes needed for Source Trace. The `image` crate prepares a temporary copy. |
| Local LLM | Qwen3-4B (Apache-2.0), GGUF Q4_K_M: a 4B model small enough for CPU-only laptops. |
| Model runtime | llama.cpp `llama-server` (MIT), pinned release b11505, managed by Rust and bound to 127.0.0.1. Chosen over a per-call CLI so the model loads once; JSON-schema grammars constrain output. Ollama is not required. |
| Voice | whisper.cpp (MIT) with Whisper Small, unchanged from the voice feature. |

## Future, not installed
SQLite will implement the same repository contract after native database access and migrations are tested. GPU acceleration remains future work; CPU Tesseract bundling is implemented with native release acceptance tracked separately. A native reminder scheduler will implement ReminderScheduler. Phase 1 stores schedules but never claims to send OS notifications. Startup registration is also deferred.

## Setup references
- [Tauri configuration](https://v2.tauri.app/reference/config/)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite)

Node 22.12+ and a current Rust toolchain are recommended. Native Linux builds also require GTK 3 and WebKitGTK 4.1 development libraries. Linux native automation and debug Debian packaging are now available on this host; real microphone and all-platform voice acceptance are tracked separately in TASK_TRACKER.md.

## Local voice/text additions
Voice capture uses CPAL (Rust); decoding uses Symphonia with only WAV/PCM, MP3, M4A AAC-LC/ALAC and OGG/Vorbis enabled; Rubato resamples to 16 kHz mono PCM. Speech inference uses pinned whisper.cpp and multilingual Whisper Small. Structured extraction for voice, text and screenshots uses the same Qwen3-4B model on the managed llama-server (127.0.0.1 only), schema-constrained JSON and the shared validator. Models are bundled and verified automatically; native sidecars are built per target with `npm run build:runtimes`. See VOICE_CAPTURE.md for setup and acceptance boundaries. SQLite and notification delivery remain future work.

## All-in-one release assets — 2026-10-16

The versioned model manifest pins Qwen3-4B Q4_K_M, Whisper Small multilingual, llama.cpp, whisper.cpp, Tesseract/Leptonica and eng/ceb/tgl trained data. Build-time scripts stream/hash/validate assets, compile native CPU sidecars and collect notices. Tauri externalBin handles target-suffixed executables; explicit resource mappings ship weights/data/notices. Release paths use Tauri resources and the executable directory, with repository fallback only in debug builds.

`assets.rs` centralizes model resolution, format/hash checks, fingerprinted receipts and background initialization. Query/event revisions prevent startup status races. Readiness means verified files and runnable executables, while inference stays on demand. Models are never copied on normal first launch, downloaded at runtime or substituted with mock extraction after failure. Explicit developer imports leave bundled resources and legacy user files untouched.

Screenshot inputs still decode in Rust; their temporary grayscale copy is BMP so the pinned static Leptonica build needs no separate PNG/JPEG/TIFF runtime. Text/speech/screenshots retain the existing validator, review and persistence contracts. Prompt version 2 uses Qwen3 non-thinking markers and manifest stop tokens. LocalStorage and onboarding versions are unchanged.

Linux x86_64, Windows x86_64 and Apple Silicon macOS are the release targets; Intel macOS is deferred. Windows uses a single Inno offline installer with an offline WebView2 payload; oversized files require hosting outside GitHub Releases. See LOCAL_AI.md and OFFLINE_AI_IMPLEMENTATION_REPORT.md for commands, measurements and actual acceptance status.
