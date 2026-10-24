# TaskLens

**Turn information into action. Privately.**

TaskLens is an MIT-licensed desktop productivity app for students, teachers, and people whose obligations arrive as screenshots and scattered announcements. Important dates and requirements get buried in chats; manually moving them into a task list is repetitive and error-prone.

TaskLens brings capture, review, and personal planning into one local workspace. The hackathon value proposition is a complete, understandable screenshot-to-action workflow with a human confirmation step. Phase 1 uses explicitly labeled mock extraction and remains independently useful through manual task/event creation, editing, search, completion, and calendar views.

Current workflow: image upload/drop/paste → preview → on-device OCR (Tesseract) → on-device extraction (Qwen3-4B via llama.cpp) → validation → review with per-field confidence, Source Trace and open questions → confirmation → local repository → agenda/calendar. Voice notes and typed text use the selected provider; transcription remains local. Optional Groq BYOK uses native HTTPS after explicit consent. The deterministic mock remains for browser development, tests, onboarding and demos, and is always labelled.

Tasks persist in localStorage; SQLite is used only for the native reminder delivery journal. Native reminders are implemented, with platform acceptance limitations. Optional Groq Cloud extraction is available; cloud OCR, remote transcription, accounts, telemetry, cloud sync and analytics are absent. See LOCAL_AI.md and RELEASE_AUDIT.md for current verification limits.

Offline operation keeps personal announcements and schedules on the device, reduces connectivity requirements and avoids transferring private source material to AI vendors. Local storage is not encryption; users remain responsible for their device security. The current storage is scoped to the app/webview profile. Source previews are reduced in size before saving.

Open source means transparent data flow, replaceable interfaces, reproducible setup, shared ownership and MIT licensing. The Phase 1 priority is polish, structure and stability; future AI must fit the reviewed contract rather than force a UI rewrite.
