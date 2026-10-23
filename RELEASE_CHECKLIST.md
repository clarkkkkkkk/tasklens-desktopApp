# Release checklist — audit candidate 0.1.0

Base: `374f692afe22de55bb80472035006e67919ddf44`. **NOT READY.** PASS means an executed check; NOT RUN is not acceptance. This checklist is updated with isolated-worktree results below. Historical shared-worktree checks are not substituted for current candidate evidence.

| Gate                                                       | Status  | Evidence / next action                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git history and scoped tree secret scans                   | PASS    | Gitleaks 8.30.1, zero findings; final candidate scan recorded below                                                                                                                                                        |
| npm dependency audit                                       | PASS    | Vitest 4.1.12 graph, zero vulnerabilities                                                                                                                                                                                  |
| Cargo dependency security                                  | FAIL    | Zero vulnerabilities but eight unresolved advisory warnings, including unsound glib                                                                                                                                        |
| TypeScript / ESLint / formatting                           | PASS    | Isolated `npm run check`, `format:check`; Rust fmt also passed                                                                                                                                                             |
| Unit / Rust / release / asset tests                        | PASS    | 144 unit passed after integration, 2 opt-in skipped; 76 Rust passed, 8 ignored; 2 release and 3 asset tests passed                                                                                                         |
| Full browser suite                                         | FAIL    | Audit run: 68 passed, 29 failed in 21.1 minutes on port 1492 under concurrent build load. Restart test separately passed on standard port 1420. Other failures unresolved.                                                 |
| Production frontend build / docs links                     | PASS    | Vite production build; local links in 58 Markdown files validated                                                                                                                                                          |
| Asset integrity and licensing                              | PASS    | `verify:assets`: 3,062,001,808 bytes, pinned hashes/runtime receipt and dependency checks; notices present in inspected historical RPM                                                                                     |
| Native Qwen extraction                                     | FAIL    | Real simple-English probe: MODEL_LOAD_FAILED, 206,284 ms load                                                                                                                                                              |
| Current multilingual extraction                            | NOT RUN | Historical 110/128 checks retained; not current acceptance                                                                                                                                                                 |
| Real Groq key/requests/latency                             | NOT RUN | Explicit test key unavailable; no production credential borrowed                                                                                                                                                           |
| Fedora native app and credential acceptance                | PASS    | 12 native app checks passed; synthetic Secret Service write/read/remove/absence across processes passed; real OCR smoke passed. No live extraction.                                                                        |
| Current native voice/inference and clean installer restart | NOT RUN | Browser/sample save and native sidebar restart do not prove real voice extraction or fresh installation                                                                                                                    |
| Windows installer / credential / reminders                 | NOT RUN | Windows host unavailable                                                                                                                                                                                                   |
| Fedora fresh install / uninstall / offline startup         | NOT RUN | Disposable clean system acceptance required                                                                                                                                                                                |
| Physical touchpad / assistive technology                   | NOT RUN | Device-assisted acceptance required                                                                                                                                                                                        |
| Production packages                                        | PASS    | Clean audit commit f0f1c60 built RPM (3,132,677,361 bytes) and AppImage (3,024,558,584 bytes), split manifests and SHA256SUMS. Published guided-tour main was integrated later; packages do not match that newer frontend. |
| Final integrated-commit installer acceptance               | NOT RUN | Rebuild and clean-install final chosen release commit                                                                                                                                                                      |
| Complete-installer split/reassembly                        | PASS    | Historical 3,020,552,696-byte AppImage split and reassembled; independent SHA256 comparison matched. Current audit installers split and checksummed; current-installer reassembly and Windows user flow not rerun.         |
| Exact intended release commit CI                           | NOT RUN | Must be green after push; older PR runs do not count                                                                                                                                                                       |
| Repository protections / private reporting                 | FAIL    | Disabled/unprotected at read-only inspection; owner action                                                                                                                                                                 |
| Approved native demo video                                 | NOT RUN | See DEMO_CHECKLIST; no recording link approved                                                                                                                                                                             |
| Publication / signing / release tag                        | NOT RUN | Owner decision; no release published                                                                                                                                                                                       |

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
