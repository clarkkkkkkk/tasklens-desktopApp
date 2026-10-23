# Contributing

Read PROJECT_SUMMARY.md, ARCHITECTURE.md and **DESIGN_SKILL.md** before editing. Work is shared between Developer 1 (UI/product) and Developer 2 (domain/storage/native). Discuss shared contract changes first; keep backward-compatible optional additions or introduce an explicit storage migration. Never bypass the repository from a component.

Recommended branches: `main` (stable), `develop` (integration), `feature/ui-shell`, `feature/inbox`, `feature/calendar`, `feature/persistence`, `feature/mock-extraction`, `feature/reminders`. Branches are recommendations; this task does not initialize, push or rewrite Git history.

Use small descriptive commits such as `feat: add editable extraction review` or `fix: preserve draft on storage failure`. Pull requests explain user-visible behavior, validation, limitations and screenshots for UI changes. Developer 1 reviews design, keyboard behavior and component reuse; Developer 2 reviews contracts, migrations, local data flow and native capabilities. Cross-layer changes require both perspectives.

Before merge: `npm run check`, `npm test`, `npm run test:e2e`, `npm run build`; on an equipped native host run `npm run tauri build -- --no-bundle`. Review the full capture → review → save → reload flow. Keep TASK_TRACKER.md and developer progress notes current. Never commit API keys, private profiles, analytics or generated build output. Optional Groq BYOK is supported through the existing consent-controlled native client; do not add a required backend or shared credentials. Check package licenses before adding dependencies.

If a new visual convention is necessary, update DESIGN_SKILL.md before implementation. Screenshots in PRs should use sample data, never private announcements. Report security issues privately to the repository maintainers once a public hosting location is established.

## Release contributions

Use the pinned Node/Rust versions and lockfiles. Run formatting, asset/release tests, dependency audits and documentation link checks in addition to frontend/Rust/browser checks. Native packaging uses `npm run release:desktop` from a clean committed candidate; see [the release checklist](docs/release/RELEASE_CHECKLIST.md). Keep compilation, package installation and native workflow evidence distinct. Only verified platforms belong in support claims.

When multiple chats/developers share a checkout, preserve their work and validate in an isolated worktree. Never force-push or rewrite history. Source-push authorization does not authorize tagging, publishing releases or uploading installers. Use synthetic fixtures and isolated profiles for acceptance, and mark unavailable tests BLOCKED or NOT RUN.
