# Local AI work and main integration — 2026-10-18

## Scope and history

This integration preserves unfinished offline AI implementation and evaluation work while incorporating the partner developer’s latest main changes. It does not certify release readiness or real-model accuracy.

- Original local main: `e3acbd6032d967881ea265ab341f97714d4803d9`.
- Reviewed WIP checkpoint: `871354596a8318bdcfd3e74542ce22fbcf8cfc8f` (`wip(ai): preserve local inference improvements before main integration`).
- Integrated upstream main: `cf09166ef41d65470d1211f4894399403d2b52cb`.
- Two-parent merge: `8f32047a9fcf08a3cf021a74995c2ca499ffbaef`.

A complete private snapshot, binary patch and verified Git bundles preserve the original repository, including untracked evaluations, ignored weights and native runtimes. Eighteen reviewed implementation/documentation/evaluation files entered the checkpoint. The microphone-device report remains untracked because it contains machine-local paths. No weights or private backup files are part of this change.

## Integrated behavior

Main contributes compact-output Qwen prompt v7, static prompt-prefix prewarming and disk KV caching, explicit time-range end derivation, a 60-second Keep waiting/Cancel notice, evaluation timing/RSS instrumentation, and Linux/Windows packaging corrections. Missing compact fields are normalized before existing validation. The static prefix is cached before user source content is submitted.

The local changes retain repair-text sanitization, strict evaluation checks and opt-in sampling diagnostics. Invalid/silent audio is rejected before evicting a warm extraction server; valid speech still uses the shared inference gate and stops llama-server before Whisper loads. Both developers’ regression cases remain.

Qwen3-4B remains the bundled extraction model. Experimental 1.7B comparisons do not change model selection. Resource pins, local-only inference, task storage, onboarding state and action schema remain unchanged. No cloud inference or mock fallback was added.

## Conflict resolutions

Four files required manual resolution:

- `LOCAL_AI.md`: combined compact-output/cache documentation with local lifecycle work and historical evaluation results.
- `src/services/extraction/prompts/build-prompt.ts`: shared static Qwen prefix plus sanitized repair text.
- `src/services/extraction/local-ai.test.ts`: retained both regression sets and checked the repair prefix.
- `src/services/extraction/evaluation/local-ai.eval.test.ts`: combined sampling diagnostics with model/runtime/prewarm/RSS/context/report instrumentation.

Architecture, technology, implementation-report, developer and tracker documents were aligned with the merged implementation. The historical local chat-demonstration v7/v8 candidates differ from main’s compact-output v7; their archived results must not be treated as validation of this integration.

## Verification on integrated source

| Command                                                                          | Observed result                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `npm run check`                                                                  | TypeScript and lint passed                             |
| `npm run format:check`                                                           | Passed                                                 |
| `npm test`                                                                       | 62 passed; one opt-in real-model test skipped          |
| `npm run build`                                                                  | Passed                                                 |
| `npm run test:assets`                                                            | 2 passed                                               |
| `cargo check --locked --manifest-path src-tauri/Cargo.toml`                      | Passed                                                 |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`                      | Passed                                                 |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml`                       | 17 passed; two opt-in OCR/codec tests ignored          |
| `npx playwright test tests/inbox-safety.spec.ts tests/voice.spec.ts --workers=1` | 6 passed; actual run used an external output directory |
| `git diff --check`                                                               | Passed                                                 |

Browser tests cover the elapsed waiting/cancel notice, no automatic save and voice UI behavior through injected services. They do not prove real inference. The full slow multilingual evaluation and multi-gigabyte installer rebuilds were intentionally excluded from this Git integration. No new performance improvement is claimed from these checks alone.

## Open acceptance gates

- Run the complete integrated compact-output v7 Qwen3-4B multilingual evaluation. Historical v6 was 64/77 and failed its accuracy gate.
- Verify installed offline text, screenshot-to-action and voice-to-action workflows, review/save, Source Trace and restart persistence on the integrated build.
- Verify the updated silent-audio lifecycle in the native application and measure end-to-end latency/RSS.
- Rebuild release artifacts after final prompt acceptance; older RPM/AppImage artifacts do not contain this merge.
- Complete Windows/macOS native builds, signing and actual-platform acceptance.

The code is suitable for review as unfinished integration work. Passing compilation and mocked browser checks does not make the offline AI release production-ready.
