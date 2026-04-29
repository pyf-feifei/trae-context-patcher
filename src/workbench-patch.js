import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { WORKBENCH_BACKUP_SUFFIX, PRODUCT_JSON_BACKUP_SUFFIX } from "./constants.js";
import { fileExists, readText, writeText } from "./utils.js";
import { resolveTraePaths } from "./trae-paths.js";

const UPDATE_CONFIG_OLD = 'async updateConfig(i){return await this.a.call("updateConfig",i)}';
const UPDATE_CONFIG_NEW = 'async updateConfig(i){if(i&&i.iCubeApp){i.iCubeApp.ai_features=i.iCubeApp.ai_features||{};i.iCubeApp.ai_features.enable_decouple_model_extra_config=false;}return await this.a.call("updateConfig",i)}';

const VSCODE_DECOUPLE_GETTER_PREFIX_OLD = 'this.j.getValue("ai_assistant.request.enable_decouple_model_extra_config")||void 0';
const VSCODE_DECOUPLE_GETTER_PREFIX_NEW = '(()=>{const __tcpDecouple=this.j.getValue("ai_assistant.request.enable_decouple_model_extra_config");return typeof __tcpDecouple==="boolean"?__tcpDecouple:void 0})()';

const PRODUCT_JSON_CHECKSUM_KEY = "vs/workbench/workbench.desktop.main.js";

function getWorkbenchPath(traeRoot) {
  const paths = resolveTraePaths({ traeRoot });
  return path.join(paths.appRoot, "out", "vs", "workbench", "workbench.desktop.main.js");
}

function getProductJsonPath(traeRoot) {
  const paths = resolveTraePaths({ traeRoot });
  return path.join(paths.appRoot, "product.json");
}

function getBackupPath(workbenchPath) {
  return `${workbenchPath}${WORKBENCH_BACKUP_SUFFIX}`;
}

function getProductJsonBackupPath(productJsonPath) {
  return `${productJsonPath}${PRODUCT_JSON_BACKUP_SUFFIX}`;
}

function computeFileChecksum(filePath) {
  const data = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(data).digest("base64");
  return hash.replace(/=+$/, "");
}

function getChecksumInProductJson(productJsonSource, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`("${escapedKey}"\\s*:\\s*")([^"]+)(")`);
  const match = productJsonSource.match(regex);
  return match ? match[2] : null;
}

function setChecksumInProductJson(productJsonSource, key, newChecksum) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`("${escapedKey}"\\s*:\\s*")([^"]+)(")`);
  return productJsonSource.replace(regex, `$1${newChecksum}$3`);
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

function syncProductJsonChecksum(productJsonPath, key, newChecksum) {
  if (!fileExists(productJsonPath)) return false;
  const backupPath = getProductJsonBackupPath(productJsonPath);
  if (!fileExists(backupPath)) {
    fs.copyFileSync(productJsonPath, backupPath);
  }
  const source = readText(productJsonPath);
  const current = getChecksumInProductJson(source, key);
  if (current === newChecksum) return false;
  if (current === null) {
    return false;
  }
  const updated = setChecksumInProductJson(source, key, newChecksum);
  if (updated !== source) {
    writeText(productJsonPath, updated);
  }
  return true;
}

function restoreProductJsonChecksum(productJsonPath) {
  const backupPath = getProductJsonBackupPath(productJsonPath);
  if (!fileExists(backupPath)) return false;
  fs.copyFileSync(backupPath, productJsonPath);
  fs.unlinkSync(backupPath);
  return true;
}

export function getWorkbenchPatchStatus({ traeRoot } = {}) {
  const workbenchPath = getWorkbenchPath(traeRoot);
  const backupPath = getBackupPath(workbenchPath);
  const productJsonPath = getProductJsonPath(traeRoot);
  const productJsonBackupPath = getProductJsonBackupPath(productJsonPath);
  const exists = fileExists(workbenchPath);
  const source = exists ? readText(workbenchPath) : "";
  const updateConfigPatched = source.includes(UPDATE_CONFIG_NEW);
  const decoupleGetterPatched =
    !source.includes(VSCODE_DECOUPLE_GETTER_PREFIX_OLD) ||
    source.includes(VSCODE_DECOUPLE_GETTER_PREFIX_NEW);

  let checksumMatches = true;
  if (exists && fileExists(productJsonPath)) {
    const expectedChecksum = computeFileChecksum(workbenchPath);
    const productSource = readText(productJsonPath);
    const recordedChecksum = getChecksumInProductJson(productSource, PRODUCT_JSON_CHECKSUM_KEY);
    checksumMatches = recordedChecksum === null || recordedChecksum === expectedChecksum;
  }

  return {
    workbenchPath,
    workbenchBackupPath: backupPath,
    workbenchFileExists: exists,
    workbenchPatched: updateConfigPatched && decoupleGetterPatched && checksumMatches,
    workbenchUpdateConfigPatched: updateConfigPatched,
    workbenchDecoupleGetterPatched: decoupleGetterPatched,
    workbenchChecksumMatches: checksumMatches,
    workbenchBackupExists: fileExists(backupPath),
    productJsonPath,
    productJsonBackupExists: fileExists(productJsonBackupPath),
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
  const newChecksum = computeFileChecksum(status.workbenchPath);
  syncProductJsonChecksum(status.productJsonPath, PRODUCT_JSON_CHECKSUM_KEY, newChecksum);
  return getWorkbenchPatchStatus({ traeRoot });
}

export function revertWorkbenchPatch({ traeRoot } = {}) {
  const status = getWorkbenchPatchStatus({ traeRoot });
  if (status.workbenchBackupExists) {
    fs.copyFileSync(status.workbenchBackupPath, status.workbenchPath);
    fs.unlinkSync(status.workbenchBackupPath);
  }
  restoreProductJsonChecksum(status.productJsonPath);
  return getWorkbenchPatchStatus({ traeRoot });
}
