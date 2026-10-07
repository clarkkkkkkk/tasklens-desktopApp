# TaskLens

**Turn information into action. Privately.**

TaskLens is an MIT-licensed desktop productivity app for students, teachers, and people whose obligations arrive as screenshots and scattered announcements. Important dates and requirements get buried in chats; manually moving them into a task list is repetitive and error-prone.

TaskLens brings capture, review, and personal planning into one local workspace. The hackathon value proposition is a complete, understandable screenshot-to-action workflow with a human confirmation step. Phase 1 uses explicitly labeled mock extraction and remains independently useful through manual task/event creation, editing, search, completion, and calendar views.

Current workflow: image upload/drop/paste → preview → mock extraction → editable review → confirmation → local repository → agenda/calendar. The supplied pictorial example is demo data, never image analysis.

Future vision (Phase 2 and later): screenshots → on-device OCR → local LLM → validated structured output → review → SQLite → scheduled native notifications. Text, PDF and voice input can follow later. No AI, OCR, remote services, accounts, telemetry, cloud sync or analytics are implemented now.

Offline operation keeps personal announcements and schedules on the device, reduces connectivity requirements and avoids transferring private source material to AI vendors. Local storage is not encryption; users remain responsible for their device security. The current storage is scoped to the app/webview profile. Source previews are reduced in size before saving.

Open source means transparent data flow, replaceable interfaces, reproducible setup, shared ownership and MIT licensing. The Phase 1 priority is polish, structure and stability; future AI must fit the reviewed contract rather than force a UI rewrite.
