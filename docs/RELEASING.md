# Reproducible release and distribution

TaskLens 0.1.0 remains a pre-release candidate. Follow [RELEASE_CHECKLIST](../RELEASE_CHECKLIST.md); a successful build alone is not release approval. Nothing in this repository publishes a release, uploads an asset or creates a tag.

## Inputs and build

Use a clean committed checkout, lockfiles, Node 22.23.2 (`.node-version`) and Rust 1.99.0 (`rust-toolchain.toml`), plus the platform dependencies in README/LOCAL_AI. Record OS, compiler, package-manager and native build-tool versions. Source/model hashes are pinned in `src-tauri/resources/models.json`. Fixed inputs improve reproducibility; bit-for-bit installer reproducibility has not been established.

```sh
npm ci
npm run prepare:models
npm run build:runtimes
npm run prepare:notices
npm run verify:assets
npm run release:desktop -- --prepared
```

Without `--prepared`, release tooling prepares assets first. It always verifies assets, rejects dirty source, public credential-like `VITE_` variables and forced mock mode, checks that package/Tauri/Cargo versions match, and records the source commit and tree. It aborts if the checkout changes while packaging, so leave the clone untouched until it finishes. Do not bypass the clean-tree guard to ship unfinished collaborator changes.

| Host         | Output in `src-tauri/target/release/distribution/`         | Notes                                                                                                                                                                                                                                                                                                                                           |
| ------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux x86_64 | `TaskLens-<version>-linux-x86_64.rpm`, `.deb`, `.AppImage` | Needs roughly 9 GB of free memory: the RPM bundler holds the uncompressed payload in memory (OOM-killed on a 7.4 GiB laptop). Packages inherit the build host's glibc baseline; build on the oldest distribution you support. In WSL2, build inside the Linux filesystem, raise `memory=` in `.wslconfig`, and set `APPIMAGE_EXTRACT_AND_RUN=1` |
| Windows x64  | `TaskLens-Setup-<version>-windows-x64.exe`                 | Inno Setup 6.5.2+ (`TASKLENS_ISCC`). Supply the Microsoft-signed offline x64 WebView2 installer as `TASKLENS_WEBVIEW2_INSTALLER` and its `TASKLENS_WEBVIEW2_SHA256`; the installer runs it before copying files when WebView2 is absent                                                                                                         |
| macOS arm64  | `TaskLens-<version>-macos-arm64.dmg`                       | Uses Tauri `app,dmg` bundles                                                                                                                                                                                                                                                                                                                    |
| macOS x64    | `TaskLens-<version>-macos-x64.dmg`                         | Uses `src-tauri/tauri.intel.conf.json`; never built yet                                                                                                                                                                                                                                                                                         |

Signing is optional and verified when configured. On Windows, `TASKLENS_SIGN_CERT_THUMBPRINT` signs every staged executable and the installer through `scripts/windows-sign.ps1`, then `signtool verify` must pass. On macOS, Tauri's standard `APPLE_*` signing/notarization variables apply; with `APPLE_SIGNING_IDENTITY` set, the script requires `codesign --verify`, Gatekeeper assessment and a stapled ticket. Without credentials, artifacts are recorded as `unsigned` or `unverified-developer-id`. These are build inputs; never commit them.

## Inventory, checksums and oversized installers

The bundled models total **2,984,882,223 bytes**, so every complete installer is around 3 GB. GitHub requires each individual release asset to be **under 2 GiB** ([official release limits](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)).

Packaging therefore splits any installer at or above 2 GiB into 1 GiB parts, keeping the original:

```text
distribution/
  TaskLens-0.1.0-linux-x86_64.rpm
  parts/TaskLens-0.1.0-linux-x86_64.rpm/
    TaskLens-0.1.0-linux-x86_64.rpm.part001 …
    TaskLens-0.1.0-linux-x86_64.rpm.parts.json
  SHA256SUMS            # installers and every part
  release-assets.json   # sizes, hashes, signing state, parts manifest
```

Verify a distribution directory (this hashes every installer and part in place, without reassembling):

```sh
node scripts/release-artifacts.mjs src-tauri/target/release/distribution
```

`release-assets.json` keeps `downloadUrl: null` and `nativeAcceptance: "NOT RUN"` until a separately approved upload and acceptance. Upload parts, manifests and `SHA256SUMS` only after owner approval. Do not upload an oversized original as a GitHub asset.

## Reassembling a split installer

The Node reassembler checks paths, order, part sizes and every hash, refuses to overwrite an existing file and removes incomplete output on failure:

```sh
node scripts/release-parts.mjs join /absolute/parts/TaskLens-0.1.0-linux-x86_64.rpm/TaskLens-0.1.0-linux-x86_64.rpm.parts.json /absolute/reassembled
sha256sum /absolute/reassembled/TaskLens-0.1.0-linux-x86_64.rpm        # Windows: Get-FileHash -Algorithm SHA256
```

Compare the result with `SHA256SUMS`. Do not run an installer until reassembly verification succeeds. Node is required for this helper; a signed native end-user reassembler is not included, so Windows end-user delivery remains an acceptance gap. Checksums provide integrity only when obtained through a trusted channel; they are not publisher signatures.

Installation commands for end users will be added here only after a published artifact has been installed and verified on its target OS.

## Publication gate

Require green CI for the exact intended commit, current platform evidence, approved release notes/demo and owner release approval. Enable protected main, secret scanning/push protection and private reporting where available. Do not infer approval from an older PR's status. Keep historical evaluations and document known limitations in release notes. Publication/tagging is a separate owner decision.

## CI

`quality.yml` is the fast gate on every PR and push to main: types, lint, formatting, docs links, unit/release/asset tests, npm and cargo audits, secret scans and the browser suite. `native-voice.yml` runs on PRs touching native paths and on main: per-OS asset preparation, Rust tests, and, only when manually dispatched with `package: true`, candidate packaging plus artifact verification. Windows packaging stops as BLOCKED until the `TASKLENS_WEBVIEW2_*` and `TASKLENS_INNO_*` URL/SHA-256 repository variables are set. Candidates are uploaded as short-lived CI artifacts, never as releases.
