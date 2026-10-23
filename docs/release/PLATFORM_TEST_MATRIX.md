# Platform acceptance matrix

Candidate: 0.1.0 prerelease preparation. Audit baseline: `374f692afe22de55bb80472035006e67919ddf44` plus preserved working changes. Date: 2026-10-23 (Asia/Manila).

**PASS** means the named test actually ran on the recorded candidate/environment. **FAIL** means an executed assertion failed. **BLOCKED** means a required environment, credential, host or prerequisite is unavailable. **NOT RUN** means no current candidate execution is recorded. Compilation, packaging, package installation and runtime acceptance are separate gates.

| Platform | Build | Fresh install | OCR | Local AI | Voice | Groq | Ready |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fedora x64 | NOT RUN | BLOCKED: clean VM | NOT RUN | NOT RUN | NOT RUN | BLOCKED: authorized test key | NO |
| Ubuntu x64 | BLOCKED: native environment | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | NO |
| Windows x64 | BLOCKED: native environment/WebView2 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | NO |
| macOS ARM64 | BLOCKED: native environment | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | NO |
| macOS Intel | BLOCKED: native environment | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | NO |

Fedora 44 is the available developer host. Ubuntu 24.04, Windows 10/11, macOS ARM64 and Intel have prepared build jobs, not certified support. Historical Fedora or Windows results in older evaluation documents do not certify this candidate. A Fedora-built DEB is not evidence that it runs on Ubuntu.

## Required fresh-machine protocol

Use a disposable OS account or VM snapshot. Never uninstall, clear storage, replace credentials or change privacy permissions in the developer's everyday profile. Record OS build, CPU flags, RAM, architecture, candidate commit, installer hash, observed behavior, exit status and sanitized evidence for each step.

| Check | Fedora | Ubuntu | Windows | macOS ARM64 | macOS Intel |
| --- | --- | --- | --- | --- | --- |
| Download from approved host and checksum | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Install through native installer | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Launch with no developer tools | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Onboarding and guided tour | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Screenshot OCR → extraction → review → confirmation → save | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Undated/ambiguous dates, separate actions and real Source Trace | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Text capture → review → save | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Real microphone permission and recording | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Audio import → Whisper → extraction → review → save | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Restart preserves tasks/settings/sidebar/calendar | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Disconnected offline startup and inference | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Groq real BYOK consent and inference | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Native credential persistence/removal | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Invalid key, 429, disconnect, cancellation and recovery | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Opt-in native reminder activation and visible notification | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Export validity and failed-save draft preservation | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Safe close during recording/review/save | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Upgrade test build preserves all local data | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Uninstall removes application and preserves personal data | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Spaces/non-ASCII install and data paths | NOT RUN | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Baseline CPU and AVX2 selection | NOT RUN | BLOCKED | BLOCKED | N/A: ARM64 | BLOCKED |
| Signature/SmartScreen/Gatekeeper behavior | N/A: unsigned candidate | N/A: unsigned candidate | BLOCKED | BLOCKED | BLOCKED |

Do not promote a platform when an essential row is unresolved. Isolated debug/native component checks may be recorded separately; they cannot replace installation tests of the final installer. Mock HTTP tests establish failure handling only, not a real Groq transaction. Browser tests establish UI behavior only, not native OS functionality.
