import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getDefaultConfigPath, loadConfig } from "./config.js";
import { fileExists } from "./utils.js";

const FALLBACK_TARGET_TOKENS = 262144;
const FALLBACK_TARGET_MODEL = "gpt-5.4";
const TARGET_HOST = "spongyicybulk-clip.hf.space";
const STATE_DB_BACKUP_SUFFIX = ".trae-context-state-backup";

function normalizeModelName(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function bareModelName(value) {
  const normalized = normalizeModelName(value);
  if (!normalized) return "";
  const parts = normalized.split("//");
  return parts[parts.length - 1];
}

function addContextWindowTarget(targets, modelId, tokens) {
  const normalized = normalizeModelName(modelId);
  if (!normalized || !Number.isInteger(tokens) || tokens <= 0) return;
  targets[normalized] = tokens;
  const bare = bareModelName(normalized);
  if (!bare) return;
  targets[bare] = tokens;
  targets[`openai//${bare}`] = tokens;
}

function getConfiguredContextWindows(configPath = getDefaultConfigPath()) {
  const config = loadConfig(configPath);
  const targets = {};
  for (const [modelId, override] of Object.entries(config.models || {})) {
    addContextWindowTarget(targets, modelId, override?.context_window_tokens);
  }
  if (Object.keys(targets).length === 0) {
    addContextWindowTarget(targets, FALLBACK_TARGET_MODEL, FALLBACK_TARGET_TOKENS);
  }
  return targets;
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
targets = {str(k).lower(): int(v) for k, v in json.loads(sys.argv[2]).items()}
host = sys.argv[3].lower()
legacy_token = targets.get('${FALLBACK_TARGET_MODEL}') or targets.get('openai//${FALLBACK_TARGET_MODEL}')

def norm(value):
    return str(value or '').strip().lower()

def bare(value):
    value = norm(value)
    return value.split('//')[-1] if value else ''

def configured_token(value):
    value = norm(value)
    if value in targets:
        return targets[value]
    stripped = bare(value)
    if stripped in targets:
        return targets[stripped]
    prefixed = 'openai//' + stripped if stripped else ''
    if prefixed in targets:
        return targets[prefixed]
    return None

def target_token(obj):
    if not isinstance(obj, dict):
        return None
    for key in ('name', 'display_name', 'model', 'model_id', 'id', 'config_name', 'custom_model_id'):
        token = configured_token(obj.get(key))
        if token:
            return token
    base = norm(obj.get('base_url', ''))
    custom = norm(obj.get('custom_model_id', ''))
    if legacy_token and (host in base or custom == '330034820'):
        return legacy_token
    return None

def patch_model(obj):
    token = target_token(obj)
    if not token:
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
rows = cur.execute("select key,value from ItemTable").fetchall()
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
targets = {str(k).lower(): int(v) for k, v in json.loads(sys.argv[2]).items()}
host = sys.argv[3].lower()
legacy_token = targets.get('${FALLBACK_TARGET_MODEL}') or targets.get('openai//${FALLBACK_TARGET_MODEL}')
result = {'exists': True, 'target_count': 0, 'patched_count': 0}

def norm(value):
    return str(value or '').strip().lower()

def bare(value):
    value = norm(value)
    return value.split('//')[-1] if value else ''

def configured_token(value):
    value = norm(value)
    if value in targets:
        return targets[value]
    stripped = bare(value)
    if stripped in targets:
        return targets[stripped]
    prefixed = 'openai//' + stripped if stripped else ''
    if prefixed in targets:
        return targets[prefixed]
    return None

def target_token(obj):
    if not isinstance(obj, dict):
        return None
    for key in ('name', 'display_name', 'model', 'model_id', 'id', 'config_name', 'custom_model_id'):
        token = configured_token(obj.get(key))
        if token:
            return token
    base = norm(obj.get('base_url', ''))
    custom = norm(obj.get('custom_model_id', ''))
    if legacy_token and (host in base or custom == '330034820'):
        return legacy_token
    return None

def is_patched(obj, token):
    return obj.get('prompt_max_tokens') == token and obj.get('selected_max_context_window_size') == token and obj.get('context_window_sizes') == [token] and obj.get('toolcall_history_max_tokens') == token and obj.get('max_tokens') == token

def walk(value):
    if isinstance(value, dict):
        token = target_token(value)
        if token:
            result['target_count'] += 1
            if is_patched(value, token):
                result['patched_count'] += 1
        for child in value.values():
            walk(child)
    elif isinstance(value, list):
        for child in value:
            walk(child)

conn = sqlite3.connect('file:' + db + '?mode=ro', uri=True, timeout=5)
cur = conn.cursor()
rows = cur.execute("select value from ItemTable").fetchall()
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
    const raw = runPython(buildStatusScript(), [dbPath, JSON.stringify(getConfiguredContextWindows(configPath)), TARGET_HOST]);
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
  runPython(buildPatchScript(), [dbPath, JSON.stringify(getConfiguredContextWindows(configPath)), TARGET_HOST]);
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
