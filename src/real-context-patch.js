import fs from "node:fs";
import path from "node:path";
import { REAL_CONTEXT_BACKUP_SUFFIX } from "./constants.js";
import { fileExists, readText, writeText } from "./utils.js";
import { resolveTraePaths } from "./trae-paths.js";

const TARGET_HOST = "spongyicybulk-clip.hf.space";
const TARGET_TOKENS = 262144;

function getAiModulesChatIndexPath(traeRoot) {
  const paths = resolveTraePaths({ traeRoot });
  return path.join(
    paths.appRoot,
    "node_modules",
    "@byted-icube",
    "ai-modules-chat",
    "dist",
    "index.js",
  );
}

function getBackupPath(indexJsPath) {
  return `${indexJsPath}${REAL_CONTEXT_BACKUP_SUFFIX}`;
}

function getLegacyBackupPaths(indexJsPath) {
  const dir = path.dirname(indexJsPath);
  const base = path.basename(indexJsPath);
  if (!fileExists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(`${base}.trae-context-real-context-`) && name.endsWith(".bak"))
    .map((name) => path.join(dir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

function getAllIndexBackupPaths(indexJsPath) {
  const dir = path.dirname(indexJsPath);
  const base = path.basename(indexJsPath);
  if (!fileExists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(`${base}.trae-context-`) && name.endsWith(".bak"))
    .map((name) => path.join(dir, name))
    .sort((left, right) => fs.statSync(left).mtimeMs - fs.statSync(right).mtimeMs);
}

function backupHasPatchMarkers(backupPath) {
  const source = readText(backupPath);
  return source.includes("custom_model:g,terminal_context") ||
    source.includes("prompt_max_tokens:o?.prompt_max_tokens") ||
    source.includes("i={...i,max_tokens:Math.max(i.max_tokens||0,262144)}");
}

function getAvailableBackupPath(indexJsPath) {
  const cleanBackup = getAllIndexBackupPaths(indexJsPath).find((backupPath) => !backupHasPatchMarkers(backupPath));
  if (cleanBackup) return cleanBackup;
  const fixed = getBackupPath(indexJsPath);
  if (fileExists(fixed)) return fixed;
  return getLegacyBackupPaths(indexJsPath)[0];
}

function patchRequestModelInfo(source) {
  const oldSnippet = 'context_window_size:o?.selected_max_context_window_size,region:o?.region,sk:o?.sk||"",auth_type:o?.auth_type||0},d=this.configurationService.getConfiguration("ai_assistant.request.aws_session_token")||void 0;return d&&(u.session_token=d),u}';
  const newSnippet = 'context_window_size:o?.selected_max_context_window_size??("number"==typeof o?.context_window_size?o.context_window_size:o?.context_window_size?.default),prompt_max_tokens:o?.prompt_max_tokens,toolcall_history_max_tokens:o?.toolcall_history_max_tokens,context_window_sizes:o?.context_window_sizes??(o?.selected_max_context_window_size?[o.selected_max_context_window_size]:void 0),max_tokens:o?.max_tokens,region:o?.region,sk:o?.sk||"",auth_type:o?.auth_type||0};(u.config_name==="openai//gpt-5.4"||u.display_model_name==="gpt-5.4"||u.base_url?.includes("spongyicybulk-clip.hf.space"))&&(u.context_window_size=262144,u.prompt_max_tokens=262144,u.toolcall_history_max_tokens=262144,u.context_window_sizes=[262144],u.max_tokens=262144);let d=this.configurationService.getConfiguration("ai_assistant.request.aws_session_token")||void 0;return d&&(u.session_token=d),u}';
  if (source.includes(newSnippet)) return source;
  if (!source.includes(oldSnippet)) {
    throw new Error("未找到真实请求模型字段构造位置，可能 Trae 版本已变化。");
  }
  return source.replace(oldSnippet, newSnippet);
}

function patchCustomModelOmit(source) {
  const oldSnippet = 'model_name:g.config_name,custom_model:j4(g,["context_window_size"]),terminal_context:w';
  const oldSnippetEmptyTerminal = 'model_name:g.config_name,custom_model:j4(g,["context_window_size"]),terminal_context:[]';
  const newSnippet = 'model_name:g.config_name,custom_model:g,terminal_context:w';
  const newSnippetEmptyTerminal = 'model_name:g.config_name,custom_model:g,terminal_context:[]';
  if (source.includes(newSnippet) || source.includes(newSnippetEmptyTerminal)) return source;
  if (source.includes(oldSnippet)) return source.replace(oldSnippet, newSnippet);
  if (source.includes(oldSnippetEmptyTerminal)) return source.replace(oldSnippetEmptyTerminal, newSnippetEmptyTerminal);
  throw new Error("未找到 custom_model 上下文字段删除位置，可能 Trae 版本已变化。");
}

function patchTokenUsageTooltip(source) {
  const marker = `i={...i,max_tokens:Math.max(i.max_tokens||0,${TARGET_TOKENS})};let f=i?.last_turn_total_tokens/i?.max_tokens`;
  if (source.includes(marker)) return source;

  const oldSnippet = "if(!l||!(i?.last_turn_total_tokens&&i?.max_tokens))return null;let f=i?.last_turn_total_tokens/i?.max_tokens";
  const newSnippet = `if(!l||!(i?.last_turn_total_tokens&&i?.max_tokens))return null;i={...i,max_tokens:Math.max(i.max_tokens||0,${TARGET_TOKENS})};let f=i?.last_turn_total_tokens/i?.max_tokens`;
  if (!source.includes(oldSnippet)) {
    throw new Error("未找到上下文使用率 UI 显示位置，可能 Trae 版本已变化。");
  }
  return source.replace(oldSnippet, newSnippet);
}

function patchSource(source) {
  return patchTokenUsageTooltip(patchCustomModelOmit(patchRequestModelInfo(source)));
}

export function getRealContextPatchStatus({ traeRoot } = {}) {
  const indexJsPath = getAiModulesChatIndexPath(traeRoot);
  const backupPath = getBackupPath(indexJsPath);
  const exists = fileExists(indexJsPath);
  const source = exists ? readText(indexJsPath) : "";
  const realContextPatched =
    source.includes("custom_model:g,terminal_context") &&
    source.includes("prompt_max_tokens:o?.prompt_max_tokens") &&
    source.includes(TARGET_HOST) &&
    source.includes(`u.max_tokens=${TARGET_TOKENS}`) &&
    source.includes(`i={...i,max_tokens:Math.max(i.max_tokens||0,${TARGET_TOKENS})}`);
  return {
    realContextIndexPath: indexJsPath,
    realContextBackupPath: backupPath,
    realContextFileExists: exists,
    realContextPatched,
    realContextBackupExists: fileExists(backupPath) || getLegacyBackupPaths(indexJsPath).length > 0,
  };
}

export function applyRealContextPatch({ traeRoot } = {}) {
  const status = getRealContextPatchStatus({ traeRoot });
  if (!status.realContextFileExists) {
    throw new Error(`真实请求链路文件不存在：${status.realContextIndexPath}`);
  }
  const source = readText(status.realContextIndexPath);
  if (!status.realContextBackupExists) {
    fs.copyFileSync(status.realContextIndexPath, status.realContextBackupPath);
  }
  const patched = patchSource(source);
  if (patched !== source) {
    writeText(status.realContextIndexPath, patched);
  }
  return getRealContextPatchStatus({ traeRoot });
}

export function revertRealContextPatch({ traeRoot } = {}) {
  const status = getRealContextPatchStatus({ traeRoot });
  const backupPath = getAvailableBackupPath(status.realContextIndexPath);
  if (backupPath) {
    fs.copyFileSync(backupPath, status.realContextIndexPath);
    fs.unlinkSync(backupPath);
  }
  return getRealContextPatchStatus({ traeRoot });
}
