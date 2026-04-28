import { removeModelOverride, setModelOverride } from "./config.js";
import { applyPatch, getPatchStatus, revertPatch } from "./patcher.js";
import { applyRealContextPatch, getRealContextPatchStatus, revertRealContextPatch } from "./real-context-patch.js";
import { applyStateDatabasePatch, getStateDatabasePatchStatus, revertStateDatabasePatch } from "./state-db-patch.js";
import { applyWorkbenchPatch, getWorkbenchPatchStatus, revertWorkbenchPatch } from "./workbench-patch.js";
import { terminateTraeIfRequested } from "./process-check.js";

function toMappings(models) {
  return Object.entries(models)
    .map(([modelId, override]) => ({
      modelId,
      contextWindowTokens: override.context_window_tokens,
      updatedAt: override.updated_at || "",
      source: override.source || "manual",
    }))
    .sort((left, right) => left.modelId.localeCompare(right.modelId));
}

function toDashboard(status) {
  return {
    status: {
      traeRoot: status.traeRoot,
      configPath: status.configPath,
      traeFound: status.traeFound,
      traeRunning: status.traeRunning,
      mainPatched: status.mainPatched,
      patchOwner: status.patchOwner,
      helperExists: status.helperExists,
      backupExists: status.backupExists,
      modelCount: status.modelCount,
      realContextPatched: status.realContextPatched,
      realContextFileExists: status.realContextFileExists,
      realContextBackupExists: status.realContextBackupExists,
      stateDbPatched: status.stateDbPatched,
      stateDbExists: status.stateDbExists,
      stateDbBackupExists: status.stateDbBackupExists,
      stateDbTargetCount: status.stateDbTargetCount,
      stateDbPatchedCount: status.stateDbPatchedCount,
      workbenchPatched: status.workbenchPatched,
      workbenchFileExists: status.workbenchFileExists,
      workbenchBackupExists: status.workbenchBackupExists,
    },
    mappings: toMappings(status.models),
  };
}

function getFullPatchStatus(options = {}) {
  const baseStatus = getPatchStatus(options);
  const realStatus = getRealContextPatchStatus(options);
  const dbStatus = getStateDatabasePatchStatus(options);
  const workbenchStatus = getWorkbenchPatchStatus(options);
  return {
    ...baseStatus,
    ...realStatus,
    ...dbStatus,
    ...workbenchStatus,
  };
}

export function loadDesktopState(options = {}) {
  return toDashboard(getFullPatchStatus(options));
}

export function saveDesktopModelOverride({
  configPath,
  modelId,
  tokens,
  traeRoot,
  skipProcessCheck = false,
} = {}) {
  setModelOverride(configPath, modelId, tokens);
  return loadDesktopState({ traeRoot, configPath, skipProcessCheck });
}

export function removeDesktopModelOverride({
  configPath,
  modelId,
  traeRoot,
  skipProcessCheck = false,
} = {}) {
  removeModelOverride(configPath, modelId);
  return loadDesktopState({ traeRoot, configPath, skipProcessCheck });
}

export function applyDesktopPatch(options = {}) {
  if (!options.skipProcessCheck) terminateTraeIfRequested({ allowTerminate: options.allowTerminate });
  applyPatch({ ...options, skipProcessCheck: true });
  if (!options.skipProcessCheck) {
    applyRealContextPatch(options);
    applyStateDatabasePatch();
    applyWorkbenchPatch(options);
  }
  return loadDesktopState({ ...options, skipProcessCheck: true });
}

export function revertDesktopPatch(options = {}) {
  if (!options.skipProcessCheck) terminateTraeIfRequested({ allowTerminate: options.allowTerminate });
  if (!options.skipProcessCheck) {
    revertWorkbenchPatch(options);
    revertRealContextPatch(options);
    revertStateDatabasePatch();
  }
  revertPatch({ ...options, skipProcessCheck: true });
  return loadDesktopState({ ...options, skipProcessCheck: true });
}
