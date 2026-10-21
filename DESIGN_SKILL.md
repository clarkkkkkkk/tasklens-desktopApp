# TaskLens design contract

This is the authoritative contract for every UI change. Read it before changing components; extend this document intentionally before introducing a convention. Reuse tokens and shared components.

## Philosophy and branding
Calm, spacious, desktop-first software that helps people turn information into action, privately. Use the original `TaskLens.png` unchanged, with `object-fit: contain` and its original aspect ratio. No new logo, recoloring, tracing, cropping, or decorative brand gradients. The source is the only asset found during repository inspection.

## Tokens
Tokens live in `src/styles/tokens.css`, exposed to Tailwind through `@theme inline`.

| Role | Value |
| --- | --- |
| App background | #F6F7F9 |
| Primary surface | #FFFFFF |
| Secondary surface | #EEF1F5 |
| Primary text | #171A1F |
| High-contrast control text (functional exception) | #000000 |
| Secondary text | #6B7280 |
| Muted text, decorative only | #9CA3AF |
| Border | #E3E7ED |
| Accent | #5B8CFF |
| Accent hover | #4778F5 |
| Accent soft | #EAF1FF |
| Lavender | #A78BFA |
| Lavender surface | #F1ECFF |
| Success | #36B37E |
| Warning | #E7A83E |
| Error | #E65C5C |

Keep roughly 85% neutral, 10% blue, 5% status/lavender. Use primary text on accent and status surfaces. On the darker primary-hover background, use the high-contrast control-text token (#000000); the standard primary text measures only 4.38:1 there, while black exceeds 5:1. This is a functional accessibility exception, not an additional brand color. Use primary text for labels over secondary/selected surfaces. White small text on the supplied blue does not meet AA. Status colors accompany readable labels and icons; never communicate only through color. Muted text is reserved for decorative marks, not necessary instructions. Use secondary text for readable metadata on white.

## Typography and rhythm
Locally bundled Inter; fallbacks system-ui, sans-serif. No remote fonts. Sizes: 11px overlines, 12px metadata, 13px navigation/controls, 14px body, 16px subsection headings, 20px detail titles, 28px page headings, 32px hero headings. Weights 400 regular, 500 medium, 600 semibold. Body line-height 1.6; controls/headings 1.25–1.4. Avoid all-caps except short, letter-spaced section labels. Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px. No unrelated spacing values.

## Shape, borders and elevation
Small controls radius 10px, regular controls 12px, cards 16px, large dropzone 24px. Borders 1px solid border token. A dashed border belongs only to dropzones. Shadows use primary text at 4–8% opacity and belong to overlays or the screenshot preview, not every row. Icons use Solar Bold Duotone, 16px metadata, 18px navigation/control, 20px emphasis, 24px empty-state artwork. Preserve Solar’s filled geometry; primary color inherits currentColor and the secondary layer uses that same color at 50% opacity. Use individual static imports through src/components/icons.tsx, retain accessible control labels, and hide decorative SVGs from assistive technology. No emoji icons.

## Components and interaction
- Buttons: 36px minimum height, 12px horizontal padding, 8px icon gap. Primary accent with primary text; hover accent-hover. Secondary white, subtle border; tertiary transparent. Destructive action uses readable text and error icon. Never an unlabeled icon button. Disabled controls show disabled semantics and an adjacent reason where relevant.
- Inputs: white, 1px border, 10px radius, 36px minimum height. Persistent visible labels, never placeholder-only forms. Textareas resize vertically. Error messages identify the field and use text plus icon.
- Cards: only for coherent sections; primary surface, border, 16px radius, 20–24px padding. Lists use separators, not one floating card per row.
- Badges: compact, text and optional icon, neutral/soft accent backgrounds; status accent is an icon/dot. Confidence labels are Confirmed, Inferred, Needs review. Never suggest mock output is verified evidence.
- Navigation: 40px rows, 18px icon, pale-blue selected surface, primary text, aria-current page. Counts are restrained. Hover secondary surface. Sidebar width 224px, white/translucent neutral surface, border-right, logo 44px contained. Settings and local status at bottom.
- Workspace: flexible width, minimum zero, 40px main padding (24px below 1200px). Topbar 72px with search and a compact New item action. Headings and content share the same left edge. Content width capped at 1000px.
- Details: 352px width with left border, white surface; own scroll area. Clear hierarchy, grouped fields, requirements, notes, reminder rows, and persistent actions. Close button and Escape dismissal; return focus to opener. When editing, preserve unsaved fields after validation/storage errors.
- Modals: avoid where inline confirmation suffices. If added, use an accessible dialog with label, focus trap, Escape dismissal, focus restoration, neutral backdrop, max width 480px. Never use browser alert/confirm for product actions.
- Dropdowns: native select is preferred for simple choices; custom menus require keyboard navigation, focus management and Escape dismissal. No hover-only actions.
- Dropzone: white, dashed border, large radius. Hover/drag uses soft accent and blue border. Provide real file input and keyboard-operable browse button. Accept PNG/JPG/JPEG/WEBP; announce errors and progress. Busy states cannot start overlapping processing. Removal cancels pending work.
- Empty states: small neutral icon, descriptive heading, one helpful sentence and optional action. Never fake sample items as personal data.
- Loading: restrained spinner or progress steps with aria-live polite and text. Explicitly say Demo/Mock. Respect reduced motion.
- Errors: inline error surface with readable text, error icon, retry or recovery guidance; role alert. Never silently discard data on storage failure.
- Confirmation: concise polite live status; saved data appears immediately. Deletes use a two-step inline confirmation. Confirmation of extraction means the user accepts the reviewed values, not that AI verified them.
- Reminders: editable checkbox rows with date/time labels. Browser development is configuration-only. Desktop delivery requires a separate, explicit activation preview in Settings; distinguish OS submission from visibility and display paused/error status. Upcoming and missed schedules belong in Settings. New date-only items offer night-before 20:00; relative presets require a confirmed anchor. Repeated DST times use explicit occurrence radio controls. Background operation is opt-in with in-app Quit and a tray limitation explanation.

## Accessibility and responsive behavior
Semantic buttons, inputs, landmarks and headings. All keyboard actions have visible 2px primary-text focus rings with 3px offset. Minimum 36px targets, explicit labels, skip link, meaningful image alt text. No nested buttons. UI changes are immediate: no page/onboarding/control/dialog transitions or entrance/exit animations. The completion logo intro and the Inbox capture-only motion described below are the animation exceptions and still respects prefers-reduced-motion.

Desktop default 1440×920; native minimum 900×640. Below 1200px sidebar narrows to 196px and details to 320px. Below 1000px an open details panel occupies the workspace column, leaving sidebar available. Below 720px navigation becomes an accessible horizontal row and content stacks for browser resilience. Controls wrap; no horizontal page overflow. Calendar retains seven equal columns.

## Examples and forbidden patterns
Correct: a selected navigation row uses the accent-soft token and aria-current; an overdue row says “Overdue” next to its error-colored icon; the original logo sits in a quiet header.

Incorrect: hardcoded purple buttons, tiny gray instructions, huge gradients, neon, glass on every card, heavy shadows, giant dashboard metrics, copied application layouts, dark mode in Phase 1, fake traffic lights, remote imagery/fonts, inaccessible icon-only controls, or unexplained confidence scores.

## Workspace search overlay
Workspace search opens a native modal dialog from the topbar or Ctrl/Cmd K. Preserve the current view behind a soft, neutral, blurred backdrop. The search panel is horizontally centered in the upper third, up to 712px wide, with a 24px radius, a white surface, a quiet border and an overlay-only shadow. Use a 20px search input, a compact keyboard-help footer, and existing neutral/blue tokens. Empty input keeps the panel compact; typed searches reveal local results with restrained pale-blue selection. Search every saved item regardless of the current view or type filter.

This search dialog intentionally extends the general 480px modal rule. Keep its 712px maximum width, 16vh top offset (capped at 160px), 12px backdrop blur and existing neutral shadow. Open and close immediately without movement, scaling, fades or delayed dismissal. Preserve focus containment and restoration.

The search field uses a visible inset blue divider for focus instead of an individual input outline. Selection changes immediately for responsive keyboard navigation and consistent contrast during selection changes. Use native modal focus containment and background inertness. Label the dialog and combobox, announce result counts, support Up/Down to select, Enter to open, Escape/outside click to dismiss, and restore focus to the opener. Escape within search must not dismiss or discard an underlying editor. Keep IME composition intact. Long titles wrap or truncate within the panel; results scroll independently and stay within short/narrow windows. Closing does not change the underlying view or clear unsaved edits.

## Onboarding
All four onboarding steps replace their content immediately without movement, scaling, fading or animation delays. Keep the existing centered 1000px maximum width, responsive stacking, stable header/progress/footer, contained middle scrolling and heading focus without scroll. Workflow preview changes are immediate and preserve the card identity, focus and demo edits. Reuse the original logo without cropping.

## Workspace motion

As requested on 2026-10-20, remove all UI motion and transitions except the TaskLens completion logo intro and the explicitly approved Inbox capture exception below. Page headings, content, empty states, cards, task rows, controls, status messages, detail panels and dialogs update immediately. Do not create exit snapshots, animation timers or delayed navigation. Keep the sidebar/topbar persistent and preserve all focus, unsaved-edit, capture and persistence behavior. Audio-level values may still update with live input; do not interpolate those updates with CSS transitions. Loading labels remain visible without decorative spinning. No new animation dependencies.

## Inbox result dialog
Inbox extraction results open in a centered native modal dialog, using the search overlay's 712px maximum width, 24px radius, neutral shadow and 12px blurred backdrop. Keep a viewport margin, a scrollable review/editor body and fixed toolbar/actions; use 16px radius and 8px margins on windows up to 600px wide. This result-specific exception permits a larger dialog than the general 480px guidance. Show and dismiss the result immediately without an animated entrance or exit. Contain focus, suspend background paste, protect unsaved edits on Escape/outside click, and return focus to the opener or Inbox's Open result button. Other task details retain their existing panel presentation.

## Completion brand handoff
After a successful Start using TaskLens completion write, permit one full-screen brand transition: 400ms gentle logo entrance, 650ms left-to-right masked name reveal, 450ms hold and 1100ms travel/shrink into the actual sidebar logo/name positions. Reuse the unchanged TaskLens.png asset and sidebar typography. Uncover the workspace during travel; hide the destination brand until arrival to avoid duplicate logos. Use gentle ease-in/out (cubic-bezier(0.4, 0, 0.2, 1)) and no animation dependency. Keep the workspace inert and hidden from accessibility until the handoff ends, then focus Inbox and start its first-capture hint. The visual layer is inert and aria-hidden, never owns focus, and has a bounded 3200ms recovery timeout if the compositor pauses. Inbox is already at its final position behind the scrim and remains static after docking. Skip and returning launches bypass this sequence. Reduced motion bypasses it or immediately settles an active sequence; resizing also settles into the real sidebar layout. A failed completion save must retain onboarding without starting motion.

## Local voice capture
Screenshots remain the primary Inbox input: preserve the original large dropzone and its original upload/processing presentation. Place the compact secondary light voice/text card above the dropzone, in the earlier capture-control position beneath the page heading. Do not show a Voice tab or a mode-selection row above the screenshot area. Keep Import audio and Capture text as small controls within the secondary card, with a 44px mic action grounded at the bottom-right of its footer. Voice is the card's default internal mode. Reuse all native services, guards, source evidence and review dialogs. Retain text drafts and completed capture results in mounted state. Only one capture job may run; switching modes while busy offers Keep capturing / Cancel and switch and awaits cleanup.

Recording shows a centered timer and 48 blue bars driven only by actual microphone amplitude history. Silence remains quiet. Keep the entire card light; no dark inset, neon, random waveform or second microphone stream. Show real preparing, transcribing, understanding, checking and review-ready stages without fake percentages or partial transcripts. Display the original selectable transcript as soon as returned, while extraction continues automatically. Preserve Source Trace timestamps/evidence and require review before saving.

Approved 2026-10-21 capture-only motion: scoped 140ms control feedback, 240ms mode-content changes and 280ms state-content changes, cubic-bezier(.16,1,.3,1), no more than 6px movement and subtle opacity. Animate one content layer only; never animate card dimensions, queue exits, delay capture/cancellation or replay entrances on timer/level updates. Pages, onboarding, dialogs and the logo intro retain their existing behavior. Reduced motion settles active effects immediately and uses static waveform bars. Announce stages, never level/timer ticks. All actions remain keyboard accessible. No new animation dependency.

## Local AI review
On-device extraction keeps the existing review surfaces; it adds no new colors, fonts or animation.

- **Processing.** The Inbox processing card shows the real stage name (Preparing image, Reading text locally, Understanding details locally, Checking extracted information) with the existing four-segment progress track, an "On-device" badge and one quiet line: "Processing locally. Your screenshot stays on this device." A secondary **Cancel processing** button is always available while busy. Never show token counts, model names or percentages in the main UI. Mock runs keep the "Mock extraction" badge and their explicit sample wording.
- **Failures.** Use the standard inline error surface with concise recovery buttons: Try again, Choose another image, and Open AI Settings for setup problems. Never show raw native errors, paths or stack traces.
- **Confidence.** Each extracted field may carry the existing Confirmed / Inferred / Needs review badge beside its value. Never display numeric confidence for model output. An unknown start time reads "Not confirmed", not "All day".
- **Source Trace.** A cited field gets a small ghost **Source** button (ScanLine icon, visible text, aria-label "Show source for …"). It opens the existing "View source screenshot" disclosure and highlights the OCR boxes with a 2px accent outline and an accent tint at 16%, 4px radius, no shadow; a polite status line quotes the source text. Source highlights update immediately without transitions.
- **Open questions.** "Needs your answer" sits above the fields as a detail section: a count, then one row per question on a warning tint at 10% with a border, a short field label, the question, and secondary buttons "Use …" for each option (dates and times in local formats), an optional ghost **Show source**, and a ghost **Dismiss**. Answers are unsaved edits and follow existing discard protection.
- **Settings › Local AI.** One section with an "On-device" badge, a plain status word (Not installed, Ready, Loading, Processing, Error, Stopped) as a badge with a static busy indicator while processing, a two-column fact list (model file, location, size, runtime, text recognition, OCR languages) and secondary actions: Select / Import model, Validate model, Reload model, Import OCR languages. Developer mode is a checkbox row; its optional context-size and thread selects are native selects.
- **Indicator.** The sidebar status reads "On your device. Only." and switches to "Processing locally" while the local model works.
- **Developer details.** Shown only in developer mode, inside a collapsed disclosure under the processing card, in secondary text with monospaced blocks on the secondary surface.

## Built-in intelligence readiness

Show the existing neutral status treatment with “Preparing local intelligence…” and “Local AI is ready.” Initialization must not block onboarding, navigation or manual editing. Failed resources offer Retry validation, concise repair details and reinstall guidance. Restrict only affected inference actions. Keep model import under Developer mode; normal onboarding never opens a model picker. Samples stay explicitly mock-labelled. Settings can show verified assets as Ready while the on-demand inference runtime is stopped. Use existing tokens and accessible live status, without progress percentages or a new setup wizard.

### First-launch transition resilience

Onboarding completion must not await visual animation completion. Save completion immediately, then run only the existing logo intro/handoff. Skip, replay exit and ordinary page changes are immediate and create no visual snapshots. Keep the logo intro's existing reduced-motion, resize and timeout safeguards.
## Native reminder recovery

Reuse existing Settings rows, inline confirmation, error surfaces and native checkboxes. Show activation preview counts and schedules needing confirmation, generic notification privacy preference, device background preference and a real test action. A persistent recovery warning may use a compact fixed surface below the topbar, aligned to the existing 352px notice width; do not shift the shell. No motion or new colors. Status events update immediately. Backup/startup controls stay honestly unavailable until their milestones are implemented.
