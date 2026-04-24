# Trae Context Patcher

A standalone Windows patcher for Trae that lets you manage `model ID -> context window` overrides either from the CLI or from a packaged desktop EXE.

## What it does

- stores `model ID -> context window tokens` in `%APPDATA%\TraeContextPatcher\model-overrides.json`
- patches `Trae\resources\app\out\main.js`
- writes `Trae\resources\app\out\trae-context-override.js`
- restores the original `main.js` on `revert`
- can be opened as a desktop window for visual editing and one-click apply or revert

## Desktop EXE

Run the app in development:

```powershell
pnpm dev
```

Build the portable Windows EXE:

```powershell
pnpm build:exe
```

The packaged executable is emitted under `dist\`, currently as `dist\Trae Context Patcher-cn.exe`.

## Safety

- close `Trae.exe` before `apply` or `revert`
- the tool creates a backup of `main.js` before changing it
- tests only touch temporary fake Trae directories
- if the current patch owner is `mtga`, applying from this tool will take over the existing import hook

## Commands

```powershell
node .\src\cli.js status
node .\src\cli.js list
node .\src\cli.js set gpt-5 262144
node .\src\cli.js remove gpt-5
node .\src\cli.js apply
node .\src\cli.js revert
```

Optional overrides:

```powershell
node .\src\cli.js status --trae-root C:\Users\23382\AppData\Local\Programs\Trae
node .\src\cli.js status --config C:\path\to\model-overrides.json
```

## Default paths

- Trae install: `C:\Users\23382\AppData\Local\Programs\Trae`
- config file: `%APPDATA%\TraeContextPatcher\model-overrides.json`

## Typical workflow

```powershell
node .\src\cli.js set gpt-5 262144
node .\src\cli.js apply
node .\src\cli.js status
```

Then restart Trae and open a new chat session with the matching custom model.
