# Reproducible release and distribution

TaskLens 0.1.0 remains a pre-release candidate. Follow [RELEASE_CHECKLIST](../RELEASE_CHECKLIST.md); a successful build alone is not release approval. No publication is automated by the audit.

## Inputs and build

Use a clean committed checkout, lockfiles, Node 22.23.2 and Rust 1.99.0 as pinned in CI, plus the platform dependencies in README/LOCAL_AI. Record OS, compiler, package-manager and native build-tool versions. Source/model hashes are pinned in `src-tauri/resources/models.json`. Fixed inputs improve reproducibility; bit-for-bit installer reproducibility has not been established.

```sh
npm ci
npm run prepare:models
npm run build:runtimes
npm run prepare:notices
npm run verify:assets
npm run release:desktop -- --prepared
```

Without `--prepared`, release tooling prepares assets first. It always verifies assets, rejects dirty source and public credential-like environment variables/forced mock mode, checks package/Tauri/Cargo versions, and records the source commit. Do not bypass the clean-tree guard to ship unfinished collaborator changes.

Linux builds RPM/AppImage. Windows uses the existing Inno offline installer path because the all-in-one payload exceeds ordinary NSIS constraints. Supply the independently verified offline WebView2 installer path and SHA-256 via `TASKLENS_WEBVIEW2_INSTALLER` and `TASKLENS_WEBVIEW2_SHA256`; these are build inputs, not credentials. Windows installation/signing acceptance remains required. No automatic online model downloader replaces the bundled weights.

The release script reports only newly produced installer files, writes `release-assets.json` and `SHA256SUMS`, and rejects source changes during packaging. Verify each packaged model, OCR language and runtime against the manifest; inspect license notices inside the package. Verify actual installation, offline first launch, source capture, review/save, restart persistence, reminders and uninstall on disposable target systems.

## Asset-size constraint

The bundled models total **2,984,882,223 bytes**. Existing Fedora installers were roughly 2.9–3.0 GB and predate this audit; they are not current release evidence. GitHub requires each individual release asset to be **under 2 GiB** ([official release limits](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)). A complete all-in-one installer cannot be uploaded as one such asset.

`scripts/release-parts.mjs` splits the complete installer into 1 GiB parts, retaining the original. A manifest records order, sizes and SHA-256 for every part and the full installer. This preserves the offline product; all parts must be downloaded before installation. Upload parts, manifest and checksums only after owner approval. Do not upload the oversized original as a GitHub asset.

```sh
node scripts/release-parts.mjs split /absolute/TaskLens.AppImage /absolute/distribution
node scripts/release-parts.mjs join /absolute/distribution/TaskLens.AppImage.parts.json /absolute/reassembled
```

Use the actual manifest filename emitted by the splitter. The Node reassembler is portable, checks safe paths/order/size/hash and refuses to overwrite an existing file. It removes its incomplete output on failure. Do not run an installer until reassembly verification succeeds. Node is currently required for this verified helper; a signed native end-user reassembler is not included. Windows end-user delivery remains an acceptance gap, not a claimed frictionless experience.

Verify the final hash independently (`sha256sum` on Fedora; `Get-FileHash -Algorithm SHA256` on Windows). Checksums provide integrity only when obtained through a trusted channel; they are not publisher signatures. No signing certificate or signing result is claimed.

## Publication gate

Require green CI for the exact intended commit, current platform evidence, approved release notes/demo and owner release approval. Enable protected main, secret scanning/push protection and private reporting where available. Do not infer approval from an older PR's status. Keep historical evaluations and document known limitations in release notes. Publication/tagging is a separate owner decision from committing the audit.
