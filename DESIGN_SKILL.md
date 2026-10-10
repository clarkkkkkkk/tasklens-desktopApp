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
Small controls radius 10px, regular controls 12px, cards 16px, large dropzone 24px. Borders 1px solid border token. A dashed border belongs only to dropzones. Shadows use primary text at 4–8% opacity and belong to overlays or the screenshot preview, not every row. Icons use Lucide, 16px metadata, 18px navigation/control, 20px emphasis, 24px empty-state artwork. Stroke 1.7–2. No emoji icons.

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
- Reminders: editable checkbox rows, date/time label; saved configuration only in Phase 1, always disclose no OS notifications. Upcoming reminder summary belongs in Settings.

## Accessibility and responsive behavior
Semantic buttons, inputs, landmarks and headings. All keyboard actions have visible 2px primary-text focus rings with 3px offset. Minimum 36px targets, explicit labels, skip link, meaningful image alt text. No nested buttons. Respect prefers-reduced-motion; transitions 140ms only for color, background, border and opacity. No entrance animations or layout motion.

Desktop default 1440×920; native minimum 900×640. Below 1200px sidebar narrows to 196px and details to 320px. Below 1000px an open details panel occupies the workspace column, leaving sidebar available. Below 720px navigation becomes an accessible horizontal row and content stacks for browser resilience. Controls wrap; no horizontal page overflow. Calendar retains seven equal columns.

## Examples and forbidden patterns
Correct: a selected navigation row uses the accent-soft token and aria-current; an overdue row says “Overdue” next to its error-colored icon; the original logo sits in a quiet header.

Incorrect: hardcoded purple buttons, tiny gray instructions, huge gradients, neon, glass on every card, heavy shadows, giant dashboard metrics, copied application layouts, dark mode in Phase 1, fake traffic lights, remote imagery/fonts, inaccessible icon-only controls, or unexplained confidence scores.

## Workspace search overlay
Workspace search opens a native modal dialog from the topbar or Ctrl/Cmd K. Preserve the current view behind a soft, neutral, blurred backdrop. The search panel is horizontally centered in the upper third, up to 712px wide, with a 24px radius, a white surface, a quiet border and an overlay-only shadow. Use a 20px search input, a compact keyboard-help footer, and existing neutral/blue tokens. Empty input keeps the panel compact; typed searches reveal local results with restrained pale-blue selection. Search every saved item regardless of the current view or type filter.

This search dialog intentionally extends the general 480px modal rule. Tokens: 712px maximum width, 16vh top offset (capped at 160px), 12px backdrop blur, 160ms opening and 120ms closing, with only 6px vertical movement and 0.99 scale. The search overlay is the sole exception to the general no-entrance-animation rule, reflecting the requested smooth search interaction. Respect reduced motion by removing movement and animation. Use a soft layered shadow derived from the primary-text token; do not introduce new brand colors.

The search field uses a visible inset blue divider for focus instead of an individual input outline. Selection changes immediately for responsive keyboard navigation and consistent contrast during selection changes. Use native modal focus containment and background inertness. Label the dialog and combobox, announce result counts, support Up/Down to select, Enter to open, Escape/outside click to dismiss, and restore focus to the opener. Escape within search must not dismiss or discard an underlying editor. Keep IME composition intact. Long titles wrap or truncate within the panel; results scroll independently and stay within short/narrow windows. Closing does not change the underlying view or clear unsaved edits.
