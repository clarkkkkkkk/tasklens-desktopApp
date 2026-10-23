# Release checklist — audit candidate 0.1.0

Base: `374f692afe22de55bb80472035006e67919ddf44`. **NOT READY.** PASS means an executed check; NOT RUN is not acceptance. This checklist is updated with isolated-worktree results below. Historical shared-worktree checks are not substituted for current candidate evidence.

| Gate                                               | Status  | Evidence / next action                                                              |
| -------------------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| Git history and scoped tree secret scans           | PASS    | Gitleaks 8.30.1, zero findings; final candidate scan recorded below                 |
| npm dependency audit                               | PASS    | Vitest 4.1.12 graph, zero vulnerabilities                                           |
| Cargo dependency security                          | FAIL    | Zero vulnerabilities but eight unresolved advisory warnings, including unsound glib |
| TypeScript / ESLint / formatting | PASS | Isolated `npm run check`, `format:check`; Rust fmt also passed |
| Unit / Rust / release / asset tests | PASS | 138 unit passed, 2 opt-in skipped; 76 Rust passed, 8 ignored; 2 release and 3 asset tests passed |
| Full browser suite | RUNNING | Initial timing failures recorded; not a passed gate |
| Production frontend build / docs links | PASS | Vite production build; local links in 58 Markdown files validated |
| Asset integrity and licensing | PASS | `verify:assets`: 3,062,001,808 bytes, pinned hashes/runtime receipt and dependency checks; notices present in inspected historical RPM |
| Native Qwen extraction                             | FAIL    | Real simple-English probe: MODEL_LOAD_FAILED, 206,284 ms load                       |
| Current multilingual extraction                    | NOT RUN | Historical 110/128 checks retained; not current acceptance                          |
| Real Groq key/requests/latency                     | NOT RUN | Explicit test key unavailable; no production credential borrowed                    |
| Current native OCR/voice/review/save/restart       | NOT RUN | Need current isolated native workflow evidence                                      |
| Windows installer / credential / reminders         | NOT RUN | Windows host unavailable                                                            |
| Fedora fresh install / uninstall / offline startup | NOT RUN | Disposable clean system acceptance required                                         |
| Physical touchpad / assistive technology           | NOT RUN | Device-assisted acceptance required                                                 |
| Exact-commit production package inspection         | NOT RUN | Old packages excluded as current evidence                                           |
| Complete-installer split/reassembly                | NOT RUN | Unit test alone does not validate actual installer delivery                         |
| Exact intended release commit CI                   | NOT RUN | Must be green after push; older PR runs do not count                                |
| Repository protections / private reporting         | FAIL    | Disabled/unprotected at read-only inspection; owner action                          |
| Approved native demo video                         | NOT RUN | See DEMO_CHECKLIST; no recording link approved                                      |
| Publication / signing / release tag                | NOT RUN | Owner decision; no release published                                                |

## Commands

```sh
npm ci
npm run check
npm run format:check
npm run docs:check
npm test
npm run test:assets
npm run test:release
npm run build
npm run test:e2e
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo audit --file src-tauri/Cargo.lock
npm audit
npm run verify:assets
```

Run native acceptance only with an isolated application identifier/profile and the corresponding build receipt. Never use the production credential namespace for test credentials. Clean release build instructions and artifact validation: [docs/RELEASING](docs/RELEASING.md).
