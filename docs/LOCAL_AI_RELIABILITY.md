# Local AI reliability investigation — 2026-10-22

Checkpoint developed on `codex/local-ai-reliability`, based on `42c2ad0`, and approved by the user for publication to `main` on 2026-10-22. This is unfinished reliability work, not a release-ready accuracy claim. Active verification scope is Fedora; Windows work is deferred. The reported Windows and Fedora failures came from development builds; their original executable hashes and Windows exit details have not yet been supplied. A successful current reproduction does not establish the cause of either original failure.

## Verified repairs

- Native subprocess failures retain typed stage, spawn/exit/timeout/cancellation classification, Windows hexadecimal exit status or Unix termination signal, and bounded recognized stderr categories. Friendly messages remain compatible with legacy string errors. No raw stderr, screenshot, transcript, OCR text, prompt, response, token or personal path enters the new diagnostic export.
- Diagnostics are off by default, session-only, bounded to 512 events, and explicitly exported in AI Settings. Trace IDs connect capture, OCR, preparation and inference. Available CPU/RSS, timings, health, executable/runtime hashes and build identity distinguish measured evidence from unavailable data.
- The Rust streaming transport requires a valid terminal completion event, nonempty bounded content and well-formed UTF-8/JSON events. Truncation is an error. Failed/cancelled model processes are reconciled before Ready is published; cancellation retires the active server. Generated prefix-cache incompatibility is recoverable without deleting models or user data.
- JSON schema property order now survives Tauri IPC. Previously `serde_json::Value` sorted schema properties, changing grammar generation order relative to the authored TypeScript schema. Only the request schema uses `RawValue`; durable reminder serialization is unchanged. The schema-order wire repair initially retained version 7. Prompt version 11 also separates completed OCR statements, labels standalone chat timestamps as context only, excludes their clocks from activity fields, and supplies bounded source-backed clock/calendar hints to the existing repair. Coverage checks request repair for omitted activities, dates, supplies, cancellation and schedule roles; they never manufacture action fields. Version 11 has focused unit coverage but has not completed real-model or native acceptance.
- Conservative omission checks request the existing single repair for uncited separately scheduled activities, omitted explicit dates and incomplete simple bring-lists. They do not manufacture extracted fields. Missing event dates remain review questions.
- Screenshot phases are explicit. Failure is not success. Recognized text and image remain available; downstream retry reuses an image-bound validated OCR checkpoint. A manual task editor opens without fabricated fields and still requires explicit save. Voice/text recovery remains separate.
- Development SHA-256 compression is optimized without bypassing verification or modifying inference sidecars. Fresh isolated debug validation improved from 299.347 s to 26.246 s in separate runs (about 11.4×); cached validation took 159 ms. This is initialization, not generation speed.

## Fedora evidence

Tests used separate application identities, WebView/data directories and synthetic sources. External networking was disabled using a user/network namespace with loopback retained. No normal TaskLens profile was opened or deleted.

| Check | Windows | Fedora |
| --- | --- | --- |
| Bundled OCR | Unverified; partner report pending | Pass, production BMP/TSV parser; English/Cebuano/Tagalog loaded |
| Model startup | Unverified | Pass, real CPU AVX2 Qwen3-4B |
| Text extraction | Unverified | Pass, native meeting date/time and both supplies reviewed/saved |
| Screenshot extraction | Unverified | Pass, synthetic midterm screenshot to native review |
| Review/save/restart | Unverified | Pass, correct date/time range and retained OCR/evidence |
| Cancellation/retry | Unverified | Pass, loading/generation cancellation then real inference |
| Offline operation | Unverified | Pass for the above native screenshot and cancellation runs |
| Multilingual correctness | Unverified | Gate open; full suite required |

Earlier acceptance evidence was written outside Git: `/tmp/TaskLens-acceptance-LE2GDX` (full native screenshot run), `/tmp/TaskLens-acceptance-GAChQl` (optimized validation/text checks), and `.local-ai/reliability-probe` (synthetic Rust transport diagnosis). These temporary directories were no longer present during the final publication audit. The measurements below record observations from those earlier runs; the temporary screenshots/receipts cannot currently be reopened. Re-run acceptance for fresh retained evidence. These paths are not application lookup paths.

Full screenshot run executable SHA-256: `6f535f800b33755a3dd4ef6d83339a47af012f06d366e27d554c7afdc4919346`. Optimized-validation build: `5d70d937f0e8a036e050c63a576ba76201fe09637630b2ed88a4cea5e33d8e77`. Both are dirty development acceptance builds using prompt version 7, not release artifacts. Final version-11 native acceptance has not yet been performed.

Measured full native screenshot run: OCR whole stage approximately 5.70 s (engine 2.10 s), model load 4.579 s, cold fixed prefix 69.235 s, request 140.466 s, screenshot through save 215.653 s. Request timing: prompt 259 tokens / 14.539 s; output 193 tokens / 125.890 s, about 1.525 tokens/s. Peak model RSS about 5,344 MiB, approximately 380% CPU, GPU offload disabled. These figures come from one CPU development run, not a controlled before/after inference optimization comparison. No OOM/segfault/process-termination evidence was found in accessible current-boot kernel logs; OOM is not a confirmed cause.

Native cancellation: loading 324.8 ms; generation 953.8 ms; subsequent constrained inference succeeded in 26.969 s including reload. The original screenshot shown by the user was not copied into test fixtures. Graduation fixtures are synthetic English, Cebuano and Tagalog text, including missing date, separate Mass/lunch and outfit requirements.

Real offline text capture → review/save passed in 219.755 s, including 87.004 s cold prefix and two inference attempts (52.868 s and 72.570 s). The existing bounded repair recovered the missing details. The saved action retained October 23, 2026 at 22:30 and both pencil and paper. Native review was visually inspected. This does not establish accuracy for other inputs.

## Reproduction

```sh
npm run test:native:ocr -- --unicode-path
npm run test:native:ocr -- --fixture graduation-cebuano
node scripts/build-native-acceptance.mjs
# Use the printed acceptance-run.json, never a normal-profile executable.
unshare -Urn sh -c 'ip link set lo up && exec node scripts/native-reliability-acceptance.mjs <receipt>'
# Separate invocations, no concurrent inference:
node scripts/native-reliability-acceptance.mjs <receipt> --cancel-only
node scripts/native-reliability-acceptance.mjs <receipt> --text-only
```

The shared harness validates the isolated receipt and executable hash. Linux requires tauri-driver/WebKitWebDriver; Windows uses WebView2 CDP on loopback. Reports/screenshots remain in the isolated profile. `--startup-only` measures resource initialization without model loading. The OCR smoke harness retains its own output directory and sanitized `report.json`; recognized diagnostic stderr can accompany successful output and is not alone a failure verdict.

Full accuracy gate (slow, budget tens of minutes; do not run alongside other inference/builds):

```sh
TASKLENS_EVAL=1 TASKLENS_EVAL_CPU=avx2 TASKLENS_EVAL_PREWARM=1 \
TASKLENS_EVAL_PREFIX_CACHE_DIR=.local-ai/audio-performance \
TASKLENS_EVAL_REPORT=reliability-v11-full \
npx vitest run src/services/extraction/evaluation/local-ai.eval.test.ts
```

The version-7 diagnostic run was stopped after its first failed graduation case; its partial result is retained in `docs/evaluation/reliability-v7-partial-baseline.json`. It is not a completed suite. The Node evaluator uses the production prompt/validator but is not the Rust transport or native UI acceptance. Its results must be reported separately. Baseline native probes showed missing fields/activities; schema-order repair alone did not eliminate the omitted lunch. Do not claim multilingual accuracy from a successful HTTP response.

## Deferred Windows handoff

Windows is outside the current Fedora-only verification scope. The existing exact-binary PE audit and OCR smoke tooling is retained for the partner. Preserve the failing executable identity and normal profile; do not rebuild or attribute antivirus interference without evidence. Windows OCR, runtime, complete review/save and offline acceptance remain unverified. No Windows crash cause or fix is confirmed. macOS is also unverified.

## Remaining work

For Fedora: complete and repair the strict multilingual accuracy gate, repeat native acceptance on version 11, retain fresh evidence, and perform controlled CPU tuning only after reliability/accuracy passes. Windows remains deferred. No smaller model, GPU backend, timeout extension, cloud fallback, model weight change or installer rebuild is part of this checkpoint. No overall completion or release readiness is claimed.

## Publication verification and known failures

`npm run check`, `npm run format:check`, `npm test` (125 passed, one opt-in evaluation skipped), `npm run build`, `node --test scripts/ai-assets.test.mjs` (3 passed), `cargo fmt --check`, `cargo check --locked`, and `cargo test --locked` (49 passed, 6 opt-in tests ignored) passed for the publication checkpoint. The frontend build retains its existing >500 kB chunk warning. Focused version-11 extraction/coverage tests passed 37/37. The real-model evaluation was not rerun for version 11 merely to publish this checkpoint.

The previous full isolated browser run passed 61/63 scenarios. Two five-second sample-preview waits timed out (Inbox and onboarding); both subsequently passed three isolated repetitions each. This is not a clean full-browser acceptance result. The final version-11 browser suite has not been rerun.

The completed **version-10 real-model suite failed**: 7/14 cases fully passed, with 18 failed assertions across the remaining seven cases, in approximately 27 minutes. All three synthetic graduation cases passed 17/17 checks each, including separate Mass/lunch, time range, venue, outfit, missing date and evidence. Other failures covered pencil/paper date preservation, English multi-action merging/header scheduling, Cebuano submission/cancellation, Tagalog clock omission, voice exam classification, noon start/arrival roles and a moved consultation/deadline. See [full machine-readable results](evaluation/reliability-v10-full.json) and [readable report](evaluation/reliability-v10-full.md). Version 11 addresses observed failure mechanisms, but its real-model accuracy is **unverified**; do not count the version-10 graduation passes as version-11 acceptance.

Intermediate versions 7–9 were diagnostic runs, some interrupted, and are retained as partial/failing reports. The focused version-10 Cebuano run passed; the full run above is the relevant completed gate. Synthetic attempt capture is opt-in and ignored under `.local-ai/evaluation-attempts`; it is separate from content-free application diagnostics.

During an earlier run the laptop was unplugged at 19% battery and reported an 800 MHz CPU ceiling. A later run reported a 4.2 GHz maximum. No OS power settings were changed. Measurements across those conditions do not establish an inference software speedup. The accessible current-boot logs contained no OOM termination evidence; the original Fedora transport failure is not proven to be OOM.

The user requested publication of the current checkpoint before final acceptance. Commit/push does not close the outstanding accuracy, native acceptance, browser or performance gates. No model weights, local profiles, private screenshots, raw user content or executable binaries are included.
