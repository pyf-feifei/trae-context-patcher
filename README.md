# Trae Context Patcher

[English](#english)

一个适用于 Windows 的 Trae 上下文窗口补丁工具。你可以通过命令行或打包后的桌面 EXE 管理 `模型 ID -> 上下文窗口 token 数` 覆盖规则。

## 功能

- 将 `模型 ID -> 上下文窗口 token 数` 保存到 `%APPDATA%\TraeContextPatcher\model-overrides.json`
- 修改 `Trae\resources\app\out\main.js`
- 写入 `Trae\resources\app\out\trae-context-override.js`
- 可通过 `revert` 恢复原始 `main.js`
- 提供桌面窗口，可视化编辑规则，并一键应用或还原补丁

## 桌面 EXE

开发模式运行：

```powershell
pnpm dev
```

构建 Windows 便携 EXE：

```powershell
pnpm build:exe
```

打包产物会输出到 `dist\`，当前文件名为 `dist\Trae Context Patcher-cn.exe`。

## 安全说明

- 执行 `apply` 或 `revert` 前请先关闭 `Trae.exe`
- 工具会在修改前备份 `main.js`
- 测试只会操作临时的模拟 Trae 目录
- 如果当前补丁所有者是 `mtga`，使用本工具应用补丁时会接管现有 import hook

## 命令行

```powershell
node .\src\cli.js status
node .\src\cli.js list
node .\src\cli.js set gpt-5 262144
node .\src\cli.js remove gpt-5
node .\src\cli.js apply
node .\src\cli.js revert
```

可选路径覆盖：

```powershell
node .\src\cli.js status --trae-root C:\Users\23382\AppData\Local\Programs\Trae
node .\src\cli.js status --config C:\path\to\model-overrides.json
```

## 默认路径

- Trae 安装目录：`C:\Users\23382\AppData\Local\Programs\Trae`
- 配置文件：`%APPDATA%\TraeContextPatcher\model-overrides.json`

## 常见流程

```powershell
node .\src\cli.js set gpt-5 262144
node .\src\cli.js apply
node .\src\cli.js status
```

然后重启 Trae，并使用匹配的自定义模型开启新的聊天会话。

---

## English

[中文](#trae-context-patcher)

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
