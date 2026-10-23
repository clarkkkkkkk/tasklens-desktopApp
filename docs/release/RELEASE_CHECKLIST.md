# Release checklist

Current verdict: **NOT READY**. Publication has not been authorized. A later instruction authorized committing and pushing source to `main`; it did not authorize publishing installers, creating a release or deploying hosting.

## Source and validation

- [x] Inspect and preserve baseline `374f692`, working changes and collaborator refs.
- [x] Save external recovery patch and untracked archive before release edits.
- [x] Isolate release work from other active chats in a managed worktree.
- [ ] Reconcile latest remote `main` without rewriting history before the authorized source push.
- [ ] Record final source commit/tree, versions and dependency lockfiles.
- [ ] TypeScript, ESLint, formatting, Vitest, browser tests and Rust checks pass on the candidate.
- [ ] Dependency audits and redacted full-history/working-tree/artifact scans are reviewed.
- [ ] Resolve or explicitly approve the GLib unsoundness advisory and maintenance findings.
- [ ] Exact candidate commit has a successful remote CI run; local checks alone do not satisfy this gate.

## Artifacts and native acceptance

- [ ] Model/runtime/language-data provenance, format, size and SHA-256 pass.
- [ ] Actual-platform notices cover bundled runtimes and libraries.
- [ ] Package RPM, DEB, AppImage, Windows EXE, ARM64 DMG and Intel DMG where feasible.
- [ ] Verify every final installer hash, size, architecture, dependencies and resource layout.
- [ ] Windows WebView2 installs offline and handles failure/reboot; signed setup/uninstaller verified if signing is available.
- [ ] macOS permissions, Developer ID, notarization and clean Gatekeeper behavior verified where available.
- [ ] Every supported platform completes the fresh-install protocol in PLATFORM_TEST_MATRIX.md.
- [ ] Upgrade/uninstall tests preserve user data and use disposable profiles.
- [ ] No unexecuted check is reported PASS; unsupported platforms are absent from public support claims.

## Distribution and explicit approval

- [ ] Owner selects and approves the large-file host for oversized complete installers.
- [ ] Owner approves the exact version, commit, platform set, signing limitations and release notes.
- [ ] Owner explicitly authorizes uploading and publishing (separate from source push).
- [ ] Upload immutable versioned files, then independently download every artifact and verify full bytes/SHA-256.
- [ ] Populate machine-readable manifest URLs only after verification.
- [ ] Confirm all documentation links resolve to the expected verified artifacts.
- [ ] Publish a prerelease using the approved semantic version tag; do not mark 1.0.0 or stable before acceptance.
- [ ] Attach checksums, manifest and third-party notices; attach eligible installers or verified official large-file links.

## Publication procedure (manual, not executed)

Publication is intentionally outside ordinary CI and requires an explicit owner action after the above gates. Freeze the candidate commit, build and verify signed installers on the native hosts, review evidence, and choose the approved version tag. A tag must point to that exact tested commit. Use a draft GitHub Release first, inspect its notes/assets/links, then publish only with owner approval. Never publish automatically from a push to main or from a passing compilation job.

No release workflow has write permission by default. The packaging workflow is `workflow_dispatch` with `package=true`, produces internal candidate artifacts, and does not publish. Protected signing infrastructure and external host provisioning remain operational prerequisites, not implied completed features.
