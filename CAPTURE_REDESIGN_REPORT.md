# Inbox capture refinement — 2026-10-21

## Delivered interface

The original screenshot dropzone and upload/processing presentation remain intact. A compact light voice/text card sits above the dropzone, beneath the Inbox heading, following the final placement request. There is no Voice tab. Import audio and Capture text are small actions inside the card; a 44px microphone button is anchored at the bottom-right. The card measured 209.375px idle and 270.984px while recording at both tested desktop widths.

Voice, imported audio and text keep one mounted capture surface through real processing milestones. Microphone access is requested only by the mic action. Recording shows elapsed time and 48 decorative, vertically symmetric blue bars built from the existing native amplitude events. A bounded rolling history and smoothing run in the waveform component, independently of Inbox rendering. There is no second microphone stream, random waveform or synthetic activity during silence.

The original selectable transcript appears immediately when Whisper finishes, while extraction continues. Whisper does not stream partial transcripts through the current interface. Original segments/evidence remain unchanged. Completed results can be reopened with Review actions. Text drafts and the last capture remain in mounted memory across mode/page changes; there is no new persistent draft storage.

All capture methods share a synchronous frontend job gate. Busy mode changes require cancellation confirmation and await cleanup. Late results are ignored. Removed recording/switch controls hand keyboard focus to the recording action or capture heading/composer without taking focus from surviving controls or review dialogs. Failed/cancelled extraction preserves available transcripts and submitted text; an imported File stays in memory until replaced/discarded for retry. A failed cleanup keeps capture blocked and explains restart recovery. Mic audio already cleaned up must be recorded again. Long-running processing offers real elapsed-time guidance, Keep waiting and Cancel after 60 seconds.

Capture-only motion uses 140ms control feedback, 240ms mode content, 280ms state content and at most 6px travel. Reduced motion immediately settles effects and displays static waveform bars. Existing page/onboarding/dialog behavior and the completion logo intro are unchanged. No native commands, runtimes, inference settings, domain schemas, model files, or persistent storage formats changed.

## Files changed

- `src/App.tsx`: distinguish capture-owned locks from unsaved-review locks; handle failed navigation cleanup safely.
- `src/features/inbox/Inbox.tsx`: coordinate the shared capture gate, immediate image selection feedback and the original screenshot surface.
- `src/features/voice/VoiceCapture.tsx`: compact presentation, guarded mode switching, real stages, transcript continuity, retained results/files and recovery.
- `src/features/voice/BundleReview.tsx`: restore review focus to a surviving control or the microphone, never a temporary status heading.
- `src/features/voice/voice.css`: light compact card, grounded mic/footer, waveform, stage indicators and responsive layouts.
- `src/features/capture/CaptureProgress.tsx`: accessible stage presentation and frontend capture-mode type.
- `src/features/capture/VoiceWaveform.tsx`: isolated real-amplitude history and reduced-motion handling.
- `src/features/capture/useCaptureMotion.ts`: finite capture-only motion with cancellation and preference-change cleanup.
- `tests/capture-experience.spec.ts`: layout, silence, concurrency, retry, cancellation, transcript/draft retention, feedback, reduced motion and console checks.
- `tests/voice-harness.tsx`: controlled amplitude/stage/failure fixtures; production stylesheet order and bundled fonts.
- `tests/voice.spec.ts`: updated microphone entry and waveform expectations.
- `tests/motion-refinement.spec.ts`: preserve static non-capture controls while allowing the approved capture exception.
- `DESIGN_SKILL.md`, `VOICE_CAPTURE.md`: updated interaction/design contracts and developer guidance.
- `CAPTURE_REDESIGN_REPORT.md`: this report.

`Dropzone.tsx` is unchanged from the branch baseline; the temporary compact screenshot design was removed as requested.

## Verification and observed measurements

- `npm run check`: passed TypeScript and ESLint.
- `npm test`: 113 passed, one optional real-model evaluation skipped. No expensive multilingual evaluation was run.
- `npm run build`: passed. The existing bundle-size advisory remains (approximately 558kB JavaScript before gzip).
- `npm run format:check` and `git diff --check`: passed.
- A full browser run passed 60/60 before the final placement revisions.
- The revised regression run passed 39/40; a development reload interrupted the remaining voice-review case. All five voice tests then passed against a frozen final source copy.
- All 15 final capture/voice scenarios passed together against the frozen final source after correcting the status-heading focus-return regression. The staged layout cases also passed again at 1440×920 and 900×640 with both console-error and uncaught-page-error collection enabled; no errors were observed.
- Visual screenshots were inspected for idle, recording, preparing, transcribing, transcript, import and text states. The existing responsive/reduced-motion and 600px review/layout checks also passed. These are browser visual checks, not native compositor screenshots.
- In injected-service browser tests under concurrent load, microphone-access status appeared on the next frame after 29.5ms and 39.6ms. These measure UI response, not hardware permission or inference latency.

Ignored local visual evidence and measurements are under `.local-ai/capture-redesign-2026-10-21/`. Browser capture/voice JSON reports were produced under `/tmp/tasklens-capture-final.json`, `/tmp/tasklens-capture-console-final.json` and `/tmp/tasklens-voice-final.json`; the accepted final combined run is `/tmp/tasklens-capture-accepted.json`. Native evidence is under `/tmp/tasklens-capture-native/`.

## Fedora native results and limitations

Native checks used the current debug executable and development frontend in an isolated XDG profile. No installer was rebuilt. Existing asset receipts were reused only when their paths, sizes and modification metadata matched; the application still performs its normal fingerprint checks. A separate fresh debug-profile attempt exceeded the three-minute validation allowance, so no fresh-profile startup acceptance is claimed.

Verified in the native window:

- Required local assets reached Ready using matching validation receipts.
- The real microphone recorded approximately two seconds, displayed 48 bars and elapsed time, then cancelled and cleaned up.
- The production audio-import UI produced a real 75-character transcript from the known synthetic exam fixture. It recognized the expected exam wording, entered Understanding details, then explicitly cancelled extraction while retaining the transcript. This import/transcribe/cancel check took 22.59 seconds overall.
- Native Tesseract OCR recognized the pictorial fixture and returned 12 regions in 4.93 seconds.
- A manual task was saved in the isolated native profile using real WebDriver keyboard/click events after capture recovery.

The real text-extraction attempt displayed “The local model did not respond.” No successful native text extraction, voice-to-action completion, screenshot-to-action completion, or real-model review/save acceptance is claimed for this change. Native manual-task save also passed using real WebDriver keyboard/click events after correcting a temporary acceptance-selector mismatch (Save item versus Save task). Browser review/save/persistence regressions passed. These limits must not be confused with the successful native microphone, transcription and OCR component checks. No inference-runtime changes were made to address the failure.

Windows/macOS native acceptance, noisy/multilingual microphone quality and a quiet-machine inference benchmark remain pending. The native run did not disable networking; this change adds no network calls or remote fallback, but it is not a fresh network-isolation certification.

Work remains on `codex/voice-first-capture`, without a push or main merge.
