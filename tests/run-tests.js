import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDefaultConfigPath, loadConfig, removeModelOverride, setModelOverride } from "../src/config.js";
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
import { applyStateDatabasePatch, getStateDatabasePatchStatus } from "../src/state-db-patch.js";
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
  const source = 'class j9{createChatRequestModelInfo(e,t,i,r){let o={name:"openai//gpt-5.4",display_name:"gpt-5.4",base_url:"https://spongyicybulk-clip.hf.space/v1/chat/completions"};let u={provider:o?.provider||"",config_name:o?.name||i||"",display_model_name:o?.display_name,multimodal:o?.multimodal===!0,ak:o?.ak||"",use_remote_service:!o?.client_connect,is_preset:false,config_source:o?.config_source??3,base_url:o?.base_url||"",context_window_size:o?.selected_max_context_window_size,region:o?.region,sk:o?.sk||"",auth_type:o?.auth_type||0},d=this.configurationService.getConfiguration("ai_assistant.request.aws_session_token")||void 0;return d&&(u.session_token=d),u}createChatRequestObject(){let g={config_name:"openai//gpt-5.4",context_window_size:262144};return{model_name:g.config_name,custom_model:j4(g,["context_window_size"]),terminal_context:[]}}getContextVariables(e){let t;let i=this.getCurrentModelName(),r=this._sessionRelationStore.getCurrentModel(),n=r?.prompt_max_tokens,o=this._i18nService.getLanguageConfig(),a=this.getAutoRunConfig(e),{projectId:s}=this._projectStore.getState();return r&&(t={provider:r.provider,multimodal:!0===r.multimodal,config_name:r.name,display_model_name:r.display_name,ak:r.ak,base_url:r.base_url,use_remote_service:!r.client_connect,config_source:r.config_source,prompt_max_tokens:n,region:r.region,sk:r.sk,auth_type:r.auth_type}),{project_id:s,model_name:i,icube_language:o.platform.toLocaleLowerCase(),icube_ai_language:this.getCurrentAILanguage(),chat_session_id:e??this.currentSession?.sessionId,custom_model:t,workspace_folder:this._workspaceFacade.getWorkspacePathBySessionId(e??this.currentSession?.sessionId),confirm_config:a}}renderUsage(l,i){if(!l||!(i?.last_turn_total_tokens&&i?.max_tokens))return null;let f=i?.last_turn_total_tokens/i?.max_tokens,_=`${(100*f).toFixed(0)}%`;return{percent:_,total:`${i.max_tokens/1e3}K`}}}let e_3=sX().memo(({isLatest:e})=>{let{localize:t}=Cb(),{tokenUsage:i,agentMessageId:r,agentProcessSupport:n,turnId:o}=(0,JP.Sz)(Jj,e=>({tokenUsage:e?.tokenUsage,agentMessageId:e?.agentMessageId,agentProcessSupport:e?.agentProcessSupport,turnId:e?.userMessageId||""})),a=uB(M0),s=uB(jP),l=e_4(e);if(!l||!(i?.last_turn_total_tokens&&i?.max_tokens))return null;let f=i?.last_turn_total_tokens/i?.max_tokens,_=`${(100*f).toFixed(0)}%`;return sX().createElement("div",null)});class z3 extends DV{parse(e,t){return t.firstTokenUsageReported||(t.firstTokenUsageReported=!0,this._chatStreamFirstTokenReporter.reportTokenUsage(e,t)),e}handleSteamingResult(e,t){t.agentMessageId&&this.storeService.updateMessage(t.sessionId,t.agentMessageId,{tokenUsage:e})}}class hp{parse(e,t){let h={content:"",tokenUsage:e.token_usage,fromAppend:e.from_append_msg};return h}}';
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

await runTest("helper overwrites stale toolcall history max tokens", async () => {
  const helperSource = buildHelperSource({ configPath: "C:/tmp/model-overrides.json" });
  const testableHelperSource = helperSource
    .replace(/^import .*$/gm, "")
    .replace(/app\.on\([\s\S]*$/, "");
  const applyOverridesToObject = new Function(`${testableHelperSource}
return applyOverridesToObject;`)();
  const payload = {
    model: "openai//gpt-5.5",
    prompt_max_tokens: 2000000,
    max_tokens: 2000000,
    toolcall_history_max_tokens: 2000000,
  };

  applyOverridesToObject(payload, {
    models: {
      "gpt-5.5": { context_window_tokens: 1000000 },
    },
  });

  assert.equal(payload.prompt_max_tokens, 1000000);
  assert.equal(payload.max_tokens, 1000000);
  assert.equal(payload.toolcall_history_max_tokens, 1000000);
});

await runTest("real context patch uses per-model configured token values", async () => {
  const { root, indexJsPath } = createFakeTraeWithRealContextFile("tcp-real-config-");
  const configPath = path.join(root, "overrides.json");
  setModelOverride(configPath, "gpt-5.4", 262144);
  setModelOverride(configPath, "gpt-5.5", 1000000);

  applyRealContextPatch({ traeRoot: root, configPath });

  const patched = fs.readFileSync(indexJsPath, "utf8");
  assert.match(patched, /const __tcpMap=\{"gpt-5\.4":262144,"openai\/\/gpt-5\.4":262144,"gpt-5\.5":1000000,"openai\/\/gpt-5\.5":1000000\}/);
  assert.match(patched, /u\.max_tokens=__tcpToken/);
  assert.doesNotMatch(patched, /u\.max_tokens=262144/);
  assert.doesNotMatch(patched, /i=\{\.\.\.i,max_tokens:Math\.max\(i\.max_tokens\|\|0,262144\)\}/);
});

await runTest("real context patch passes per-model max tokens to native context variables", async () => {
  const { root, indexJsPath } = createFakeTraeWithRealContextFile("tcp-real-native-context-");
  const configPath = path.join(root, "overrides.json");
  setModelOverride(configPath, "gpt-5.4", 262144);
  setModelOverride(configPath, "gpt-5.5", 1000000);

  applyRealContextPatch({ traeRoot: root, configPath });

  const patched = fs.readFileSync(indexJsPath, "utf8");
  assert.match(patched, /const __tcpContextMap=\{"gpt-5\.4":262144,"openai\/\/gpt-5\.4":262144,"gpt-5\.5":1000000,"openai\/\/gpt-5\.5":1000000\}/);
  assert.match(patched, /n=__tcpContextToken/);
  assert.match(patched, /context_window_sizes:\[n\]/);
  assert.match(patched, /max_tokens:n/);
  assert.match(patched, /custom_model:t,context_window_size:t\?\.context_window_size,prompt_max_tokens:t\?\.prompt_max_tokens/);
});

await runTest("real context patch forwards context window as top-level request fields", async () => {
  const { root, indexJsPath } = createFakeTraeWithRealContextFile("tcp-real-request-top-level-");
  const configPath = path.join(root, "overrides.json");
  setModelOverride(configPath, "gpt-5.5", 1000000);

  applyRealContextPatch({ traeRoot: root, configPath });

  const patched = fs.readFileSync(indexJsPath, "utf8");
  assert.match(patched, /custom_model:g,context_window_size:g\.context_window_size,prompt_max_tokens:g\.prompt_max_tokens/);
  assert.match(patched, /toolcall_history_max_tokens:g\.toolcall_history_max_tokens,context_window_sizes:g\.context_window_sizes,max_tokens:g\.max_tokens/);
});

await runTest("real context patch rewrites token usage stream max per model", async () => {
  const { root, indexJsPath } = createFakeTraeWithRealContextFile("tcp-real-token-usage-");
  const configPath = path.join(root, "overrides.json");
  setModelOverride(configPath, "gpt-5.5", 1000000);

  applyRealContextPatch({ traeRoot: root, configPath });

  const patched = fs.readFileSync(indexJsPath, "utf8");
  assert.match(patched, /const __tcpUsageMap=\{"gpt-5\.5":1000000,"openai\/\/gpt-5\.5":1000000\}/);
  assert.match(patched, /e=\{\.\.\.e,max_tokens:__tcpUsageToken\}/);
});

await runTest("real context patch rewrites history token usage max per model", async () => {
  const { root, indexJsPath } = createFakeTraeWithRealContextFile("tcp-real-history-usage-");
  const configPath = path.join(root, "overrides.json");
  setModelOverride(configPath, "gpt-5.5", 1000000);

  applyRealContextPatch({ traeRoot: root, configPath });

  const patched = fs.readFileSync(indexJsPath, "utf8");
  assert.match(patched, /const __tcpHistoryUsageMap=\{"gpt-5\.5":1000000,"openai\/\/gpt-5\.5":1000000\}/);
  assert.match(patched, /__tcpHistoryUsage&&__tcpHistoryToken\?\{\.\.\.__tcpHistoryUsage,max_tokens:__tcpHistoryToken\}:__tcpHistoryUsage/);
});

await runTest("real context patch caps usage UI to configured model max", async () => {
  const { root, indexJsPath } = createFakeTraeWithRealContextFile("tcp-real-ui-usage-");
  const configPath = path.join(root, "overrides.json");
  setModelOverride(configPath, "gpt-5.4", 262144);
  setModelOverride(configPath, "gpt-5.5", 1000000);

  applyRealContextPatch({ traeRoot: root, configPath });

  const patched = fs.readFileSync(indexJsPath, "utf8");
  assert.match(patched, /const __tcpUiUsageMap=\{"gpt-5\.4":262144,"openai\/\/gpt-5\.4":262144,"gpt-5\.5":1000000,"openai\/\/gpt-5\.5":1000000\}/);
  assert.match(patched, /__tcpUiToken\?\{\.\.\.i,max_tokens:__tcpUiToken\}:i\.max_tokens>__tcpUiMax\?\{\.\.\.i,max_tokens:__tcpUiMax\}:i/);
});


await runTest("real context patch formats million-token tooltip as M", async () => {
  const { root, indexJsPath } = createFakeTraeWithRealContextFile("tcp-real-tooltip-");
  const configPath = path.join(root, "overrides.json");
  setModelOverride(configPath, "gpt-5.4", 1000000);

  applyRealContextPatch({ traeRoot: root, configPath });

  const patched = fs.readFileSync(indexJsPath, "utf8");
  assert.match(patched, />=1e6/);
  assert.match(patched, /\/1e6/);
  assert.match(patched, /"M":"K"/);
  assert.doesNotMatch(patched, /total:`\$\{i\.max_tokens\/1e3\}K`/);
});

await runTest("real context patch updates an existing patch to configured token value", async () => {
  const { root, indexJsPath } = createFakeTraeWithRealContextFile("tcp-real-repatch-");
  const configPath = path.join(root, "overrides.json");
  setModelOverride(configPath, "gpt-5.4", 262144);
  applyRealContextPatch({ traeRoot: root, configPath });
  setModelOverride(configPath, "gpt-5.5", 1000000);

  applyRealContextPatch({ traeRoot: root, configPath });

  const patched = fs.readFileSync(indexJsPath, "utf8");
  assert.match(patched, /"gpt-5\.4":262144/);
  assert.match(patched, /"gpt-5\.5":1000000/);
  assert.match(patched, /u\.max_tokens=__tcpToken/);
  assert.doesNotMatch(patched, /u\.max_tokens=262144/);
  assert.doesNotMatch(patched, /i=\{\.\.\.i,max_tokens:Math\.max\(i\.max_tokens\|\|0,\d+\)\}/);
});


await runTest("real context patch is idempotent after tooltip formatter is installed", async () => {
  const { root, indexJsPath } = createFakeTraeWithRealContextFile("tcp-real-idempotent-");
  const configPath = path.join(root, "overrides.json");
  setModelOverride(configPath, "gpt-5.4", 1000000);
  applyRealContextPatch({ traeRoot: root, configPath });
  const oncePatched = fs.readFileSync(indexJsPath, "utf8");

  const status = applyRealContextPatch({ traeRoot: root, configPath });

  assert.equal(status.realContextPatched, true);
  assert.equal(fs.readFileSync(indexJsPath, "utf8"), oncePatched);
});

await runTest("real context patch applies request-chain changes and reverts from backup", async () => {
  const { root, indexJsPath, source } = createFakeTraeWithRealContextFile();
  const configPath = path.join(root, "overrides.json");
  setModelOverride(configPath, "gpt-5.4", 262144);
  const applied = applyRealContextPatch({ traeRoot: root, configPath });
  assert.equal(applied.realContextPatched, true);
  const patched = fs.readFileSync(indexJsPath, "utf8");
  assert.match(patched, /custom_model:g,context_window_size:g\.context_window_size/);
  assert.match(patched, /prompt_max_tokens:o\?\.prompt_max_tokens/);
  assert.match(patched, /spongyicybulk-clip\.hf\.space/);
  assert.match(patched, /const __tcpMap=\{"gpt-5\.4":262144,"openai\/\/gpt-5\.4":262144\}/);
  assert.doesNotMatch(patched, /i=\{\.\.\.i,max_tokens:Math\.max\(i\.max_tokens\|\|0,262144\)\}/);

  const status = getRealContextPatchStatus({ traeRoot: root, configPath });
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

await runTest("state database patch uses configured token value", async () => {
  const root = tempDir("tcp-state-config-");
  const dbPath = path.join(root, "state.vscdb");
  const seed = {
    models: [
      {
        name: "openai//gpt-5.4",
        display_name: "gpt-5.4",
        base_url: "https://spongyicybulk-clip.hf.space/v1/chat/completions",
        prompt_max_tokens: 262144,
      },
    ],
  };
  const setup = `
import sqlite3, sys, json
conn = sqlite3.connect(sys.argv[1])
cur = conn.cursor()
cur.execute('create table ItemTable (key text primary key, value text)')
cur.execute('insert into ItemTable values (?, ?)', ('model-list', ${JSON.stringify(JSON.stringify(seed))}))
conn.commit()
conn.close()
`;
  const { spawnSync } = await import("node:child_process");
  assert.equal(spawnSync("python", ["-c", setup, dbPath], { encoding: "utf8" }).status, 0);
  const configPath = path.join(root, "overrides.json");
  setModelOverride(configPath, "gpt-5.4", 1000000);

  const status = applyStateDatabasePatch({ dbPath, configPath });

  assert.equal(status.stateDbPatched, true);
  const check = `
import sqlite3, sys, json
conn = sqlite3.connect(sys.argv[1])
value = conn.execute('select value from ItemTable where key=?', ('model-list',)).fetchone()[0]
print(json.loads(value)['models'][0]['prompt_max_tokens'])
print(json.loads(value)['models'][0]['max_tokens'])
conn.close()
`;
  const result = spawnSync("python", ["-c", check, dbPath], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), ["1000000", "1000000"]);
});

await runTest("state database patch keeps configured tokens per model", async () => {
  const root = tempDir("tcp-state-per-model-");
  const dbPath = path.join(root, "state.vscdb");
  const seed = {
    models: [
      {
        name: "openai//gpt-5.4",
        display_name: "gpt-5.4",
        prompt_max_tokens: 131072,
      },
      {
        name: "openai//gpt-5.5",
        display_name: "gpt-5.5",
        prompt_max_tokens: 131072,
      },
    ],
  };
  const setup = `
import sqlite3, sys, json
conn = sqlite3.connect(sys.argv[1])
cur = conn.cursor()
cur.execute('create table ItemTable (key text primary key, value text)')
cur.execute('insert into ItemTable values (?, ?)', ('model-list', ${JSON.stringify(JSON.stringify(seed))}))
conn.commit()
conn.close()
`;
  const { spawnSync } = await import("node:child_process");
  assert.equal(spawnSync("python", ["-c", setup, dbPath], { encoding: "utf8" }).status, 0);
  const configPath = path.join(root, "overrides.json");
  setModelOverride(configPath, "gpt-5.4", 262144);
  setModelOverride(configPath, "gpt-5.5", 1000000);

  const status = applyStateDatabasePatch({ dbPath, configPath });

  assert.equal(status.stateDbPatched, true);
  assert.equal(status.stateDbTargetCount, 2);
  const check = `
import sqlite3, sys, json
conn = sqlite3.connect(sys.argv[1])
value = conn.execute('select value from ItemTable where key=?', ('model-list',)).fetchone()[0]
data = json.loads(value)
for item in data['models']:
    print(item['name'], item['prompt_max_tokens'], item['max_tokens'])
conn.close()
`;
  const result = spawnSync("python", ["-c", check, dbPath], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), [
    "openai//gpt-5.4 262144 262144",
    "openai//gpt-5.5 1000000 1000000",
  ]);
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

await runTest("loadDesktopState includes real request-chain status", async () => {
  const { root } = createFakeTraeWithRealContextFile("tcp-desktop-real-");
  const configPath = path.join(root, "overrides.json");
  applyRealContextPatch({ traeRoot: root, configPath });

  const dashboard = loadDesktopState({
    traeRoot: root,
    configPath,
    skipProcessCheck: true,
  });

  assert.equal(dashboard.status.realContextPatched, true);
  assert.equal(dashboard.status.realContextFileExists, true);
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
