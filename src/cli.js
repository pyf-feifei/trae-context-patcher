#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import {
  getDefaultConfigPath,
  loadConfig,
  parsePositiveInteger,
  removeModelOverride,
  setModelOverride,
} from "./config.js";
import { applyPatch, getPatchStatus, revertPatch } from "./patcher.js";
import { applyRealContextPatch, getRealContextPatchStatus, revertRealContextPatch } from "./real-context-patch.js";
import { applyStateDatabasePatch, getStateDatabasePatchStatus, revertStateDatabasePatch } from "./state-db-patch.js";
import { applyWorkbenchPatch, getWorkbenchPatchStatus, revertWorkbenchPatch } from "./workbench-patch.js";

function writeLine(writer, message = "") {
  writer(`${message}\n`);
}

function printUsage(writer) {
  writeLine(
    writer,
    `Usage:
  node ./src/cli.js status [--trae-root PATH] [--config PATH]
  node ./src/cli.js list [--config PATH]
  node ./src/cli.js set <modelId> <tokens> [--config PATH]
  node ./src/cli.js remove <modelId> [--config PATH]
  node ./src/cli.js apply [--trae-root PATH] [--config PATH]
  node ./src/cli.js revert [--trae-root PATH] [--config PATH]`,
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    configPath: process.env.TRAE_CONTEXT_PATCHER_CONFIG_PATH || getDefaultConfigPath(),
    traeRoot: process.env.TRAE_INSTALL_DIR,
  };

  for (let index = 0; index < args.length; ) {
    if (args[index] === "--config") {
      options.configPath = args[index + 1];
      args.splice(index, 2);
      continue;
    }
    if (args[index] === "--trae-root") {
      options.traeRoot = args[index + 1];
      args.splice(index, 2);
      continue;
    }
    index += 1;
  }

  return { args, options };
}

function printMappings(models, writer) {
  const entries = Object.entries(models);
  if (entries.length === 0) {
    writeLine(writer, "No configured model overrides.");
    return;
  }
  for (const [modelId, override] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    writeLine(writer, `${modelId}: ${override.context_window_tokens}`);
  }
}

function printStatus(status, writer) {
  writeLine(writer, `Config path: ${status.configPath}`);
  writeLine(writer, `Trae root: ${status.traeRoot}`);
  writeLine(writer, `Trae found: ${status.traeFound ? "yes" : "no"}`);
  writeLine(writer, `Trae running: ${status.traeRunning ? "yes" : "no"}`);
  writeLine(writer, `Main patched: ${status.mainPatched ? "yes" : "no"}`);
  writeLine(writer, `Patch owner: ${status.patchOwner}`);
  writeLine(writer, `Helper exists: ${status.helperExists ? "yes" : "no"}`);
  writeLine(writer, `Backup exists: ${status.backupExists ? "yes" : "no"}`);
  if (status.realContextPatched !== undefined) {
    writeLine(writer, `Real context patched: ${status.realContextPatched ? "yes" : "no"}`);
  }
  if (status.stateDbPatched !== undefined) {
    writeLine(writer, `State DB patched: ${status.stateDbPatched ? "yes" : "no"} (${status.stateDbPatchedCount}/${status.stateDbTargetCount})`);
  }
  if (status.workbenchPatched !== undefined) {
    writeLine(writer, `Workbench patched: ${status.workbenchPatched ? "yes" : "no"}`);
  }
  writeLine(writer, `Configured models: ${status.modelCount}`);
  if (status.modelCount > 0) {
    writeLine(writer, "Mappings:");
    printMappings(status.models, writer);
  }
}

function getFullStatus(options) {
  const baseStatus = getPatchStatus(options);
  let realStatus = {};
  let dbStatus = {};
  let workbenchStatus = {};
  try { realStatus = getRealContextPatchStatus(options); } catch {}
  try { dbStatus = getStateDatabasePatchStatus(options); } catch {}
  try { workbenchStatus = getWorkbenchPatchStatus(options); } catch {}
  return { ...baseStatus, ...realStatus, ...dbStatus, ...workbenchStatus };
}

export async function runCli(argv, io = {}) {
  const stdout = io.stdout || process.stdout.write.bind(process.stdout);
  const stderr = io.stderr || process.stderr.write.bind(process.stderr);
  const { args, options } = parseArgs(argv);
  const command = args.shift() || "help";

  switch (command) {
    case "help":
      printUsage(stdout);
      return 0;
    case "status": {
      printStatus(getFullStatus(options), stdout);
      return 0;
    }
    case "list": {
      printMappings(loadConfig(options.configPath).models, stdout);
      return 0;
    }
    case "set": {
      const modelId = args.shift();
      const tokens = parsePositiveInteger(args.shift(), "tokens");
      setModelOverride(options.configPath, modelId, tokens);
      writeLine(stdout, `Saved override: ${modelId} -> ${tokens}`);
      return 0;
    }
    case "remove": {
      const modelId = args.shift();
      removeModelOverride(options.configPath, modelId);
      writeLine(stdout, `Removed override: ${modelId}`);
      return 0;
    }
    case "apply": {
      const status = applyPatch(options);
      writeLine(stdout, `Patched Trae at ${status.mainJsPath}`);
      try {
        const realStatus = applyRealContextPatch(options);
        writeLine(stdout, `Real context patched at ${realStatus.realContextIndexPath}`);
      } catch (error) {
        writeLine(stderr, `Real context patch skipped: ${error.message || error}`);
      }
      try {
        const dbStatus = applyStateDatabasePatch(options);
        writeLine(stdout, `State DB patched: ${dbStatus.stateDbPatchedCount}/${dbStatus.stateDbTargetCount} entries`);
      } catch (error) {
        writeLine(stderr, `State DB patch skipped: ${error.message || error}`);
      }
      try {
        const workbenchStatus = applyWorkbenchPatch(options);
        writeLine(stdout, `Workbench patched at ${workbenchStatus.workbenchPath}`);
      } catch (error) {
        writeLine(stderr, `Workbench patch skipped: ${error.message || error}`);
      }
      return 0;
    }
    case "revert": {
      try { revertWorkbenchPatch(options); } catch (error) {
        writeLine(stderr, `Workbench revert skipped: ${error.message || error}`);
      }
      try { revertRealContextPatch(options); } catch (error) {
        writeLine(stderr, `Real context revert skipped: ${error.message || error}`);
      }
      try { revertStateDatabasePatch(options); } catch (error) {
        writeLine(stderr, `State DB revert skipped: ${error.message || error}`);
      }
      const status = revertPatch(options);
      writeLine(stdout, `Reverted Trae patch at ${status.mainJsPath}`);
      return 0;
    }
    default:
      printUsage(stderr);
      throw new Error(`Unknown command: ${command}`);
  }
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution) {
  runCli(process.argv.slice(2)).catch((error) => {
    writeLine(process.stderr.write.bind(process.stderr), error.message || String(error));
    process.exitCode = 1;
  });
}
