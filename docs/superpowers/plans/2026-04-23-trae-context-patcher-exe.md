# Trae Context Patcher EXE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows desktop EXE for configuring model overrides and applying or reverting the Trae patch without using the CLI.

**Architecture:** Keep the existing Node.js patcher/config modules as the backend, add a thin desktop service layer that returns renderer-friendly state, and wrap it in a secure Electron shell with a single-window HTML/CSS/JS UI. Package the app with Electron Builder as a Windows portable executable.

**Tech Stack:** Node.js, Electron, Electron Builder, plain HTML/CSS/JS, existing custom single-process test runner

---

## File Structure

- Modify: `package.json`
- Modify: `README.md`
- Modify: `tests/run-tests.js`
- Create: `src/desktop-service.js`
- Create: `src/electron/main.js`
- Create: `src/electron/preload.js`
- Create: `src/electron/ipc.js`
- Create: `src/ui/index.html`
- Create: `src/ui/app.js`
- Create: `src/ui/styles.css`
- Test: `tests/run-tests.js`

### Task 1: Desktop Service Layer

**Files:**
- Create: `src/desktop-service.js`
- Modify: `tests/run-tests.js`

- [ ] **Step 1: Write the failing desktop service tests**

Add tests that expect these functions to exist and return a renderer-friendly dashboard:

```js
import {
  applyDesktopPatch,
  loadDesktopState,
  removeDesktopModelOverride,
  revertDesktopPatch,
  saveDesktopModelOverride,
} from "../src/desktop-service.js";
```

Required assertions:
- `loadDesktopState()` returns sorted mappings and patch metadata
- `saveDesktopModelOverride()` persists a model and returns updated state
- `removeDesktopModelOverride()` removes the model and returns updated state
- `applyDesktopPatch()` flips `mainPatched` to `true`
- `revertDesktopPatch()` flips `mainPatched` back to `false`

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test`
Expected: FAIL because `src/desktop-service.js` does not exist yet.

- [ ] **Step 3: Implement the minimal desktop service**

Create functions that wrap the existing config and patcher modules and normalize the result to this shape:

```js
{
  status: {
    traeRoot,
    configPath,
    traeFound,
    traeRunning,
    mainPatched,
    patchOwner,
    helperExists,
    backupExists,
    modelCount,
  },
  mappings: [
    {
      modelId,
      contextWindowTokens,
      updatedAt,
      source,
    },
  ],
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS for the new desktop service tests and all existing tests.

### Task 2: Electron Shell And Secure IPC

**Files:**
- Modify: `package.json`
- Create: `src/electron/main.js`
- Create: `src/electron/preload.js`
- Create: `src/electron/ipc.js`

- [ ] **Step 1: Add Electron dependencies and scripts**

Add dev dependencies and scripts for development and packaging:

```json
{
  "main": "./src/electron/main.js",
  "scripts": {
    "dev": "electron .",
    "test": "node ./tests/run-tests.js",
    "build:exe": "electron-builder --win portable"
  }
}
```

- [ ] **Step 2: Register minimal IPC handlers**

Expose handlers for:
- `desktop:load-state`
- `desktop:save-model`
- `desktop:remove-model`
- `desktop:apply-patch`
- `desktop:revert-patch`

Each handler should call the desktop service and return the updated state.

- [ ] **Step 3: Expose a safe preload API**

Expose a narrow renderer API:

```js
window.traeContextPatcher = {
  loadState,
  saveModel,
  removeModel,
  applyPatch,
  revertPatch,
};
```

- [ ] **Step 4: Start the window with locked-down preferences**

Use:

```js
{
  contextIsolation: true,
  nodeIntegration: false,
  preload: join(__dirname, "preload.js")
}
```

- [ ] **Step 5: Run tests again**

Run: `pnpm test`
Expected: PASS. The Electron shell is not covered directly, but the backend contract stays green.

### Task 3: Single-Window Renderer UI

**Files:**
- Create: `src/ui/index.html`
- Create: `src/ui/app.js`
- Create: `src/ui/styles.css`
- Modify: `README.md`

- [ ] **Step 1: Build the static window structure**

Create panels for:
- header
- status strip
- mapping form
- mappings table
- patch action buttons
- feedback area

- [ ] **Step 2: Wire renderer actions to the preload API**

Behavior requirements:
- load current state on startup
- save mappings from the form
- populate the form when editing an existing row
- remove mappings from row actions
- refresh the status after apply and revert
- show friendly success or error messages

- [ ] **Step 3: Add intentional desktop styling**

Use a bold but readable desktop theme:
- warm gradient background
- slate panels with amber accents
- clear state badges
- responsive single-column fallback for narrow windows

- [ ] **Step 4: Update docs for EXE usage**

Document:
- `pnpm dev`
- `pnpm build:exe`
- where the EXE is emitted
- the same apply/revert safety notes from the CLI README

- [ ] **Step 5: Run tests and packaging build**

Run:
- `pnpm test`
- `pnpm build:exe`

Expected:
- tests pass
- Electron Builder emits a Windows portable executable under `dist\`

## Self-Review

- **Spec coverage:** covered desktop window UX, status display, model management, patch actions, packaging, and testing. No tray or installer work included, matching the v1 non-goals.
- **Placeholder scan:** no TBD/TODO markers or omitted commands remain.
- **Type consistency:** the plan uses one consistent dashboard shape and one consistent preload API naming scheme.
