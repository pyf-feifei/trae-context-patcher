import { spawnSync } from "node:child_process";
import { TRAE_PROCESS_NAME } from "./constants.js";

export function isTraeRunning() {
  if (process.platform !== "win32") {
    return false;
  }
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
  if (process.platform !== "win32" && runner === spawnSync) {
    throw new Error("Automatic Trae close is only implemented on Windows.");
  }
  const result = runner(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `$ErrorActionPreference = 'SilentlyContinue'; Stop-Process -Name '${TRAE_PROCESS_NAME}' -Force`,
    ],
    { encoding: "utf8" },
  );
  if (result?.error) {
    throw result.error;
  }
  if (typeof result?.status === "number" && result.status !== 0) {
    throw new Error(result.stderr || "Failed to close Trae.");
  }
  return true;
}
