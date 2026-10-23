# One-minute native TaskLens demo

Status: **NOT RECORDED / NOT APPROVED**. The current Qwen load failure must be resolved before demonstrating local extraction. Browser mock results are unsuitable as real inference evidence. Do not publish a video link until the owner supplies or approves the recording.

## Preparation

1. Build the intended commit and run the actual Tauri application with an isolated demo profile.
2. Use only synthetic content; remove personal notifications, tasks, keys and desktop windows from the recording.
3. Verify the selected provider is genuinely ready. For Groq, explicitly configure a test key and consent; do not show the key. For Local AI, warm-up may be disclosed but must not substitute a mock.
4. Create a synthetic screenshot: “Science club workshop — 12 November 2026, 2:00–3:00 PM, Room 204. Bring a notebook.” Use the same current-date context when checking dates. A second undated announcement can demonstrate unresolved information if time permits.
5. Complete a rehearsal: capture → real extraction → evidence review → confirm → save → calendar/task view → restart persistence. Record actual latency separately.

## Suggested 60-second sequence

| Time    | Visible action                                              | Narration                                                                                              |
| ------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 0–8 s   | Running native Inbox and provider status                    | “TaskLens turns announcements into reviewable tasks, with local processing or optional Groq.”          |
| 8–20 s  | Capture synthetic screenshot; real processing stages        | “The screenshot is read locally. This run uses the provider shown here.”                               |
| 20–38 s | Inspect extracted date, place, requirement and Source Trace | “Details remain in review. I can check each claim against the source and correct missing information.” |
| 38–48 s | Confirm and save; dialog closes after storage               | “Only my confirmation saves this as a confirmed task.”                                                 |
| 48–60 s | Open saved task/calendar                                    | “Tasks stay on this device. Groq requires my own key and permission to send source text.”              |

If extraction takes longer, visibly label a time cut and retain an uncut evidence recording. Do not replace the processing interval with a fabricated result. Show only verified functionality. Easter eggs are optional and must not displace the core workflow.

Run instructions: `npm ci`, prepare the pinned assets/runtimes/notices as described in [README](README.md), then `npm run tauri -- dev`. Packaged demo should use the exact validated installer instead.
