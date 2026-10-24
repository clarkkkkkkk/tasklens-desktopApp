# GitHub-only downloads

Status: **preparation, NOT READY**. The only official distribution destination is [TaskLens GitHub Releases](https://github.com/clarkkkkkkk/tasklens-desktopApp/releases). There are no public verified installer links yet. A draft is visible only to authorized repository members. Never use Actions artifacts as permanent public downloads.

Complete installers retain Qwen3-4B, Whisper Small, native OCR and language data. Installers at or above 2 GiB are split into approximately 1 GiB numbered files. Parts are transport files, not individual models or executable installers. Reconstructing them produces the original offline installer byte for byte. No application model downloads are introduced.

## Ordinary-user installation

On the eventual published release, choose your exact platform/architecture and download:

1. Every numbered part of that installer, starting at `.part001`.
2. `SHA256SUMS` and the release manifest.
3. `TaskLens-reconstruct.ps1` for Windows or `TaskLens-reconstruct.sh` for Linux/macOS.

Put them in one new folder. Review the reconstruction script before running it. Obtain all files from the same official release; checksums establish integrity through that trusted channel, not a publisher signature. Allow disk space for both parts and the reconstructed installer (about 6 GB), plus installation space. No Node.js, Python or Rust is needed. Linux/macOS use the system shell, SHA-256 utility and, for optional downloads, curl. Windows uses built-in PowerShell 5.1 or later.

The following are **local candidate examples**, not published download claims:

```sh
# Fedora: reconstruct, then use the normal installer.
sh ./TaskLens-reconstruct.sh TaskLens-0.1.0-linux-x86_64.rpm
sudo dnf install ./TaskLens-0.1.0-linux-x86_64.rpm

# Ubuntu, using the DEB parts instead:
sh ./TaskLens-reconstruct.sh TaskLens-0.1.0-linux-x86_64.deb
sudo apt install ./TaskLens-0.1.0-linux-x86_64.deb

# Portable Linux, using the AppImage parts instead:
sh ./TaskLens-reconstruct.sh TaskLens-0.1.0-linux-x86_64.AppImage
chmod +x ./TaskLens-0.1.0-linux-x86_64.AppImage
./TaskLens-0.1.0-linux-x86_64.AppImage

# macOS: use arm64 for Apple Silicon; use x64 only when that platform is verified.
sh ./TaskLens-reconstruct.sh TaskLens-0.1.0-macos-arm64.dmg
hdiutil attach -readonly -nobrowse ./TaskLens-0.1.0-macos-arm64.dmg
# Drag TaskLens.app from the mounted disk to Applications, then eject it.
```

Windows, from PowerShell in the downloaded folder:

```powershell
& ./TaskLens-reconstruct.ps1 -Installer 'TaskLens-Setup-0.1.0-windows-x64.exe'
# Only after reconstruction reports success:
Start-Process -FilePath './TaskLens-Setup-0.1.0-windows-x64.exe' -Wait
```

Use the normal Windows execution-policy rules; do not disable machine-wide policy to run a script. A downloaded script may require review and `Unblock-File` under the user's policy. Double-click the verified reconstructed EXE for graphical installation. Unsigned installers can trigger SmartScreen; no verified publisher is claimed without Authenticode.

The optional `--download RELEASE_TAG` (shell) or `-DownloadTag RELEASE_TAG` (PowerShell) retrieves missing checksums/parts from this fixed official GitHub repository. Use an actual published tag from the release page; no speculative tag-download command is advertised here. Scripts verify each downloaded part and the final installer before producing the output. Existing installers are never overwritten. Missing, corrupted, duplicated or out-of-order parts fail safely. No installer is automatically executed.

If verification fails, do not install. Remove only the named bad part and download it again from the same release. A failed reconstruction removes its own temporary output and preserves user files. An existing reconstructed installer must be checked or moved deliberately before retrying.

## Maintainer verification and draft gate

`npm run release:desktop -- --prepared` builds from a clean committed checkout, splits oversized complete installers, and produces manifests and complete/per-part hashes. `npm run verify:release -- DIRECTORY` verifies originals, every part and the checksum inventory. Upload only eligible originals or numbered parts, manifests, checksums, notices and reconstruction scripts. Never upload originals at or above 2 GiB or commit binaries/parts to Git.

Before publication, download every draft asset through authenticated GitHub access into an empty directory, verify hashes, reconstruct each platform installer using that platform's script, and compare complete size/hash with its original. Record separate packaging, reconstruction, installation and native acceptance statuses. A shell test on Fedora cannot certify PowerShell on Windows or Gatekeeper on macOS. Keep the release draft until all required security and advertised-platform acceptance gates pass.

The separate website repository’s Download page was updated at source `98e6cc1`. Vercel reports success and HTTPS 200 at `https://www.tasklens.site/download` includes these instructions while retaining the no-public-installer disclosure. That verifies the website content deployment, not desktop-package acceptance. No unverified package download buttons are enabled.
