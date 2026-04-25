import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { TRAE_PROCESS_NAME } from "./constants.js";

const MAC_PROCESS_NAME = "Trae";

export function isTraeRunning() {
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `$ErrorActionPreference = 'SilentlyContinue'; @(Get-Process -Name '${TRAE_PROCESS_NAME}').Count`,
      ],
      { encoding: "utf8" },
    );

    if (result.error) {
      return false;
    }

    const count = Number.parseInt(String(result.stdout || "0").trim(), 10);
    return Number.isInteger(count) && count > 0;
  }

  if (process.platform === "darwin") {
    const result = spawnSync("pgrep", ["-x", MAC_PROCESS_NAME], { encoding: "utf8" });
    return result.status === 0 && String(result.stdout || "").trim().length > 0;
  }

  return false;
}

function stopTrae(runner) {
  if (process.platform === "win32") {
    return runner(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `$ErrorActionPreference = 'SilentlyContinue'; Stop-Process -Name '${TRAE_PROCESS_NAME}' -Force`,
      ],
      { encoding: "utf8" },
    );
  }
  if (process.platform === "darwin") {
    return runner("osascript", ["-e", `tell application "${MAC_PROCESS_NAME}" to quit`], {
      encoding: "utf8",
    });
  }
  throw new Error("Automatic Trae close is only implemented on Windows and macOS.");
}

export function terminateTraeIfRequested({
  allowTerminate = false,
  isRunning = isTraeRunning,
  runner = spawnSync,
} = {}) {
  if (!isRunning()) {
    return false;
  }
  if (!allowTerminate) {
    throw new Error("Trae is running. Confirm automatic close before apply or revert.");
  }
  const result = stopTrae(runner);
  if (result?.error) {
    throw result.error;
  }
  if (typeof result?.status === "number" && result.status !== 0) {
    throw new Error(result.stderr || "Failed to close Trae.");
  }
  return true;
}
