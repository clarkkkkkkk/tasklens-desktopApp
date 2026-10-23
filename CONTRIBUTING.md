# Contributing

Read [README](README.md), [architecture](ARCHITECTURE.md), [design contract](DESIGN_SKILL.md), [security policy](SECURITY.md) and [code of conduct](CODE_OF_CONDUCT.md). Check existing issues before expanding scope. UI/product and domain/native contributors share the same repository: never reset or overwrite another developer's work.

## Setup

Use Node 22.23.2 (minimum 22.12), Rust 1.99.0 and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Fedora needs compiler/CMake, GTK3/WebKitGTK4.1, ALSA, D-Bus and appindicator development packages. Windows needs the MSVC toolchain/CMake and WebView2; full offline installers additionally require verified offline WebView2 and Inno Setup. See [LOCAL_AI.md](LOCAL_AI.md).

```sh
npm ci
npm run dev                    # labelled browser/mock workflow
npm run prepare:models         # network access at build/preparation time
npm run build:runtimes
npm run prepare:notices
npm run tauri dev              # actual native application
```

Never supply a real key to browser fixtures or ordinary CI. Use synthetic content. Installed Local-mode inference uses bundled assets; do not replace it with a downloader to shrink a release.

## Changes and review

Create a focused branch such as `codex/fix-description` or `feature/description`. Inspect status first. Keep repository contracts backwards compatible; add a tested migration when changing a durable schema. Components consume the repository/service interfaces instead of bypassing task storage. Preserve Source Trace, cancellation, privacy consent and review-before-save.

Use descriptive commits (`fix: preserve draft after storage failure`). A PR should describe the trigger, resulting behavior, validation and unresolved platform limits; include synthetic screenshots for UI changes. UI reviews cover keyboard/focus/design behavior; native reviews cover contracts, permissions, storage, resources and migrations. New visual conventions require an intentional design-contract update.

## Checks

```sh
npm run check
npm run format:check
npm run docs:check
npm test
npm run test:assets
npm run test:release
npx playwright install chromium
npm run test:e2e
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm audit
cargo audit --file src-tauri/Cargo.lock
```

Rust compilation needs prepared resource receipts. CI prepares assets before native checks. The real-model suites and secure-store acceptance are opt-in and can be slow. A passing browser/mock test is not Windows/native/inference evidence. Record commit, platform, commands, outcome and limitations. Do not change historical evaluation numbers to imply improved quality.

For secret scanning install verified Gitleaks 8.30.1, then run `gitleaks git --log-opts='--all --full-history' --redact=100 .` and `gitleaks dir --redact=100 dist`; also scan your scoped working tree and ignored `.env` files privately. Never publish unredacted findings.

## Release and security

[Release instructions](docs/RELEASING.md) and the [release checklist](RELEASE_CHECKLIST.md) govern packaging. Do not publish, tag, sign with another person's identity, push to protected branches or bypass required checks without owner authorization. Test installed packages on their actual OS. A successful old PR is not evidence for current main.

Follow [SECURITY.md](SECURITY.md) for private reports. Contributions are under the repository's [MIT license](LICENSE); dependencies retain their own license obligations. Do not add shared API keys, analytics, additional hosted infrastructure or generated models/binaries to Git.
