# Release checklist

Current verdict: **NOT READY**. The owner requested GitHub-only draft preparation and source/website updates. Public installer publication remains blocked until the required checks pass.

## Source and security

- [x] Inspect baseline, collaborator history and dirty changes; preserve recoverable baseline and both developers' work.
- [x] Create isolated release branch/worktree and merge current published main without rewriting history.
- [x] Keep application identity, UI/logo, model pins, local-first defaults and optional Groq.
- [x] Record exact compiled commit/tree and consistent 0.1.0 application versions.
- [x] Exact-candidate quality and four-platform native compilation CI pass (`0d678fc`).
- [x] Patch Vitest and Zod; current npm audit has zero vulnerabilities.
- [x] Redacted history/source/frontend scans; inspect extracted binaries/notices, triage public-license false positive.
- [ ] Resolve/review open GLib unsoundness and maintenance warnings for production approval.
- [ ] Complete native credential, consent, network/retry and authorized live Groq acceptance.

## Packaging and native acceptance

- [x] Fedora candidate RPM, DEB and AppImage generated with models, runtimes, OCR data and notices.
- [x] Fedora container install/library/sidecar/uninstall/data-sentinel checks pass.
- [x] Native Fedora screenshot OCR, local extraction, evidence review and draft save pass.
- [ ] Rebuild after verified exam-classification and required-arrival omissions; rerun strict real-model checks.
- [ ] Complete all native workflows, restart, export, reminders, failure recovery and upgrade tests.
- [ ] Replace Fedora-built Linux release inputs with Ubuntu-built candidates and verify both distributions. Fedora sidecars fail Ubuntu 24.04 with missing GLIBC_2.43.
- [ ] Rerun CI after macOS ARM native-input tar truncation; verify chunk reconstruction and post-extraction hashes.
- [ ] Complete Windows EXE and both macOS DMG packaging and artifact checks.
- [ ] Test clean desktop installs, baseline CPUs and target-specific permissions on every advertised platform.
- [ ] Verify Authenticode/Developer ID/notarization when credentials exist; otherwise disclose unsigned limitations and test the actual OS behavior.
- [ ] Review prerelease tag versus installer version metadata before publication.

## GitHub-only delivery

- [x] Owner selected GitHub Releases exclusively; no external host or Git LFS.
- [x] Automatically split complete oversized installers into approximately 1 GiB parts; retain original offline installers.
- [x] Produce complete/per-part SHA-256 inventory and source/signing/architecture manifest.
- [x] Supply system shell and PowerShell reconstruction scripts; synthetic native regression tests pass on all four CI runners.
- [x] Prepare draft release targeting compiled source; no public installer publication.
- [ ] Verify final complete installers and all parts, stage only assets under 2 GiB, upload checksums/manifests/notices/scripts/parts to the same draft.
- [ ] Download every uploaded draft asset, verify hashes and complete reconstruction on each target platform; record receipts.
- [ ] Populate real download locations only after the applicable verification; never use Actions artifacts as permanent public links.
- [x] Update README/RELEASING and website Download guidance; live website deployment verified separately.
- [ ] Pass every required advertised-platform/security/distribution gate before changing draft to published.

Ordinary CI has read-only repository contents permissions and no real Groq/signing secrets. Packaging is manually dispatched and has no publication step. A passing build does not grant production acceptance. Do not force tags, rewrite history, replace models, execute unverified remote scripts or clear personal profiles to make a gate pass.

## Final observed handoff: 2026-10-24

**NOT READY.** Latest implementation source `dfef55578349ed74d41ede73355d140dcbf57524` was pushed to main. Its optimized production application compiled, but installer packaging was interrupted during RPM creation; no final installer inventory exists for that source. The staged production binary passed startup and native OCR, then **FAIL**: screenshot extraction reported that the local model did not respond. Later checks in that sequence were **NOT RUN**. This does not certify a clean install or successful real-model repair.

Quality run [40078422617](https://github.com/clarkkkkkkk/tasklens-desktopApp/actions/runs/40078422617) initially failed the screenshot-result modal visibility test: **111 browser tests passed, 1 failed**. Repeated local full-modal tests recorded 2 passes and 1 overall test timeout; that is not a resolved CI failure. Rerun/current native-run status could not be verified reliably because GitHub access intermittently failed DNS/routing. No pending run is counted as passed.

The last verified GitHub release remained a draft with no installer assets attached; no public installer was published by this work. Do not promote the earlier failed 0d678fc artifacts. Website source `98e6cc1` is independently deployed and HTTPS content-verified. See the [machine-readable handoff](../evaluation/release-handoff-2026-10-24.json). Source compilation, local transport verification, website deployment and desktop production acceptance remain separate results.
