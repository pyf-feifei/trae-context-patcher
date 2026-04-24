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
