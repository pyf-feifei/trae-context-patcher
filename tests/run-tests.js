import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, removeModelOverride, setModelOverride } from "../src/config.js";
import { buildHelperSource } from "../src/helper-template.js";
import { getTraeRootCandidates, resolveTraePaths } from "../src/trae-paths.js";
import {
  applyDesktopPatch,
  loadDesktopState,
  removeDesktopModelOverride,
  revertDesktopPatch,
  saveDesktopModelOverride,
} from "../src/desktop-service.js";
import { applyPatch, getPatchStatus, revertPatch } from "../src/patcher.js";
import { runCli } from "../src/cli.js";
import { applyRealContextPatch, getRealContextPatchStatus, revertRealContextPatch } from "../src/real-context-patch.js";
import { terminateTraeIfRequested } from "../src/process-check.js";

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createFakeTraeInstall(prefix = "tcp-trae-") {
  const root = tempDir(prefix);
  const outDir = path.join(root, "resources", "app", "out");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "main.js"), 'console.log("main");\n', "utf8");
  return { root, outDir };
}


function createFakeTraeWithRealContextFile(prefix = "tcp-real-") {
  const fake = createFakeTraeInstall(prefix);
  const distDir = path.join(
    fake.root,
    "resources",
    "app",
    "node_modules",
    "@byted-icube",
    "ai-modules-chat",
    "dist",
  );
  fs.mkdirSync(distDir, { recursive: true });
  const indexJsPath = path.join(distDir, "index.js");
  const source = 'class j9{createChatRequestModelInfo(e,t,i,r){let o={name:"openai//gpt-5.4",display_name:"gpt-5.4",base_url:"https://spongyicybulk-clip.hf.space/v1/chat/completions"};let u={provider:o?.provider||"",config_name:o?.name||i||"",display_model_name:o?.display_name,multimodal:o?.multimodal===!0,ak:o?.ak||"",use_remote_service:!o?.client_connect,is_preset:false,config_source:o?.config_source??3,base_url:o?.base_url||"",context_window_size:o?.selected_max_context_window_size,region:o?.region,sk:o?.sk||"",auth_type:o?.auth_type||0},d=this.configurationService.getConfiguration("ai_assistant.request.aws_session_token")||void 0;return d&&(u.session_token=d),u}createChatRequestObject(){let g={config_name:"openai//gpt-5.4",context_window_size:262144};return{model_name:g.config_name,custom_model:j4(g,["context_window_size"]),terminal_context:[]}}renderUsage(l,i){if(!l||!(i?.last_turn_total_tokens&&i?.max_tokens))return null;let f=i?.last_turn_total_tokens/i?.max_tokens,_=`${(100*f).toFixed(0)}%`;return{percent:_,total:`${i.max_tokens/1e3}K`}}}';
  fs.writeFileSync(indexJsPath, source, "utf8");
  return { ...fake, indexJsPath, source };
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  }
}





await runTest("getTraeRootCandidates includes env override and common Windows installs", async () => {
  const previousTraeInstallDir = process.env.TRAE_INSTALL_DIR;
  const previousLocalAppData = process.env.LOCALAPPDATA;
  process.env.TRAE_INSTALL_DIR = "C:/Custom/Trae";
  process.env.LOCALAPPDATA = "C:/Users/Test/AppData/Local";
  try {
    const candidates = getTraeRootCandidates();
    assert.equal(candidates[0], path.resolve("C:/Custom/Trae"));
    assert.ok(candidates.includes(path.resolve("C:/Users/Test/AppData/Local/Programs/Trae")));
    assert.ok(candidates.includes(path.resolve("C:/Users/Test/AppData/Local/Trae")));
  } finally {
    if (previousTraeInstallDir === undefined) {
      delete process.env.TRAE_INSTALL_DIR;
    } else {
      process.env.TRAE_INSTALL_DIR = previousTraeInstallDir;
    }
    if (previousLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = previousLocalAppData;
    }
  }
});

await runTest("resolveTraePaths selects first candidate that contains main.js", async () => {
  const root = tempDir("tcp-auto-root-");
  const missingRoot = path.join(root, "missing");
  const validRoot = path.join(root, "valid-trae");
  const outDir = path.join(validRoot, "resources", "app", "out");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "main.js"), 'console.log(\"main\");\n', "utf8");

  const paths = resolveTraePaths({ candidates: [missingRoot, validRoot] });
  assert.equal(paths.traeRoot, path.resolve(validRoot));
  assert.equal(paths.traeFound, true);
});

await runTest("custom marker allows provider-prefixed custom model without patching native twin", async () => {
  const helperSource = buildHelperSource({ configPath: "C:/tmp/model-overrides.json" });
  const testableHelperSource = helperSource
    .replace(/^import .*$/gm, "")
    .replace(/app\.on\([\s\S]*$/, "");
  const applyOverridesToObject = new Function(`${testableHelperSource}
return applyOverridesToObject;`)();
  const payload = {
    models: [
      { model: "openai//gpt-5.4", is_custom_model: 0, context_window_sizes: [131072], prompt_max_tokens: 131072 },
      { model: "openai//gpt-5.4", is_custom_model: 1, context_window_sizes: [131072], prompt_max_tokens: 131072 },
    ],
  };

  applyOverridesToObject(payload, {
    models: {
      "gpt-5.4": { context_window_tokens: 262144 },
    },
  });

  assert.deepEqual(payload.models[0].context_window_sizes, [262144]);
  assert.equal(payload.models[0].prompt_max_tokens, 262144);
  assert.deepEqual(payload.models[1].context_window_sizes, [262144]);
  assert.equal(payload.models[1].prompt_max_tokens, 262144);
});

await runTest("bare model id patches provider-prefixed Trae model", async () => {
  const helperSource = buildHelperSource({ configPath: "C:/tmp/model-overrides.json" });
  const testableHelperSource = helperSource
    .replace(/^import .*$/gm, "")
    .replace(/app\.on\([\s\S]*$/, "");
  const applyOverridesToObject = new Function(`${testableHelperSource}
return applyOverridesToObject;`)();
  const payload = {
    models: [
      { model: "openai//gpt-5.4", context_window_sizes: [131072], prompt_max_tokens: 131072 },
      { model: "gpt-5.4", is_custom_model: 1, context_window_sizes: [131072], prompt_max_tokens: 131072 },
    ],
  };

  applyOverridesToObject(payload, {
    models: {
      "gpt-5.4": { context_window_tokens: 262144 },
    },
  });

  assert.deepEqual(payload.models[0].context_window_sizes, [262144]);
  assert.equal(payload.models[0].prompt_max_tokens, 262144);
  assert.deepEqual(payload.models[1].context_window_sizes, [262144]);
  assert.equal(payload.models[1].prompt_max_tokens, 262144);
});

await runTest("helper updates common context display fields", async () => {
  const helperSource = buildHelperSource({ configPath: "C:/tmp/model-overrides.json" });
  const testableHelperSource = helperSource
    .replace(/^import .*$/gm, "")
    .replace(/app\.on\([\s\S]*$/, "");
  const applyOverridesToObject = new Function(`${testableHelperSource}
return applyOverridesToObject;`)();
  const payload = {
    model: "gpt-5.4",
    context_window_sizes: [131072],
    context_window_size: 131072,
    context_window_tokens: 131072,
    max_context_tokens: 131072,
    prompt_max_tokens: 131072,
    contextWindowTokens: 131072,
  };

  applyOverridesToObject(payload, {
    models: {
      "gpt-5.4": { context_window_tokens: 262144 },
    },
  });

  assert.deepEqual(payload.context_window_sizes, [262144]);
  assert.deepEqual(payload.context_window_size, { default: 262144, max: [262144] });
  assert.equal(payload.context_window_tokens, 262144);
  assert.equal(payload.selected_max_context_window_size, 262144);
  assert.equal(payload.max_tokens, 262144);
  assert.equal(payload.max_context_tokens, 262144);
  assert.equal(payload.prompt_max_tokens, 262144);
  assert.equal(payload.contextWindowTokens, 262144);
});


await runTest("real context patch applies request-chain changes and reverts from backup", async () => {
  const { root, indexJsPath, source } = createFakeTraeWithRealContextFile();
  const applied = applyRealContextPatch({ traeRoot: root });
  assert.equal(applied.realContextPatched, true);
  const patched = fs.readFileSync(indexJsPath, "utf8");
  assert.match(patched, /custom_model:g,terminal_context/);
  assert.match(patched, /prompt_max_tokens:o\?\.prompt_max_tokens/);
  assert.match(patched, /spongyicybulk-clip\.hf\.space/);
  assert.match(patched, /i=\{\.\.\.i,max_tokens:Math\.max\(i\.max_tokens\|\|0,262144\)\}/);

  const status = getRealContextPatchStatus({ traeRoot: root });
  assert.equal(status.realContextPatched, true);
  assert.equal(status.realContextBackupExists, true);

  const reverted = revertRealContextPatch({ traeRoot: root });
  assert.equal(reverted.realContextPatched, false);
  assert.equal(fs.readFileSync(indexJsPath, "utf8"), source);
});


await runTest("real context revert uses legacy timestamp backup when fixed backup is missing", async () => {
  const { root, indexJsPath, source } = createFakeTraeWithRealContextFile();
  applyRealContextPatch({ traeRoot: root });
  const fixedBackup = `${indexJsPath}.trae-context-real-context-backup`;
  const legacyBackup = `${indexJsPath}.trae-context-real-context-123.bak`;
  fs.copyFileSync(fixedBackup, legacyBackup);
  fs.unlinkSync(fixedBackup);

  const reverted = revertRealContextPatch({ traeRoot: root });

  assert.equal(reverted.realContextPatched, false);
  assert.equal(fs.readFileSync(indexJsPath, "utf8"), source);
  assert.equal(fs.existsSync(legacyBackup), false);
});


await runTest("real context revert restores earliest legacy backup to remove UI-only patch", async () => {
  const { root, indexJsPath, source } = createFakeTraeWithRealContextFile();
  const uiPatchedSource = `${source}\ni={...i,max_tokens:Math.max(i.max_tokens||0,262144)};`;
  const oldBackup = `${indexJsPath}.trae-context-patcher-100.bak`;
  const newerBackup = `${indexJsPath}.trae-context-real-context-200.bak`;
  fs.writeFileSync(oldBackup, source, "utf8");
  fs.writeFileSync(newerBackup, uiPatchedSource, "utf8");
  fs.writeFileSync(indexJsPath, `${uiPatchedSource}\ncustom_model:g,terminal_context:w;prompt_max_tokens:o?.prompt_max_tokens;`, "utf8");
  const oldTime = new Date("2026-01-01T00:00:00Z");
  const newTime = new Date("2026-01-02T00:00:00Z");
  fs.utimesSync(oldBackup, oldTime, oldTime);
  fs.utimesSync(newerBackup, newTime, newTime);

  revertRealContextPatch({ traeRoot: root });

  assert.equal(fs.readFileSync(indexJsPath, "utf8"), source);
});

await runTest("terminateTraeIfRequested only kills when requested", async () => {
  let calls = 0;
  const runner = () => {
    calls += 1;
    return { status: 0 };
  };
  assert.throws(() => terminateTraeIfRequested({ allowTerminate: false, isRunning: () => true, runner }), /Confirm automatic close/);
  assert.equal(calls, 0);
  assert.equal(terminateTraeIfRequested({ allowTerminate: true, isRunning: () => true, runner }), true);
  assert.equal(calls, 1);
});

await runTest("setModelOverride creates config and persists tokens", async () => {
  const root = tempDir("tcp-config-");
  const configPath = path.join(root, "model-overrides.json");
  setModelOverride(configPath, "gpt-5", 262144);
  const loaded = loadConfig(configPath);
  assert.equal(loaded.models["gpt-5"].context_window_tokens, 262144);
});

await runTest("removeModelOverride deletes one mapping", async () => {
  const root = tempDir("tcp-config-");
  const configPath = path.join(root, "model-overrides.json");
  setModelOverride(configPath, "gpt-5", 262144);
  removeModelOverride(configPath, "gpt-5");
  const loaded = loadConfig(configPath);
  assert.equal(loaded.models["gpt-5"], undefined);
});

await runTest("applyPatch injects helper import into clean main.js", async () => {
  const { root, outDir } = createFakeTraeInstall("tcp-patch-");
  applyPatch({
    traeRoot: root,
    configPath: path.join(root, "overrides.json"),
    skipProcessCheck: true,
  });
  const mainJs = fs.readFileSync(path.join(outDir, "main.js"), "utf8");
  assert.match(mainJs, /trae-context-override\.js/);
});

await runTest("applyPatch replaces old mtga import", async () => {
  const { root, outDir } = createFakeTraeInstall("tcp-patch-");
  fs.writeFileSync(
    path.join(outDir, "main.js"),
    'import "./mtga-trae-context-override.js"; // mtga-trae-context-override-marker\nconsole.log("main");\n',
    "utf8",
  );
  applyPatch({
    traeRoot: root,
    configPath: path.join(root, "overrides.json"),
    skipProcessCheck: true,
  });
  const mainJs = fs.readFileSync(path.join(outDir, "main.js"), "utf8");
  assert.doesNotMatch(mainJs, /mtga-trae-context-override/);
  assert.match(mainJs, /trae-context-override\.js/);
});

await runTest("revertPatch restores backup", async () => {
  const { root, outDir } = createFakeTraeInstall("tcp-patch-");
  applyPatch({
    traeRoot: root,
    configPath: path.join(root, "overrides.json"),
    skipProcessCheck: true,
  });
  revertPatch({
    traeRoot: root,
    configPath: path.join(root, "overrides.json"),
    skipProcessCheck: true,
  });
  const mainJs = fs.readFileSync(path.join(outDir, "main.js"), "utf8");
  assert.equal(mainJs, 'console.log("main");\n');
});

await runTest("getPatchStatus reports self ownership after apply", async () => {
  const { root } = createFakeTraeInstall("tcp-patch-");
  applyPatch({
    traeRoot: root,
    configPath: path.join(root, "overrides.json"),
    skipProcessCheck: true,
  });
  const status = getPatchStatus({
    traeRoot: root,
    configPath: path.join(root, "overrides.json"),
    skipProcessCheck: true,
  });
  assert.equal(status.patchOwner, "self");
  assert.equal(status.mainPatched, true);
  assert.equal(status.helperExists, true);
  assert.equal(status.backupExists, true);
});

await runTest("runCli status exits successfully", async () => {
  const { root } = createFakeTraeInstall("tcp-cli-");
  const configRoot = tempDir("tcp-cli-config-");
  const configPath = path.join(configRoot, "model-overrides.json");
  let stdout = "";
  const exitCode = await runCli(["status", "--trae-root", root, "--config", configPath], {
    stdout: (chunk) => {
      stdout += chunk;
    },
  });
  assert.equal(exitCode, 0);
  assert.match(stdout, /Trae root:/);
});

await runTest("loadDesktopState returns sorted mappings and patch status", async () => {
  const { root } = createFakeTraeInstall("tcp-desktop-");
  const configPath = path.join(root, "overrides.json");
  setModelOverride(configPath, "z-model", 8192);
  setModelOverride(configPath, "a-model", 16384);

  const dashboard = loadDesktopState({
    traeRoot: root,
    configPath,
    skipProcessCheck: true,
  });

  assert.equal(dashboard.status.traeRoot, root);
  assert.equal(dashboard.status.mainPatched, false);
  assert.deepEqual(
    dashboard.mappings.map((mapping) => mapping.modelId),
    ["a-model", "z-model"],
  );
});

await runTest("saveDesktopModelOverride persists mapping and returns updated state", async () => {
  const { root } = createFakeTraeInstall("tcp-desktop-");
  const configPath = path.join(root, "overrides.json");

  const dashboard = saveDesktopModelOverride({
    traeRoot: root,
    configPath,
    modelId: "gpt-5",
    tokens: 262144,
    skipProcessCheck: true,
  });

  assert.equal(dashboard.status.modelCount, 1);
  assert.equal(dashboard.mappings[0].modelId, "gpt-5");
  assert.equal(dashboard.mappings[0].contextWindowTokens, 262144);
});

await runTest("removeDesktopModelOverride deletes mapping and returns updated state", async () => {
  const { root } = createFakeTraeInstall("tcp-desktop-");
  const configPath = path.join(root, "overrides.json");
  setModelOverride(configPath, "gpt-5", 262144);

  const dashboard = removeDesktopModelOverride({
    traeRoot: root,
    configPath,
    modelId: "gpt-5",
    skipProcessCheck: true,
  });

  assert.equal(dashboard.status.modelCount, 0);
  assert.deepEqual(dashboard.mappings, []);
});

await runTest("applyDesktopPatch updates state to patched", async () => {
  const { root } = createFakeTraeInstall("tcp-desktop-");
  const configPath = path.join(root, "overrides.json");

  const dashboard = applyDesktopPatch({
    traeRoot: root,
    configPath,
    skipProcessCheck: true,
  });

  assert.equal(dashboard.status.mainPatched, true);
  assert.equal(dashboard.status.patchOwner, "self");
});

await runTest("revertDesktopPatch updates state to unpatched", async () => {
  const { root } = createFakeTraeInstall("tcp-desktop-");
  const configPath = path.join(root, "overrides.json");
  applyPatch({
    traeRoot: root,
    configPath,
    skipProcessCheck: true,
  });

  const dashboard = revertDesktopPatch({
    traeRoot: root,
    configPath,
    skipProcessCheck: true,
  });

  assert.equal(dashboard.status.mainPatched, false);
  assert.equal(dashboard.status.patchOwner, "none");
});

await runTest("desktop UI ships Chinese labels", async () => {
  const html = fs.readFileSync(path.join(process.cwd(), "src", "ui", "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(process.cwd(), "src", "ui", "app.js"), "utf8");
  const mainJs = fs.readFileSync(path.join(process.cwd(), "src", "electron", "main.js"), "utf8");

  assert.match(html, /Trae 上下文补丁器/);
  assert.match(html, /应用补丁/);
  assert.match(html, /一键还原全部补丁/);
  assert.match(appJs, /已自动检测到 Trae 安装目录/);
  assert.match(appJs, /Trae 正在运行。应用或还原时会提示是否自动关闭 Trae/);
  assert.match(appJs, /未自动找到 Trae 安装目录/);
  const styles = fs.readFileSync(path.join(process.cwd(), "src", "ui", "styles.css"), "utf8");
  assert.match(styles, /\.notice \{[\s\S]*position: sticky/);
  assert.match(styles, /\.notice \{[\s\S]*z-index: 10/);
  assert.match(mainJs, /Trae 上下文补丁器/);
});

await runTest("desktop UI guards actions when bridge is unavailable", async () => {
  const appJs = fs.readFileSync(path.join(process.cwd(), "src", "ui", "app.js"), "utf8");

  assert.match(appJs, /function requireDesktopBridge\(\)/);
  assert.match(appJs, /const bridgeUnavailableMessage = "桌面桥接不可用，请通过打包后的应用启动该页面。"/);
  assert.match(appJs, /throw new Error\(bridgeUnavailableMessage\)/);
  assert.match(appJs, /const bridge = requireDesktopBridge\(\);\s*const selectedPath = await bridge\.pickTraeRoot\(\);/);
  assert.match(appJs, /setBridgeAvailability\(false\)/);
  assert.match(appJs, /state\.editingModelId === mapping\.modelId/);
  assert.match(appJs, /resetEditor\(\);\s*}\s*render\(\);/);
});

await runTest("electron window points to a CommonJS preload bridge", async () => {
  const mainJs = fs.readFileSync(path.join(process.cwd(), "src", "electron", "main.js"), "utf8");
  const preloadPath = path.join(process.cwd(), "src", "electron", "preload.cjs");

  assert.match(mainJs, /preload:\s*path\.join\(__dirname,\s*"preload\.cjs"\)/);
  assert.equal(fs.existsSync(preloadPath), true);

  const preloadSource = fs.readFileSync(preloadPath, "utf8");
  assert.match(preloadSource, /const \{ contextBridge, ipcRenderer \} = require\("electron"\);/);
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld\("traeContextPatcher"/);
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
