# Security policy

TaskLens is a pre-release desktop application. Current security evidence and unresolved gates are in [SECURITY_AUDIT.md](SECURITY_AUDIT.md) and [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). No third-party penetration-test certification or vulnerability-free guarantee is implied.

## Report a vulnerability

Do not post credentials, private screenshots, task backups, transcripts or exploit details in a public issue. Use GitHub private vulnerability reporting **if the owner enables it**. At audit time it was disabled. Otherwise open an issue only requesting a confidential maintainer contact, without sensitive details. No private reporting address is invented here. Maintainers should enable private reporting and acknowledge reports before agreeing on disclosure.

There is no published supported-release series yet. Report candidate issues with the commit, platform, sanitized reproduction and impact. Security fixes should be validated on each affected native platform before a release is called supported.

## Threat model and protections

- Local mode is the default. Tesseract OCR, Whisper transcription and bundled Qwen inference stay local. Optional Groq Cloud sends minimum recognized text/transcripts only after explicit provider selection and device consent. No automatic cloud fallback, telemetry, cloud sync or login backend is included.
- Rust owns authenticated Groq requests. The fixed HTTPS endpoint uses normal TLS, redirects are disabled, and native gates recheck mode/consent/credentials/budgets before requests. Actual Groq limits remain authoritative over advisory application counters.
- API keys never belong in source, logs, task backups, JavaScript localStorage or `VITE_` environment variables. The input clears after submission; native status returns no key/fragment/header. Secure-store failures use memory-only credentials. Disconnect cancels work and reports incomplete deletion rather than silently retaining usable credentials.
- Windows Credential Manager and Fedora Secret Service are the supported persistent backends. Acceptance application identities use a separate credential namespace; tests must never borrow a user's production key. Real Groq tests require an explicitly configured test credential and are not ordinary CI.
- Main-window capabilities name permitted IPC commands. No general shell, arbitrary remote URL/header, SQL or filesystem plugin is exposed. React renders source/model content as text; CSP blocks remote scripts and direct Groq access. Native file/image/audio validation and process/time/output bounds provide additional protection, not immunity to third-party parser defects.
- Unix OCR/audio job directories are private, generated natively and cleaned on completion/cancellation/startup. Sidecars use argument arrays. Local inference transport is loopback-only; Ollama must be treated as a trusted local service when enabled.
- Diagnostics are opt-in metadata and bounded in memory. Raw source text, remote bodies and authorization values must not be logged or uploaded as CI artifacts. Browser/native fixtures must be synthetic or clearly licensed public material.

## Data at rest and backups

Tasks, screenshot thumbnails, evidence, locally generated transcripts and exported JSON are **unencrypted**. Webview localStorage (`tasklens:data:v1`) remains task authority. `app_data_dir()/storage/tasklens.sqlite3` is only a reminder delivery journal. Its parameterized SQL, Unix 0700/0600 permissions and scheduling fences do not turn it into encrypted task storage. Native consent/usage metadata is outside task backups. Same-user malware and OS administrators can still read application data.

Keep backups in trusted storage. Backup import, authenticated encrypted exports, SQLCipher task migration, autostart and automatic updates are unfinished. Windows user-ACL behavior, signing and fresh-install acceptance need actual Windows verification. OS submission of a reminder is not proof that a banner was displayed.

## Repository and release practices

Run full-history Gitleaks with complete redaction, a current working-tree/bundle scan, `npm audit` and `cargo audit`. Review informational/unsoundness warnings, not only the vulnerability count. Do not suppress advisories broadly. Rotate any exposed real credential immediately; deleting the current file does not revoke it. Shared Git history must not be rewritten without owner approval.

CI uses read-only repository permissions, pinned action revisions and no real service key. Artifacts must contain only intended public build inputs/outputs. Keep profiles, `.env` files, raw diagnostic responses and personal content out of uploads. Release installers need current source identity, asset/license verification, checksums, actual platform acceptance and owner publication approval. Splitting a complete installer for transport must preserve and verify its original checksum.

Linux persistent-model cleanup uses a permanent spawning thread with a checked parent-death signal. Request-worker exit must not kill a healthy model; abrupt TaskLens process termination must still kill it. Both behaviors have subprocess regression tests. This does not certify installed-package acceptance on other platforms.
