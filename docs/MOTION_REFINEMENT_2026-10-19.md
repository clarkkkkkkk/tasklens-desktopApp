# TaskLens motion refinement — 2026-10-19

## 1. Confirmed problems and causes

The audit started from `e5886b6` on a separate `codex/motion-refinement` branch. No user screencast was attached; comparison recordings were made from that original revision and the revised application in isolated browser contexts.

- Onboarding layered a 300ms section animation, another 300ms preview animation and individually staggered heading words. The nested transforms/opacities produced uneven settling and scaled text.
- The onboarding shell grew with its content. At 900×640, the original welcome footer extended to approximately 697px, outside the window; subsequent heading focus scrolled the document by 81–115px. The larger demo increased this instability.
- Workflow selection remounted its preview card through `key={workflow}`, replaying its full entrance.
- Calendar faded its grid independently of the shared page movement. Processing/error/confirmation surfaces also had independent CSS entrances.
- Inbox entered again after the completion overlay disappeared. The temporary brand overlay owned focus and lacked a deadline if its compositor animations stopped.

## 2. Exact file inventory

- `DESIGN_SKILL.md`: reconcile the motion contract with composition-based onboarding, timings and bounded brand recovery.
- `src/App.tsx`: latest-navigation guard, navigation scroll reset, Inbox entrance behind the brand scrim and removal of redundant completion snapshots during the brand sequence.
- `src/components/motion/motion.ts`: shared onboarding motion and bounded cancellation/cleanup for finite animations.
- `src/components/motion/motion.css`: onboarding timing token and removal of independent processing/error/confirmation entrances.
- `src/components/motion/BrandHandoff.tsx`: inert, accessibility-hidden visual overlay and bounded recovery.
- `src/features/onboarding/OnboardingFlow.tsx`: persistent step/preview composition, coordinated replacement, focus without scrolling and keyboard-accessible scroll region.
- `src/features/onboarding/onboarding.css`: viewport-contained shell, fixed header/progress/footer and stable preview dimensions.
- `src/features/calendar/CalendarView.tsx`: remove the independently animated grid.
- `tests/brand-handoff.spec.ts`: inspect the visual overlay through its DOM selector because it is intentionally hidden from accessibility.
- `tests/motion-refinement.spec.ts`: eight regressions covering layouts, preview identity/focus, navigation, interruptions and handoff geometry/recovery.
- `tests/motion-visual.spec.ts`: two repeatable browser recording/screenshot/layout measurements, including original-revision comparison support.
- `TASK_TRACKER.md`: verified delivery status and acceptance limits.
- This report.

No model, inference, native runtime, service interface, persistence schema, package dependency, token palette or original logo asset was changed. The existing main content animation container is retained.

## 3. Onboarding transitions

Keep one live section and animate its entire composition. A 90ms exit precedes replacement, followed by a 210ms entrance; headings, descriptions and previews share that owner. Back/Continue are unavailable only during the brief exit so rapid activation cannot target a stale step. Timers are bounded, canceled on interruption, and cleaned up. Focus moves to the new heading with `preventScroll`.

The viewport shell keeps branding, progress and footer in place. Only the labeled, keyboard-focusable middle region scrolls; scroll anchoring is disabled and the region resets on step changes. Demo input, expanded screenshot and requirements remain reachable without covering the footer. The preview card stays mounted during Capture/Review/Remember selection, keeps a minimum height and uses 160ms feedback without going blank. Demo edits retain their existing state when moving Back/Continue.

## 4. Sidebar and content lifecycle

Every page retains the existing shared 320ms entrance: 12px upward movement at constant full opacity. Calendar no longer fades separately. No page snapshots or queued exit copies are introduced. Sidebar, topbar, search, local status and the Inbox component stay mounted. Only accepted view changes reset workspace scrolling; an active-page click does not replay motion or close a review. A synchronous requested-view reference handles several activations before React commits, while later frames supersede the current animation.

The existing dirty-editor, voice capture, search, review and persistence guards are preserved. Details keep their own 220ms, 12px upward entrance without dimming; search/result dialog layout, focus containment and unsaved-edit protection retain their existing contracts.

## 5. Text rendering

Onboarding headings are single text runs without split-word reveals or scaling. Parent movement preserves font size, weight, spacing, line height and wrapping. Page and panel text remain at full opacity. No persistent compositor hint was added to a large text container.

## 6. Completion brand handoff

Completion is persisted before presentation starts, as before. The same logo/name travel to the actual measured sidebar rectangles; the destination remains hidden during travel. The overlay is inert, aria-hidden and never takes focus. The original geometry, aspect ratio and easing are retained. Inbox settles behind the scrim and does not re-enter after docking. Resize or a reduced-motion change settles immediately; a 3200ms safety deadline removes a paused overlay and restores workspace focus. Skip/returning launches bypass the brand sequence. Failed persistence keeps onboarding usable.

## 7. Timing and easing

| Interaction                          | Timing / movement                                                |
| ------------------------------------ | ---------------------------------------------------------------- |
| Controls / workflow selection colors | Existing 120–160ms / 140ms colors                                |
| Onboarding step replacement          | 90ms exit + 210ms entrance; 12px, no scale                       |
| Workflow preview feedback            | 160ms, no layout movement or blank frame                         |
| Workspace pages                      | 320ms; 12px upward; full opacity                                 |
| Details / extraction review          | Existing 220ms; 12px upward; full opacity                        |
| Search                               | Existing 160ms opening / 120ms closing exception                 |
| Brand                                | Existing 400ms reveal + 650ms name + 450ms hold + 1100ms docking |

Standard easing remains `cubic-bezier(.16,1,.3,1)`. The brand retains `cubic-bezier(.4,0,.2,1)`. Reduced motion removes movement and scaling and immediately settles active animations.

## 8. Accessibility and visual acceptance

Browser tests exercise all four onboarding steps at 1440×920, the native minimum 900×640, and browser resilience at 600×640. They check stable shell rectangles, a single live step, no document scrolling, accessible controls, preview focus, every sidebar page, repeated/current-page clicks, same-task activations and interrupted navigation across frames. Other tests cover reduced motion during a step/page/brand animation, resize during brand travel, paused compositors, returning launches and failed saves. Existing axe checks and editor/search focus checks are retained.

The app was observed in the in-app browser at 900×640, and original/revised recording frames and screenshots were reviewed. The revised footer remains at y≈554.81–616.00 on every step and window scroll remains zero. Original and revised videos include onboarding, sample interaction, brand reveal/docking, Inbox arrival, all eight sidebar pages and returning launches. The logo and name reach the measured destination within a one-pixel test tolerance.

Artifacts are local under `$HOME/.cache/tasklens-motion/2026-10-19/`; recordings are not repository assets. The comparison baseline uses the original source, an isolated Vite cache, and the same bundled fonts.

## 9. Verification results

| Command                                                                                               | Final result                                                               |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `npm run check`                                                                                       | Passed: TypeScript and ESLint                                              |
| `npm run format:check`                                                                                | Passed                                                                     |
| `npm test`                                                                                            | 62 passed; one opt-in real-model evaluation skipped                        |
| `npm run build`                                                                                       | Passed                                                                     |
| `npx playwright test --workers=2 --output "$HOME/.cache/tasklens-motion/2026-10-19/accepted-browser"` | 45 passed in 3.6 minutes                                                   |
| `npx playwright test tests/motion.spec.ts --grep 'handoff and rapid' --repeat-each=5 --workers=1`     | 5 passed in 49.9 seconds; the actual run used an external output directory |
| `git diff --check`                                                                                    | Passed                                                                     |

The full browser suite includes all existing task, screenshot-sample, review, voice, search, quota/recovery, persistence and accessibility tests, plus the ten new motion/recording cases. Browser voice and extraction tests use the existing injected/sample services; no real-model or native inference acceptance is claimed. No Rust or multi-gigabyte installer rebuild was needed for these frontend-only edits.

Investigation record: an earlier candidate added an extra animated content wrapper. Its full serial browser run passed 44/45, with a sample screenshot failure. Repeated tracing showed the click reached the sample handler but its asynchronous canvas encoder did not call back within the assertion window. The original revision passed three comparison runs. The final version keeps the original content container and does not change the demo service or weaken the test. It passed five consecutive targeted repetitions and the final full 45-test suite. The encoder stall's underlying cause was not established; the earlier trace/logs are retained locally instead of being presented as a clean pass.

Final command results: `accepted-frontend-results.json` and `accepted-browser.log` in the local artifact directory. Final videos/screenshots/layout measurements: `accepted-browser/motion-visual-record-motion-acceptance-at-1440×920/` and `accepted-browser/motion-visual-record-motion-acceptance-at-900×640/`. Original comparison: `before-fonts-verified/`. Intermediate diagnostic runs remain separate.

## 10. Remaining limits

This is browser acceptance on Linux, not a native Tauri/WebKit/macOS animation or GPU-performance certification. No user-provided screencast was available; the original source revision was recorded for comparison. No changes are pushed or merged to main. The existing private microphone report remains untouched and untracked.

No clipping of interactive controls, overlapping page copies or doubled destination branding was observed in the accepted browser screenshots and sampled recording frames. Small windows intentionally scroll the middle onboarding region; native font rasterization and GPU behavior still need actual-platform review.
