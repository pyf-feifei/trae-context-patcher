import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getDefaultConfigPath, loadConfig } from "./config.js";
import { fileExists } from "./utils.js";

const FALLBACK_TARGET_TOKENS = 262144;
const TARGET_MODEL = "gpt-5.4";
const TARGET_HOST = "spongyicybulk-clip.hf.space";
const STATE_DB_BACKUP_SUFFIX = ".trae-context-state-backup";

function getConfiguredTargetTokens(configPath = getDefaultConfigPath()) {
  const config = loadConfig(configPath);
  const exact = config.models["gpt-5.4"]?.context_window_tokens;
  if (Number.isInteger(exact) && exact > 0) return exact;
  const first = Object.values(config.models || {})
    .map((item) => item?.context_window_tokens)
    .find((item) => Number.isInteger(item) && item > 0);
  return first || FALLBACK_TARGET_TOKENS;
}

export function getStateDbPath() {
  const appData =
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : path.join(os.homedir(), "AppData", "Roaming"));
  return path.join(appData, "Trae", "User", "globalStorage", "state.vscdb");
}

function buildPatchScript() {
  return `
import json, os, sqlite3, sys

db = sys.argv[1]
token = int(sys.argv[2])
model = sys.argv[3].lower()
host = sys.argv[4].lower()

def is_target(obj):
    if not isinstance(obj, dict):
        return False
    name = str(obj.get('name', '')).lower()
    display = str(obj.get('display_name', '')).lower()
    base = str(obj.get('base_url', '')).lower()
    custom = str(obj.get('custom_model_id', ''))
    return name == 'openai//' + model or name == model or display == model or host in base or custom == '330034820'

def patch_model(obj):
    if not is_target(obj):
        return False
    obj['prompt_max_tokens'] = token
    obj['context_window_size'] = {'default': token, 'max': [token]}
    obj['selected_max_context_window_size'] = token
    obj['context_window_sizes'] = [token]
    obj['toolcall_history_max_tokens'] = token
    obj['max_tokens'] = token
    features = obj.setdefault('features', {})
    cw = features.setdefault('context_windows', {})
    cw['enable'] = True
    data = cw.setdefault('data', {})
    data['dev_context'] = token
    data['max_context'] = token
    data['max_context_list'] = [token]
    data['dev_turns'] = data.get('dev_turns') or 200
    data['max_turns'] = data.get('max_turns') or 200
    return True

def walk(value):
    hit = False
    if isinstance(value, dict):
        if patch_model(value):
            hit = True
        for child in value.values():
            if walk(child):
                hit = True
    elif isinstance(value, list):
        for child in value:
            if walk(child):
                hit = True
    return hit

conn = sqlite3.connect(db, timeout=5)
cur = conn.cursor()
rows = cur.execute("select key,value from ItemTable where value like '%gpt-5.4%' or value like '%spongyicybulk%' or value like '%330034820%'").fetchall()
changed = 0
for key, val in rows:
    try:
        data = json.loads(val)
    except Exception:
        continue
    if walk(data):
        cur.execute('update ItemTable set value=? where key=?', (json.dumps(data, ensure_ascii=False, separators=(',', ':')), key))
        changed += 1
conn.commit()
conn.close()
print(changed)
`;
}

function buildStatusScript() {
  return `
import json, sqlite3, sys

db = sys.argv[1]
token = int(sys.argv[2])
model = sys.argv[3].lower()
host = sys.argv[4].lower()
result = {'exists': True, 'target_count': 0, 'patched_count': 0}

def is_target(obj):
    if not isinstance(obj, dict):
        return False
    name = str(obj.get('name', '')).lower()
    display = str(obj.get('display_name', '')).lower()
    base = str(obj.get('base_url', '')).lower()
    custom = str(obj.get('custom_model_id', ''))
    return name == 'openai//' + model or name == model or display == model or host in base or custom == '330034820'

def is_patched(obj):
    return obj.get('prompt_max_tokens') == token and obj.get('selected_max_context_window_size') == token and obj.get('context_window_sizes') == [token] and obj.get('toolcall_history_max_tokens') == token and obj.get('max_tokens') == token

def walk(value):
    if isinstance(value, dict):
        if is_target(value):
            result['target_count'] += 1
            if is_patched(value):
                result['patched_count'] += 1
        for child in value.values():
            walk(child)
    elif isinstance(value, list):
        for child in value:
            walk(child)

conn = sqlite3.connect('file:' + db + '?mode=ro', uri=True, timeout=5)
cur = conn.cursor()
rows = cur.execute("select value from ItemTable where value like '%gpt-5.4%' or value like '%spongyicybulk%' or value like '%330034820%'").fetchall()
for (val,) in rows:
    try:
        walk(json.loads(val))
    except Exception:
        pass
conn.close()
print(json.dumps(result))
`;
}

function runPython(script, args) {
  const candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  let lastResult;
  for (const command of candidates) {
    const result = spawnSync(command, ["-c", script, ...args], { encoding: "utf8" });
    if (result.error) {
      lastResult = result;
      continue;
    }
    if (result.status !== 0) {
      throw new Error(result.stderr || "Python state database operation failed.");
    }
    return String(result.stdout || "").trim();
  }
  throw lastResult?.error || new Error("Python is required for state database operations.");
}

export function getStateDatabasePatchStatus({ dbPath = getStateDbPath(), configPath = getDefaultConfigPath() } = {}) {
  const backupPath = `${dbPath}${STATE_DB_BACKUP_SUFFIX}`;
  if (!fileExists(dbPath)) {
    return { stateDbPath: dbPath, stateDbExists: false, stateDbPatched: false, stateDbBackupExists: fileExists(backupPath), stateDbTargetCount: 0, stateDbPatchedCount: 0 };
  }
  try {
    const raw = runPython(buildStatusScript(), [dbPath, String(getConfiguredTargetTokens(configPath)), TARGET_MODEL, TARGET_HOST]);
    const parsed = JSON.parse(raw || "{}");
    return {
      stateDbPath: dbPath,
      stateDbExists: true,
      stateDbPatched: parsed.target_count > 0 && parsed.target_count === parsed.patched_count,
      stateDbBackupExists: fileExists(backupPath),
      stateDbTargetCount: parsed.target_count || 0,
      stateDbPatchedCount: parsed.patched_count || 0,
    };
  } catch {
    return { stateDbPath: dbPath, stateDbExists: true, stateDbPatched: false, stateDbBackupExists: fileExists(backupPath), stateDbTargetCount: 0, stateDbPatchedCount: 0 };
  }
}

export function applyStateDatabasePatch({ dbPath = getStateDbPath(), configPath = getDefaultConfigPath() } = {}) {
  if (!fileExists(dbPath)) return getStateDatabasePatchStatus({ dbPath, configPath });
  const backupPath = `${dbPath}${STATE_DB_BACKUP_SUFFIX}`;
  if (!fileExists(backupPath)) {
    fs.copyFileSync(dbPath, backupPath);
  }
  runPython(buildPatchScript(), [dbPath, String(getConfiguredTargetTokens(configPath)), TARGET_MODEL, TARGET_HOST]);
  return getStateDatabasePatchStatus({ dbPath, configPath });
}

export function revertStateDatabasePatch({ dbPath = getStateDbPath() } = {}) {
  const backupPath = `${dbPath}${STATE_DB_BACKUP_SUFFIX}`;
  if (fileExists(backupPath)) {
    fs.copyFileSync(backupPath, dbPath);
    fs.unlinkSync(backupPath);
  }
  return getStateDatabasePatchStatus({ dbPath });
}
