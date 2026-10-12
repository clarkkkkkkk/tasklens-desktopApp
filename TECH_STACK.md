# Technology decisions

| Layer | Current choice and reason |
| --- | --- |
| UI | React with strict TypeScript: reusable components and checked domain contracts. |
| Build | Vite: small, fast frontend development and static production assets. |
| Desktop | Tauri 2 / Rust: system webview, local app identity, constrained native surface. No privileged plugins are needed yet. |
| Styling | Tailwind CSS via its Vite plugin plus shared CSS tokens: one authoritative palette and spacing vocabulary. |
| Components | Small semantic local primitives and Solar (Bold Duotone) icons via @solar-icons/react. shadcn/ui is not installed because the initial controls do not need additional headless dependencies. |
| Typography | Bundled Inter via @fontsource/inter; no font network request at runtime. |
| State | React context and hooks; domain operations are independent from presentation. |
| Validation | Zod at form and persistence boundaries. Native form controls for simple inputs. |
| Persistence | Versioned localStorage behind ActionRepository; no existing SQLite/Tauri setup was present. Writes fail visibly and do not optimistically erase current state. |
| Tests | Vitest for domain/storage contracts; Playwright for real-browser workflow, persistence and accessibility checks; ESLint and TypeScript. |
| OCR | Tesseract 5 CLI (Apache-2.0), languages eng+ceb+tgl, run as a separate local process with TSV output: mature, offline, multilingual, and returns per-word confidence and boxes needed for Source Trace. The `image` crate prepares a temporary copy. |
| Local LLM | Microsoft Phi-4-mini-instruct (MIT), GGUF Q4_K_M: a 3.8B instruction model small enough for CPU-only laptops. |
| Model runtime | llama.cpp `llama-server` (MIT), pinned release b11505, managed by Rust and bound to 127.0.0.1. Chosen over a per-call CLI so the model loads once; JSON-schema grammars constrain output. Ollama is not required. |
| Voice | whisper.cpp (MIT) with Whisper Small, unchanged from the voice feature. |

## Future, not installed
SQLite will implement the same repository contract after native database access and migrations are tested. GPU acceleration for llama.cpp and a bundled Tesseract per platform are future packaging work. A native reminder scheduler will implement ReminderScheduler. Phase 1 stores schedules but never claims to send OS notifications. Startup registration is also deferred.

## Setup references
- [Tauri configuration](https://v2.tauri.app/reference/config/)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite)

Node 22.12+ and a current Rust toolchain are recommended. Native Linux builds also require GTK 3 and WebKitGTK 4.1 development libraries. Inspection found Node and Rust installed, GTK available, but WebKitGTK 4.1 development metadata missing; native build results are recorded in TASK_TRACKER.md.
