const { contextBridge, ipcRenderer } = require("electron");

function invoke(channel, payload = {}) {
  return ipcRenderer.invoke(channel, payload);
}

contextBridge.exposeInMainWorld("traeContextPatcher", {
  loadState: (payload) => invoke("desktop:load-state", payload),
  saveModel: (payload) => invoke("desktop:save-model", payload),
  removeModel: (payload) => invoke("desktop:remove-model", payload),
  applyPatch: (payload) => invoke("desktop:apply-patch", payload),
  revertPatch: (payload) => invoke("desktop:revert-patch", payload),
  pickTraeRoot: () => invoke("desktop:pick-trae-root"),
});
