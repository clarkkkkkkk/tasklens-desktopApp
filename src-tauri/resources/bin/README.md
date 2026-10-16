# Legacy runtime directory

Current releases use Tauri `bundle.externalBin` sidecars prepared in `src-tauri/binaries`
by `npm run build:runtimes`. This legacy directory is no longer included in packaging.
Do not copy inference executables here. See LOCAL_AI.md for the native build workflow.
