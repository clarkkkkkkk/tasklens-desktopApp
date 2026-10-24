# Changelog

## Unreleased — 0.1.0 candidate

This is not a published release. GitHub currently has no approved public release/tag evidence in this audit.

- Capture screenshots with local Tesseract OCR; locally transcribe supported audio/voice with Whisper; route structured extraction through bundled Qwen/llama.cpp or opt-in local Ollama.
- Optional Groq BYOK extraction through native HTTPS, secure/session-only credentials, explicit privacy permission, bounded usage and retained-source recovery.
- Human review, Source Trace, multiple actions, task/calendar/search and local persistence; separately activated native reminders with a delivery journal.
- Compact Settings, guided Groq connection, safe review completion, first-run onboarding and a persistent collapsible sidebar.
- Audit fixes: isolated native credential namespaces; private OCR job directories; bounded local-provider response parsing; patched Vitest tooling; production mock/public-secret build rejection.
- Release preparation: deterministic installer names for Linux RPM/DEB/AppImage, Windows x64 and macOS arm64/x64; automatic 1 GiB parts for installers over GitHub's 2 GiB limit, with `SHA256SUMS` and in-place part verification; WebView2 installed before files are copied on Windows; optional verified Authenticode and Apple signing; macOS Keychain credential storage.
- Fixes: Windows Tesseract resource paths (`\\?\` verbatim paths); the real-model probe now uses the app's 300 s load budget; the native CI workflow no longer repeats the quality gates and caches models again.
- Audit tooling: full-history/redacted secret checks, least-privilege pinned CI, documentation checks, complete-installer part/checksum tooling and contribution templates.

- Linux release blocker: keep reusable Qwen processes alive across request-worker retirement while retaining OS crash cleanup; reject known-incompatible glibc inputs before release packaging. Native reacceptance remains required.

### Known gates

Current real inference accuracy/reliability, exact-candidate CI, Windows installers/runtime, signing, fresh-install acceptance and an approved native demo remain subject to [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Tasks/backups are not encrypted; primary SQLite storage, autostart and backup import are unfinished.

## Historical progress

Dated [development notes](DEVELOPMENT_REPORT.md), [local AI reliability](docs/LOCAL_AI_RELIABILITY.md), [Groq integration](docs/GROQ_BYOK.md), [Settings/Inbox report](docs/SETTINGS_INBOX_UX.md) and [evaluation evidence](docs/evaluation/reliability-v10-full.md) describe earlier work. Their results remain tied to their original commits, prompts and platforms.
