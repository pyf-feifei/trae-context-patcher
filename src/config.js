import os from "node:os";
import path from "node:path";
import { fileExists, readText, writeText } from "./utils.js";

export function getDefaultConfigPath() {
  const configRoot =
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : path.join(os.homedir(), "AppData", "Roaming"));
  return path.join(configRoot, "TraeContextPatcher", "model-overrides.json");
}

function normalizeConfig(config) {
  const normalized = config && typeof config === "object" ? config : {};
  const models =
    normalized.models && typeof normalized.models === "object" ? normalized.models : {};
  return {
    version: Number.isInteger(normalized.version) ? normalized.version : 1,
    models,
  };
}

export function loadConfig(configPath = getDefaultConfigPath()) {
  if (!fileExists(configPath)) {
    return { version: 1, models: {} };
  }
  return normalizeConfig(JSON.parse(readText(configPath)));
}

export function saveConfig(configPath = getDefaultConfigPath(), config) {
  const normalized = normalizeConfig(config);
  writeText(configPath, `${JSON.stringify(normalized, null, 2)}\n`);
}

export function parsePositiveInteger(value, fieldName = "value") {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

export function setModelOverride(configPath = getDefaultConfigPath(), modelId, tokens) {
  const normalizedModelId = String(modelId || "").trim();
  if (!normalizedModelId) {
    throw new Error("modelId must not be empty");
  }
  const normalizedTokens = parsePositiveInteger(tokens, "tokens");
  const config = loadConfig(configPath);
  config.models[normalizedModelId] = {
    context_window_tokens: normalizedTokens,
    updated_at: new Date().toISOString(),
    source: "manual",
  };
  saveConfig(configPath, config);
  return config.models[normalizedModelId];
}

export function removeModelOverride(configPath = getDefaultConfigPath(), modelId) {
  const normalizedModelId = String(modelId || "").trim();
  if (!normalizedModelId) {
    throw new Error("modelId must not be empty");
  }
  const config = loadConfig(configPath);
  delete config.models[normalizedModelId];
  saveConfig(configPath, config);
}
