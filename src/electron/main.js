import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";
import { registerIpcHandlers } from "./ipc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appIcon = path.join(__dirname, "..", "assets", "icon.png");
let handlersRegistered = false;

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: "#10131b",
    title: "Trae 上下文补丁器",
    icon: appIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  window.loadFile(path.join(__dirname, "..", "ui", "index.html"));
}

app.whenReady().then(() => {
  if (!handlersRegistered) {
    registerIpcHandlers();
    handlersRegistered = true;
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
