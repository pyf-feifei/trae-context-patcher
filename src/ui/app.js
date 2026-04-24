const api = window.traeContextPatcher;
const bridgeUnavailableMessage = "桌面桥接不可用，请通过打包后的应用启动该页面。";

const state = {
  dashboard: null,
  traeRootOverride: "",
  editingModelId: null,
  pending: false,
};

const elements = {
  notice: document.getElementById("notice"),
  traeRootValue: document.getElementById("traeRootValue"),
  configPathValue: document.getElementById("configPathValue"),
  traeRunningValue: document.getElementById("traeRunningValue"),
  patchStateValue: document.getElementById("patchStateValue"),
  patchOwnerValue: document.getElementById("patchOwnerValue"),
  modelCountValue: document.getElementById("modelCountValue"),
  warningPanel: document.getElementById("warningPanel"),
  refreshButton: document.getElementById("refreshButton"),
  pickTraeRootButton: document.getElementById("pickTraeRootButton"),
  mappingForm: document.getElementById("mappingForm"),
  modelIdInput: document.getElementById("modelIdInput"),
  tokensInput: document.getElementById("tokensInput"),
  saveButton: document.getElementById("saveButton"),
  cancelEditButton: document.getElementById("cancelEditButton"),
  mappingTableBody: document.getElementById("mappingTableBody"),
  emptyState: document.getElementById("emptyState"),
  editorTitle: document.getElementById("editorTitle"),
  applyButton: document.getElementById("applyButton"),
  revertButton: document.getElementById("revertButton"),
};

function showNotice(message, tone = "info") {
  elements.notice.textContent = message;
  elements.notice.dataset.tone = tone;
  elements.notice.hidden = !message;
}

function requireDesktopBridge() {
  if (!api) {
    throw new Error(bridgeUnavailableMessage);
  }
  return api;
}

function getRequestOptions() {
  return state.traeRootOverride ? { traeRoot: state.traeRootOverride } : {};
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function setBusy(isBusy) {
  state.pending = isBusy;
  elements.refreshButton.disabled = isBusy;
  elements.pickTraeRootButton.disabled = isBusy;
  elements.saveButton.disabled = isBusy;
  elements.cancelEditButton.disabled = isBusy;
  elements.applyButton.disabled = isBusy;
  elements.revertButton.disabled = isBusy;
}

function setBridgeAvailability(isAvailable) {
  elements.refreshButton.disabled = !isAvailable;
  elements.pickTraeRootButton.disabled = !isAvailable;
  elements.modelIdInput.disabled = !isAvailable;
  elements.tokensInput.disabled = !isAvailable;
  elements.saveButton.disabled = !isAvailable;
  elements.cancelEditButton.disabled = !isAvailable;
  elements.applyButton.disabled = !isAvailable;
  elements.revertButton.disabled = !isAvailable;
}

function resetEditor() {
  state.editingModelId = null;
  elements.editorTitle.textContent = "新增模型映射";
  elements.modelIdInput.disabled = false;
  elements.modelIdInput.value = "";
  elements.tokensInput.value = "";
  elements.saveButton.textContent = "保存映射";
  elements.cancelEditButton.hidden = true;
}

function editMapping(mapping) {
  state.editingModelId = mapping.modelId;
  elements.editorTitle.textContent = `编辑 ${mapping.modelId}`;
  elements.modelIdInput.value = mapping.modelId;
  elements.modelIdInput.disabled = true;
  elements.tokensInput.value = String(mapping.contextWindowTokens);
  elements.saveButton.textContent = "更新映射";
  elements.cancelEditButton.hidden = false;
}

function renderWarning(status) {
  if (!status.traeFound) {
    elements.warningPanel.hidden = false;
    elements.warningPanel.textContent = "未自动找到 Trae 安装目录。请点击“选择 Trae 目录”手动指定。";
    return;
  }
  if (status.traeRunning) {
    elements.warningPanel.hidden = false;
    elements.warningPanel.textContent = "Trae 正在运行。请先关闭后再应用或回滚补丁。";
    return;
  }
  if (status.patchOwner === "mtga") {
    elements.warningPanel.hidden = false;
    elements.warningPanel.textContent = "检测到旧的 MTGA 补丁。应用后将由本工具接管导入钩子。";
    return;
  }
  elements.warningPanel.hidden = true;
  elements.warningPanel.textContent = "";
}

function renderMappings(mappings) {
  elements.mappingTableBody.replaceChildren();
  elements.emptyState.hidden = mappings.length !== 0;

  for (const mapping of mappings) {
    const row = document.createElement("tr");

    const modelCell = document.createElement("td");
    modelCell.textContent = mapping.modelId;
    row.appendChild(modelCell);

    const tokensCell = document.createElement("td");
    tokensCell.textContent = String(mapping.contextWindowTokens);
    row.appendChild(tokensCell);

    const updatedCell = document.createElement("td");
    updatedCell.textContent = formatDate(mapping.updatedAt);
    row.appendChild(updatedCell);

    const actionsCell = document.createElement("td");
    actionsCell.className = "row-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "inline-button";
    editButton.textContent = "编辑";
    editButton.addEventListener("click", () => editMapping(mapping));
    actionsCell.appendChild(editButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "inline-button danger";
    deleteButton.textContent = "删除";
    deleteButton.addEventListener("click", async () => {
      const confirmed = window.confirm(`确定删除 ${mapping.modelId} 的映射吗？`);
      if (!confirmed) {
        return;
      }
      await runAction(async () => {
        const bridge = requireDesktopBridge();
        state.dashboard = await bridge.removeModel({
          ...getRequestOptions(),
          modelId: mapping.modelId,
        });
        if (state.editingModelId === mapping.modelId) {
          resetEditor();
        }
        render();
        showNotice(`已删除映射：${mapping.modelId}`, "success");
      });
    });
    actionsCell.appendChild(deleteButton);

    row.appendChild(actionsCell);
    elements.mappingTableBody.appendChild(row);
  }
}

function render() {
  if (!state.dashboard) {
    return;
  }

  const { status, mappings } = state.dashboard;
  elements.traeRootValue.textContent = status.traeRoot;
  elements.configPathValue.textContent = status.configPath;
  elements.traeRunningValue.textContent = status.traeRunning ? "运行中" : "未运行";
  elements.patchStateValue.textContent = status.mainPatched ? "已打补丁" : "未打补丁";
  elements.patchOwnerValue.textContent = status.patchOwner === "self" ? "本工具" : status.patchOwner;
  elements.modelCountValue.textContent = String(status.modelCount);
  renderWarning(status);
  renderMappings(mappings);
}

async function runAction(action) {
  setBusy(true);
  try {
    await action();
  } catch (error) {
    showNotice(error.message || String(error), "error");
  } finally {
    setBusy(false);
  }
}

function getStartupMessage(dashboard) {
  if (dashboard.status.traeFound) {
    return `已自动检测到 Trae 安装目录：${dashboard.status.traeRoot}`;
  }
  return `未自动找到 Trae 安装目录，已尝试默认路径：${dashboard.status.traeRoot}`;
}

async function refreshState(message = "状态已刷新。") {
  await runAction(async () => {
    const bridge = requireDesktopBridge();
    state.dashboard = await bridge.loadState(getRequestOptions());
    render();
    const noticeMessage = typeof message === "function" ? message(state.dashboard) : message;
    if (noticeMessage) {
      showNotice(noticeMessage, state.dashboard.status.traeFound ? "info" : "error");
    }
  });
}

elements.mappingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const modelId = elements.modelIdInput.value.trim();
  const tokens = Number.parseInt(elements.tokensInput.value, 10);

  await runAction(async () => {
    const bridge = requireDesktopBridge();
    state.dashboard = await bridge.saveModel({
      ...getRequestOptions(),
      modelId,
      tokens,
    });
    render();
    resetEditor();
    showNotice(`已保存映射：${modelId}`, "success");
  });
});

elements.cancelEditButton.addEventListener("click", () => {
  resetEditor();
  showNotice("已取消编辑。", "info");
});

elements.refreshButton.addEventListener("click", async () => {
  await refreshState();
});

elements.pickTraeRootButton.addEventListener("click", async () => {
  await runAction(async () => {
    const bridge = requireDesktopBridge();
    const selectedPath = await bridge.pickTraeRoot();
    if (!selectedPath) {
      showNotice("已取消选择 Trae 目录。", "info");
      return;
    }
    state.traeRootOverride = selectedPath;
    state.dashboard = await bridge.loadState(getRequestOptions());
    render();
    showNotice(`当前使用的 Trae 目录：${selectedPath}`, "success");
  });
});

elements.applyButton.addEventListener("click", async () => {
  await runAction(async () => {
    const bridge = requireDesktopBridge();
    state.dashboard = await bridge.applyPatch(getRequestOptions());
    render();
    showNotice("补丁已应用。重启 Trae 后请新开会话验证。", "success");
  });
});

elements.revertButton.addEventListener("click", async () => {
  await runAction(async () => {
    const bridge = requireDesktopBridge();
    state.dashboard = await bridge.revertPatch(getRequestOptions());
    render();
    showNotice("补丁已回滚，并已移除 helper。", "success");
  });
});

if (!api) {
  setBridgeAvailability(false);
  showNotice(bridgeUnavailableMessage, "error");
} else {
  setBridgeAvailability(true);
  resetEditor();
  refreshState(getStartupMessage);
}
