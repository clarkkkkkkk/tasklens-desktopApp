# Local AI in TaskLens

TaskLens turns screenshots, typed text and voice notes into reviewable tasks, events and deadlines **entirely on your computer**. There is no cloud AI, no remote OCR, no API key and no account. Once the model and OCR language data are installed, extraction works with Wi‑Fi turned off.

## What runs where

```
Screenshot (bytes over local IPC, never a URL)
  → Tesseract 5 OCR (eng+ceb+tgl), native child process      src-tauri/src/ocr.rs
  → OCR regions: text, confidence, bounding boxes, IDs
  → source units (wrapped lines rejoined, IDs kept)           prompts/build-prompt.ts
  → Phi-4-mini-instruct via TaskLens-managed llama-server     src-tauri/src/local_ai/
      bound to 127.0.0.1, random port, per-launch API key
      JSON-schema-constrained output, temperature 0
  → validation: JSON → schema → evidence IDs → dates/times → confidence
                                                              validation/validate-extraction.ts
  → review (Source Trace, open questions) → Confirm → existing local repository
```

`LocalAIExtractionService` implements the same `ExtractionService` interface as `MockExtractionService`; the UI does not know which one ran. Composition happens in `src/app/services.ts`:

| Environment | Extraction |
| --- | --- |
| TaskLens desktop app | `LocalAIExtractionService` |
| Browser (`npm run dev`), Playwright tests | `MockExtractionService` |
| Desktop with `VITE_TASKLENS_EXTRACTION=mock` | `MockExtractionService` (demo/troubleshooting) |
| Onboarding tour and “Try a sample screenshot” | Always the mock, so they work before a model is installed |

Voice notes (whisper.cpp) and typed text use the same model, prompt and validator; their transcript segments (`s1…`) or sentences (`t1…`) take the place of OCR regions.

## Voice and typed text

Voice: CPAL microphone capture or audio import → native decoding/resampling → whisper.cpp (Whisper Small) → timestamped transcript → the same Phi-4-mini prompt, validator and review bundle used for screenshots. Typed text uses the same path with one source unit per sentence. Recording permission, supported formats, retention, cancellation and resource limits are documented in [VOICE_CAPTURE.md](VOICE_CAPTURE.md). No wake word or background microphone listener is used, and nothing is saved without review.

## Model

| | |
| --- | --- |
| Model | Microsoft **Phi-4-mini-instruct** (3.8B parameters), MIT license |
| Format | GGUF, **Q4_K_M** 4-bit quantization (Unsloth conversion of Microsoft’s weights) |
| File | `Phi-4-mini-instruct-Q4_K_M.gguf`, 2,491,874,272 bytes |
| SHA-256 | `88c00229914083cd112853aab84ed51b87bdf6b9ce42f532d8c85c7c63b1730a` |
| Pinned source | `https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/78eb92a46fc37e6b524df991ed9aca9bc6aa7b80/Phi-4-mini-instruct-Q4_K_M.gguf` |
| Runtime | llama.cpp **b11505** (`ff5888f9`), `llama-server`, CPU, MIT license |

Microsoft does not publish an official GGUF of Phi-4-mini-instruct, so TaskLens pins one specific community conversion by revision and checksum. The manifest lives in `src-tauri/resources/models.json`. Any other file is rejected.

### Runtime lifecycle

`llama-server` is not started per extraction. TaskLens loads it **on demand** (it starts warming up while OCR is still reading a screenshot), keeps it running for later extractions and stops it when TaskLens exits. States: not installed · loading · ready · processing · failed · stopped; the model file itself is not installed · unverified · verified · corrupted. Loading never blocks the UI; all native work runs on background threads.

The system prompt is a constant prefix, so llama.cpp’s prompt cache reuses it after the first extraction.

### Model storage

Models live in the TaskLens application data folder, never in Git:

| OS | Folder |
| --- | --- |
| Windows | `%APPDATA%\app.tasklens.desktop\models\` |
| macOS | `~/Library/Application Support/app.tasklens.desktop/models/` |
| Linux | `~/.local/share/app.tasklens.desktop/models/` |

`models/verified.json` caches a successful checksum against the file’s size and modification time, so the 2.5 GB hash is not recomputed at every launch.

## Installing (one-time setup)

TaskLens never downloads models or language data by itself.

1. **Runtime** — packaged builds include `llama-server` in `resources/bin`. For development run `npm run build:runtimes -- --prebuilt --llama-only` (downloads the pinned official llama.cpp release for your platform and verifies its SHA-256) or `npm run build:runtimes` to build from source with CMake.
2. **Model** — download the file above from its pinned source (a one-time 2.5 GB download; inference afterwards is local). In TaskLens open **Settings › Local AI › Select / Import model** and choose it. TaskLens copies it into the models folder while computing its SHA-256 and installs it only if size and checksum match.
3. **OCR** — install Tesseract 5 (Windows: `winget install UB-Mannheim.TesseractOCR`; macOS: `brew install tesseract`; Linux: your distribution’s `tesseract-ocr` package). English data ships with it.
4. **OCR languages** — download `ceb.traineddata` and `tgl.traineddata` from [tesseract-ocr/tessdata](https://github.com/tesseract-ocr/tessdata) and import them in **Settings › Local AI › Import OCR languages**. TaskLens stores them with English in its own `tessdata` folder. Verified copies (commit `ced78752`): `ceb` 2,402,839 bytes, SHA-256 `391d8ac6…26a1`; `tgl` 7,321,367 bytes, SHA-256 `767262b9…da8b`.

Settings shows the model, its location and size, checksum state, runtime state, Tesseract version and which OCR languages are installed. **Validate model** re-hashes the file; **Reload model** restarts the runtime.

## Supported languages

OCR: English (`eng`), Cebuano (`ceb`), Tagalog (`tgl`), together as `eng+ceb+tgl`. Code-switching such as “Tomorrow ang pictorial ugma and much better all of us mag black pants” is kept exactly as written. Nothing is translated or normalised before the model sees it, and evidence always points at the original text.

## Extraction rules

- **Structured only.** The model must return JSON matching a schema compiled into a llama.cpp grammar. Evidence IDs are an `enum` of the region IDs actually present, so the model cannot cite a region that does not exist.
- **Versioned prompts** in `src/services/extraction/prompts/` (`TASKLENS_EXTRACTION_PROMPT_VERSION = 1`).
- **Unknown stays null.** Arrival time is never assumed to be the start time; a deadline is never an event time; separate sections are not merged unless the source connects them.
- **Times** are copied as written (“1:30PM”) and converted to 24-hour time by the validator, not by the model.
- **Relative dates** (“ugma”, “bukas”, “karong Friday”, “Huwebes”) are resolved by the validator, deterministically, from a sending date: a chat timestamp shown above the message, or for voice/text the capture date. A screenshot’s file time is never treated as a sending date. With no sending date the date stays empty and an open question offers candidates.
- **Semantic confidence** only, never percentages: *Confirmed* (stated in the cited source text), *Inferred* (reasonably derived) and *Needs review* (ambiguous, contradictory, incomplete or unsupported). The validator may downgrade the model’s confidence and never upgrades it. A field without valid evidence cannot be Confirmed.
- **Open questions** (`ExtractionAmbiguity`: field, question, options, evidence) are shown under “Needs your answer”. Answering applies the value as an unsaved edit; nothing is auto-resolved.
- **Action bundles.** One screenshot can produce several items; Inbox then opens the multi-item review.
- **Never trust raw output.** Invalid output gets one controlled retry that tells the model what went wrong; after that the user sees a retryable error and nothing is saved.

## Source Trace

Every meaningful field keeps the OCR region IDs it came from. In review, **Source** next to a field opens the screenshot with those regions’ Tesseract bounding boxes highlighted (for example *Arrival time 1:30 PM* → “Mga 1:30PM kinahanglan naa na tanan sa campus.”). Boxes and region text are stored with the item (`source.ocr`) so tracing works after saving.

## Privacy and security

- No screenshot content, OCR text, prompts, model output or task data leaves the computer. The webview’s CSP allows only Tauri IPC; it cannot reach the model server or the internet.
- Rust talks to `llama-server` through a minimal HTTP client that accepts only a port and always connects to `127.0.0.1` (`src-tauri/src/local_ai/http.rs`). The server is started with `--host 127.0.0.1`, a random free port, a random per-launch API key and `--no-webui`. It is never bound to `0.0.0.0` or the LAN.
- Child processes receive structured argument lists, never a shell string. OCR text is never interpolated into commands; prompts travel in the HTTP request body.
- Uploads: PNG/JPEG/WEBP only, at most 10 MB, at most 16,000 px per side, decoded with allocation limits. Request IDs must be UUIDs; prompt and schema sizes are bounded.
- Temporary OCR images live in the app data `ocr-jobs` folder, are deleted after each job and cleaned at startup. The user’s original file is never modified.
- Developer mode (**Settings › Local AI**) shows OCR text, regions, raw model output and validator corrections in the Inbox for diagnosis. It is off by default.

## Offline verification procedure

1. Install the runtime, model and OCR language data as above. Confirm Settings › Local AI shows **Model file: checksum verified**, Tesseract, and English/Cebuano/Tagalog installed.
2. Close TaskLens.
3. Disconnect the network (turn Wi‑Fi off or unplug Ethernet).
4. Launch TaskLens.
5. Drop `tests/fixtures/screenshots/pictorial.png` onto Inbox.
6. Watch *Preparing image → Reading text locally → Understanding details locally → Checking extracted information*.
7. Review the result: arrival 1:30 PM (Confirmed), start time empty (Needs review), black pants / no jeans, and an open question about the date. Use **Source** to highlight the screenshot.
8. Answer the date question or edit it, then **Confirm & save**.
9. Check the item in Today/Upcoming/Calendar and restart TaskLens: it persists.
10. Nothing in steps 4–9 needs a network connection.

## Evaluation

`TASKLENS_EVAL=1 npx vitest run src/services/extraction/evaluation` runs the real model on every case in `tests/fixtures/extraction/cases.ts` (pictorial, midterm, Action Bundle, Cebuano/Tagalog/mixed text and voice) and writes `docs/evaluation/local-ai-eval.md`. Each case records expected action count, types, dates, times, arrival time, location, requirements, ambiguities and forbidden hallucinations. A handful of fixtures is a regression signal, **not** a measure of production accuracy. Screenshot cases use real Tesseract output recorded from the rendered fixtures (`npm` script: `node scripts/render-screenshot-fixtures.mjs`; OCR: `cargo test -- --ignored ocr_fixtures`).

## Troubleshooting

| Message | What to do |
| --- | --- |
| Local model is not installed | Settings › Local AI › Select / Import model. |
| Model file damaged / checksum does not match | Download the pinned file again and import it. |
| Local model failed to load | Close other heavy apps (needs about 4 GB free RAM), then Reload model. |
| Local text recognition is not installed | Install Tesseract 5, then reopen Settings. |
| Cebuano or Tagalog missing | Import `ceb`/`tgl.traineddata` in Settings. |
| Could not read enough text | Use a sharper, larger or uncropped screenshot. |
| Could not be validated | Try again. Developer mode shows the raw output. |
| Very slow | CPU only: the first extraction after loading takes longest. Developer mode can set threads. |

## Known limitations

- CPU inference: roughly 20–125 seconds per item set on a 6-core desktop CPU (Ryzen 5 3600); the first extraction also loads the model (about 10–20 s). No GPU acceleration is configured yet.
- Phi-4-mini at 4-bit is a small model. On the regression suite it passes 71/83 checks with no forbidden hallucination, but it mislabels item types (an exam as a deadline), often leaves times empty, misses requirements phrased as suggestions ("much better mag black pants"), sometimes merges or splits items, and occasionally returns no item with only a question. Review every result. The validator guards evidence, dates, times, confidence and grounding, not wording.
- Outputs are deterministic for identical input (temperature 0), but the prompt includes the current time and file time, so re-running the same screenshot can give a different result.
- Prompt wording matters: small additions measurably changed results. Change the prompt only together with an evaluation run, and bump the prompt version.
- OCR quality depends on the screenshot. Stylised fonts, emoji and very small text reduce accuracy; handwriting is not supported.
- Line grouping uses layout heuristics tuned on chat bubbles and notices.
- Runtimes are tied to TaskLens's lifetime: a Windows job object (kill on close) and a Linux parent-death signal end `llama-server` even if TaskLens crashes. On macOS only a normal exit stops it.
- The WebView2 runtime (Windows) may itself contact Microsoft services, as browser engines do; TaskLens's page has no network access (CSP `connect-src ipc:`) and extraction never uses the network. Tauri disables WebView2 SmartScreen by default.
- Packaged builds must ship `llama-server` for each platform. Tesseract is found from a bundled copy or a system installation.

## Licenses

TaskLens source code is MIT licensed. Third-party components keep their own licenses; TaskLens does not own them. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): Phi-4-mini-instruct (Microsoft, MIT), llama.cpp (MIT), whisper.cpp (MIT), Tesseract OCR (Apache-2.0), Tesseract trained language data (Apache-2.0).
