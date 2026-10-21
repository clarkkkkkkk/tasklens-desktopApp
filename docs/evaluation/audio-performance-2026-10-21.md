# Audio extraction performance investigation — 2026-10-21

The reported capture contains a completed transcript followed by an extraction transport error. This identifies action extraction as the failed stage; it does not establish why that particular runtime disconnected. No claim that the historical failure is reproduced or fully resolved is made.

## Implemented

- A cancelled native inference request now exits Rust buffered reads using a terminal cancellation error. `Interrupted` was unsafe here because `read_exact`/`read_until` retry it, potentially keeping cancelled work and the shared model gate occupied. Cancellation is checked before submission and before every socket read. The overall deadline is also checked when data continues arriving.
- Recording waveform is horizontally centered in its capture card at both desktop sizes. Its real amplitude history, quiet-silence behavior and reduced-motion behavior are retained.
- Added an opt-in synthetic real-model diagnostic: `node scripts/benchmark-audio-extraction.mjs default` or `single-slot`. It uses production prompts, schema and validation, and checks date/time and both requested supplies. Reports and model state remain ignored under `.local-ai/audio-performance/`; no private recordings are used.

No model, prompt, decoding, threading, context-size or inference-cache defaults were changed. No weights or native runtimes were rebuilt.

## Observed measurements

Fedora workstation, Intel i5-10210U, CPU inference, four runtime threads, 8192-token context. Pinned Qwen3-4B Q4_K_M, SHA-256 `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5`, prompt v7. The fixture requests an October 23, 2026 meeting at 22:30 and a pencil and paper.

| Measurement | Existing defaults | Experimental RAM cache disabled |
| --- | ---: | ---: |
| Model load | 12.23 s | 6.39 s |
| Initial prefix operation | 250.86 s, cold evaluation | 0.062 s, existing prefix restore |
| Voice transcript → extraction | 99.32 s | 156.57 s |
| Text → extraction | 87.62 s | 88.06 s |
| Peak runtime RSS | 5,345 MiB | 5,288 MiB |

These are individual diagnostic runs on an active desktop, not controlled comparative benchmarks. Browser verification overlapped part of the experimental run and materially increased load. Cold evaluation and cached restoration are different operations. The experiment does not justify a speed claim or a production cache change; its flags were not adopted. Existing disk-prefix restoration already avoids cold prompt evaluation after a model restart.

Both voice results passed production validation and all fixture checks. Both text results passed production validation and date/time checks, but omitted “paper”; the diagnostic correctly exits nonzero for that quality failure. This existing quality issue is recorded rather than weakening assertions or changing extraction prompts during a performance fix.

These tests run the bundled model directly through authenticated loopback. They are not acceptance of the complete native microphone → Whisper → action review/save flow, and do not reproduce the original transport failure. Whisper timings from earlier capture work are documented in `CAPTURE_REDESIGN_REPORT.md`. Inference remains local; no external fallback was added. This investigation did not perform a fresh network-isolation test.

## Verification

Native HTTP tests cover cancellation before connecting, cancellation during a buffered body read, chunked/content-length decoding and split streaming events. Browser layout regressions assert that the 48-bar waveform center matches the card center within one pixel at 1440×920 and 900×640. Screenshots are observed separately from fixture service acceptance.

The large CPU model remains inherently slow on this laptop. A smaller model or lower-quality decoding requires separate accuracy evaluation; neither was silently introduced. Native end-to-end acceptance of the reported failure and quiet-machine performance measurements remain pending.

Final automated checks for this change:

- `npm run check`, `npm run format:check`, `npm run build`: passed. Build retains the existing >500 kB bundle-size warning.
- `npm test`: 113 passed, one real-model suite skipped; the separate diagnostic above actually ran Qwen.
- `cargo fmt --check`, `cargo check --locked`, `cargo build --locked`: passed.
- `cargo test --locked local_ai::http::tests`: four passed.
- Frozen final-source browser run, `npx playwright test tests/capture-experience.spec.ts tests/voice.spec.ts --workers=1`: all 15 passed. Both desktop screenshots were visually inspected, with centered waveform and no clipping. An earlier overlapping benchmark/browser run timed out taking a screenshot at 1440px; the isolated rerun passed unchanged.
- `git diff --check`: passed.

A focused Fedora native cancellation/follow-up-completion attempt used an isolated profile and the rebuilt debug executable. It stopped at the three-minute asset-readiness timeout before loading Qwen; no native real-model cancellation or follow-up-completion pass is claimed. The test application and driver closed cleanly. The normal development application was left running. Evidence: `/tmp/tasklens-capture-native/performance-failure.txt`; centered waveform screenshots: `.local-ai/audio-performance/centered-waveform-{1440,900}.png`. Full native audio-to-action acceptance remains pending.
