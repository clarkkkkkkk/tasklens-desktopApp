# TaskLens distribution and installation

Release status: **NOT READY**. Version: **0.1.0**, prerelease candidate. No public installer or verified download URL is available. This document describes candidate installation and the gated publication procedure; it is not a download announcement.

## Hosting decision

Preserve the complete offline installation: Qwen3-4B Q4_K_M (2,497,280,256 bytes), Whisper Small multilingual (487,601,967 bytes), baseline/AVX2 native runtimes where applicable, Tesseract and eng/ceb/tgl language data. No first-launch model download, smaller-model substitution, account or required backend.

[GitHub permits each release asset under 2 GiB](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). Earlier Linux artifacts are already above this limit: RPM 3,117,766,141 bytes and AppImage 3,020,552,696 bytes. Those are historical builds, not this candidate. Measure every final installer after signing.

The selected solution is a trusted large-file host with immutable versioned HTTPS download URLs and the complete ordinary installer as one file. **Host selection, owner approval, credentials, upload, retention/bandwidth policy and download verification are BLOCKED.** Do not invent a bucket, domain, download URL or free-host promise. GitHub hosts release notes, notices, checksums and manifests; eligible installers may also be attached directly. Existing split/join tools are retained but are not invoked by release packaging or offered as the selected distribution flow.

After separately approved upload, fetch every complete artifact to an empty directory, compare its byte size and SHA-256 with the locally verified final file, then populate `downloadUrl` and `downloadVerified` in the manifest. A manifest is not proof of authenticity by itself: distribute it through the official repository and verify code signatures where available. Redirect destinations and host ownership must be reviewed.

## Candidate filenames

| Target | Required filename |
| --- | --- |
| Windows x64 | `TaskLens-Setup-0.1.0-windows-x64.exe` |
| Fedora x64 | `TaskLens-0.1.0-linux-x86_64.rpm` |
| Ubuntu x64 | `TaskLens-0.1.0-linux-x86_64.deb` |
| Linux portable x64 | `TaskLens-0.1.0-linux-x86_64.AppImage` |
| macOS Apple Silicon | `TaskLens-0.1.0-macos-arm64.dmg` |
| macOS Intel | `TaskLens-0.1.0-macos-x64.dmg` |

Names are the packaging contract, not a claim that all artifacts exist. See [the platform matrix](PLATFORM_TEST_MATRIX.md). Public download commands must be generated only after actual published URLs resolve; none are supplied yet.

## Local candidate installation commands

These are preparation examples for locally supplied, checksum-verified candidate files. They do not download a published release. Obtain `SHA256SUMS` alongside the candidate from the trusted maintainer; check only the file being installed (a platform directory can contain several installers).

Fedora:

```sh
sha256sum --ignore-missing --check SHA256SUMS
sudo dnf install ./TaskLens-0.1.0-linux-x86_64.rpm
```

Ubuntu/Debian package installation (Ubuntu 24.04 is the intended initial test baseline; other versions are unverified):

```sh
sha256sum --ignore-missing --check SHA256SUMS
sudo apt install ./TaskLens-0.1.0-linux-x86_64.deb
```

AppImage:

```sh
sha256sum --ignore-missing --check SHA256SUMS
chmod +x TaskLens-0.1.0-linux-x86_64.AppImage
./TaskLens-0.1.0-linux-x86_64.AppImage
```

Confirm that checksum checking actually reports the intended filename as OK before installing. RPM/DEB provide desktop entries. AppImage is portable; system-wide desktop integration is not currently automated. FUSE requirements and extracted execution must be tested on each documented distribution. Installing an RPM/DEB may fetch standard system dependencies; AI resources remain bundled.

Windows PowerShell, after downloading the actual EXE and checksums from future approved release links:

```powershell
$file = 'TaskLens-Setup-0.1.0-windows-x64.exe'
$line = Get-Content -LiteralPath './SHA256SUMS' | Where-Object { $_ -match ('^[a-fA-F0-9]{64}  ' + [regex]::Escape($file) + '$') }
if (@($line).Count -ne 1) { throw 'Missing or duplicate installer checksum' }
$expected = ($line -split '  ', 2)[0]
if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $expected) { throw 'Checksum mismatch' }
$installer = Start-Process -FilePath (Join-Path $PWD $file) -Wait -PassThru
if ($installer.ExitCode -ne 0) { throw "Installer exited with $($installer.ExitCode)" }
```

Graphically, double-click the EXE, follow installation, optionally select the desktop shortcut, then launch from Start. Uninstall using Windows Settings. Unsigned candidates do not have verified publisher identity and may trigger SmartScreen. Authenticode and clean Windows installation remain separate gates.

macOS, choose the matching architecture with `uname -m` (`arm64` versus `x86_64`). After obtaining the actual candidate DMG and checksum file:

```sh
# Apple Silicon example; use macos-x64 for Intel.
file=TaskLens-0.1.0-macos-arm64.dmg
expected=$(awk -v file="$file" '$2 == file { print $1 }' SHA256SUMS)
[ "${#expected}" -eq 64 ] || exit 1
printf '%s  %s\n' "$expected" "$file" | shasum -a 256 -c - || exit 1
mountpoint=$(mktemp -d /tmp/tasklens-dmg.XXXXXX) || exit 1
hdiutil attach -readonly -nobrowse -mountpoint "$mountpoint" "$file" || exit 1
# Close TaskLens before replacement. Test upgrades in a disposable account first.
sudo ditto "$mountpoint/TaskLens.app" /Applications/TaskLens.app
hdiutil detach "$mountpoint"
rmdir "$mountpoint"
open /Applications/TaskLens.app
```

Graphically, mount the matching DMG and drag TaskLens into Applications. These macOS instructions require native verification before being advertised as verified. Do not disable Gatekeeper or remove quarantine as the standard installation flow. Developer ID, notarization and clean-machine Gatekeeper acceptance are pending.

## Building candidates

Use Node from `.node-version`, Rust from `rust-toolchain.toml`, committed lockfiles and native platform prerequisites. First prepare models, runtimes and notices, then commit reviewed candidate source and run:

```sh
npm ci
npm run prepare:models
npm run build:runtimes
npm run prepare:notices
npm run release:desktop -- --prepared
node scripts/release-artifacts.mjs src-tauri/target/release/distribution
```

`--prepared` still verifies asset hashes, runtime provenance and dependencies. Omit it to repeat preparation. The wrapper requires a clean worktree; clears only generated bundle/distribution/staging directories; enforces matching package/Tauri/Cargo versions; produces the exact filenames above; and writes `release-assets.json` and `SHA256SUMS`. It never publishes. Generated artifacts are under `src-tauri/target/release/distribution/` and are excluded from Git.

Windows additionally requires Inno Setup 6.5.2+, `TASKLENS_ISCC`, `TASKLENS_WEBVIEW2_INSTALLER` and `TASKLENS_WEBVIEW2_SHA256`. Obtain the x64 offline Evergreen standalone payload from Microsoft and verify its hash, signature and actual x64 runtime installation. PE wrapper architecture alone does not establish payload architecture. The script rejects small bootstrapper payloads and invalid Microsoft signatures. Do not use a mutable download as the integrity reference. CI repository variables also require HTTPS URLs and approved hashes for WebView2 and Inno.

For optional Windows signing, install the code-signing certificate in the build account and set `TASKLENS_SIGN_CERT_THUMBPRINT`; `signtool.exe` must be on PATH. Inno signs the setup and uninstaller; the wrapper signs staged application/sidecar executables and verifies signatures. Signing credentials never enter frontend configuration.

For macOS use [Tauri's Developer ID and notarization variables](https://v2.tauri.app/distribute/sign/macos/), including `APPLE_SIGNING_IDENTITY` and the chosen Apple API credentials in a protected build environment. The wrapper checks codesign, Gatekeeper assessment and stapled ticket when Developer ID signing is requested. Unsigned/ad-hoc candidates remain unverified. Intel uses the explicit `tauri.intel.conf.json` sidecar overlay; ARM64 must not receive x86 AVX2 binaries.

No Homebrew tap, WinGet manifest, APT repository, DNF repository or automatic updater channel is implemented.

## Troubleshooting

- **SmartScreen:** check provenance and SHA-256; unsigned builds cannot claim verified publisher identity. Prefer a future signed release.
- **Gatekeeper:** verify matching architecture, signature and notarization. Report rejection; use a properly signed candidate rather than disabling OS protections.
- **Missing Linux libraries:** capture the missing soname, distribution/version, `ldd` output and package dependency metadata. Install the distribution's runtime packages; report packaging omissions. A developer-host build does not prove Ubuntu compatibility.
- **Unsupported CPU:** report CPU flags and selected baseline/AVX2 sidecar. Never force AVX2. ARM64 and Intel use different macOS installers.
- **Model integrity failure:** retry validation or reinstall the trusted complete package. Keep user data; do not substitute downloaded model files.
- **Microphone:** grant TaskLens permission in OS settings and select a working input. Imported audio is a separate path from live capture.
- **Offline startup:** allow local verification to finish; no model download is expected. Check resource files and native sidecar failures.
- **Groq:** verify explicit consent, own API key, native credential store and internet access. Rate limits belong to the user's account. Do not paste keys into logs or issue reports. Local mode remains available without a cloud account.
