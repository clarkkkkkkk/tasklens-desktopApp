# TaskLens 0.1.0 — prerelease draft

**Unpublished. Current production status: NOT READY.** These notes must be regenerated against the exact approved candidate before publication.

TaskLens turns screenshots, typed information and voice into reviewed local tasks. The intended offline packages bundle Qwen3-4B Q4_K_M, Whisper Small multilingual, native OCR and required language data. Optional Groq BYOK remains consent-controlled; no account or shared key is required for offline use.

This preparation adds consistent installer names/checksum manifests, DEB packaging, Windows offline installer hardening and optional signing, macOS Keychain/Intel preparation, and separated release validation jobs. Existing collaborator runtime fixes and the guided workspace tour are preserved.

## Downloads

No public download locations have been verified. Do not publish this draft with fabricated links. Attach the final manifest/checksums, notices, reconstruction scripts and GitHub-sized parts only after byte verification. Keep the draft unpublished until native acceptance and downloaded-asset verification pass. Use the artifact inventory produced by the approved build.

## Limitations

- Native platform coverage is incomplete. Consult PLATFORM_TEST_MATRIX.md for executed results; compilation and package generation alone do not certify runtime support.
- Windows/macOS signing, Gatekeeper/SmartScreen, real microphone behavior and clean upgrade acceptance require native environments and credentials where applicable.
- Intel macOS is unverified.
- Full offline installers exceed GitHub’s per-file limit. The owner selected GitHub-only numbered parts with native shell/PowerShell reconstruction; no external host is used.
- Task data, the delivery journal and backups are unencrypted. Tasks remain in localStorage; SQLite is a reminder delivery journal. Backup import and automatic launch-at-startup are unfinished.
- Reminders are opt-in; OS submission does not guarantee visible notification delivery.
- Real Groq inference requires the user's key and explicit consent. Live acceptance is blocked without an authorized test key.
- Security review retains the transitive GLib unsoundness and Cargo maintenance advisories.

See DISTRIBUTION.md for candidate installation instructions and troubleshooting, and PRODUCTION_READINESS.md for the final verdict and evidence. No automatic update channel, Homebrew tap, WinGet manifest or package repository is advertised.

The compiled 0d678fc candidate failed strict native exam classification and omitted a required screenshot arrival. It must not be promoted. Native Whisper WAV transcription and manual-save/restart component checks passed; these do not pass voice-to-task extraction. Rebuild and rerun after the bounded-repair fixes.
