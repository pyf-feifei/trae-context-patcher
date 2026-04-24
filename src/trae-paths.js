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
    const key = resolved.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(resolved);
    }
  }
  return result;
}

export function getTraeRootCandidates() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return uniquePaths([
    process.env.TRAE_INSTALL_DIR,
    path.join(localAppData, "Programs", "Trae"),
    path.join(localAppData, "Trae"),
  ]);
}

export function getDefaultTraeRoot() {
  return getTraeRootCandidates()[0];
}

function buildPaths(traeRoot) {
  const resolvedTraeRoot = path.resolve(traeRoot);
  const appRoot = path.join(resolvedTraeRoot, "resources", "app");
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
