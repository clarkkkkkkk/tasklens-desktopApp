# Contributing

Read PROJECT_SUMMARY.md, ARCHITECTURE.md and **DESIGN_SKILL.md** before editing. Work is shared between Developer 1 (UI/product) and Developer 2 (domain/storage/native). Discuss shared contract changes first; keep backward-compatible optional additions or introduce an explicit storage migration. Never bypass the repository from a component.

Recommended branches: `main` (stable), `develop` (integration), `feature/ui-shell`, `feature/inbox`, `feature/calendar`, `feature/persistence`, `feature/mock-extraction`, `feature/reminders`. Branches are recommendations; this task does not initialize, push or rewrite Git history.

Use small descriptive commits such as `feat: add editable extraction review` or `fix: preserve draft on storage failure`. Pull requests explain user-visible behavior, validation, limitations and screenshots for UI changes. Developer 1 reviews design, keyboard behavior and component reuse; Developer 2 reviews contracts, migrations, local data flow and native capabilities. Cross-layer changes require both perspectives.

Before merge: `npm run check`, `npm test`, `npm run test:e2e`, `npm run build`; on an equipped native host run `npm run tauri build -- --no-bundle`. Review the full capture → review → save → reload flow. Keep TASK_TRACKER.md and developer progress notes current. No API keys, analytics, remote AI, cloud dependencies or generated build output in commits. Check package licenses before adding dependencies.

If a new visual convention is necessary, update DESIGN_SKILL.md before implementation. Screenshots in PRs should use sample data, never private announcements. Report security issues privately to the repository maintainers once a public hosting location is established.
