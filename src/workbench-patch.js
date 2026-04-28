import fs from "node:fs";
import path from "node:path";
import { WORKBENCH_BACKUP_SUFFIX } from "./constants.js";
import { fileExists, readText, writeText } from "./utils.js";
import { resolveTraePaths } from "./trae-paths.js";

const UPDATE_CONFIG_OLD = 'async updateConfig(i){return await this.a.call("updateConfig",i)}';
const UPDATE_CONFIG_NEW = 'async updateConfig(i){if(i&&i.iCubeApp){i.iCubeApp.ai_features=i.iCubeApp.ai_features||{};i.iCubeApp.ai_features.enable_decouple_model_extra_config=false;}return await this.a.call("updateConfig",i)}';

const VSCODE_DECOUPLE_GETTER_OLD = '"ai_assistant.request.enable_decouple_model_extra_config")||void 0';
const VSCODE_DECOUPLE_GETTER_NEW = '"ai_assistant.request.enable_decouple_model_extra_config");return typeof __tcpDecouple==="boolean"?__tcpDecouple:void 0})()';
const VSCODE_DECOUPLE_GETTER_PREFIX_OLD = 'this.j.getValue("ai_assistant.request.enable_decouple_model_extra_config")||void 0';
const VSCODE_DECOUPLE_GETTER_PREFIX_NEW = '(()=>{const __tcpDecouple=this.j.getValue("ai_assistant.request.enable_decouple_model_extra_config");return typeof __tcpDecouple==="boolean"?__tcpDecouple:void 0})()';

function getWorkbenchPath(traeRoot) {
  const paths = resolveTraePaths({ traeRoot });
  return path.join(paths.appRoot, "out", "vs", "workbench", "workbench.desktop.main.js");
}

function getBackupPath(workbenchPath) {
  return `${workbenchPath}${WORKBENCH_BACKUP_SUFFIX}`;
}

function patchUpdateConfig(source) {
  if (source.includes(UPDATE_CONFIG_NEW)) return source;
  if (!source.includes(UPDATE_CONFIG_OLD)) {
    throw new Error("未找到 DynamicConfig 推送函数 updateConfig，可能 Trae 版本已变化。");
  }
  return source.replace(UPDATE_CONFIG_OLD, UPDATE_CONFIG_NEW);
}

function patchVscodeDecoupleGetter(source) {
  if (source.includes(VSCODE_DECOUPLE_GETTER_PREFIX_NEW)) return source;
  if (!source.includes(VSCODE_DECOUPLE_GETTER_PREFIX_OLD)) {
    return source;
  }
  return source.replace(VSCODE_DECOUPLE_GETTER_PREFIX_OLD, VSCODE_DECOUPLE_GETTER_PREFIX_NEW);
}

function patchSource(source) {
  return patchVscodeDecoupleGetter(patchUpdateConfig(source));
}

export function getWorkbenchPatchStatus({ traeRoot } = {}) {
  const workbenchPath = getWorkbenchPath(traeRoot);
  const backupPath = getBackupPath(workbenchPath);
  const exists = fileExists(workbenchPath);
  const source = exists ? readText(workbenchPath) : "";
  const updateConfigPatched = source.includes(UPDATE_CONFIG_NEW);
  const decoupleGetterPatched =
    !source.includes(VSCODE_DECOUPLE_GETTER_PREFIX_OLD) ||
    source.includes(VSCODE_DECOUPLE_GETTER_PREFIX_NEW);
  return {
    workbenchPath,
    workbenchBackupPath: backupPath,
    workbenchFileExists: exists,
    workbenchPatched: updateConfigPatched && decoupleGetterPatched,
    workbenchUpdateConfigPatched: updateConfigPatched,
    workbenchDecoupleGetterPatched: decoupleGetterPatched,
    workbenchBackupExists: fileExists(backupPath),
  };
}

export function applyWorkbenchPatch({ traeRoot } = {}) {
  const status = getWorkbenchPatchStatus({ traeRoot });
  if (!status.workbenchFileExists) {
    throw new Error(`Trae workbench 文件不存在：${status.workbenchPath}`);
  }
  const source = readText(status.workbenchPath);
  if (!status.workbenchBackupExists) {
    fs.copyFileSync(status.workbenchPath, status.workbenchBackupPath);
  }
  const patched = patchSource(source);
  if (patched !== source) {
    writeText(status.workbenchPath, patched);
  }
  return getWorkbenchPatchStatus({ traeRoot });
}

export function revertWorkbenchPatch({ traeRoot } = {}) {
  const status = getWorkbenchPatchStatus({ traeRoot });
  if (status.workbenchBackupExists) {
    fs.copyFileSync(status.workbenchBackupPath, status.workbenchPath);
    fs.unlinkSync(status.workbenchBackupPath);
  }
  return getWorkbenchPatchStatus({ traeRoot });
}
