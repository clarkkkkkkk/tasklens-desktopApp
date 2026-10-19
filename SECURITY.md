# Local data security

TaskLens performs its implemented AI inference locally and has no automatic cloud fallback. Reminder notifications are separately opt-in. Generic notifications contain no task title by default; enabling titles is a distinct device privacy preference. Notes, source images, OCR, evidence and transcripts are never included in notification payloads.

Current task data remains in webview localStorage under `tasklens:data:v1`. The new native SQLite file at `app_data_dir()/storage/tasklens.sqlite3` is a **delivery journal only** until the canonical-storage milestone is completed. The journal, task storage and JSON exports are **unencrypted**. Backups contain private data; keep them in a trusted location. Permissions do not protect against malware running as the same user.

The journal worker uses fixed parameterized SQL and exposes only typed main-window commands. No arbitrary SQL, filesystem path, executable argument or free-form notification-body command is exposed. Unix journal directories/files use 0700/0600; symlinked database files and newer schema versions fail closed. Native storage errors do not turn unreadable task data into an empty workspace. Windows user ACL enforcement remains pending.

Claims are committed before notification submission. A crash can occur after the OS accepts a request and before the journal records it; interrupted claims become unknown and are not automatically retried. OS acceptance is not a guarantee of banner visibility or user acknowledgment. A failed task/reminder reconciliation leaves delivery paused and task-save success is reported separately. SQLite is not yet the task authority and cross-store writes are not described as a database transaction.

## Required encryption follow-up

A separate design must specify SQLCipher distribution and licensing, OS-backed key storage on Linux/Windows/macOS, key recovery and loss behavior, authenticated encrypted export envelopes, rotation, and a recoverable verified migration. Plaintext leftovers, temporary files, WAL/journals and recovery snapshots must be addressed. Do not claim encryption until these paths and failure cases have been tested.

See [native reliability status](docs/NATIVE_RELIABILITY.md) for the incomplete acceptance gates. Do not commit real task snapshots, private screenshots/transcripts, microphone identifiers, credentials, model weights or native acceptance profiles.
