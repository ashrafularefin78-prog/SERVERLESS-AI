import {
  APP_VERSION,
  CONVERSATION_SKILLS,
  CONTEXT_LIMITS,
  DEFAULT_SETTINGS,
  DEMO_MODE,
  SUGGESTIONS,
  SYSTEM_GUARDRAIL,
  UNDERSTANDING_SKILLS,
  modeById,
} from "./config.js";
import { MAX_MEMORIES, applyMemoryCommand, buildMemoryPrompt, parseMemoryCommand } from "./memory.js";
import { analyzeIntent, expandShorthand, normalizeText, understandingHint } from "./understand.js";
import * as engine from "./engine/manager.js";
import { detectDevice, requestPersistentStorage } from "./engine/device.js";
import {
  isCpuModel,
  modelByKey,
  modelSizeLabel,
  recommendedModelKey,
} from "./engine/catalog.js";
import {
  clearDatabase,
  createConversation,
  createMessage,
  deleteConversation,
  getConversation,
  getSettings,
  listConversations,
  saveConversation,
  saveSettings,
} from "./storage/db.js";
import {
  h,
  renderDeviceSummary,
  renderHistory,
  renderMessage,
  renderModelDialogList,
  renderWelcome,
  streamText,
} from "./ui/render.js";
import {
  buildCodingPrompt,
  coderSuggestions,
  demoCodingReply,
} from "./coder/languages.js";

const $ = (id) => document.getElementById(id);

const dom = {};
const state = {
  device: null,
  settings: { ...DEFAULT_SETTINGS },
  conversations: [],
  conversation: null,
  selectedKey: null,
  engine: engine.getState(),
  generating: false,
  runId: 0,
  streamSignal: null,
  partialText: "",
  autoScroll: true,
  resolveGeneration: null,
  generationDone: Promise.resolve(),
  loadDialogMode: null,
  instructionsTimer: null,
  toastTimer: null,
  memoryOutcome: null,
};

export async function boot() {
  cacheDom();
  bindEvents();
  applyTheme();

  const [settings, conversations] = await Promise.all([getSettings(), listConversations()]);
  state.settings = { ...DEFAULT_SETTINGS, ...settings };
  state.conversations = conversations;

  applyTheme();
  syncSettingsForm();
  updateModeSelect();

  state.device = await detectDevice();
  state.selectedKey = normalizeModelKey(
    state.settings.modelKey || recommendedModelKey(state.device),
  );

  state.conversation = await initialConversation();
  renderAll();
  engine.subscribe(onEngineState);

  // The built-in assistant is the engine: it needs no download and no model.
  await engine.loadModel({ modelKey: "demo", device: state.device });

  autoResize();
  updateComposerState();
}

function cacheDom() {
  const ids = [
    "app",
    "sidebar",
    "scrim",
    "history",
    "new-chat",
    "sidebar-close",
    "open-sidebar",
    "engine-pill",
    "status-dot",
    "status-label",
    "status-sub",
    "open-settings",
    "open-settings-2",
    "chat-title",
    "chat-sub",
    "model-chip",
    "chip-dot",
    "model-chip-label",
    "theme-toggle",
    "load-strip",
    "load-strip-fill",
    "load-strip-text",
    "chat-scroll",
    "messages",
    "mode-select",
    "composer",
    "input",
    "send",
    "stop",
    "clear-data-link",
    "model-dialog",
    "model-device",
    "model-list",
    "load-dialog",
    "load-title",
    "load-sub",
    "load-progress-track",
    "load-fill",
    "load-percent",
    "load-detail",
    "load-hide",
    "load-cancel",
    "load-retry",
    "settings-dialog",
    "settings-model-name",
    "settings-model-meta",
    "temperature",
    "temp-output",
    "max-tokens",
    "custom-instructions",
    "memory-list",
    "memory-input",
    "memory-add",
    "theme-select",
    "export-data",
    "clear-data",
    "confirm-dialog",
    "confirm-title",
    "confirm-body",
    "confirm-ok",
    "confirm-cancel",
    "toast",
  ];
  for (const id of ids) {
    dom[id] = $(id);
    if (!dom[id]) console.warn(`Missing element #${id}`);
  }
}

/* ---------------------------------------------------------------
   Events
--------------------------------------------------------------- */

function bindEvents() {
  dom["new-chat"].addEventListener("click", () => newChat());
  dom["open-sidebar"].addEventListener("click", openSidebar);
  dom["sidebar-close"].addEventListener("click", closeSidebar);
  dom.scrim.addEventListener("click", closeSidebar);

  const showAssistantStatus = () =>
    toast("You're using the built-in assistant. It works fully offline.");
  dom["engine-pill"].addEventListener("click", showAssistantStatus);
  dom["model-chip"].addEventListener("click", showAssistantStatus);
  dom["theme-toggle"].addEventListener("click", toggleTheme);
  dom["open-settings"].addEventListener("click", openSettings);
  dom["open-settings-2"].addEventListener("click", openSettings);

  for (const button of document.querySelectorAll("[data-close-dialog]")) {
    button.addEventListener("click", () => {
      const dialog = button.closest("dialog");
      if (dialog) closeDialog(dialog);
    });
  }

  for (const dialog of [dom["model-dialog"], dom["settings-dialog"]]) {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  }

  dom["load-dialog"].addEventListener("cancel", (event) => {
    event.preventDefault();
    hideLoadDialog();
  });
  dom["load-dialog"].addEventListener("click", (event) => {
    if (event.target === dom["load-dialog"]) hideLoadDialog();
  });
  dom["load-hide"].addEventListener("click", hideLoadDialog);
  dom["load-cancel"].addEventListener("click", cancelLoad);
  dom["load-retry"].addEventListener("click", () => startModelLoad({ modal: true }));

  dom["model-list"].addEventListener("click", (event) => {
    const option = event.target.closest("[data-model-key]");
    if (option && !option.disabled) handleModelChoice(option.dataset.modelKey);
  });

  dom.history.addEventListener("click", onHistoryClick);
  dom.messages.addEventListener("click", onMessagesClick);

  dom.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSend();
  });
  dom.input.addEventListener("input", () => {
    autoResize();
    updateComposerState();
  });
  dom.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      handleSend();
    }
  });
  dom.stop.addEventListener("click", () => stopGeneration());

  dom["mode-select"].addEventListener("change", () => {
    state.settings.mode = dom["mode-select"].value;
    saveSettingsPatch({ mode: state.settings.mode });
    updateChatHeader();
    updateComposerPlaceholder();
    refreshWelcomeSuggestions();
  });

  dom.temperature.addEventListener("input", () => {
    const value = Number(dom.temperature.value);
    dom["temp-output"].textContent = value.toFixed(1);
    state.settings.temperature = value;
  });
  dom.temperature.addEventListener("change", () => {
    saveSettingsPatch({ temperature: Number(dom.temperature.value) });
  });
  dom["max-tokens"].addEventListener("change", () => {
    saveSettingsPatch({ maxTokens: Number(dom["max-tokens"].value) });
  });
  dom["custom-instructions"].addEventListener("input", () => {
    state.settings.customInstructions = dom["custom-instructions"].value;
    window.clearTimeout(state.instructionsTimer);
    state.instructionsTimer = window.setTimeout(() => {
      saveSettingsPatch({ customInstructions: state.settings.customInstructions });
    }, 600);
  });
  dom["memory-add"].addEventListener("click", addMemoryFromInput);
  dom["memory-input"].addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addMemoryFromInput();
    }
  });
  dom["memory-list"].addEventListener("click", (event) => {
    const button = event.target.closest("button[data-memory-id]");
    if (button) forgetMemory(button.dataset.memoryId);
  });
  dom["theme-select"].addEventListener("change", () => {
    state.settings.theme = dom["theme-select"].value;
    applyTheme();
    saveSettingsPatch({ theme: state.settings.theme });
  });

  dom["export-data"].addEventListener("click", exportChats);
  dom["clear-data"].addEventListener("click", clearAllData);
  dom["clear-data-link"].addEventListener("click", clearAllData);

  dom["chat-scroll"].addEventListener("scroll", () => {
    const distance =
      dom["chat-scroll"].scrollHeight -
      dom["chat-scroll"].scrollTop -
      dom["chat-scroll"].clientHeight;
    state.autoScroll = distance < 90;
  });

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "k") {
      event.preventDefault();
      newChat();
      return;
    }
    if (event.key === "Escape" && state.generating && !document.querySelector("dialog[open]")) {
      stopGeneration();
    }
  });

  window.matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => {
    if (state.settings.theme === "system") applyTheme();
  });
}

/* ---------------------------------------------------------------
   Boot helpers
--------------------------------------------------------------- */

async function initialConversation() {
  if (state.conversations.length) {
    const conversation = await getConversation(state.conversations[0].id);
    if (conversation) return conversation;
  }
  return createConversation({
    mode: state.settings.mode,
    modelKey: state.selectedKey,
  });
}

function normalizeModelKey(key) {
  if (!state.device?.webgpu) return "cpu";
  if (!key) return recommendedModelKey(state.device);
  if (isCpuModel(key)) return key;

  const model = modelByKey(key);
  if (!model) return recommendedModelKey(state.device);
  if (model.requiresF16 && !state.device.shaderF16) return recommendedModelKey(state.device);
  if (!model.ids?.f16 && !model.ids?.f32) return recommendedModelKey(state.device);
  return key;
}

function onEngineState(snapshot) {
  const previous = state.engine;
  state.engine = snapshot;
  updateEngineChrome(snapshot);
  updateSettingsModelInfo();

  if (snapshot.phase === "loading") {
    if (dom["load-dialog"].open && state.loadDialogMode === "loading") {
      updateLoadProgress(snapshot);
    }
    return;
  }

  if (snapshot.phase === "ready") {
    if (dom["load-dialog"].open && state.loadDialogMode === "loading") {
      closeDialog(dom["load-dialog"]);
      state.loadDialogMode = null;
    }
    if (previous.phase !== "ready" && state.conversation?.messages.length === 0) {
      renderConversation({ scroll: false });
    }
    return;
  }

  if (snapshot.phase === "error" && previous.phase !== "error" && snapshot.error) {
    showLoadError(snapshot.error);
  }
}

function renderAll() {
  renderSidebar();
  renderConversation({ scroll: true });
  updateEngineChrome(state.engine);
  updateSettingsModelInfo();
  updateComposerState();
  updateChatHeader();
}

/* ---------------------------------------------------------------
   Rendering
--------------------------------------------------------------- */

function renderSidebar() {
  renderHistory(dom.history, state.conversations, state.conversation?.id);
}

function renderConversation({ scroll = true } = {}) {
  const conversation = state.conversation;
  if (!conversation) return;

  updateChatHeader();
  dom.messages.textContent = "";

  if (!conversation.messages.length) {
    const mode = modeById(state.settings.mode);
    dom.messages.append(
      renderWelcome({
        device: state.device || {},
        engine: state.engine,
        selectedKey: state.selectedKey || recommendedModelKey(state.device || {}),
        demo: DEMO_MODE,
        suggestions: mode.id === "coder" ? coderSuggestions() : SUGGESTIONS,
      }),
    );
  } else {
    const last = conversation.messages.at(-1);
    const canRegenerate =
      last?.role === "assistant" && !last.streaming && !last.error;
    for (const message of conversation.messages) {
      dom.messages.append(
        renderMessage(message, {
          canRegenerate: message === last && canRegenerate,
        }),
      );
    }
  }

  if (scroll) scrollToBottom();
}

function updateChatHeader() {
  const conversation = state.conversation;
  if (!conversation) return;
  const title =
    conversation.title && conversation.title !== "New chat"
      ? conversation.title
      : conversation.messages.length
        ? deriveTitle(conversation.messages.find((m) => m.role === "user")?.content || "Chat")
        : "New chat";
  dom["chat-title"].textContent = title;

  const mode = modeById(state.settings.mode);
  const model =
    state.engine.phase === "ready" || state.engine.phase === "generating"
      ? state.engine.modelFamily
      : "built-in assistant";
  dom["chat-sub"].textContent = `${mode.label} mode - ${model}`;
}

function updateComposerState() {
  const busy = state.generating;
  const loading = state.engine.phase === "loading";
  const hasText = Boolean(dom.input.value.trim());

  dom.send.hidden = busy;
  dom.stop.hidden = !busy;
  dom.send.disabled = !hasText || busy || loading;
  dom.input.disabled = false;
  dom["mode-select"].disabled = false;
}

function updateEngineChrome(snapshot) {
  const status = engineStatus(snapshot);
  const pct = Math.round((snapshot.progress || 0) * 100);
  const dotClass = `status-dot${status.tone === "idle" ? "" : ` is-${status.tone}`}`;

  dom["status-dot"].className = dotClass;
  dom["chip-dot"].className = dotClass;
  dom["status-label"].textContent = status.label;
  dom["status-sub"].textContent = status.sub;
  dom["model-chip-label"].textContent = status.chip;

  if (snapshot.phase === "loading") {
    dom["load-strip"].hidden = false;
    dom["load-strip-fill"].style.width = `${pct}%`;
    dom["load-strip-text"].textContent =
      `${snapshot.modelName || "Model"} - ${pct}% - ${snapshot.progressText || "Loading..."}`;
  } else {
    dom["load-strip"].hidden = true;
    dom["load-strip-fill"].style.width = "0%";
  }

  if (dom["load-dialog"].open && state.loadDialogMode === "loading") {
    updateLoadProgress(snapshot);
  }
}

function engineStatus(snapshot) {
  const pct = Math.round((snapshot.progress || 0) * 100);
  const modelName = snapshot.modelName || snapshot.modelFamily || "model";

  if (snapshot.phase === "loading") {
    return {
      tone: "loading",
      label: `Loading ${modelName}`,
      sub: `${pct}% - ${snapshot.progressText || "Preparing..."}`,
      chip: `${modelName} ${pct}%`,
    };
  }

  if (snapshot.phase === "generating") {
    return {
      tone: "generating",
      label: snapshot.modelFamily || "Model ready",
      sub: "Writing a reply...",
      chip: "Writing...",
    };
  }

  if (snapshot.phase === "error") {
    return {
      tone: "error",
      label: "Model failed to load",
      sub: snapshot.error || "Open settings to try another model.",
      chip: "Model error",
    };
  }

  if (snapshot.phase === "ready") {
    return {
      tone: "ready",
      label: snapshot.modelFamily || "Model ready",
      sub:
        snapshot.backend === "wasm"
          ? "CPU fallback - replies will be slow"
          : snapshot.backend === "demo"
            ? "Built-in rules - works offline"
            : "WebGPU - runs entirely here",
      chip: snapshot.modelFamily || "Model ready",
    };
  }

  return {
    tone: "idle",
    label: "Built-in assistant",
    sub: "Starting...",
    chip: "Built-in assistant",
  };
}

function updateSettingsModelInfo() {
  const snapshot = state.engine;
  if (snapshot.phase === "ready" || snapshot.phase === "generating") {
    dom["settings-model-name"].textContent =
      snapshot.backend === "demo"
        ? "Built-in assistant"
        : `${snapshot.modelFamily || "Model"} - ${snapshot.modelName}`;
    dom["settings-model-meta"].textContent =
      snapshot.backend === "wasm"
        ? "CPU fallback loaded"
        : snapshot.backend === "demo"
          ? "Built-in rules - works offline"
          : "WebGPU model loaded";
    return;
  }
  if (snapshot.phase === "loading") {
    dom["settings-model-name"].textContent = `Loading ${snapshot.modelName || "model"}`;
    dom["settings-model-meta"].textContent = `${Math.round((snapshot.progress || 0) * 100)}%`;
    return;
  }
  dom["settings-model-name"].textContent = "Built-in assistant";
  dom["settings-model-meta"].textContent = "Starting...";
}

function syncSettingsForm() {
  dom.temperature.value = String(state.settings.temperature);
  dom["temp-output"].textContent = Number(state.settings.temperature).toFixed(1);
  dom["max-tokens"].value = String(state.settings.maxTokens);
  dom["custom-instructions"].value = state.settings.customInstructions || "";
  dom["theme-select"].value = state.settings.theme;
  updateModeSelect();
  updateComposerPlaceholder();
  renderMemoryList();
}

function renderMemoryList() {
  const list = dom["memory-list"];
  list.textContent = "";
  const memory = state.settings.memory || [];

  if (!memory.length) {
    list.append(h("li", { class: "memory-empty", text: "Nothing remembered yet." }));
    return;
  }

  for (const item of memory) {
    list.append(
      h(
        "li",
        { class: "memory-item" },
        h("span", { text: item.text }),
        h("button", {
          class: "icon-btn",
          type: "button",
          "aria-label": `Forget: ${item.text}`,
          dataset: { memoryId: item.id },
          html: '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-x"></use></svg>',
        }),
      ),
    );
  }
}

async function addMemoryFromInput() {
  const text = dom["memory-input"].value.trim();
  if (!text) return;
  const result = applyMemoryCommand(state.settings.memory, { type: "add", text });
  if (result.full) {
    toast(`Memory is full (${MAX_MEMORIES} notes). Forget one first.`);
    return;
  }
  if (result.duplicate) {
    toast("Already remembered.");
    return;
  }
  await saveSettingsPatch({ memory: result.memory });
  dom["memory-input"].value = "";
  renderMemoryList();
}

async function forgetMemory(id) {
  const memory = (state.settings.memory || []).filter((item) => item.id !== id);
  await saveSettingsPatch({ memory });
  renderMemoryList();
}

function updateModeSelect() {
  dom["mode-select"].value = state.settings.mode;
}

function updateComposerPlaceholder() {
  dom.input.placeholder =
    state.settings.mode === "coder"
      ? "Ask for code, paste a bug, or include an error message..."
      : "Ask anything...";
}

function refreshWelcomeSuggestions() {
  if (state.conversation && state.conversation.messages.length === 0) {
    renderConversation({ scroll: false });
  }
}

/* ---------------------------------------------------------------
   Theme
--------------------------------------------------------------- */

function resolvedTheme() {
  if (state.settings.theme === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return state.settings.theme === "light" ? "light" : "dark";
}

function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f5f5ef" : "#0c0f0e");
}

function toggleTheme() {
  const next = resolvedTheme() === "dark" ? "light" : "dark";
  state.settings.theme = next;
  applyTheme();
  syncSettingsForm();
  saveSettingsPatch({ theme: next });
}

/* ---------------------------------------------------------------
   Sidebar / conversations
--------------------------------------------------------------- */

function openSidebar() {
  dom.sidebar.classList.add("open");
  dom.scrim.hidden = false;
}

function closeSidebar() {
  dom.sidebar.classList.remove("open");
  dom.scrim.hidden = true;
}

async function newChat() {
  await stopAndWait();
  await saveCurrent();
  state.conversation = createConversation({
    mode: state.settings.mode,
    modelKey: state.selectedKey,
  });
  renderSidebar();
  renderConversation();
  closeSidebar();
  focusInput();
}

async function openConversation(id) {
  if (state.conversation?.id === id) {
    closeSidebar();
    return;
  }
  await stopAndWait();
  await saveCurrent();
  const conversation = await getConversation(id);
  if (!conversation) {
    toast("That chat could not be found.");
    return;
  }
  state.conversation = conversation;
  renderSidebar();
  renderConversation();
  closeSidebar();
}

async function onHistoryClick(event) {
  const remove = event.target.closest("[data-delete-conversation]");
  if (remove) {
    event.stopPropagation();
    await deleteChatById(remove.dataset.deleteConversation);
    return;
  }

  const item = event.target.closest("[data-conversation-id]");
  if (item) await openConversation(item.dataset.conversationId);
}

async function deleteChatById(id) {
  const summary = state.conversations.find((item) => item.id === id);
  const active = state.conversation?.id === id;

  const ok = await confirmDialog({
    title: "Delete this chat?",
    body: `"${summary?.title || "This chat"}" will be removed from this device. This cannot be undone.`,
    confirmLabel: "Delete",
  });
  if (!ok) return;

  if (active) await stopAndWait();
  await deleteConversation(id);
  state.conversations = state.conversations.filter((item) => item.id !== id);

  if (active) {
    state.conversation = createConversation({
      mode: state.settings.mode,
      modelKey: state.selectedKey,
    });
  }

  renderSidebar();
  renderConversation();
}

async function saveCurrent() {
  const conversation = state.conversation;
  if (!conversation || !conversation.messages.length) return;

  if (conversation.title === "New chat") {
    const firstUser = conversation.messages.find((message) => message.role === "user");
    if (firstUser) conversation.title = deriveTitle(firstUser.content);
  }

  conversation.updatedAt = Date.now();
  await saveConversation(conversation);
  upsertSummary(conversation);
}

function upsertSummary(conversation) {
  const summary = {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
  const index = state.conversations.findIndex((item) => item.id === conversation.id);
  if (index >= 0) state.conversations[index] = summary;
  else state.conversations.push(summary);
  state.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  renderSidebar();
}

/* ---------------------------------------------------------------
   Model loading
--------------------------------------------------------------- */

function openModelDialog() {
  toast("The built-in assistant is active. No setup needed.");
}

async function handleModelChoice(key) {
  if (DEMO_MODE) {
    closeDialog(dom["model-dialog"]);
    return;
  }

  const current = engine.getState();
  if (current.modelKey === key && (current.phase === "ready" || current.phase === "generating")) {
    closeDialog(dom["model-dialog"]);
    toast("That model is already loaded.");
    return;
  }

  if (current.phase === "loading") {
    toast("Wait for the current model to finish loading.");
    return;
  }

  const model = modelByKey(key);
  if (!model) return;

  if (current.phase === "ready" || current.phase === "generating") {
    const ok = await confirmDialog({
      title: `Switch to ${model.name}?`,
      body: `${current.modelFamily || "The current model"} will be unloaded. The new model may need a fresh download.`,
      confirmLabel: "Switch model",
      tone: "primary",
    });
    if (!ok) return;
  }

  state.selectedKey = key;
  state.settings.modelKey = key;
  saveSettingsPatch({ modelKey: key });
  closeDialog(dom["model-dialog"]);
  await startModelLoad({ modal: true });
}

function selectWelcomeModel(key) {
  if (engine.getState().phase === "loading") return;
  state.selectedKey = key;
  state.settings.modelKey = key;
  saveSettingsPatch({ modelKey: key });
  renderConversation({ scroll: false });
}

async function startModelLoad({ modal = true } = {}) {
  if (DEMO_MODE) return;

  const current = engine.getState();
  if (current.phase === "loading") {
    if (modal) showLoadDialog();
    return;
  }

  await stopAndWait();

  const key = normalizeModelKey(
    state.selectedKey || state.settings.modelKey || recommendedModelKey(state.device),
  );
  const model = modelByKey(key);
  if (!model) {
    toast("Pick a model first.");
    return;
  }

  state.selectedKey = key;
  state.settings.modelKey = key;
  state.settings.onboardingDone = true;
  await saveSettingsPatch({ modelKey: key, onboardingDone: true });
  await requestPersistentStorage();

  if (modal) showLoadDialog();

  try {
    await engine.loadModel({ modelKey: key, device: state.device });
    if (engine.getState().phase === "ready") {
      if (dom["load-dialog"].open) closeDialog(dom["load-dialog"]);
      state.loadDialogMode = null;
      toast(`${model.name} is ready.`);
      updateSettingsModelInfo();
      renderConversation({ scroll: false });
    }
  } catch (error) {
    if (error?.name === "AbortError" || engine.getState().phase === "idle") {
      if (dom["load-dialog"].open) closeDialog(dom["load-dialog"]);
      state.loadDialogMode = null;
      return;
    }
    showLoadError(engine.getState().error || error?.message || "The model failed to load.");
  }
}

function showLoadDialog() {
  const model = modelByKey(state.selectedKey) || null;
  state.loadDialogMode = "loading";

  dom["load-title"].textContent = "Preparing your model";
  dom["load-sub"].textContent = model
    ? `${model.family} needs about ${modelSizeLabel(model.downloadMB)} on first load. The weights are cached after that.`
    : "The first visit downloads the weights once. Later visits load from cache.";

  dom["load-retry"].hidden = true;
  dom["load-hide"].hidden = false;
  dom["load-cancel"].hidden = false;
  dom["load-cancel"].textContent = "Cancel";

  updateLoadProgress(engine.getState());
  if (!dom["load-dialog"].open) dom["load-dialog"].showModal();
}

function updateLoadProgress(snapshot) {
  const pct = Math.max(0, Math.min(100, Math.round((snapshot.progress || 0) * 100)));
  dom["load-fill"].style.width = `${pct}%`;
  dom["load-percent"].textContent = `${pct}%`;
  dom["load-detail"].textContent = snapshot.progressText || "Starting...";
  dom["load-progress-track"].setAttribute("aria-valuenow", String(pct));
}

function showLoadError(message) {
  state.loadDialogMode = "error";
  dom["load-title"].textContent = "The model did not load";
  dom["load-sub"].textContent = message;
  dom["load-fill"].style.width = "0%";
  dom["load-percent"].textContent = "Error";
  dom["load-detail"].textContent = "Try again, or pick a smaller model.";
  dom["load-retry"].hidden = false;
  dom["load-hide"].hidden = true;
  dom["load-cancel"].hidden = false;
  dom["load-cancel"].textContent = "Close";
  if (!dom["load-dialog"].open) dom["load-dialog"].showModal();
}

function hideLoadDialog() {
  closeDialog(dom["load-dialog"]);
  state.loadDialogMode = null;
  if (engine.getState().phase === "loading") {
    toast("Download continues in the background.");
  }
}

async function cancelLoad() {
  if (state.loadDialogMode === "error") {
    closeDialog(dom["load-dialog"]);
    state.loadDialogMode = null;
    return;
  }

  engine.abortLoad();
  closeDialog(dom["load-dialog"]);
  state.loadDialogMode = null;
  state.settings.onboardingDone = false;
  await saveSettingsPatch({ onboardingDone: false });
  toast("Model load cancelled. Partial downloads may be reused later.");
  renderConversation({ scroll: false });
  updateEngineChrome(engine.getState());
}

/* ---------------------------------------------------------------
   Settings
--------------------------------------------------------------- */

function openSettings() {
  syncSettingsForm();
  updateSettingsModelInfo();
  if (!dom["settings-dialog"].open) dom["settings-dialog"].showModal();
}

async function saveSettingsPatch(patch) {
  Object.assign(state.settings, patch);
  try {
    await saveSettings(patch);
  } catch (error) {
    console.error("Could not save settings", error);
    toast("Could not save settings.");
  }
}

async function exportChats() {
  try {
    const conversations = [];
    for (const summary of state.conversations) {
      const conversation = await getConversation(summary.id);
      if (conversation) conversations.push(conversation);
    }

    const payload = {
      app: "LocalMind",
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      settings: {
        mode: state.settings.mode,
        temperature: state.settings.temperature,
        maxTokens: state.settings.maxTokens,
        theme: state.settings.theme,
        memory: state.settings.memory || [],
      },
      conversations,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `localmind-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("Chats exported as JSON.");
  } catch (error) {
    console.error(error);
    toast("Export failed.");
  }
}

async function clearAllData() {
  closeDialog(dom["settings-dialog"]);
  const ok = await confirmDialog({
    title: "Clear everything?",
    body: "This deletes every chat and setting from this browser. It cannot be undone.",
    confirmLabel: "Clear all data",
  });
  if (!ok) return;

  await stopAndWait();
  await engine.unload();
  await clearDatabase();

  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Cache storage may be unavailable.
  }

  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // Storage may be unavailable.
  }

  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    // Service workers are optional.
  }

  toast("Everything cleared. Reloading...");
  window.setTimeout(() => window.location.reload(), 500);
}

/* ---------------------------------------------------------------
   Chat generation
--------------------------------------------------------------- */

function handleSend() {
  if (state.generating) return;
  const text = dom.input.value.trim();
  if (!text) return;

  if (!engine.isReady()) {
    toast("The assistant is still starting. Try again in a second.");
    return;
  }

  dom.input.value = "";
  autoResize();
  updateComposerState();
  sendUserMessage(text);
}

async function sendUserMessage(text) {
  const command = parseMemoryCommand(text);
  state.memoryOutcome = command ? applyMemoryCommand(state.settings.memory, command) : null;
  if (state.memoryOutcome?.changed) {
    await saveSettingsPatch({ memory: state.memoryOutcome.memory });
  }

  const conversation = ensureConversation();
  const userMessage = createMessage("user", text);
  conversation.messages.push(userMessage);
  conversation.mode = state.settings.mode;
  conversation.modelKey = state.selectedKey;
  conversation.updatedAt = Date.now();
  if (conversation.title === "New chat") conversation.title = deriveTitle(text);

  const assistant = createMessage("assistant", "", { streaming: true });
  conversation.messages.push(assistant);
  state.autoScroll = true;

  await saveCurrent();
  renderConversation();
  runGeneration(assistant.id);
}

function ensureConversation() {
  if (!state.conversation) {
    state.conversation = createConversation({
      mode: state.settings.mode,
      modelKey: state.selectedKey,
    });
  }
  return state.conversation;
}

async function runGeneration(assistantId) {
  const conversation = state.conversation;
  const assistant = conversation?.messages.find((message) => message.id === assistantId);
  if (!conversation || !assistant) return;

  const messagesForEngine = buildEngineMessages(conversation, assistantId);
  if (!messagesForEngine) {
    assistant.streaming = false;
    assistant.error = "There is no message to answer.";
    renderConversation({ scroll: false });
    return;
  }

  const runId = ++state.runId;
  state.generating = true;
  state.partialText = "";
  state.streamSignal = engine.newGenerationSignal();
  state.generationDone = new Promise((resolve) => {
    state.resolveGeneration = resolve;
  });
  state.autoScroll = true;
  updateComposerState();
  updateEngineChrome(engine.getState());

  const started = performance.now();
  let accumulated = "";
  let usage = null;
  let aborted = false;
  let errorMessage = null;
  let lastSave = performance.now();

  try {
    for await (const chunk of engine.generate({
      messages: messagesForEngine,
      temperature: Number(state.settings.temperature),
      maxTokens: Number(state.settings.maxTokens),
      signal: state.streamSignal,
      demo: {
        buildDemoReply: state.settings.mode === "coder" ? demoCodingReply : null,
        memoryOutcome: state.memoryOutcome,
      },
    })) {
      if (runId !== state.runId) return;

      if (chunk.text) {
        accumulated += chunk.text;
        state.partialText = accumulated;
        const node = dom.messages.querySelector(
          `[data-message-id="${cssEscape(assistantId)}"]`,
        );
        if (node) streamText(node, accumulated, state.autoScroll);

        if (performance.now() - lastSave > 2500) {
          assistant.content = accumulated;
          conversation.updatedAt = Date.now();
          saveConversation(conversation).catch(() => {});
          lastSave = performance.now();
        }
      }

      if (chunk.usage) usage = chunk.usage;
    }
  } catch (error) {
    if (error?.name === "AbortError" || state.streamSignal?.aborted) aborted = true;
    else errorMessage = friendlyError(error);
  }

  if (runId !== state.runId) {
    resolveGenerationRun();
    return;
  }

  assistant.streaming = false;
  assistant.content = accumulated.trimEnd();
  const stoppedByUser = aborted || Boolean(state.streamSignal?.aborted);
  assistant.stopped = stoppedByUser;

  if (errorMessage) {
    assistant.error = errorMessage;
  } else {
    if (!assistant.content) {
      assistant.content = stoppedByUser ? "_Stopped._" : "_No output. Try a shorter prompt._";
    }
    if (!stoppedByUser) {
      const seconds = Math.max((performance.now() - started) / 1000, 0.01);
      const tokens = usage?.completion_tokens || estimateTokens(assistant.content);
      if (tokens) {
        assistant.stats = {
          tokens,
          seconds,
          tokensPerSecond: tokens / seconds,
        };
      }
    }
  }

  state.generating = false;
  state.streamSignal = null;
  state.partialText = "";
  updateComposerState();
  resolveGenerationRun();
  await saveCurrent();
  renderConversation({ scroll: false });
  scrollToBottom();
  updateEngineChrome(engine.getState());
  focusInput();
}

function buildEngineMessages(conversation, excludeId) {
  const mode = modeById(state.settings.mode);
  const latestUser =
    [...conversation.messages]
      .reverse()
      .find(
        (message) =>
          message.role === "user" && message.id !== excludeId && message.content?.trim(),
      )?.content || "";

  let systemPrompt = `${mode.prompt}\n\n${CONVERSATION_SKILLS}\n\n${UNDERSTANDING_SKILLS}\n\n${SYSTEM_GUARDRAIL}`;

  const memoryPrompt = buildMemoryPrompt(state.settings.memory, latestUser, state.memoryOutcome);
  if (memoryPrompt) systemPrompt += `\n\n${memoryPrompt}`;

  const hint = understandingHint(analyzeIntent(latestUser));
  if (hint) systemPrompt += `\n\n${hint}`;

  if (mode.id === "coder") {
    systemPrompt += `\n\n${buildCodingPrompt({
      languageId: "auto",
      taskId: "auto",
      userText: latestUser,
    })}`;
  }

  const custom = state.settings.customInstructions.trim();
  if (custom) systemPrompt += `\n\nAdditional user instructions:\n${custom}`;

  const history = conversation.messages.filter(
    (message) =>
      message.id !== excludeId &&
      !message.streaming &&
      !message.error &&
      message.content?.trim() &&
      (message.role === "user" || message.role === "assistant"),
  );

  const trimmed = [];
  let characters = 0;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (trimmed.length >= CONTEXT_LIMITS.maxMessages) break;
    const content =
      message.role === "user" ? expandShorthand(normalizeText(message.content)) : message.content;
    if (characters + content.length > CONTEXT_LIMITS.maxChars && trimmed.length > 0) break;
    trimmed.unshift({ role: message.role, content });
    characters += content.length;
  }

  if (!trimmed.length) return null;
  return [{ role: "system", content: systemPrompt }, ...trimmed];
}

async function regenerate() {
  if (state.generating || !engine.isReady()) return;
  const conversation = state.conversation;
  if (!conversation) return;

  const last = conversation.messages.at(-1);
  if (!last || last.role !== "assistant") return;

  conversation.messages.pop();
  if (!conversation.messages.some((message) => message.role === "user")) return;

  const assistant = createMessage("assistant", "", { streaming: true });
  conversation.messages.push(assistant);
  state.autoScroll = true;
  renderConversation();
  runGeneration(assistant.id);
}

function stopGeneration() {
  if (!state.generating) return;
  engine.stop();
}

async function stopAndWait() {
  if (!state.generating) return;
  engine.stop();
  await Promise.race([
    state.generationDone,
    new Promise((resolve) => window.setTimeout(resolve, 2500)),
  ]);
  if (state.generating) forceFinishGeneration();
}

function forceFinishGeneration() {
  state.runId += 1;
  state.generating = false;
  state.streamSignal = null;

  const conversation = state.conversation;
  const assistant = conversation?.messages.at(-1);
  if (assistant?.streaming) {
    assistant.streaming = false;
    assistant.content = state.partialText.trimEnd() || "_Stopped._";
    assistant.stopped = true;
    assistant.error = null;
    saveCurrent().catch(() => {});
    renderConversation({ scroll: false });
  }

  state.partialText = "";
  resolveGenerationRun();
  updateComposerState();
  updateEngineChrome(engine.getState());
}

function resolveGenerationRun() {
  if (state.resolveGeneration) {
    state.resolveGeneration();
    state.resolveGeneration = null;
  }
}

function onMessagesClick(event) {
  const copyButton = event.target.closest("[data-copy-code]");
  if (copyButton) {
    const block = copyButton.closest(".code-block");
    const code = block?.querySelector("pre code")?.textContent || "";
    copyText(code);
    const label = copyButton.querySelector("span");
    if (label) {
      label.textContent = "Copied";
      window.setTimeout(() => {
        label.textContent = "Copy";
      }, 1300);
    }
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === "copy") {
      const message = state.conversation?.messages.find(
        (item) => item.id === actionButton.dataset.messageId,
      );
      if (message) {
        copyText(message.content);
        toast("Message copied.");
      }
      return;
    }
    if (action === "regenerate" || action === "retry") {
      regenerate();
      return;
    }
    if (action === "start-model") {
      startModelLoad({ modal: true });
      return;
    }
  }

  const modelCard = event.target.closest("[data-model-key]");
  if (modelCard && !modelCard.disabled) {
    selectWelcomeModel(modelCard.dataset.modelKey);
    return;
  }

  const suggestion = event.target.closest("[data-suggestion]");
  if (suggestion) {
    dom.input.value = suggestion.dataset.suggestion;
    autoResize();
    updateComposerState();
    focusInput();
  }
}

/* ---------------------------------------------------------------
   Utilities
--------------------------------------------------------------- */

function deriveTitle(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 52 ? `${clean.slice(0, 49).trimEnd()}...` : clean;
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

function friendlyError(error) {
  const message = String(error?.message || error || "Unknown error");
  if (/out of memory|OOM|memory allocation/i.test(message)) {
    return "The browser ran out of memory. Pick a smaller model or close other tabs.";
  }
  if (/device lost/i.test(message)) {
    return "The GPU device was lost. Reload the page and try again.";
  }
  if (/fetch|network|download/i.test(message)) {
    return "The download failed. Check your connection and try again.";
  }
  return message.length > 260 ? `${message.slice(0, 257)}...` : message;
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function autoResize() {
  dom.input.style.height = "auto";
  dom.input.style.height = `${Math.min(dom.input.scrollHeight, 190)}px`;
}

function scrollToBottom() {
  window.requestAnimationFrame(() => {
    dom["chat-scroll"].scrollTop = dom["chat-scroll"].scrollHeight;
    state.autoScroll = true;
  });
}

function focusInput() {
  if (window.matchMedia("(pointer: coarse)").matches) return;
  dom.input.focus();
}

async function copyText(text) {
  const value = String(text || "");
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Fallback for browsers that block the clipboard API.
  }

  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  try {
    document.execCommand("copy");
    return true;
  } catch {
    toast("Copy failed. Select the text manually.");
    return false;
  } finally {
    area.remove();
  }
}

function toast(message) {
  window.clearTimeout(state.toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  state.toastTimer = window.setTimeout(() => {
    dom.toast.classList.remove("show");
  }, 2800);
}

let activeConfirm = null;

function confirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  tone = "danger",
}) {
  if (activeConfirm) activeConfirm(false);

  return new Promise((resolve) => {
    let settled = false;
    const onCancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    const onBackdrop = (event) => {
      if (event.target === dom["confirm-dialog"]) finish(false);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      activeConfirm = null;
      dom["confirm-dialog"].removeEventListener("cancel", onCancel);
      dom["confirm-dialog"].removeEventListener("click", onBackdrop);
      if (dom["confirm-dialog"].open) dom["confirm-dialog"].close();
      resolve(value);
    };

    activeConfirm = finish;

    dom["confirm-title"].textContent = title;
    dom["confirm-body"].textContent = body;
    dom["confirm-ok"].textContent = confirmLabel;
    dom["confirm-ok"].className = `btn ${tone}`;
    dom["confirm-ok"].onclick = () => finish(true);
    dom["confirm-cancel"].onclick = () => finish(false);

    dom["confirm-dialog"].addEventListener("cancel", onCancel);
    dom["confirm-dialog"].addEventListener("click", onBackdrop);
    if (!dom["confirm-dialog"].open) dom["confirm-dialog"].showModal();
  });
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}
