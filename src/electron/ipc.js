import { dialog, ipcMain } from "electron";
import {
  applyDesktopPatch,
  loadDesktopState,
  removeDesktopModelOverride,
  revertDesktopPatch,
  saveDesktopModelOverride,
} from "../desktop-service.js";

function normalizePath(value) {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

function normalizeOptions(payload = {}) {
  return {
    traeRoot: normalizePath(payload.traeRoot),
    configPath: normalizePath(payload.configPath),
    allowTerminate: payload.allowTerminate === true,
  };
}

export function registerIpcHandlers() {
  ipcMain.handle("desktop:load-state", async (_event, payload = {}) => {
    return loadDesktopState(normalizeOptions(payload));
  });

  ipcMain.handle("desktop:save-model", async (_event, payload = {}) => {
    return saveDesktopModelOverride({
      ...normalizeOptions(payload),
      modelId: payload.modelId,
      tokens: payload.tokens,
    });
  });

  ipcMain.handle("desktop:remove-model", async (_event, payload = {}) => {
    return removeDesktopModelOverride({
      ...normalizeOptions(payload),
      modelId: payload.modelId,
    });
  });

  ipcMain.handle("desktop:apply-patch", async (_event, payload = {}) => {
    return applyDesktopPatch(normalizeOptions(payload));
  });

  ipcMain.handle("desktop:revert-patch", async (_event, payload = {}) => {
    return revertDesktopPatch(normalizeOptions(payload));
  });

  ipcMain.handle("desktop:pick-trae-root", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "选择 Trae 安装目录",
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
}
