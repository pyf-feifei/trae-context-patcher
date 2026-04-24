import fs from "node:fs";
import path from "node:path";

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function ensureDirForFile(filePath) {
  ensureDir(path.dirname(filePath));
}

export function fileExists(filePath) {
  return fs.existsSync(filePath);
}

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath, content) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, content, "utf8");
}

export function removeFileIfExists(filePath) {
  if (fileExists(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
