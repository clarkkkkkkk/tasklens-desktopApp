# Historical MVP scope

This document records the initial scope. Current implementation and release status are described in [README](README.md) and [release audit](RELEASE_AUDIT.md). OCR, native reminders and optional Groq BYOK have since been implemented; statements below about future work are historical.

# Phase 1 MVP

## MUST HAVE

- Original TaskLens branding and strict light-theme design contract.
- React/TypeScript frontend and Tauri desktop foundation.
- Browse, drag/drop and clipboard-paste screenshot input, preview, removal, explicit mock processing.
- Structured editable review; confirm/save; independent manual task/event/deadline creation.
- Local persistence with validation, failure handling and a replaceable repository.
- Inbox, Today, Upcoming, month Calendar, All Tasks, Completed, Needs Review, search.
- Completion/restoration, deletion confirmation, reminder configurations and settings.
- Keyboard access, loading/empty/error states, docs, owner trackers, MIT license and automated checks.

## SHOULD HAVE

- Source thumbnails that survive reload, sample announcement for repeatable demos.
- Upcoming reminder overview and local backup export.
- Linux/macOS/Windows packaged application smoke tests on equipped hosts.
- SQLite migration once the native environment is established.

## POST-MVP

The local voice/text extension implements audio transcription and local structured extraction with separate platform/language acceptance. OCR, PDFs, native reminder execution, startup registration and broader input sources remain future work. No remote AI, cloud accounts, sync, Google Calendar, chatbot, mobile app, dark mode or auto-update service is part of this implementation.

The Phase 1 application must be usable without AI: users can create and manage their own items directly.
