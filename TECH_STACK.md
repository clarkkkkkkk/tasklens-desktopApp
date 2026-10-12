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

## Future, not installed
SQLite will implement the same repository contract after native database access and migrations are tested. Local OCR remains deferred; text/voice already use local LLM extraction behind ExtractionService with validated output. A native reminder scheduler will implement ReminderScheduler. Phase 1 stores schedules but never claims to send OS notifications. Startup registration is also deferred.

## Setup references
- [Tauri configuration](https://v2.tauri.app/reference/config/)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite)

Node 22.12+ and a current Rust toolchain are recommended. Native Linux builds also require GTK 3 and WebKitGTK 4.1 development libraries. Linux native automation and debug Debian packaging are now available on this host; real microphone and all-platform voice acceptance are tracked separately in TASK_TRACKER.md.

## Local voice/text additions
Voice capture uses CPAL (Rust); decoding uses Symphonia with only WAV/PCM, MP3, M4A AAC-LC/ALAC and OGG/Vorbis enabled; Rubato resamples to 16 kHz mono PCM. Speech inference uses pinned whisper.cpp and multilingual Whisper Small. Shared structured extraction uses pinned llama.cpp with Qwen3-4B Q4_K_M, schema-constrained JSON and Zod validation. Tauri IPC replaces any need for a local HTTP service. Models are user-imported; native binaries are built per target with `npm run build:runtimes`. See VOICE_CAPTURE.md for setup and acceptance boundaries. SQLite, OCR and notification delivery remain future work.
