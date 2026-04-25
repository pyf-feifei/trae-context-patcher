import os from "node:os";
import path from "node:path";
import { BACKUP_SUFFIX, HELPER_FILENAME } from "./constants.js";
import { fileExists } from "./utils.js";

function uniquePaths(paths) {
  const seen = new Set();
  const result = [];
  for (const item of paths) {
    if (!item) {
      continue;
    }
    const resolved = path.resolve(item);
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(resolved);
    }
  }
  return result;
}

function getWindowsTraeRootCandidates() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return [
    path.join(localAppData, "Programs", "Trae"),
    path.join(localAppData, "Trae"),
  ];
}

function getMacTraeRootCandidates() {
  return [
    "/Applications/Trae.app/Contents/Resources/app",
    path.join(os.homedir(), "Applications", "Trae.app", "Contents", "Resources", "app"),
  ];
}

export function getTraeRootCandidates() {
  return uniquePaths([
    process.env.TRAE_INSTALL_DIR,
    ...getWindowsTraeRootCandidates(),
    ...getMacTraeRootCandidates(),
  ]);
}

export function getDefaultTraeRoot() {
  return getTraeRootCandidates()[0];
}

function resolveAppRoot(resolvedTraeRoot) {
  if (resolvedTraeRoot.endsWith(path.join("Contents", "Resources", "app"))) {
    return resolvedTraeRoot;
  }
  const macAppRoot = path.join(resolvedTraeRoot, "Contents", "Resources", "app");
  if (fileExists(macAppRoot)) {
    return macAppRoot;
  }
  return path.join(resolvedTraeRoot, "resources", "app");
}

function buildPaths(traeRoot) {
  const resolvedTraeRoot = path.resolve(traeRoot);
  const appRoot = resolveAppRoot(resolvedTraeRoot);
  const outDir = path.join(appRoot, "out");
  const mainJsPath = path.join(outDir, "main.js");
  const helperPath = path.join(outDir, HELPER_FILENAME);
  const backupPath = `${mainJsPath}${BACKUP_SUFFIX}`;
  return {
    traeRoot: resolvedTraeRoot,
    appRoot,
    outDir,
    mainJsPath,
    helperPath,
    backupPath,
    traeFound: fileExists(mainJsPath),
  };
}

export function resolveTraePaths({ traeRoot, candidates } = {}) {
  if (traeRoot) {
    return buildPaths(traeRoot);
  }

  const candidateRoots = candidates ? uniquePaths(candidates) : getTraeRootCandidates();
  const resolvedCandidates = candidateRoots.map((candidate) => buildPaths(candidate));
  return resolvedCandidates.find((candidate) => candidate.traeFound) || resolvedCandidates[0];
}
