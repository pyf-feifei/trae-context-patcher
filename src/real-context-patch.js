import fs from "node:fs";
import path from "node:path";
import { REAL_CONTEXT_BACKUP_SUFFIX } from "./constants.js";
import { fileExists, readText, writeText } from "./utils.js";
import { getDefaultConfigPath, loadConfig } from "./config.js";
import { resolveTraePaths } from "./trae-paths.js";

const TARGET_HOST = "spongyicybulk-clip.hf.space";
const FALLBACK_TARGET_TOKENS = 262144;
const FALLBACK_TARGET_MODEL = "gpt-5.4";
const REQUEST_MODEL_FIELDS_LEGACY_PATCHED = 'context_window_size:o?.selected_max_context_window_size??("number"==typeof o?.context_window_size?o.context_window_size:o?.context_window_size?.default),prompt_max_tokens:o?.prompt_max_tokens,toolcall_history_max_tokens:o?.toolcall_history_max_tokens,context_window_sizes:o?.context_window_sizes??(o?.selected_max_context_window_size?[o.selected_max_context_window_size]:void 0),max_tokens:o?.max_tokens,region:o?.region,sk:o?.sk||"",auth_type:o?.auth_type||0}';
const REQUEST_MODEL_FIELDS = 'context_window_size:o?.selected_max_context_window_size??("number"==typeof o?.context_window_size?o.context_window_size:o?.context_window_size?.default),prompt_max_tokens:o?.prompt_max_tokens,toolcall_history_max_tokens:o?.toolcall_history_max_tokens,context_window_sizes:o?.context_window_sizes??(o?.selected_max_context_window_size?[o.selected_max_context_window_size]:void 0),max_tokens:o?.max_tokens,extra_config:o?.extra_config??o?.custom_config,region:o?.region,sk:o?.sk||"",auth_type:o?.auth_type||0}';
const SESSION_TOKEN_RETURN = ';let d=this.configurationService.getConfiguration("ai_assistant.request.aws_session_token")||void 0;return d&&(u.session_token=d),u}';
const CONTEXT_VARIABLES_OLD = 'let t;let i=this.getCurrentModelName(),r=this._sessionRelationStore.getCurrentModel(),n=r?.prompt_max_tokens,o=this._i18nService.getLanguageConfig(),a=this.getAutoRunConfig(e),{projectId:s}=this._projectStore.getState();return r&&(t={provider:r.provider,multimodal:!0===r.multimodal,config_name:r.name,display_model_name:r.display_name,ak:r.ak,base_url:r.base_url,use_remote_service:!r.client_connect,config_source:r.config_source,prompt_max_tokens:n,region:r.region,sk:r.sk,auth_type:r.auth_type}),{project_id:s,model_name:i,icube_language:o.platform.toLocaleLowerCase(),icube_ai_language:this.getCurrentAILanguage(),chat_session_id:e??this.currentSession?.sessionId,custom_model:t,workspace_folder:this._workspaceFacade.getWorkspacePathBySessionId(e??this.currentSession?.sessionId),confirm_config:a}}';
const TOKEN_USAGE_PARSER_OLD = 'parse(e,t){return t.firstTokenUsageReported||(t.firstTokenUsageReported=!0,this._chatStreamFirstTokenReporter.reportTokenUsage(e,t)),e}handleSteamingResult';
const HISTORY_TOKEN_USAGE_OLD = 'tokenUsage:e.token_usage,fromAppend:e.from_append_msg';
const USAGE_UI_SELECTOR_OLD = '{tokenUsage:i,agentMessageId:r,agentProcessSupport:n,turnId:o}=(0,JP.Sz)(Jj,e=>({tokenUsage:e?.tokenUsage,agentMessageId:e?.agentMessageId,agentProcessSupport:e?.agentProcessSupport,turnId:e?.userMessageId||""}))';
const USAGE_UI_SELECTOR_NEW = '{tokenUsage:i,agentMessageId:r,agentProcessSupport:n,turnId:o,modelSmartSelectionMeta:m,modelInfo:c}=(0,JP.Sz)(Jj,e=>({tokenUsage:e?.tokenUsage,agentMessageId:e?.agentMessageId,agentProcessSupport:e?.agentProcessSupport,turnId:e?.userMessageId||"",modelSmartSelectionMeta:e?.modelSmartSelectionMeta,modelInfo:e?.modelInfo}))';
const USAGE_UI_NULL_CHECK = 'if(!l||!(i?.last_turn_total_tokens&&i?.max_tokens))return null;let f=i?.last_turn_total_tokens/i?.max_tokens';
const REQUEST_OBJECT_TOP_LEVEL_CONTEXT = 'custom_model:g,context_window_size:g.context_window_size,prompt_max_tokens:g.prompt_max_tokens,toolcall_history_max_tokens:g.toolcall_history_max_tokens,context_window_sizes:g.context_window_sizes,max_tokens:g.max_tokens,terminal_context';
const NATIVE_CONTEXT_TOP_LEVEL_CONTEXT = 'custom_model:t,context_window_size:t?.context_window_size,prompt_max_tokens:t?.prompt_max_tokens,toolcall_history_max_tokens:t?.toolcall_history_max_tokens,context_window_sizes:t?.context_window_sizes,max_tokens:t?.max_tokens,workspace_folder:';
const NATIVE_CONTEXT_PATCHED_REGEX = /let t;let i=this\.getCurrentModelName\(\),r=this\._sessionRelationStore\.getCurrentModel\(\),n=r\?\.prompt_max_tokens;\(\(\)=>\{const __tcpContextMap=\{[^}]*\}[\s\S]*?\}\)\(\);[\s\S]*?let o=this\._i18nService\.getLanguageConfig\(\),a=this\.getAutoRunConfig\(e\),\{projectId:s\}=this\._projectStore\.getState\(\);return r&&\(t=\{provider:r\.provider[\s\S]*?auth_type:r\.auth_type\}\),\{project_id:s,model_name:i,icube_language:o\.platform\.toLocaleLowerCase\(\),icube_ai_language:this\.getCurrentAILanguage\(\),chat_session_id:e\?\?this\.currentSession\?\.sessionId,custom_model:t[\s\S]*?workspace_folder:this\._workspaceFacade\.getWorkspacePathBySessionId\(e\?\?this\.currentSession\?\.sessionId\),confirm_config:a\}\}/;

function normalizeModelName(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function bareModelName(value) {
  const normalized = normalizeModelName(value);
  if (!normalized) return "";
  const parts = normalized.split("//");
  return parts[parts.length - 1];
}

function addContextWindowTarget(targets, modelId, tokens) {
  const normalized = normalizeModelName(modelId);
  if (!normalized || !Number.isInteger(tokens) || tokens <= 0) return;
  targets[normalized] = tokens;
  const bare = bareModelName(normalized);
  if (!bare) return;
  targets[bare] = tokens;
  targets[`openai//${bare}`] = tokens;
}

function getConfiguredContextWindows(configPath = getDefaultConfigPath()) {
  const config = loadConfig(configPath);
  const targets = {};
  for (const [modelId, override] of Object.entries(config.models || {})) {
    addContextWindowTarget(targets, modelId, override?.context_window_tokens);
  }
  if (Object.keys(targets).length === 0) {
    addContextWindowTarget(targets, FALLBACK_TARGET_MODEL, FALLBACK_TARGET_TOKENS);
  }
  return targets;
}

function getAiModulesChatIndexPath(traeRoot) {
  const paths = resolveTraePaths({ traeRoot });
  return path.join(
    paths.appRoot,
    "node_modules",
    "@byted-icube",
    "ai-modules-chat",
    "dist",
    "index.js",
  );
}

function getBackupPath(indexJsPath) {
  return `${indexJsPath}${REAL_CONTEXT_BACKUP_SUFFIX}`;
}

function getLegacyBackupPaths(indexJsPath) {
  const dir = path.dirname(indexJsPath);
  const base = path.basename(indexJsPath);
  if (!fileExists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(`${base}.trae-context-real-context-`) && name.endsWith(".bak"))
    .map((name) => path.join(dir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

function getAllIndexBackupPaths(indexJsPath) {
  const dir = path.dirname(indexJsPath);
  const base = path.basename(indexJsPath);
  if (!fileExists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(`${base}.trae-context-`) && name.endsWith(".bak"))
    .map((name) => path.join(dir, name))
    .sort((left, right) => fs.statSync(left).mtimeMs - fs.statSync(right).mtimeMs);
}

function backupHasPatchMarkers(backupPath) {
  const source = readText(backupPath);
  return source.includes("custom_model:g,terminal_context") ||
    source.includes("prompt_max_tokens:o?.prompt_max_tokens") ||
    source.includes("const __tcpMap=") ||
    source.includes("i={...i,max_tokens:Math.max(i.max_tokens||0,262144)}") ||
    /i=\{\.\.\.i,max_tokens:Math\.max\(i\.max_tokens\|\|0,\d+\)\}/.test(source);
}

function getAvailableBackupPath(indexJsPath) {
  const cleanBackup = getAllIndexBackupPaths(indexJsPath).find((backupPath) => !backupHasPatchMarkers(backupPath));
  if (cleanBackup) return cleanBackup;
  const fixed = getBackupPath(indexJsPath);
  if (fileExists(fixed)) return fixed;
  return getLegacyBackupPaths(indexJsPath)[0];
}

function buildRequestContextPatch(contextWindows) {
  const mapLiteral = JSON.stringify(contextWindows);
  return `;(()=>{const __tcpMap=${mapLiteral},__tcpToolProtocol={apply_file_path:!0,enable_invalid_json_hint:!0,is_new_pe:!0,native_function_call:!0,native_keep_finish_tool:!1,parallel_tool_calling:!1,use_v2_process:!0},__tcpToolConfig=__tcpValue=>{let __tcpExisting={};try{__tcpExisting=__tcpValue&&"string"==typeof __tcpValue?JSON.parse(__tcpValue):__tcpValue&&"object"==typeof __tcpValue&&!Array.isArray(__tcpValue)?__tcpValue:{}}catch{}const __tcpMerged={...__tcpToolProtocol,...__tcpExisting,native_function_call:!0,native_keep_finish_tool:!1,parallel_tool_calling:!1};return __tcpMerged},__tcpNorm=__tcpValue=>"string"==typeof __tcpValue?__tcpValue.trim().toLowerCase():"",__tcpBare=__tcpValue=>__tcpNorm(__tcpValue).split("//").pop(),__tcpToken=__tcpMap[__tcpNorm(u.config_name)]??__tcpMap[__tcpNorm(u.display_model_name)]??__tcpMap[__tcpNorm(o?.name)]??__tcpMap[__tcpNorm(o?.display_name)]??__tcpMap[__tcpBare(u.config_name)]??__tcpMap[__tcpBare(u.display_model_name)]??__tcpMap[__tcpBare(o?.name)]??__tcpMap[__tcpBare(o?.display_name)]??(u.base_url?.includes("${TARGET_HOST}")?__tcpMap["${FALLBACK_TARGET_MODEL}"]:void 0);__tcpToken&&(u.context_window_size=__tcpToken,u.prompt_max_tokens=__tcpToken,u.toolcall_history_max_tokens=__tcpToken,u.context_window_sizes=[__tcpToken],u.max_tokens=__tcpToken,u.extra_config=__tcpToolConfig(u.extra_config??o?.custom_config))})()`;
}

function buildNativeContextVariablesSnippet(contextWindows) {
  const mapLiteral = JSON.stringify(contextWindows);
  return `let t;let i=this.getCurrentModelName(),r=this._sessionRelationStore.getCurrentModel(),n=r?.prompt_max_tokens;(()=>{const __tcpContextMap=${mapLiteral},__tcpContextNorm=__tcpValue=>"string"==typeof __tcpValue?__tcpValue.trim().toLowerCase():"",__tcpContextBare=__tcpValue=>__tcpContextNorm(__tcpValue).split("//").pop(),__tcpContextToken=__tcpContextMap[__tcpContextNorm(i)]??__tcpContextMap[__tcpContextNorm(r?.name)]??__tcpContextMap[__tcpContextNorm(r?.display_name)]??__tcpContextMap[__tcpContextNorm(r?.config_name)]??__tcpContextMap[__tcpContextBare(i)]??__tcpContextMap[__tcpContextBare(r?.name)]??__tcpContextMap[__tcpContextBare(r?.display_name)]??__tcpContextMap[__tcpContextBare(r?.config_name)]??(r?.base_url?.includes("${TARGET_HOST}")?__tcpContextMap["${FALLBACK_TARGET_MODEL}"]:void 0);__tcpContextToken&&(n=__tcpContextToken)})();const __tcpContextToolProtocol={apply_file_path:!0,enable_invalid_json_hint:!0,is_new_pe:!0,native_function_call:!0,native_keep_finish_tool:!1,parallel_tool_calling:!1,use_v2_process:!0},__tcpContextToolConfig=__tcpValue=>{let __tcpExisting={};try{__tcpExisting=__tcpValue&&"string"==typeof __tcpValue?JSON.parse(__tcpValue):__tcpValue&&"object"==typeof __tcpValue&&!Array.isArray(__tcpValue)?__tcpValue:{}}catch{}return {...__tcpContextToolProtocol,...__tcpExisting,native_function_call:!0,native_keep_finish_tool:!1,parallel_tool_calling:!1}};let o=this._i18nService.getLanguageConfig(),a=this.getAutoRunConfig(e),{projectId:s}=this._projectStore.getState();return r&&(t={provider:r.provider,multimodal:!0===r.multimodal,config_name:r.name,display_model_name:r.display_name,ak:r.ak,base_url:r.base_url,use_remote_service:!r.client_connect,config_source:r.config_source,prompt_max_tokens:n,context_window_size:n,selected_max_context_window_size:n,context_window_sizes:[n],toolcall_history_max_tokens:n,max_tokens:n,extra_config:__tcpContextToolConfig(r.extra_config??r.custom_config),region:r.region,sk:r.sk,auth_type:r.auth_type}),{project_id:s,model_name:i,icube_language:o.platform.toLocaleLowerCase(),icube_ai_language:this.getCurrentAILanguage(),chat_session_id:e??this.currentSession?.sessionId,custom_model:t,context_window_size:t?.context_window_size,prompt_max_tokens:t?.prompt_max_tokens,toolcall_history_max_tokens:t?.toolcall_history_max_tokens,context_window_sizes:t?.context_window_sizes,max_tokens:t?.max_tokens,workspace_folder:this._workspaceFacade.getWorkspacePathBySessionId(e??this.currentSession?.sessionId),confirm_config:a}}`;
}

function patchNativeContextTopLevelFields(source) {
  if (source.includes(NATIVE_CONTEXT_TOP_LEVEL_CONTEXT)) return source;
  return source.replace(
    "custom_model:t,workspace_folder:",
    NATIVE_CONTEXT_TOP_LEVEL_CONTEXT,
  );
}

function patchNativeContextVariables(source, contextWindows) {
  const newSnippet = buildNativeContextVariablesSnippet(contextWindows);
  if (source.includes(newSnippet)) return patchNativeContextTopLevelFields(source);
  let patched = source;
  if (source.includes("const __tcpContextMap=")) {
    if (NATIVE_CONTEXT_PATCHED_REGEX.test(source)) {
      return patchNativeContextTopLevelFields(source.replace(NATIVE_CONTEXT_PATCHED_REGEX, newSnippet));
    }
    patched = source.replace(/const __tcpContextMap=\{[^}]*\}/g, `const __tcpContextMap=${JSON.stringify(contextWindows)}`);
    return patchNativeContextTopLevelFields(patched);
  }
  if (!source.includes(CONTEXT_VARIABLES_OLD)) return patchNativeContextTopLevelFields(source);
  patched = source.replace(CONTEXT_VARIABLES_OLD, newSnippet);
  return patchNativeContextTopLevelFields(patched);
}

function buildTokenUsageParserPatch(contextWindows) {
  const mapLiteral = JSON.stringify(contextWindows);
  return `parse(e,t){(()=>{const __tcpUsageMap=${mapLiteral},__tcpUsageNorm=__tcpValue=>"string"==typeof __tcpValue?__tcpValue.trim().toLowerCase():"",__tcpUsageBare=__tcpValue=>__tcpUsageNorm(__tcpValue).split("//").pop(),__tcpUsagePick=__tcpValue=>__tcpUsageMap[__tcpUsageNorm(__tcpValue)]??__tcpUsageMap[__tcpUsageBare(__tcpValue)],__tcpUsageToken=__tcpUsagePick(t?.chatFirstTokenPayload?.model)??__tcpUsagePick(t?.requestObject?.model_name)??__tcpUsagePick(t?.requestObject?.custom_model?.config_name)??__tcpUsagePick(t?.requestObject?.custom_model?.display_model_name)??__tcpUsagePick(t?.requestObject?.custom_model?.name)??__tcpUsagePick(t?.requestObject?.custom_model?.model);__tcpUsageToken&&(e={...e,max_tokens:__tcpUsageToken})})();return t.firstTokenUsageReported||(t.firstTokenUsageReported=!0,this._chatStreamFirstTokenReporter.reportTokenUsage(e,t)),e}handleSteamingResult`;
}

function patchTokenUsageStreamParser(source, contextWindows) {
  const newSnippet = buildTokenUsageParserPatch(contextWindows);
  if (source.includes(newSnippet)) return source;
  if (source.includes("const __tcpUsageMap=")) {
    return source.replace(/const __tcpUsageMap=\{[^}]*\}/g, `const __tcpUsageMap=${JSON.stringify(contextWindows)}`);
  }
  if (!source.includes(TOKEN_USAGE_PARSER_OLD)) return source;
  return source.replace(TOKEN_USAGE_PARSER_OLD, newSnippet);
}

function buildHistoryTokenUsagePatch(contextWindows) {
  const mapLiteral = JSON.stringify(contextWindows);
  return `tokenUsage:(()=>{let __tcpHistoryUsage=e.token_usage;const __tcpHistoryUsageMap=${mapLiteral},__tcpHistoryNorm=__tcpValue=>"string"==typeof __tcpValue?__tcpValue.trim().toLowerCase():"",__tcpHistoryBare=__tcpValue=>__tcpHistoryNorm(__tcpValue).split("//").pop(),__tcpHistoryPick=__tcpValue=>__tcpHistoryUsageMap[__tcpHistoryNorm(__tcpValue)]??__tcpHistoryUsageMap[__tcpHistoryBare(__tcpValue)],__tcpHistoryToken=__tcpHistoryPick(e?.model_smart_selection_meta?.config_name)??__tcpHistoryPick(e?.model_info?.config_name)??__tcpHistoryPick(e?.model_info?.display_model_name)??__tcpHistoryPick(e?.model_name)??__tcpHistoryPick(e?.provider_model_name);return __tcpHistoryUsage&&__tcpHistoryToken?{...__tcpHistoryUsage,max_tokens:__tcpHistoryToken}:__tcpHistoryUsage})(),fromAppend:e.from_append_msg`;
}

function patchHistoryTokenUsage(source, contextWindows) {
  const newSnippet = buildHistoryTokenUsagePatch(contextWindows);
  if (source.includes(newSnippet)) return source;
  if (source.includes("const __tcpHistoryUsageMap=")) {
    return source.replace(/const __tcpHistoryUsageMap=\{[^}]*\}/g, `const __tcpHistoryUsageMap=${JSON.stringify(contextWindows)}`);
  }
  if (!source.includes(HISTORY_TOKEN_USAGE_OLD)) return source;
  return source.replace(HISTORY_TOKEN_USAGE_OLD, newSnippet);
}

function buildUsageUiCorrection(contextWindows) {
  const mapLiteral = JSON.stringify(contextWindows);
  const maxConfiguredTokens = Math.max(...Object.values(contextWindows));
  return `if(!l||!(i?.last_turn_total_tokens&&i?.max_tokens))return null;i=(()=>{const __tcpUiUsageMap=${mapLiteral},__tcpUiMax=${maxConfiguredTokens},__tcpUiNorm=__tcpValue=>"string"==typeof __tcpValue?__tcpValue.trim().toLowerCase():"",__tcpUiBare=__tcpValue=>__tcpUiNorm(__tcpValue).split("//").pop(),__tcpUiPick=__tcpValue=>__tcpUiUsageMap[__tcpUiNorm(__tcpValue)]??__tcpUiUsageMap[__tcpUiBare(__tcpValue)],__tcpUiToken=__tcpUiPick(m?.config_name)??__tcpUiPick(c?.config_name)??__tcpUiPick(c?.display_model_name)??__tcpUiPick(c?.name)??__tcpUiPick(c?.model_name);return __tcpUiToken?{...i,max_tokens:__tcpUiToken}:i.max_tokens>__tcpUiMax?{...i,max_tokens:__tcpUiMax}:i})();let f=i?.last_turn_total_tokens/i?.max_tokens`;
}

function patchUsageUiMaxTokens(source, contextWindows) {
  const mapLiteral = JSON.stringify(contextWindows);
  const maxConfiguredTokens = Math.max(...Object.values(contextWindows));
  if (source.includes("const __tcpUiUsageMap=")) {
    return source
      .replace(/const __tcpUiUsageMap=\{[^}]*\}/g, `const __tcpUiUsageMap=${mapLiteral}`)
      .replace(/__tcpUiMax=\d+/g, `__tcpUiMax=${maxConfiguredTokens}`);
  }
  if (!source.includes(USAGE_UI_SELECTOR_OLD)) return source;
  let patched = source.replace(USAGE_UI_SELECTOR_OLD, USAGE_UI_SELECTOR_NEW);
  const selectorIndex = patched.indexOf(USAGE_UI_SELECTOR_NEW);
  const nullCheckIndex = patched.indexOf(USAGE_UI_NULL_CHECK, selectorIndex);
  if (nullCheckIndex === -1) return patched;
  return `${patched.slice(0, nullCheckIndex)}${buildUsageUiCorrection(contextWindows)}${patched.slice(nullCheckIndex + USAGE_UI_NULL_CHECK.length)}`;
}

function buildRequestModelInfoSnippet(contextWindows) {
  return `${REQUEST_MODEL_FIELDS}${buildRequestContextPatch(contextWindows)}${SESSION_TOKEN_RETURN}`;
}

function patchRequestModelInfo(source, contextWindows) {
  const oldSnippet = 'context_window_size:o?.selected_max_context_window_size,region:o?.region,sk:o?.sk||"",auth_type:o?.auth_type||0},d=this.configurationService.getConfiguration("ai_assistant.request.aws_session_token")||void 0;return d&&(u.session_token=d),u}';
  const newSnippet = buildRequestModelInfoSnippet(contextWindows);
  if (source.includes(newSnippet)) return source;

  let patchedFieldsStart = source.indexOf(REQUEST_MODEL_FIELDS);
  if (patchedFieldsStart === -1) {
    patchedFieldsStart = source.indexOf(REQUEST_MODEL_FIELDS_LEGACY_PATCHED);
  }
  if (patchedFieldsStart !== -1) {
    const patchedFieldsEnd = source.indexOf(SESSION_TOKEN_RETURN, patchedFieldsStart);
    if (patchedFieldsEnd === -1) {
      throw new Error("未找到真实请求模型字段构造结束位置，可能 Trae 版本已变化。");
    }
    return `${source.slice(0, patchedFieldsStart)}${newSnippet}${source.slice(patchedFieldsEnd + SESSION_TOKEN_RETURN.length)}`;
  }

  if (!source.includes(oldSnippet)) {
    throw new Error("未找到真实请求模型字段构造位置，可能 Trae 版本已变化。");
  }
  return source.replace(oldSnippet, newSnippet);
}

function patchCustomModelOmit(source) {
  const oldSnippet = 'model_name:g.config_name,custom_model:j4(g,["context_window_size"]),terminal_context:w';
  const oldSnippetEmptyTerminal = 'model_name:g.config_name,custom_model:j4(g,["context_window_size"]),terminal_context:[]';
  const newSnippet = 'model_name:g.config_name,custom_model:g,terminal_context:w';
  const newSnippetEmptyTerminal = 'model_name:g.config_name,custom_model:g,terminal_context:[]';
  if (source.includes(REQUEST_OBJECT_TOP_LEVEL_CONTEXT)) return source;
  if (source.includes(newSnippet) || source.includes(newSnippetEmptyTerminal)) return source;
  if (source.includes(oldSnippet)) return source.replace(oldSnippet, newSnippet);
  if (source.includes(oldSnippetEmptyTerminal)) return source.replace(oldSnippetEmptyTerminal, newSnippetEmptyTerminal);
  throw new Error("未找到 custom_model 上下文字段删除位置，可能 Trae 版本已变化。");
}

function patchRequestObjectTopLevelContext(source) {
  if (source.includes(REQUEST_OBJECT_TOP_LEVEL_CONTEXT)) return source;
  const patched = source.replaceAll(
    "custom_model:g,terminal_context",
    REQUEST_OBJECT_TOP_LEVEL_CONTEXT,
  );
  if (patched !== source) return patched;
  throw new Error("未找到请求对象 context_window_size 透传位置，可能 Trae 版本已变化。");
}

function patchTokenUsageTooltip(source) {
  const forcedMaxTokensRegex = /(if\(!l\|\|!\(i\?\.last_turn_total_tokens&&i\?\.max_tokens\)\)return null;)i=\{\.\.\.i,max_tokens:Math\.max\(i\.max_tokens\|\|0,\d+\)\};(let f=i\?\.last_turn_total_tokens\/i\?\.max_tokens)/g;
  const cleaned = source.replace(forcedMaxTokensRegex, "$1$2");
  const expectedSnippet = "if(!l||!(i?.last_turn_total_tokens&&i?.max_tokens))return null;let f=i?.last_turn_total_tokens/i?.max_tokens";
  if (cleaned.includes("const __tcpUiUsageMap=") && cleaned.includes("let f=i?.last_turn_total_tokens/i?.max_tokens")) {
    return cleaned;
  }
  if (!cleaned.includes(expectedSnippet)) {
    throw new Error("未找到上下文使用率 UI 显示位置，可能 Trae 版本已变化。");
  }
  return cleaned;
}


function patchTooltipTotalFormat(source) {
  const oldSnippet = "total:`${i.max_tokens/1e3}K`";
  const newSnippet = 'total:(e=>{const t=e>=1e6?e/1e6:e/1e3;return`${Number.isInteger(t)?t:t.toFixed(3).replace(/\.?0+$/," ").trim()}${e>=1e6?"M":"K"}`})(i.max_tokens)';
  if (source.includes(newSnippet)) return source;
  if (!source.includes(oldSnippet)) return source;
  return source.replace(oldSnippet, newSnippet);
}


function patchSource(source, contextWindows) {
  return patchTooltipTotalFormat(
    patchTokenUsageTooltip(
      patchUsageUiMaxTokens(
        patchTokenUsageStreamParser(
          patchHistoryTokenUsage(
            patchNativeContextVariables(
              patchRequestObjectTopLevelContext(
                patchCustomModelOmit(patchRequestModelInfo(source, contextWindows)),
              ),
              contextWindows,
            ),
            contextWindows,
          ),
          contextWindows,
        ),
        contextWindows,
      ),
      contextWindows,
    ),
  );
}

export function getRealContextPatchStatus({ traeRoot, configPath = getDefaultConfigPath() } = {}) {
  const indexJsPath = getAiModulesChatIndexPath(traeRoot);
  const backupPath = getBackupPath(indexJsPath);
  const exists = fileExists(indexJsPath);
  const source = exists ? readText(indexJsPath) : "";
  const contextWindows = getConfiguredContextWindows(configPath);
  const mapLiteral = JSON.stringify(contextWindows);
  const hasForcedTooltipMax = /i=\{\.\.\.i,max_tokens:Math\.max\(i\.max_tokens\|\|0,\d+\)\}/.test(source);
  const realContextPatched =
    source.includes(REQUEST_OBJECT_TOP_LEVEL_CONTEXT) &&
    source.includes("prompt_max_tokens:o?.prompt_max_tokens") &&
    source.includes("extra_config:o?.extra_config??o?.custom_config") &&
    source.includes("u.extra_config=__tcpToolConfig") &&
    source.includes(`const __tcpMap=${mapLiteral}`) &&
    source.includes("u.max_tokens=__tcpToken") &&
    source.includes(`const __tcpContextMap=${mapLiteral}`) &&
    source.includes("extra_config:__tcpContextToolConfig") &&
    source.includes(`const __tcpUsageMap=${mapLiteral}`) &&
    source.includes(`const __tcpHistoryUsageMap=${mapLiteral}`) &&
    source.includes(`const __tcpUiUsageMap=${mapLiteral}`) &&
    source.includes(NATIVE_CONTEXT_TOP_LEVEL_CONTEXT) &&
    !hasForcedTooltipMax;
  return {
    realContextIndexPath: indexJsPath,
    realContextBackupPath: backupPath,
    realContextFileExists: exists,
    realContextPatched,
    realContextBackupExists: fileExists(backupPath) || getLegacyBackupPaths(indexJsPath).length > 0,
  };
}

export function applyRealContextPatch({ traeRoot, configPath = getDefaultConfigPath() } = {}) {
  const status = getRealContextPatchStatus({ traeRoot, configPath });
  if (!status.realContextFileExists) {
    throw new Error(`真实请求链路文件不存在：${status.realContextIndexPath}`);
  }
  const source = readText(status.realContextIndexPath);
  if (!status.realContextBackupExists) {
    fs.copyFileSync(status.realContextIndexPath, status.realContextBackupPath);
  }
  const patched = patchSource(source, getConfiguredContextWindows(configPath));
  if (patched !== source) {
    writeText(status.realContextIndexPath, patched);
  }
  return getRealContextPatchStatus({ traeRoot, configPath });
}

export function revertRealContextPatch({ traeRoot } = {}) {
  const status = getRealContextPatchStatus({ traeRoot });
  const backupPath = getAvailableBackupPath(status.realContextIndexPath);
  if (backupPath) {
    fs.copyFileSync(backupPath, status.realContextIndexPath);
    fs.unlinkSync(backupPath);
  }
  return getRealContextPatchStatus({ traeRoot });
}
