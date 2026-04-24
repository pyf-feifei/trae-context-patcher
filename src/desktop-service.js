import { removeModelOverride, setModelOverride } from "./config.js";
import { applyPatch, getPatchStatus, revertPatch } from "./patcher.js";

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
    },
    mappings: toMappings(status.models),
  };
}

export function loadDesktopState(options = {}) {
  return toDashboard(getPatchStatus(options));
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
  applyPatch(options);
  return loadDesktopState({ ...options, skipProcessCheck: true });
}

export function revertDesktopPatch(options = {}) {
  revertPatch(options);
  return loadDesktopState({ ...options, skipProcessCheck: true });
}
