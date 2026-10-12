# Local runtime binaries

Prepared by `npm run build:runtimes` and bundled with TaskLens. Never committed.

- `llama-server` (llama.cpp, pinned in `../models.json` → `llamaCpp`) plus its shared libraries
- `whisper-cli` (whisper.cpp) for voice capture
- optionally `tesseract`; otherwise a system Tesseract 5.x installation is used

Binary lookup is centralised in `src-tauri/src/platform.rs`.
