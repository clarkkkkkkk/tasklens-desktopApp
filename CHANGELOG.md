# Changelog

## 0.1.0 — Unreleased prerelease preparation

- Preserve local Qwen3-4B, Whisper Small, Tesseract and optional consent-controlled Groq BYOK workflows.
- Include the existing guided workspace tour and bounded native input/HTTP security fixes.
- Prepare consistently named RPM, DEB, AppImage, Windows offline EXE and architecture-specific macOS DMG packages.
- Add optional Windows signing, offline WebView2 validation, macOS Keychain support and Intel runtime preparation.
- Require clean-source packaging and emit SHA-256 manifests with explicit unpublished download locations.
- Separate validation, native preparation, packaging and artifact checks in CI; retain publication as an approved manual operation.
- Patch the Vitest development dependency to 4.1.12.

This is not a published release. Clean-machine acceptance, approved large-file hosting, signing/notarization and native Windows/macOS verification remain incomplete. See [production readiness](docs/release/PRODUCTION_READINESS.md).
