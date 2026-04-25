# Trae Context Patcher

一个可通过脚本在 Windows 和 macOS 上运行的 Trae 上下文窗口补丁工具。你可以使用 GUI 或命令行管理 `模型 ID -> 上下文窗口 token 数` 覆盖规则。

[English](#english)

## 功能

- 保存 `模型 ID -> 上下文窗口 token 数` 配置
- 修改 Trae 安装目录中的 `out/main.js`
- 写入 `out/trae-context-override.js`
- 可通过 `revert` 恢复原始 `main.js`
- 提供 Electron GUI，可视化编辑规则，并一键应用或还原补丁

## 脚本启动

首次使用需要安装 Node.js 和 pnpm。

Windows GUI：

```powershell
.\start-gui.cmd
```

macOS GUI：

```bash
chmod +x ./start-gui.sh ./tcp.sh ./run-cli.sh
./start-gui.sh
```

跨平台命令行：

```bash
pnpm run cli -- status
pnpm run cli -- set gpt-5.4 1000000
pnpm run cli -- apply
```

也可以直接使用脚本：

```powershell
.\tcp.cmd status
.\tcp.cmd set gpt-5.4 1000000
.\tcp.cmd apply
```

```bash
./tcp.sh status
./tcp.sh set gpt-5.4 1000000
./tcp.sh apply
```

## Trae 路径

工具会自动尝试常见路径：

- Windows: `%LOCALAPPDATA%\Programs\Trae`
- Windows: `%LOCALAPPDATA%\Trae`
- macOS: `/Applications/Trae.app/Contents/Resources/app`
- macOS: `~/Applications/Trae.app/Contents/Resources/app`

如果自动检测不到，手动指定：

```bash
pnpm run cli -- status --trae-root /Applications/Trae.app/Contents/Resources/app
pnpm run cli -- apply --trae-root /Applications/Trae.app/Contents/Resources/app
```

Windows 示例：

```powershell
pnpm run cli -- status --trae-root C:\Users\23382\AppData\Local\Programs\Trae
```

也可以用环境变量：

```bash
TRAE_INSTALL_DIR=/Applications/Trae.app/Contents/Resources/app ./tcp.sh status
```

## 配置文件路径

- Windows: `%APPDATA%\TraeContextPatcher\model-overrides.json`
- macOS: `~/Library/Application Support/TraeContextPatcher/model-overrides.json`

可以手动指定配置文件：

```bash
pnpm run cli -- status --config ./model-overrides.json
```


## 还原补丁和清理配置

还原已经写入 Trae 文件的补丁：

```powershell
.\tcp.cmd revert
```

```bash
./tcp.sh revert
```

如果自动找不到 Trae，手动指定路径：

```powershell
.\tcp.cmd revert --trae-root C:\Users\23382\AppData\Local\Programs\Trae
```

```bash
./tcp.sh revert --trae-root /Applications/Trae.app/Contents/Resources/app
```

`revert` 只还原 Trae 文件补丁，不会删除已保存的模型上下文配置。查看配置：

```bash
./tcp.sh list
```

删除某个模型配置：

```powershell
.\tcp.cmd remove gpt-5.4
```

```bash
./tcp.sh remove gpt-5.4
```

如果要“补丁和配置都清掉”，先 `revert`，再对 `list` 中的模型逐个 `remove`。

## Windows EXE

仍然可以构建 Windows 便携 EXE：

```powershell
pnpm build:exe
```

产物输出到 `dist\Trae Context Patcher-cn.exe`。

## 安全说明

- 执行 `apply` 或 `revert` 前请先关闭 Trae
- GUI 中勾选自动关闭时，Windows 和 macOS 会尝试自动退出 Trae
- 工具会在修改前备份 `main.js`
- 测试只会操作临时的模拟 Trae 目录

## 常见流程

```bash
pnpm run cli -- set gpt-5.4 1000000
pnpm run cli -- apply
pnpm run cli -- status
```

然后重启 Trae，并使用匹配的自定义模型开启新的聊天会话。

---

## English

A script-first Trae context window patcher that runs on Windows and macOS. You can use either the Electron GUI or the CLI to manage `model ID -> context window token` overrides.

## Features

- Stores `model ID -> context window tokens` overrides
- Patches Trae's `out/main.js`
- Writes `out/trae-context-override.js`
- Restores the original `main.js` with `revert`
- Provides an Electron GUI for visual editing and one-click apply/revert

## Script Launch

Node.js and pnpm are required for first use.

Windows GUI:

```powershell
.\start-gui.cmd
```

macOS GUI:

```bash
chmod +x ./start-gui.sh ./tcp.sh ./run-cli.sh
./start-gui.sh
```

Cross-platform CLI:

```bash
pnpm run cli -- status
pnpm run cli -- set gpt-5.4 1000000
pnpm run cli -- apply
```

Direct scripts:

```powershell
.\tcp.cmd status
.\tcp.cmd set gpt-5.4 1000000
.\tcp.cmd apply
```

```bash
./tcp.sh status
./tcp.sh set gpt-5.4 1000000
./tcp.sh apply
```

## Trae Paths

The tool tries these common locations automatically:

- Windows: `%LOCALAPPDATA%\Programs\Trae`
- Windows: `%LOCALAPPDATA%\Trae`
- macOS: `/Applications/Trae.app/Contents/Resources/app`
- macOS: `~/Applications/Trae.app/Contents/Resources/app`

Override the path if needed:

```bash
pnpm run cli -- status --trae-root /Applications/Trae.app/Contents/Resources/app
pnpm run cli -- apply --trae-root /Applications/Trae.app/Contents/Resources/app
```

Windows example:

```powershell
pnpm run cli -- status --trae-root C:\Users\23382\AppData\Local\Programs\Trae
```

Or use an environment variable:

```bash
TRAE_INSTALL_DIR=/Applications/Trae.app/Contents/Resources/app ./tcp.sh status
```

## Config Path

- Windows: `%APPDATA%\TraeContextPatcher\model-overrides.json`
- macOS: `~/Library/Application Support/TraeContextPatcher/model-overrides.json`

Use a custom config file:

```bash
pnpm run cli -- status --config ./model-overrides.json
```


## Revert Patches and Clear Config

Revert patches written into Trae files:

```powershell
.\tcp.cmd revert
```

```bash
./tcp.sh revert
```

If Trae is not detected automatically, pass the path manually:

```powershell
.\tcp.cmd revert --trae-root C:\Users\23382\AppData\Local\Programs\Trae
```

```bash
./tcp.sh revert --trae-root /Applications/Trae.app/Contents/Resources/app
```

`revert` only restores patched Trae files. It does not delete saved model context settings. List saved settings:

```bash
./tcp.sh list
```

Remove one model setting:

```powershell
.\tcp.cmd remove gpt-5.4
```

```bash
./tcp.sh remove gpt-5.4
```

To clear both patches and config, run `revert` first, then remove each model shown by `list`.

## Windows EXE

You can still build the portable Windows EXE:

```powershell
pnpm build:exe
```

The output is `dist\Trae Context Patcher-cn.exe`.

## Safety

- Close Trae before `apply` or `revert`
- If automatic close is enabled in the GUI, Windows and macOS will try to quit Trae
- The tool creates a backup of `main.js` before changing it
- Tests only touch temporary fake Trae directories

## Typical Workflow

```bash
pnpm run cli -- set gpt-5.4 1000000
pnpm run cli -- apply
pnpm run cli -- status
```

Then restart Trae and open a new chat session with the matching custom model.
