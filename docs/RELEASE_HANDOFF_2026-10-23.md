# Release preparation handoff — 2026-10-23

Branch `codex/production-release-preparation` at `94fcbfc`. Gate status lives in [RELEASE_CHECKLIST](../RELEASE_CHECKLIST.md); build and distribution steps in [RELEASING](RELEASING.md). This note records what changed and what is left.

## Starting point

Codex left one checkpoint commit (`96be317`) forked from `374f692`, before main gained the security audit (`f0f1c60`), the guided tour and the release-audit docs. All UI sources were already identical to main. The `codex/release-security-audit` and `codex/production-release-candidate` worktrees named in the original brief were not on origin; their audit work had already reached main.

## Changes on this branch

| Commit    | Change                                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0737067` | Merged main. Four conflicts: `credentials.rs` and `release-tools.test.mjs` took the release side (supersets of main); the other two were corrected next              |
| `0364aca` | Restored automatic splitting of installers over 2 GiB, which the `release-desktop.mjs` rewrite had dropped; `SHA256SUMS` covers parts; `verifyInventory` checks them |
| `62b450d` | `native-voice.yml` no longer repeats `quality.yml`; model cache, `persist-credentials: false`, timeouts and PR path filter restored                                  |
| `abb1482` | Real-model probe uses the app's 300 s load budget (`MODEL_LOAD_BUDGET`); rerun evidence recorded                                                                     |
| `efaaeb4` | Windows Tesseract fix for Tauri's `\\?\` resource paths, ported from `f420d5c` on `frenzzy`                                                                          |
| `94fcbfc` | Merged main again for the Whisper MSVC static-runtime fix (`e00f24a`)                                                                                                |

Separate branch `fix/tour-small-viewport` (`148ad89`, off main) fixes the only failing CI browser test: at 600×640 the guided-tour card covered its target because no side had room. It is kept out of this branch because it is UI work on main.

## Open blockers, most severe first

1. **No current installer exists.** Linux packaging for `94fcbfc` was OOM-killed on the 7.4 GiB laptop during the RPM step; a rebuild on a 32 GB host is in progress. No Windows or macOS installer has been built.
2. **Windows never run.** Installer, WebView2 prerequisite, OCR path fix, Credential Manager and reminders need a native Windows run.
3. **Qwen accuracy.** Load and inference work; the simple-English case scores 6/7 (drops "paper"). Multilingual accuracy not rerun.
4. **CI red on main** until `fix/tour-small-viewport` merges. `94fcbfc` itself has no CI run yet (no PR).
5. **Cargo advisories**: zero vulnerabilities, eight allowed warnings including unsound `glib` (upstream GTK stack).
6. **Repository settings**: branch protection, secret scanning and private reporting are owner actions.
7. **Not yet exercised**: in-app microphone capture, live Groq, clean install/uninstall, reminders across restart, signing/notarization, macOS runtime, Intel macOS build.

## Next steps

1. Build Linux packages on the 32 GB host, run `node scripts/release-artifacts.mjs`, reassemble one installer from its parts, and fill in the Linux rows.
2. Install the AppImage or RPM on Fedora with an isolated profile and walk the capture → review → save → restart flow.
3. Open a PR for `fix/tour-small-viewport`, then one for this branch, so both get exact-commit CI.
4. Build the Windows installer natively (Inno Setup 6.5.2+, verified offline WebView2) and run the native acceptance scripts.
