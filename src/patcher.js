import {
  PATCH_MARKER,
  HELPER_FILENAME,
  BACKUP_SUFFIX,
  MTGA_PATCH_MARKER,
  MTGA_HELPER_FILENAME,
} from "./constants.js";
import { getDefaultConfigPath, loadConfig } from "./config.js";
import { buildHelperSource } from "./helper-template.js";
import { isTraeRunning } from "./process-check.js";
import { resolveTraePaths } from "./trae-paths.js";
import { escapeRegExp, fileExists, readText, removeFileIfExists, writeText } from "./utils.js";

function getImportLine() {
  return `import "./${HELPER_FILENAME}"; // ${PATCH_MARKER}`;
}

function getSelfImportRegex() {
  return new RegExp(
    `^import\\s+["']\\./${escapeRegExp(HELPER_FILENAME)}["'];\\s*//\\s*${escapeRegExp(PATCH_MARKER)}\\s*\\r?\\n?`,
    "m",
  );
}

function getMtgaImportRegex() {
  return new RegExp(
    `^import\\s+["']\\./${escapeRegExp(MTGA_HELPER_FILENAME)}["'];\\s*//\\s*${escapeRegExp(MTGA_PATCH_MARKER)}\\s*\\r?\\n?`,
    "m",
  );
}

function stripKnownImports(source) {
  return source.replace(getSelfImportRegex(), "").replace(getMtgaImportRegex(), "");
}

function detectPatchOwner(source) {
  if (!source) {
    return "none";
  }
  if (source.includes(PATCH_MARKER)) {
    return "self";
  }
  if (source.includes(MTGA_PATCH_MARKER) || source.includes(MTGA_HELPER_FILENAME)) {
    return "mtga";
  }
  if (source.includes(HELPER_FILENAME)) {
    return "unknown";
  }
  return "none";
}

function patchMainSource(source) {
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = bom ? source.slice(1) : source;
  const stripped = stripKnownImports(body);
  return `${bom}${getImportLine()}\n${stripped}`;
}

function revertMainSource(source) {
  return stripKnownImports(source);
}

function assertTraeNotRunning(skipProcessCheck) {
  if (!skipProcessCheck && isTraeRunning()) {
    throw new Error("Trae is running. Close Trae before apply or revert.");
  }
}

export function getPatchStatus({
  traeRoot,
  configPath = getDefaultConfigPath(),
  skipProcessCheck = false,
} = {}) {
  const paths = resolveTraePaths({ traeRoot });
  const config = loadConfig(configPath);
  const mainExists = fileExists(paths.mainJsPath);
  const mainSource = mainExists ? readText(paths.mainJsPath) : "";
  const patchOwner = detectPatchOwner(mainSource);

  return {
    traeRoot: paths.traeRoot,
    mainJsPath: paths.mainJsPath,
    helperPath: paths.helperPath,
    backupPath: paths.backupPath,
    configPath,
    traeFound: mainExists,
    traeRunning: skipProcessCheck ? false : isTraeRunning(),
    helperExists: fileExists(paths.helperPath),
    backupExists: fileExists(paths.backupPath),
    patchOwner,
    mainPatched: patchOwner === "self",
    modelCount: Object.keys(config.models).length,
    models: config.models,
    helperFileName: HELPER_FILENAME,
    backupSuffix: BACKUP_SUFFIX,
  };
}

export function applyPatch({
  traeRoot,
  configPath = getDefaultConfigPath(),
  skipProcessCheck = false,
} = {}) {
  assertTraeNotRunning(skipProcessCheck);
  const paths = resolveTraePaths({ traeRoot });
  if (!fileExists(paths.mainJsPath)) {
    throw new Error(`Trae main.js not found: ${paths.mainJsPath}`);
  }

  const source = readText(paths.mainJsPath);
  if (!fileExists(paths.backupPath)) {
    writeText(paths.backupPath, source);
  }

  writeText(paths.helperPath, buildHelperSource({ configPath }));
  const patchedSource = patchMainSource(source);
  if (patchedSource !== source) {
    writeText(paths.mainJsPath, patchedSource);
  }

  return getPatchStatus({ traeRoot, configPath, skipProcessCheck: true });
}

export function revertPatch({
  traeRoot,
  configPath = getDefaultConfigPath(),
  skipProcessCheck = false,
} = {}) {
  assertTraeNotRunning(skipProcessCheck);
  const paths = resolveTraePaths({ traeRoot });
  if (!fileExists(paths.mainJsPath)) {
    throw new Error(`Trae main.js not found: ${paths.mainJsPath}`);
  }

  if (fileExists(paths.backupPath)) {
    writeText(paths.mainJsPath, readText(paths.backupPath));
    removeFileIfExists(paths.backupPath);
  } else {
    const source = readText(paths.mainJsPath);
    const revertedSource = revertMainSource(source);
    if (revertedSource !== source) {
      writeText(paths.mainJsPath, revertedSource);
    }
  }

  removeFileIfExists(paths.helperPath);
  return getPatchStatus({ traeRoot, configPath, skipProcessCheck: true });
}
