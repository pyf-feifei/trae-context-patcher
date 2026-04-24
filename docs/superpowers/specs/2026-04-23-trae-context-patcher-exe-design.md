# Trae Context Patcher EXE Design

**Date:** 2026-04-23  
**Status:** Drafted from approved assumptions

## Goal

Turn the standalone CLI-only patcher into a Windows desktop tool that can be opened directly as an `.exe`, edited visually, and used without touching the terminal.

## User Experience

The application opens as a single desktop window named `Trae Context Patcher`.

The first screen shows:
- the detected Trae install path
- whether Trae is running
- whether `main.js` is patched and who currently owns the patch
- the configured model override list
- controls to add, edit, delete, apply, revert, and refresh

The primary flow is:
1. Open the EXE
2. Add one or more `model ID -> context window tokens` mappings
3. Click `Apply Patch`
4. Restart Trae

## Recommended Approach

Use Electron for the desktop shell and keep the existing patcher/config logic as the backend.

### Why this approach
- the existing codebase is already pure Node.js and can be reused directly
- the machine has Node and pnpm available, but no .NET SDK or Rust toolchain
- Electron can produce a Windows portable EXE with the least rewrite risk
- the patcher needs local filesystem and process access, which Electron handles naturally

### Alternatives considered
1. **Electron desktop app** - fastest path, largest binary, best code reuse. **Recommended.**
2. **C# WinForms/WPF app** - smaller native app, but requires a full rewrite and a missing .NET SDK.
3. **Tauri/WebView desktop app** - smaller output, but requires Rust and a second implementation layer.

## Architecture

### Core modules kept as-is
The existing modules remain the source of truth for patching behavior:
- `src/config.js`
- `src/patcher.js`
- `src/helper-template.js`
- `src/process-check.js`
- `src/trae-paths.js`

### New desktop layers
Add three thin layers:

1. **Desktop service layer**
   - wraps core functions into UI-friendly actions
   - returns serializable state for the renderer
   - centralizes sorting and formatting for the model list

2. **Electron shell**
   - `main` process creates the window and registers IPC handlers
   - `preload` exposes a minimal safe API to the renderer
   - renderer runs with `contextIsolation: true` and no direct Node access

3. **Renderer UI**
   - plain HTML/CSS/JS single-window app
   - table for mappings
   - inline form for add/edit
   - status cards and action buttons
   - lightweight notification area for success/error messages

## Window Layout

### Header
- product title
- short subtitle describing that the tool patches Trae locally
- refresh button

### Status strip
- Trae path
- Trae running state
- patch state
- patch owner
- config file path

### Model overrides panel
- table with `Model ID`, `Context Tokens`, `Updated`, `Actions`
- `Edit` and `Delete` action buttons per row
- empty state when no mappings exist

### Editor panel
- text input for model ID
- numeric input for context window tokens
- `Save Mapping` button
- `Cancel Edit` button when editing

### Patch actions panel
- `Apply Patch`
- `Revert Patch`
- contextual warning when Trae is still running
- explicit note when the current patch owner is `mtga` and applying will take over

### Feedback area
- compact activity log / toast line for latest action result

## Behavior Rules

- `Apply Patch` and `Revert Patch` surface a clear error if Trae is running
- if the current owner is `mtga`, `Apply Patch` replaces the old import with this tool's helper
- mapping edits save immediately to `%APPDATA%\TraeContextPatcher\model-overrides.json`
- the desktop app refreshes status after every mutating action
- no background service, no tray, no installer in v1
- default Trae root stays auto-detected; manual override can be added later if needed

## Packaging

Build a Windows portable EXE with Electron Builder.

### Output target
- `dist\Trae Context Patcher.exe`

### Non-goals for v1
- MSI installer
- auto-start or tray mode
- live Trae process termination
- automatic model discovery from external systems

## Testing

Keep the existing single-process test runner and extend it with:
- desktop service tests for list/save/remove/apply/revert flows
- a smoke-level packaging check via Electron Builder on Windows

UI behavior will rely on the tested service layer and a manual smoke test of the packaged EXE.
