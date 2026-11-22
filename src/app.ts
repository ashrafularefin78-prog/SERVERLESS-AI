import {
  APP_VERSION,
  CONVERSATION_SKILLS,
  contextLimitsFor,
  DEFAULT_SETTINGS,
  SUGGESTIONS,
  SYSTEM_GUARDRAIL,
  THINKING_EFFORTS,
  UNDERSTANDING_SKILLS,
  effortById,
  modeById,
} from "./config.js";
import {
  MAX_MEMORIES,
  applyMemoryCommand,
  buildMemoryPrompt,
  parseMemoryCommand,
} from "./memory.js";
import {
  KEY_DERIVATION,
  decryptJson,
  LEGACY_KEY_DERIVATION,
  MEMORY_VERIFIER,
  MIN_PASSPHRASE_LENGTH,
  checkVerifier,
  deriveMemoryKey,
  encryptJson,
  randomSalt,
  recordAAD,
} from "./crypto.js";
import { analyzeIntent, expandShorthand, normalizeText, understandingHint } from "./understand.js";
import {
  offlineModeSupported,
  readOfflineModeMarker,
  refreshServiceWorker,
  writeOfflineModeMarker,
} from "./offline.js";
import {
  clearDiagnostics,
  formatDiagnostics,
  listDiagnostics,
  recordDiagnostic,
  subscribeDiagnostics,
  type DiagnosticEntry,
} from "./diagnostics.js";
import type { GpuAdapterInfo, StorageUsage } from "./diagnostics-bundle.js";
import type { RedactionResult } from "./privacy/redact.js";
import type { IndexProgressView } from "./rag/progress.js";

/** Loaded when indexing starts: a reader who never adds a document never needs it. */
const loadIndexProgress = () => import("./rag/progress.js");

/**
 * The redaction module is a lazy dependency: a user who never turns the setting on
 * never downloads or parses it.
 */
const loadRedactor = () => import("./privacy/redact.js");

/**
 * Loaded on demand. The probes touch WebGPU and OPFS, and a reader who never opens
 * Settings should not download code for them.
 */
const diagnosticsBundle = () => import("./diagnostics-bundle.js");
import { compactHistory, formatCompactionNote } from "./context.js";
import * as engine from "./engine/manager.js";
import {
  assessModelFit,
  detectDeviceProfile,
  deviceSummary,
  recommendDeviceModel,
} from "./engine/device.js";
import { groupModelsByFamily, modelFamily } from "./engine/model-families.js";
import { createIdleRelease, shouldReleaseOnHide } from "./engine/memory.js";
import { buildBugReportUrl, readPlatform } from "./feedback.js";
import {
  isLicenseAccepted,
  licenseAcceptanceKey,
  licenseFor,
  needsLicenseAcceptance,
} from "./engine/model-licenses.js";
import type { DeviceProfile } from "./engine/device.js";
import type { LocalModel } from "./engine/models.js";
import {
  clearDatabase,
  createConversation,
  createMessage,
  decryptStoredConversations,
  deleteConversation,
  encryptStoredConversations,
  getConversation,
  getSettings,
  listConversations,
  migrateVaultRecords,
  saveConversation,
  saveSettings,
  setVaultKey,
} from "./storage/db.js";
import { h, renderHistory, renderMessage, renderWelcome, streamText } from "./ui/render.js";
import { buildCodingPrompt, coderSuggestions, demoCodingReply } from "./coder/languages.js";
import { piiWarning } from "./guardrails.js";
import {
  addDocumentFile,
  listDocuments,
  removeDocument,
  retrieveKnowledge,
  disposeEmbeddings,
  setEmbeddingProgressListener,
} from "./rag/index.js";
import type {
  ChatMessage,
  Conversation,
  ConversationSummary,
  EngineState,
  KnowledgeDoc,
  MemoryNote,
  MemoryOutcome,
  MemoryVault,
  Message,
  Settings,
  Theme,
  ThinkingEffort,
} from "./types.js";

interface Dom {
  app: HTMLElement;
  sidebar: HTMLElement;
  scrim: HTMLElement;
  history: HTMLElement;
  "new-chat": HTMLButtonElement;
  "sidebar-close": HTMLButtonElement;
  "open-sidebar": HTMLButtonElement;
  "engine-pill": HTMLElement;
  "status-dot": HTMLElement;
  "status-label": HTMLElement;
  "status-sub": HTMLElement;
  "open-settings": HTMLButtonElement;
  "open-settings-2": HTMLButtonElement;
  "chat-title": HTMLElement;
  "chat-sub": HTMLElement;
  "model-chip": HTMLElement;
  "chip-dot": HTMLElement;
  "model-chip-label": HTMLElement;
  "theme-toggle": HTMLButtonElement;
  "chat-scroll": HTMLElement;
  "scroll-bottom": HTMLButtonElement;
  "scroll-bottom-label": HTMLElement;
  messages: HTMLElement;
  "mode-select": HTMLSelectElement;
  composer: HTMLFormElement;
  input: HTMLTextAreaElement;
  send: HTMLButtonElement;
  stop: HTMLButtonElement;
  "edit-banner": HTMLElement;
  "edit-cancel": HTMLButtonElement;
  "clear-data-link": HTMLButtonElement;
  "settings-dialog": HTMLDialogElement;
  "custom-instructions": HTMLTextAreaElement;
  "memory-list": HTMLUListElement;
  "memory-input": HTMLInputElement;
  "memory-add": HTMLButtonElement;
  "model-select": HTMLInputElement;
  "model-picker": HTMLElement;
  "model-trigger": HTMLButtonElement;
  "model-trigger-value": HTMLElement;
  "model-trigger-meta": HTMLElement;
  "model-pop": HTMLElement;
  "model-search": HTMLInputElement;
  "model-count": HTMLElement;
  "model-list": HTMLElement;
  "composer-model-trigger": HTMLButtonElement;
  "composer-model-trigger-value": HTMLElement;
  "composer-model-pop": HTMLElement;
  "composer-model-search": HTMLInputElement;
  "composer-model-count": HTMLElement;
  "composer-model-list": HTMLElement;
  "composer-model-empty": HTMLElement;
  "effort-select": HTMLSelectElement;
  "model-empty": HTMLElement;
  "model-status": HTMLElement;
  "model-note": HTMLElement;
  "model-load": HTMLButtonElement;
  "model-delete": HTMLButtonElement;
  "model-progress": HTMLProgressElement;
  "device-check": HTMLElement;
  "device-check-spec": HTMLElement;
  "device-check-advice": HTMLElement;
  "device-recommend": HTMLButtonElement;
  "model-warning": HTMLElement;
  "knowledge-list": HTMLUListElement;
  "knowledge-add": HTMLButtonElement;
  "knowledge-file": HTMLInputElement;
  "knowledge-status": HTMLElement;
  "welcome-dialog": HTMLDialogElement;
  "welcome-device-title": HTMLElement;
  "welcome-device-reason": HTMLElement;
  "welcome-start": HTMLButtonElement;
  "welcome-model": HTMLButtonElement;
  "knowledge-progress": HTMLElement;
  "knowledge-progress-fill": HTMLElement;
  "vault-status": HTMLElement;
  "vault-enable": HTMLButtonElement;
  "vault-unlock": HTMLButtonElement;
  "vault-lock": HTMLButtonElement;
  "vault-disable": HTMLButtonElement;
  "vault-dialog": HTMLDialogElement;
  "vault-title": HTMLElement;
  "vault-sub": HTMLElement;
  "vault-pass": HTMLInputElement;
  "vault-confirm": HTMLInputElement;
  "vault-confirm-field": HTMLElement;
  "vault-hint": HTMLElement;
  "vault-ok": HTMLButtonElement;
  "vault-cancel": HTMLButtonElement;
  "theme-select": HTMLSelectElement;
  "export-data": HTMLButtonElement;
  "clear-data": HTMLButtonElement;
  "hardware-stats": HTMLInputElement;
  "offline-mode": HTMLInputElement;
  "offline-mode-note": HTMLElement;
  "redact-pii": HTMLInputElement;
  "redact-pii-note": HTMLElement;
  "offline-badge": HTMLElement;
  "diagnostic-list": HTMLUListElement;
  "diagnostic-env": HTMLElement;
  "report-bug": HTMLAnchorElement;
  "diagnostics-copy": HTMLButtonElement;
  "diagnostics-export": HTMLButtonElement;
  "env-gpu": HTMLElement;
  "env-memory": HTMLElement;
  "env-storage": HTMLElement;
  "diagnostics-clear": HTMLButtonElement;
  "license-dialog": HTMLDialogElement;
  "license-model": HTMLElement;
  "license-terms": HTMLElement;
  "license-link-row": HTMLElement;
  "license-link": HTMLAnchorElement;
  "license-accept": HTMLInputElement;
  "license-accept-label": HTMLElement;
  "license-cancel": HTMLButtonElement;
  "license-ok": HTMLButtonElement;
  "engine-alert": HTMLElement;
  "engine-alert-title": HTMLElement;
  "engine-alert-text": HTMLElement;
  "engine-alert-reload": HTMLButtonElement;
  "engine-alert-dismiss": HTMLButtonElement;
  "confirm-dialog": HTMLDialogElement;
  "confirm-title": HTMLElement;
  "confirm-body": HTMLElement;
  "confirm-ok": HTMLButtonElement;
  "confirm-cancel": HTMLButtonElement;
  toast: HTMLElement;
  announcement: HTMLElement;
}

interface State {
  settings: Settings;
  conversations: ConversationSummary[];
  conversation: Conversation | null;
  engine: EngineState;
  generating: boolean;
  runId: number;
  streamSignal: AbortSignal | null;
  partialText: string;
  autoScroll: boolean;
  resolveGeneration: (() => void) | null;
  generationDone: Promise<void>;
  instructionsTimer: number | null;
  toastTimer: number | null;
  memoryOutcome: MemoryOutcome | null;
  editingId: string | null;
  memoryKey: CryptoKey | null;
  vaultAutoLockTimer: number | null;
  vaultHideTimer: number | null;
  /** Guards against a second lock while one is saving and clearing. */
  lockingVault: boolean;
  modelSupport: Awaited<ReturnType<typeof engine.detectSupport>> | null;
  modelCached: boolean | null;
  deviceProfile: DeviceProfile | null;
  knowledge: KnowledgeDoc[];
  knowledgeBusy: boolean;
  /** How many trailing messages are in the DOM, for long chats. */
  messageWindow: number;
  messageWindowFor: string | null;
  vaultMode: "enable" | "unlock" | null;
  /** Set when the model was unloaded to free memory, so a send can reload it. */
  modelReleased: boolean;
}

/**
 * Messages kept in the DOM per page. A 10,000-message chat must not build
 * 10,000 nodes on load; older turns are appended on request.
 */
const MESSAGE_WINDOW_STEP = 60;

const $ = (id: string) => document.getElementById(id);

const dom = {} as Dom;
const state: State = {
  settings: { ...DEFAULT_SETTINGS },
  conversations: [],
  conversation: null,
  engine: engine.getState(),
  generating: false,
  runId: 0,
  streamSignal: null,
  partialText: "",
  autoScroll: true,
  resolveGeneration: null,
  generationDone: Promise.resolve(),
  instructionsTimer: null,
  toastTimer: null,
  memoryOutcome: null,
  editingId: null,
  memoryKey: null,
  vaultAutoLockTimer: null,
  vaultHideTimer: null,
  lockingVault: false,
  modelSupport: null,
  modelCached: null,
  deviceProfile: null,
  knowledge: [],
  knowledgeBusy: false,
  messageWindow: MESSAGE_WINDOW_STEP,
  messageWindowFor: null,
  vaultMode: null,
  modelReleased: false,
};

export async function boot() {
  cacheDom();
  bindEvents();
  applyTheme();

  const settings = await getSettings();
  state.settings = { ...DEFAULT_SETTINGS, ...settings };
  const vaulted = Boolean(state.settings.memoryVault);
  if (vaulted) state.settings.memory = [];
  state.conversations = vaulted ? [] : await listConversations();

  applyTheme();
  await reconcileOfflineMode();
  syncSettingsForm();
  updateModeSelect();

  state.conversation = await initialConversation();
  renderAll();
  syncBugReportLink();
  engine.subscribe(onEngineState);

  await initModelPanel();
  await refreshKnowledge();
  // A previous out-of-memory crash asked us not to reload the same model again.
  const skipRestore = readSessionFlag(SKIP_MODEL_RESTORE_FLAG);
  writeSessionFlag(SKIP_MODEL_RESTORE_FLAG, false);
  await engine.init({
    modelId:
      !skipRestore && engine.models.some((model) => model.id === state.settings.modelId)
        ? state.settings.modelId
        : null,
  });

  autoResize();
  updateComposerState();

  if (vaulted) {
    openVaultDialog("unlock");
  } else if (wantsDiagnosticsOnLoad()) {
    // `?debug=true` is the link a maintainer can hand to a user: it lands on the
    // diagnostics panel instead of asking them to find it.
    openSettings({ scrollToDiagnostics: true });
  } else if (!maybeShowWelcome()) {
    void settleWelcome();
  }
}

function wantsDiagnosticsOnLoad() {
  try {
    return new URLSearchParams(window.location.search).get("debug") === "true";
  } catch {
    return false;
  }
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
    "chat-scroll",
    "scroll-bottom",
    "scroll-bottom-label",
    "messages",
    "mode-select",
    "composer",
    "input",
    "send",
    "stop",
    "edit-banner",
    "edit-cancel",
    "clear-data-link",
    "settings-dialog",
    "custom-instructions",
    "memory-list",
    "memory-input",
    "memory-add",
    "model-select",
    "model-picker",
    "model-trigger",
    "model-trigger-value",
    "model-trigger-meta",
    "model-pop",
    "model-search",
    "model-count",
    "model-list",
    "model-empty",
    "composer-model-trigger",
    "composer-model-trigger-value",
    "composer-model-pop",
    "composer-model-search",
    "composer-model-count",
    "composer-model-list",
    "composer-model-empty",
    "effort-select",
    "model-status",
    "model-note",
    "model-load",
    "model-delete",
    "model-progress",
    "device-check",
    "device-check-spec",
    "device-check-advice",
    "device-recommend",
    "model-warning",
    "knowledge-list",
    "knowledge-add",
    "knowledge-file",
    "knowledge-status",
    "welcome-dialog",
    "welcome-device-title",
    "welcome-device-reason",
    "welcome-start",
    "welcome-model",
    "knowledge-progress",
    "knowledge-progress-fill",
    "vault-status",
    "vault-enable",
    "vault-unlock",
    "vault-lock",
    "vault-disable",
    "vault-dialog",
    "vault-title",
    "vault-sub",
    "vault-pass",
    "vault-confirm",
    "vault-confirm-field",
    "vault-hint",
    "vault-ok",
    "vault-cancel",
    "theme-select",
    "export-data",
    "clear-data",
    "hardware-stats",
    "offline-mode",
    "offline-mode-note",
    "redact-pii",
    "redact-pii-note",
    "offline-badge",
    "diagnostic-list",
    "diagnostic-env",
    "report-bug",
    "diagnostics-copy",
    "diagnostics-export",
    "env-gpu",
    "env-memory",
    "env-storage",
    "diagnostics-clear",
    "license-dialog",
    "license-model",
    "license-terms",
    "license-link-row",
    "license-link",
    "license-accept",
    "license-accept-label",
    "license-cancel",
    "license-ok",
    "engine-alert",
    "engine-alert-title",
    "engine-alert-text",
    "engine-alert-reload",
    "engine-alert-dismiss",
    "confirm-dialog",
    "confirm-title",
    "confirm-body",
    "confirm-ok",
    "confirm-cancel",
    "toast",
    "announcement",
  ];
  const cache = dom as unknown as Record<string, HTMLElement | null>;
  for (const id of ids) {
    cache[id] = $(id);
    if (!cache[id]) console.warn(`Missing element #${id}`);
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

  dom["theme-toggle"].addEventListener("click", toggleTheme);
  dom["open-settings"].addEventListener("click", () => openSettings());
  dom["open-settings-2"].addEventListener("click", () => openSettings());

  for (const button of document.querySelectorAll("[data-close-dialog]")) {
    button.addEventListener("click", () => {
      const dialog = button.closest<HTMLDialogElement>("dialog");
      if (dialog) closeDialog(dialog);
    });
  }

  dom["settings-dialog"].addEventListener("click", (event) => {
    if (event.target === dom["settings-dialog"]) closeDialog(dom["settings-dialog"]);
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
  dom["edit-cancel"].addEventListener("click", () => cancelEdit());

  dom["mode-select"].addEventListener("change", () => {
    state.settings.mode = dom["mode-select"].value;
    saveSettingsPatch({ mode: state.settings.mode });
    updateChatHeader();
    updateComposerPlaceholder();
    refreshWelcomeSuggestions();
  });
  dom["effort-select"].addEventListener("change", () => {
    state.settings.effort = dom["effort-select"].value as ThinkingEffort;
    saveSettingsPatch({ effort: state.settings.effort });
  });

  dom["custom-instructions"].addEventListener("input", () => {
    state.settings.customInstructions = dom["custom-instructions"].value;
    window.clearTimeout(state.instructionsTimer ?? undefined);
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
    const button = (event.target as Element | null)?.closest<HTMLElement>("button[data-memory-id]");
    if (button) forgetMemory(button.dataset.memoryId ?? "");
  });
  dom["knowledge-add"].addEventListener("click", () => dom["knowledge-file"].click());
  dom["knowledge-file"].addEventListener("change", () => {
    const files = Array.from(dom["knowledge-file"].files ?? []);
    dom["knowledge-file"].value = "";
    if (files.length) void addKnowledgeFiles(files);
  });
  dom["knowledge-list"].addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>(
      "button[data-knowledge-id]",
    );
    if (button) void deleteKnowledge(button.dataset.knowledgeId ?? "");
  });

  for (const eventName of ["pointerdown", "keydown", "touchstart"] as const) {
    document.addEventListener(
      eventName,
      () => {
        if (state.memoryKey) armVaultAutoLock();
      },
      { passive: true },
    );
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (state.memoryKey) scheduleVaultHideLock();
      return;
    }
    // Back before the grace expired: keep the session, restart the idle clock.
    cancelVaultHideLock();
    if (state.memoryKey) armVaultAutoLock();
  });
  window.addEventListener("pagehide", () => {
    cancelVaultHideLock();
    if (state.memoryKey) void lockVault();
  });

  dom["vault-enable"].addEventListener("click", () => openVaultDialog("enable"));
  dom["vault-unlock"].addEventListener("click", () => openVaultDialog("unlock"));
  dom["vault-lock"].addEventListener("click", () => void lockVault());
  dom["vault-disable"].addEventListener("click", () => void disableEncryption());
  dom["vault-ok"].addEventListener("click", () => void confirmVault());
  dom["vault-cancel"].addEventListener("click", () => closeDialog(dom["vault-dialog"]));
  dom["vault-pass"].addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void confirmVault();
    }
  });
  renderEffortSelect();
  registerModelPickers();
  dom["device-recommend"].addEventListener("click", () => {
    dom["model-select"].value = dom["device-recommend"].dataset.modelId ?? "";
    syncModelTrigger();
    void applyModelChoice();
  });
  dom["model-load"].addEventListener("click", () => {
    void downloadSelectedModel();
  });
  dom["model-delete"].addEventListener("click", () => {
    void deleteSelectedModel();
  });
  dom["theme-select"].addEventListener("change", () => {
    state.settings.theme = dom["theme-select"].value as Theme;
    applyTheme();
    saveSettingsPatch({ theme: state.settings.theme });
  });

  dom["export-data"].addEventListener("click", exportChats);

  dom["clear-data"].addEventListener("click", clearAllData);
  dom["clear-data-link"].addEventListener("click", clearAllData);

  dom["offline-mode"].addEventListener("change", () => void setOfflineMode());
  dom["license-accept"].addEventListener("change", () => {
    dom["license-ok"].disabled = !dom["license-accept"].checked;
  });
  dom["license-cancel"].addEventListener("click", () => resolveLicense(false));
  dom["license-ok"].addEventListener("click", () => resolveLicense(dom["license-accept"].checked));
  // Escape closes a native <dialog> without running either button handler, so
  // settle the pending decision here as well instead of waiting forever.
  dom["license-dialog"].addEventListener("close", () => {
    const resolve = activeLicense;
    activeLicense = null;
    resolve?.(false);
  });

  dom["redact-pii"].addEventListener("change", () => {
    void saveSettingsPatch({ redactPii: dom["redact-pii"].checked });
    renderRedactionSetting();
  });
  dom["hardware-stats"].addEventListener("change", () => {
    void saveSettingsPatch({ hardwareStats: dom["hardware-stats"].checked });
  });
  dom["welcome-start"].addEventListener("click", () => closeWelcome());
  dom["welcome-model"].addEventListener("click", () => {
    closeWelcome();
    openSettings();
  });
  dom["diagnostics-copy"].addEventListener("click", () => void copyDiagnostics());
  dom["diagnostics-export"].addEventListener("click", () => void exportDiagnosticsBundle());
  dom["diagnostics-clear"].addEventListener("click", () => {
    clearDiagnostics();
    toast("Diagnostics cleared.");
  });
  dom["scroll-bottom"].addEventListener("click", () => scrollToBottom({ smooth: true }));
  dom["engine-alert-reload"].addEventListener("click", reloadApp);
  dom["engine-alert-dismiss"].addEventListener("click", hideEngineAlert);
  subscribeDiagnostics(() => renderDiagnostics());

  // Rotation, an opened mobile keyboard, or a window resize all change what
  // "at the bottom" means.
  // A discarded tab keeps nothing alive: hand the GPU memory back as it goes.
  // The back/forward cache is the exception, because the restore expects the
  // model to still be there.
  window.addEventListener("pagehide", (event) => {
    if (!shouldReleaseOnHide(event)) return;
    idleRelease.stop();
    void engine.unloadModel().catch(() => {});
  });

  window.addEventListener("resize", () => window.requestAnimationFrame(syncScrollCue));
  window.visualViewport?.addEventListener("resize", () =>
    window.requestAnimationFrame(syncScrollCue),
  );

  dom["chat-scroll"].addEventListener(
    "scroll",
    () => {
      // Reading these three properties forces layout, and scroll fires in bursts.
      // Collapse a burst into one measurement per frame.
      if (scrollFrame !== null) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = null;
        const distance = distanceFromBottom();
        // Direction, not timing, decides intent: the app's own jumps move
        // toward the bottom, and skipping the reader away from it is manual.
        // A time window cannot tell those apart when someone scrolls up again
        // straight after a jump.
        const towardBottom = distance < lastDistance - 1;
        lastDistance = distance;
        if (distance < BOTTOM_SLACK) state.autoScroll = true;
        else if (!towardBottom) state.autoScroll = false;
        syncScrollCue();
      });
    },
    { passive: true },
  );

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "k") {
      event.preventDefault();
      newChat();
      return;
    }
    if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
      if (state.editingId) cancelEdit();
      else if (state.generating) stopGeneration();
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
    const conversation = await getConversation(state.conversations[0]!.id);
    if (conversation) return conversation;
  }
  return createConversation({ mode: state.settings.mode });
}

function onEngineState(snapshot: EngineState) {
  const previous = state.engine;
  state.engine = snapshot;
  updateEngineChrome(snapshot);
  syncBugReportLink();
  if (snapshot.error && snapshot.error !== previous.error) toast(snapshot.error);

  // A later successful load clears the previous failure banner.
  if (!snapshot.error && !snapshot.crash && (previous.error || previous.crash)) hideEngineAlert();

  if (snapshot.crash && snapshot.crash !== previous.crash) {
    const outOfMemory = snapshot.crash === "oom";
    showEngineAlert(
      outOfMemory ? "The model ran out of memory" : "The on-device model stopped",
      snapshot.error || "The built-in assistant is still available.",
    );
    if (outOfMemory && !previous.generating) scheduleMemoryReload();
  }
  if (
    snapshot.phase !== previous.phase ||
    snapshot.mode !== previous.mode ||
    snapshot.modelId !== previous.modelId ||
    snapshot.progress?.progress !== previous.progress?.progress
  ) {
    renderModelPanel();
  }

  if (snapshot.mode !== previous.mode || snapshot.phase !== previous.phase) {
    if (snapshot.mode === "model") state.modelReleased = false;
    syncMemoryWatch();
  }

  if (
    snapshot.phase === "ready" &&
    previous.phase !== "ready" &&
    state.conversation?.messages.length === 0
  ) {
    renderConversation({ scroll: false });
  }
}

function renderAll() {
  renderSidebar();
  renderConversation({ scroll: true });
  updateEngineChrome(state.engine);
  updateComposerState();
  updateChatHeader();
}

function getWelcomeModelRecommendation() {
  const recommendation = state.deviceProfile
    ? recommendDeviceModel(engine.models, state.deviceProfile)
    : null;
  // The welcome card is for devices that can run something better than the
  // built-in rules; "stay on the built-in assistant" needs no call to action.
  return recommendation && recommendation.kind !== "builtin" ? recommendation : null;
}

/* ---------------------------------------------------------------
   Rendering
--------------------------------------------------------------- */

function renderSidebar() {
  if (vaultLocked()) {
    dom.history.textContent = "";
    dom.history.append(
      h("p", { class: "history-empty", text: "Chats are encrypted. Unlock to read them." }),
    );
    return;
  }
  renderHistory(dom.history, state.conversations, state.conversation?.id ?? null);
}

function renderConversation({ scroll = true }: { scroll?: boolean } = {}) {
  const conversation = state.conversation;
  if (!conversation) return;

  updateChatHeader();
  dom.messages.textContent = "";

  if (!conversation.messages.length) {
    const mode = modeById(state.settings.mode);
    dom.messages.append(
      renderWelcome({
        engine: state.engine,
        suggestions: mode.id === "coder" ? coderSuggestions() : SUGGESTIONS,
        recommendation: getWelcomeModelRecommendation(),
      }),
    );
  } else {
    if (state.messageWindowFor !== conversation.id) {
      state.messageWindowFor = conversation.id;
      state.messageWindow = MESSAGE_WINDOW_STEP;
    }

    const last = conversation.messages.at(-1);
    const canRegenerate = last?.role === "assistant" && !last.streaming && !last.error;
    const start = Math.max(0, conversation.messages.length - state.messageWindow);
    const hidden = start;

    if (hidden > 0) {
      dom.messages.append(
        h(
          "div",
          { class: "earlier-bar" },
          h("button", {
            class: "btn subtle",
            type: "button",
            dataset: { action: "show-earlier" },
            text: `Show ${Math.min(hidden, MESSAGE_WINDOW_STEP)} earlier message${Math.min(hidden, MESSAGE_WINDOW_STEP) === 1 ? "" : "s"} (${hidden} hidden)`,
          }),
        ),
      );
    }

    for (const message of conversation.messages.slice(start)) {
      dom.messages.append(
        renderMessage(message, {
          canRegenerate: message === last && canRegenerate,
          canEdit: !state.generating,
        }),
      );
    }
  }

  if (scroll) {
    // The welcome panel is taller than a phone screen, so anchor it to the top
    // instead of scrolling the eyebrow and headline out of view on load.
    if (conversation.messages.length) {
      scrollToBottom();
    } else {
      window.requestAnimationFrame(() => {
        dom["chat-scroll"].scrollTop = 0;
        syncScrollCue();
      });
    }
  } else {
    window.requestAnimationFrame(syncScrollCue);
  }
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
  dom["chat-sub"].textContent = `${mode.label} mode - ${
    state.engine.mode === "model" ? "on-device model" : "built-in assistant"
  }`;
}

function updateComposerState() {
  const busy = state.generating;
  const hasText = Boolean(dom.input.value.trim());

  dom.send.hidden = busy;
  dom.stop.hidden = !busy;
  dom.send.disabled = !hasText || busy;
  dom.input.disabled = false;
  dom["mode-select"].disabled = false;
  dom.messages.classList.toggle("is-generating", busy);
}

/**
 * Point the feedback link at an issue pre-filled with what the user can see in
 * the app. Called whenever the engine changes, because the engine and model are
 * the first questions a maintainer asks.
 */
function syncBugReportLink() {
  const snapshot = state.engine;
  dom["report-bug"].href = buildBugReportUrl({
    environment: {
      engine: `${snapshot.mode === "model" ? "On-device model" : "Built-in assistant"} (${snapshot.phase})`,
      modelId: snapshot.modelId,
      userAgent: navigator.userAgent,
      platform: readPlatform(navigator as { platform?: string }),
      language: navigator.language,
    },
  });
}

function updateEngineChrome(snapshot: EngineState) {
  const status = engineStatus(snapshot);
  const dotClass = `status-dot${status.tone === "idle" ? "" : ` is-${status.tone}`}`;

  dom["status-dot"].className = dotClass;
  dom["chip-dot"].className = dotClass;
  dom["status-label"].textContent = status.label;
  dom["status-sub"].textContent = status.sub;
  dom["model-chip-label"].textContent = status.chip;
}

function engineStatus(snapshot: EngineState) {
  const model = engine.models.find((item) => item.id === snapshot.modelId) ?? null;

  if (snapshot.phase === "loading") {
    const percent = Math.round((snapshot.progress?.progress ?? 0) * 100);
    return {
      tone: "generating",
      label: "On-device model",
      sub: snapshot.progress?.text || "Loading...",
      chip: `Loading ${percent}%`,
    };
  }

  if (snapshot.mode === "model" && model) {
    return {
      tone: snapshot.phase === "generating" ? "generating" : "ready",
      label: model.label,
      sub:
        snapshot.phase === "generating"
          ? "Writing a reply..."
          : `On-device - ${model.runtime === "gguf" ? "CPU/WASM" : "WebGPU"} - offline`,
      chip: snapshot.phase === "generating" ? "Writing..." : model.label,
    };
  }

  if (snapshot.phase === "generating") {
    return {
      tone: "generating",
      label: "Built-in assistant",
      sub: "Writing a reply...",
      chip: "Writing...",
    };
  }

  if (snapshot.phase === "ready") {
    return {
      tone: "ready",
      label: "Built-in assistant",
      sub: "Built-in rules - works offline",
      chip: "Built-in assistant",
    };
  }

  return {
    tone: "idle",
    label: "Built-in assistant",
    sub: "Starting...",
    chip: "Built-in assistant",
  };
}

function renderEffortSelect() {
  const select = dom["effort-select"];
  select.textContent = "";
  for (const effort of THINKING_EFFORTS) {
    select.append(h("option", { value: effort.id, text: effort.label, title: effort.hint }));
  }
}

function syncSettingsForm() {
  dom["custom-instructions"].value = state.settings.customInstructions || "";
  dom["theme-select"].value = state.settings.theme;
  dom["effort-select"].value = effortById(state.settings.effort).id;
  updateModeSelect();
  updateComposerPlaceholder();
  renderMemoryList();
  renderVaultControls();
  dom["hardware-stats"].checked = Boolean(state.settings.hardwareStats);
  renderRedactionSetting();
  renderOfflineMode();
  renderDiagnostics();
}

function renderMemoryList() {
  const list = dom["memory-list"];
  list.textContent = "";
  const memory = state.settings.memory || [];

  if (vaultLocked()) {
    list.append(
      h("li", { class: "memory-empty", text: "Memory is encrypted. Unlock to view notes." }),
    );
    return;
  }

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

function vaultLocked(): boolean {
  return Boolean(state.settings.memoryVault) && !state.memoryKey;
}

function renderVaultControls() {
  const vault = state.settings.memoryVault;
  const locked = vaultLocked();

  dom["vault-status"].textContent = vault
    ? locked
      ? "Encrypted on this device. Locked until you unlock it."
      : "Encrypted on this device. Unlocked for this tab only."
    : "Not encrypted: chats and notes are stored as plain records in this browser.";

  dom["vault-enable"].hidden = Boolean(vault);
  dom["vault-unlock"].hidden = !locked;
  dom["vault-lock"].hidden = !vault || locked;
  dom["vault-disable"].hidden = !vault || locked;
}

function openVaultDialog(mode: "enable" | "unlock") {
  const enabling = mode === "enable";
  state.vaultMode = mode;

  dom["vault-title"].textContent = enabling ? "Encrypt chats and memory" : "Unlock encrypted chats";
  dom["vault-sub"].textContent = enabling
    ? "Choose a passphrase. Chats and memory notes are encrypted with AES-256-GCM before they are saved."
    : "Enter the passphrase you set on this device.";
  dom["vault-confirm-field"].hidden = !enabling;
  dom["vault-hint"].textContent = enabling
    ? `There is no recovery: if you forget the passphrase, the encrypted data cannot be read. Use at least ${MIN_PASSPHRASE_LENGTH} characters.`
    : "The passphrase is never stored. It unlocks data for this tab only. The vault locks after 15 minutes of inactivity or when you leave this tab.";
  dom["vault-ok"].textContent = enabling ? "Encrypt" : "Unlock";
  dom["vault-pass"].value = "";
  dom["vault-confirm"].value = "";

  if (!dom["vault-dialog"].open) dom["vault-dialog"].showModal();
  dom["vault-pass"].focus();
}

async function confirmVault() {
  const mode = state.vaultMode;
  const pass = dom["vault-pass"].value;
  if (!mode) return;

  if (mode === "enable") {
    if (pass.normalize("NFKC").length < MIN_PASSPHRASE_LENGTH) {
      toast(`Use a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters.`);
      return;
    }
    if (pass.normalize("NFKC") !== dom["vault-confirm"].value.normalize("NFKC")) {
      toast("Passphrases do not match.");
      return;
    }

    try {
      const normalizedPassphrase = pass.normalize("NFKC");
      const salt = randomSalt();
      const key = await deriveMemoryKey(normalizedPassphrase, salt);
      state.memoryKey = key;
      setVaultKey(key, 2);
      armVaultAutoLock();

      const vault: MemoryVault = {
        version: 2,
        kdf: "PBKDF2-SHA-256",
        iterations: KEY_DERIVATION.iterations,
        salt,
        verifier: await encryptJson(key, MEMORY_VERIFIER, recordAAD("settings", "vault-verifier")),
        notes: await encryptJson(
          key,
          state.settings.memory || [],
          recordAAD("settings", "vault-notes"),
        ),
      };
      const encrypted = await encryptStoredConversations();

      state.settings.memoryVault = vault;
      state.settings.memory = [];
      await saveSettings({ memoryVault: vault, memory: [] });
      closeDialog(dom["vault-dialog"]);
      await refreshVaultState();
      toast(
        encrypted
          ? `Encrypted ${encrypted} chat${encrypted === 1 ? "" : "s"} on this device.`
          : "Encryption enabled.",
      );
    } catch (error) {
      console.error("Could not enable encryption", error);
      toast("Could not enable encryption.");
    }
    return;
  }

  const vault = state.settings.memoryVault;
  if (!vault) return;

  try {
    const legacy = vault.version !== 2;
    const iterations = legacy
      ? LEGACY_KEY_DERIVATION.iterations
      : vault.iterations || KEY_DERIVATION.iterations;
    const oldKey = await deriveMemoryKey(pass, vault.salt, iterations, !legacy, !legacy);
    const oldVersion = legacy ? 1 : 2;
    const verifierAad = legacy ? undefined : recordAAD("settings", "vault-verifier");
    if (!(await checkVerifier(oldKey, vault.verifier, verifierAad))) {
      toast("Wrong passphrase.");
      return;
    }

    const notesAad = legacy ? undefined : recordAAD("settings", "vault-notes");
    const notes = await decryptJson<MemoryNote[]>(oldKey, vault.notes, notesAad);
    let key = oldKey;
    if (legacy || iterations < KEY_DERIVATION.iterations || vault.kdf !== "PBKDF2-SHA-256") {
      const salt = randomSalt();
      key = await deriveMemoryKey(pass, salt, KEY_DERIVATION.iterations, true, !legacy);
      const upgraded: MemoryVault = {
        version: 2,
        kdf: "PBKDF2-SHA-256",
        iterations: KEY_DERIVATION.iterations,
        salt,
        verifier: await encryptJson(key, MEMORY_VERIFIER, recordAAD("settings", "vault-verifier")),
        notes: await encryptJson(key, notes, recordAAD("settings", "vault-notes")),
      };
      await migrateVaultRecords(oldKey, key, oldVersion, upgraded);
      state.settings.memoryVault = upgraded;
    }

    state.memoryKey = key;
    setVaultKey(key, 2);
    state.settings.memory = notes;
    armVaultAutoLock();
    closeDialog(dom["vault-dialog"]);
    await refreshVaultState();
    toast(legacy ? "Vault upgraded and unlocked." : "Unlocked for this tab.");
  } catch (error) {
    console.error("Could not unlock", error);
    toast("Could not unlock.");
  }
}

async function refreshVaultState() {
  state.conversations = await listConversations();
  state.conversation = await initialConversation();
  renderAll();
  syncSettingsForm();
}

/**
 * Hiding the tab is not a request to lock: on a slow on-device model the reply is
 * still arriving, and a tab switch is the normal case. Lock after a short grace
 * so a peek at another tab does not throw away the passphrase.
 */
const VAULT_HIDE_GRACE_MS = 60_000;

function scheduleVaultHideLock() {
  cancelVaultHideLock();
  state.vaultHideTimer = window.setTimeout(() => {
    state.vaultHideTimer = null;
    void lockVault();
  }, VAULT_HIDE_GRACE_MS);
}

function cancelVaultHideLock() {
  if (state.vaultHideTimer !== null) {
    window.clearTimeout(state.vaultHideTimer);
    state.vaultHideTimer = null;
  }
}

function armVaultAutoLock() {
  if (state.vaultAutoLockTimer !== null) {
    window.clearTimeout(state.vaultAutoLockTimer);
  }
  state.vaultAutoLockTimer = window.setTimeout(
    () => {
      if (state.memoryKey) void lockVault();
    },
    15 * 60 * 1000,
  );
}

async function lockVault() {
  if (state.lockingVault) return;
  state.lockingVault = true;

  try {
    cancelVaultHideLock();
    if (state.vaultAutoLockTimer !== null) {
      window.clearTimeout(state.vaultAutoLockTimer);
      state.vaultAutoLockTimer = null;
    }

    // A reply that is still streaming saves every couple of seconds. Stop it and
    // land one final encrypted write before the key goes away, otherwise the
    // next tick would have no key and the record would be written in the clear.
    // `saveConversation` refuses that now, but the reply should not be lost
    // either, so the save happens while the key is still in memory.
    if (state.generating) await stopAndWait();
    if (state.memoryKey && state.conversation?.messages.length) {
      await saveCurrent().catch(() => {});
    }
  } finally {
    setVaultKey(null);
    state.memoryKey = null;
    state.settings.memory = [];
    state.conversations = [];
    state.conversation = createConversation({ mode: state.settings.mode });
    closeDialog(dom["vault-dialog"]);
    renderAll();
    syncSettingsForm();
    state.lockingVault = false;
  }

  if (!state.settings.memoryVault) return;
  toast("Locked. Encrypted chats are hidden until you unlock.");
}

async function disableEncryption() {
  const ok = await confirmDialog({
    title: "Remove encryption?",
    body: "Chats and memory notes will be stored as plain records in this browser.",
    confirmLabel: "Remove encryption",
  });
  if (!ok) return;

  try {
    const notes = state.settings.memory || [];
    await decryptStoredConversations();
    if (state.vaultAutoLockTimer !== null) window.clearTimeout(state.vaultAutoLockTimer);
    state.vaultAutoLockTimer = null;
    setVaultKey(null);
    state.settings.memoryVault = null;
    state.memoryKey = null;
    await saveSettings({ memoryVault: null, memory: notes });
    await refreshVaultState();
    toast("Encryption removed.");
  } catch (error) {
    console.error("Could not remove encryption", error);
    toast("Could not remove encryption.");
  }
}

async function commitMemory(notes: MemoryNote[]) {
  state.settings.memory = notes;
  const vault = state.settings.memoryVault;
  try {
    if (vault && state.memoryKey) {
      if (vault.version !== 2) {
        throw new Error("Unlock again to upgrade this legacy vault before editing memory.");
      }
      const next: MemoryVault = {
        ...vault,
        notes: await encryptJson(
          state.memoryKey,
          notes,
          vault.version === 2 ? recordAAD("settings", "vault-notes") : undefined,
        ),
      };
      state.settings.memoryVault = next;
      await saveSettings({ memoryVault: next, memory: [] });
    } else {
      await saveSettings({ memory: notes });
    }
  } catch (error) {
    console.error("Could not save memory", error);
    toast("Could not save memory.");
  }
}

async function addMemoryFromInput() {
  if (vaultLocked()) {
    toast("Memory is locked. Unlock it to add notes.");
    return;
  }
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
  await commitMemory(result.memory);
  dom["memory-input"].value = "";
  renderMemoryList();
}

async function forgetMemory(id: string) {
  const memory = (state.settings.memory || []).filter((item) => item.id !== id);
  await commitMemory(memory);
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
   Knowledge base
--------------------------------------------------------------- */

async function refreshKnowledge() {
  try {
    state.knowledge = await listDocuments();
  } catch (error) {
    console.warn("Could not read the knowledge base", error);
    state.knowledge = [];
  }
  renderKnowledgePanel();
}

function renderKnowledgePanel() {
  const list = dom["knowledge-list"];
  list.textContent = "";

  if (!state.knowledge.length) {
    list.append(h("li", { class: "memory-empty", text: "No documents yet." }));
  } else {
    for (const doc of state.knowledge) {
      const chunks = `${doc.chunkCount} chunk${doc.chunkCount === 1 ? "" : "s"}`;
      list.append(
        h(
          "li",
          { class: "memory-item" },
          h("span", { text: `${doc.title} (${chunks})` }),
          h("button", {
            class: "icon-btn",
            type: "button",
            "aria-label": `Remove ${doc.title}`,
            dataset: { knowledgeId: doc.id },
            html: '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-x"></use></svg>',
          }),
        ),
      );
    }
  }

  if (!state.knowledgeBusy) {
    dom["knowledge-status"].textContent = state.knowledge.length
      ? `${state.knowledge.length} document${state.knowledge.length === 1 ? "" : "s"} indexed. On-device model replies can cite them.`
      : "Embeddings run on this device. The first document downloads a small model once.";
  }
  dom["knowledge-add"].disabled = state.knowledgeBusy;
}

async function addKnowledgeFiles(files: File[]) {
  if (offlineModeActive()) {
    // The first embedding run downloads MiniLM; afterwards indexing is local.
    toast(
      "Offline mode is on. Index a document once with it off so the embedding model is cached.",
    );
    return;
  }

  state.knowledgeBusy = true;
  renderKnowledgePanel();

  const describeIndexProgress = await loadIndexProgress()
    .then((module) => module.describeIndexProgress)
    .catch(() => null);
  setEmbeddingProgressListener((progress) => {
    if (describeIndexProgress) setIndexProgress(describeIndexProgress(progress));
    else setIndexProgress({ percent: 0, label: `Indexing ${progress.file}...`, busy: true });
  });

  try {
    for (const file of files) {
      setIndexProgress({ percent: 2, label: `Reading ${file.name}...`, busy: true });
      await addDocumentFile(file);
    }
    toast(
      files.length === 1
        ? `${files[0]?.name ?? "Document"} indexed on this device.`
        : `${files.length} documents indexed on this device.`,
    );
  } catch (error) {
    toast(friendlyError(error));
  } finally {
    setEmbeddingProgressListener(null);
    state.knowledgeBusy = false;
    setIndexProgress(null);
    await refreshKnowledge();
  }
}

function setIndexProgress(view: IndexProgressView | null) {
  const bar = dom["knowledge-progress"];
  if (!view) {
    bar.hidden = true;
    bar.setAttribute("aria-valuenow", "0");
    dom["knowledge-progress-fill"].style.width = "0%";
    return;
  }
  bar.hidden = false;
  bar.setAttribute("aria-valuenow", String(view.percent));
  bar.setAttribute("aria-valuetext", view.label);
  dom["knowledge-progress-fill"].style.width = `${view.percent}%`;
  dom["knowledge-status"].textContent = view.label;
}

async function deleteKnowledge(id: string) {
  const doc = state.knowledge.find((item) => item.id === id);
  const ok = await confirmDialog({
    title: "Remove this document?",
    body: `"${doc?.title ?? "This document"}" and its embeddings will be deleted from this device.`,
    confirmLabel: "Remove",
  });
  if (!ok) return;

  try {
    await removeDocument(id);
    toast("Document removed.");
  } catch {
    toast("Could not remove the document.");
  }
  await refreshKnowledge();
}

/* ---------------------------------------------------------------
   On-device model
--------------------------------------------------------------- */

async function initModelPanel() {
  dom["model-select"].value = engine.models.some((model) => model.id === state.settings.modelId)
    ? state.settings.modelId
    : "";
  const total = engine.models.length + 1;
  for (const picker of modelPickers) {
    picker.count.textContent = `${total} models`;
    picker.search.placeholder = `Search ${total} models...`;
  }
  syncModelTrigger();

  state.modelSupport = await engine.detectSupport();
  state.deviceProfile = await detectDeviceProfile(state.modelSupport.available);
  renderModelPanel();
  if (!state.conversation?.messages.length) renderConversation({ scroll: false });
}

interface ModelPickerEls {
  trigger: HTMLButtonElement;
  value: HTMLElement;
  meta: HTMLElement | null;
  pop: HTMLElement;
  search: HTMLInputElement;
  count: HTMLElement;
  list: HTMLElement;
  empty: HTMLElement;
  fallback: string;
}

const modelPickers: ModelPickerEls[] = [];
let activeModelPicker: ModelPickerEls | null = null;

/**
 * Settings and the composer each own a picker over the same model list, so the
 * picker markup stays identical and only one can be open at a time.
 */
function registerModelPickers() {
  modelPickers.length = 0;
  modelPickers.push(
    {
      trigger: dom["model-trigger"],
      value: dom["model-trigger-value"],
      meta: dom["model-trigger-meta"],
      pop: dom["model-pop"],
      search: dom["model-search"],
      count: dom["model-count"],
      list: dom["model-list"],
      empty: dom["model-empty"],
      fallback: "Built-in assistant - no download",
    },
    {
      trigger: dom["composer-model-trigger"],
      value: dom["composer-model-trigger-value"],
      meta: null,
      pop: dom["composer-model-pop"],
      search: dom["composer-model-search"],
      count: dom["composer-model-count"],
      list: dom["composer-model-list"],
      empty: dom["composer-model-empty"],
      fallback: "Built-in assistant",
    },
  );

  for (const picker of modelPickers) bindModelPicker(picker);
}

function bindModelPicker(picker: ModelPickerEls) {
  picker.trigger.addEventListener("click", () => {
    if (picker.pop.hidden) openModelPicker(picker);
    else closeModelPicker(picker);
  });
  picker.search.addEventListener("input", () => renderModelList(picker));
  picker.search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModelPicker(picker);
      picker.trigger.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      picker.list.querySelector<HTMLElement>(".model-option")?.click();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      picker.list.querySelector<HTMLElement>(".model-option")?.focus();
    }
  });
  picker.list.addEventListener("keydown", (event) => {
    const options = [...picker.list.querySelectorAll<HTMLElement>(".model-option")];
    const index = options.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = options[index + (event.key === "ArrowDown" ? 1 : -1)];
      (next ?? options[0])?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeModelPicker(picker);
      picker.trigger.focus();
    }
  });
}

function openModelPicker(picker: ModelPickerEls) {
  if (activeModelPicker && activeModelPicker !== picker) closeModelPicker(activeModelPicker);
  picker.search.value = "";
  renderModelList(picker);
  picker.pop.hidden = false;
  picker.trigger.setAttribute("aria-expanded", "true");
  activeModelPicker = picker;
  const current = picker.list.querySelector<HTMLElement>(".model-option.is-selected");
  current?.scrollIntoView({ block: "center" });
  picker.search.focus();
}

function closeModelPicker(picker: ModelPickerEls | null = activeModelPicker) {
  const targets = picker ? [picker] : modelPickers;
  for (const target of targets) {
    target.pop.hidden = true;
    target.trigger.setAttribute("aria-expanded", "false");
  }
  if (!picker || picker === activeModelPicker) activeModelPicker = null;
}

function syncModelTrigger() {
  const model = selectedModel();
  for (const picker of modelPickers) {
    picker.value.textContent = model ? model.label : picker.fallback;
    if (picker.meta) {
      picker.meta.textContent = model ? model.memoryLabel : "No download - works offline";
    }
    picker.trigger.classList.toggle("has-model", Boolean(model));
    picker.trigger.title = model ? model.label : picker.fallback;
  }
}

function modelMatches(model: (typeof engine.models)[number], query: string) {
  if (!query) return true;
  const size = model.runtime === "gguf" ? `${Math.ceil(model.downloadBytes / 1_000_000)} mb` : "";
  const family = modelFamily(model);
  const needle =
    (query.includes("uncensored") && model.runtime === "gguf" && model.uncensored
      ? "uncensored "
      : "") + `${model.label} ${family} ${model.runtime}${size ? " " + size : ""}`;
  return needle.toLowerCase().includes(query);
}

function builtinRow(selectedId: string, picker: ModelPickerEls) {
  return h(
    "button",
    {
      type: "button",
      class: `model-option${selectedId === "" ? " is-selected" : ""}`,
      role: "option",
      "aria-selected": selectedId === "" ? "true" : "false",
      "data-model-id": "",
      onclick: () => chooseModel("", picker),
    },
    [
      h("span", { class: "model-option-name", text: "Built-in assistant" }),
      h("span", { class: "model-option-meta", text: "No download - works offline" }),
    ],
  );
}

function modelOptionRow(
  model: (typeof engine.models)[number],
  selectedId: string,
  picker: ModelPickerEls,
) {
  const meta = h("span", { class: "model-option-meta" }, [
    h("span", {
      text:
        model.runtime === "gguf" ? `${Math.ceil(model.downloadBytes / 1_000_000)} MB` : "WebGPU",
    }),
    model.runtime === "gguf" && model.uncensored
      ? h("span", { class: "model-tag", text: "uncensored" })
      : null,
  ]);
  return h(
    "button",
    {
      type: "button",
      class: `model-option${model.id === selectedId ? " is-selected" : ""}`,
      role: "option",
      "aria-selected": model.id === selectedId ? "true" : "false",
      "data-model-id": model.id,
      onclick: () => chooseModel(model.id, picker),
    },
    [h("span", { class: "model-option-name", text: model.label }), meta],
  );
}

function renderModelList(picker: ModelPickerEls) {
  const query = picker.search.value.trim().toLowerCase();
  const list = picker.list;
  const selectedId = dom["model-select"].value;
  list.textContent = "";

  const builtinMatches =
    query === "" || "built-in assistant no download offline builtin".includes(query);
  const visible = engine.models.filter((model) => modelMatches(model, query));

  if (builtinMatches) list.append(builtinRow(selectedId, picker));

  const sections: Array<[string, (typeof engine.models)[number][]]> = [
    ["Community GGUF - CPU/WASM", visible.filter((model) => model.runtime === "gguf")],
    ["WebGPU - official model builds", visible.filter((model) => model.runtime === "webllm")],
  ];

  for (const [title, models] of sections) {
    if (!models.length) continue;
    list.append(h("p", { class: "model-section", text: title }));
    for (const group of groupModelsByFamily(models)) {
      list.append(
        h(
          "div",
          { class: "model-group" },
          h("span", { text: group.family }),
          h("span", { class: "model-group-count", text: String(group.models.length) }),
        ),
      );
      for (const model of group.models) list.append(modelOptionRow(model, selectedId, picker));
    }
  }

  const shown = (builtinMatches ? 1 : 0) + visible.length;
  picker.count.textContent = query ? `${shown} match${shown === 1 ? "" : "es"}` : `${shown} models`;
  picker.empty.hidden = shown > 0;
}

function chooseModel(id: string, picker: ModelPickerEls) {
  dom["model-select"].value = id;
  syncModelTrigger();
  closeModelPicker(picker);
  picker.trigger.focus();
  void applyModelChoice();
}

function selectedModel() {
  const id = dom["model-select"].value;
  return engine.models.find((model) => model.id === id) ?? null;
}

function renderModelPanel() {
  const model = selectedModel();
  const snapshot = engine.getState();
  const unsupportedReason =
    model && state.modelSupport ? engine.modelSupportReason(model, state.modelSupport) : null;
  const supported =
    !!state.modelSupport && (model ? !unsupportedReason : state.modelSupport.available);
  const loading = snapshot.phase === "loading";
  const loadingThis = loading && snapshot.modelId === model?.id;
  const active = snapshot.mode === "model" && snapshot.modelId === model?.id;
  const cached = state.modelCached === true;

  dom["model-select"].value = model ? model.id : "";
  dom["model-select"].disabled = loading;
  for (const picker of modelPickers) picker.trigger.disabled = loading;
  syncModelTrigger();

  const status = dom["model-status"];
  status.classList.remove("is-error");

  if (!state.modelSupport) {
    status.textContent = "Checking this device...";
  } else if (!supported && model) {
    status.textContent = unsupportedReason ?? state.modelSupport.reason;
    status.classList.add("is-error");
  } else if (!supported && !model) {
    status.textContent = `Built-in assistant ready. ${state.modelSupport.reason}`;
  } else if (loadingThis) {
    status.textContent = snapshot.progress?.text || `Loading ${model.label}...`;
  } else if (loading) {
    status.textContent = "Another model is loading...";
  } else if (active && snapshot.phase === "generating") {
    status.textContent = `${model.label} is writing a reply on this device.`;
  } else if (active) {
    status.textContent = `${model.label} is loaded. Replies run on your ${model.runtime === "gguf" ? "CPU" : "GPU"} and never leave the tab.`;
  } else if (model && cached) {
    status.textContent = `${model.label} is downloaded. Load it to use it.`;
  } else if (model) {
    status.textContent =
      model.runtime === "gguf"
        ? `${model.label} is not downloaded yet. About ${Math.ceil(model.downloadBytes / 1_000_000)} MB download; additional RAM is needed to run it.`
        : `${model.label} is not downloaded yet. Download size varies by model; larger models can require many GB.`;
  } else {
    status.textContent =
      "Using the built-in rule assistant. Pick a model above to run a real one on this device.";
  }

  const progress = dom["model-progress"];
  progress.hidden = !loadingThis;
  progress.value = snapshot.progress?.progress ?? 0;

  const load = dom["model-load"];
  load.hidden = !model;
  load.disabled = !model || !supported || loading || active;
  load.textContent = active ? "Loaded" : cached ? "Load model" : "Download and load";

  const remove = dom["model-delete"];
  remove.hidden = !model;
  remove.disabled = !model || loading;

  dom["model-note"].textContent = model
    ? `${model.note} Weights are cached in this browser's private storage and can be deleted at any time.`
    : "Models run in a Worker with WebGPU or CPU/WebAssembly. Your prompts and replies stay on this device.";

  renderDeviceCheck();
  renderModelFit(model);
}

async function refreshDeviceProfile() {
  if (!state.modelSupport) return;
  state.deviceProfile = await detectDeviceProfile(state.modelSupport.available);
  renderModelPanel();
}

function renderDeviceCheck() {
  const profile = state.deviceProfile;
  const box = dom["device-check"];
  if (!profile) {
    box.hidden = true;
    return;
  }

  box.hidden = false;
  dom["device-check-spec"].textContent = deviceSummary(profile);

  const recommendation = recommendDeviceModel(engine.models, profile);
  const advice = dom["device-check-advice"];
  const action = dom["device-recommend"];
  if (!recommendation) {
    advice.hidden = true;
    advice.textContent = "";
    action.hidden = true;
    action.disabled = true;
    return;
  }

  advice.hidden = false;
  advice.textContent = "";
  advice.append(
    h("strong", { text: recommendation.title }),
    document.createTextNode(` ${recommendation.reason}`),
  );

  const selected = dom["model-select"].value === (recommendation.modelId ?? "");
  action.hidden = false;
  action.disabled = selected;
  action.textContent = selected ? "Recommended model selected" : recommendation.actionLabel;
  action.dataset.modelId = recommendation.modelId ?? "";
}

function renderModelFit(model: (typeof engine.models)[number] | null) {
  const fit = model && state.deviceProfile ? assessModelFit(model, state.deviceProfile) : null;
  const warning = dom["model-warning"];
  if (!fit || fit.level === "ok") {
    warning.hidden = true;
    warning.textContent = "";
    warning.classList.remove("is-danger");
    return;
  }

  warning.hidden = false;
  warning.classList.toggle("is-danger", fit.level === "too-large");
  warning.textContent = fit.reasons.join(" ");
}

async function refreshModelPanel({ checkCache = false }: { checkCache?: boolean } = {}) {
  const model = selectedModel();
  if (!model) {
    state.modelCached = false;
  } else if (
    checkCache &&
    state.modelSupport &&
    !engine.modelSupportReason(model, state.modelSupport)
  ) {
    state.modelCached = await engine.hasCachedModel(model.id).catch(() => false);
  } else if (state.engine.mode === "model" && state.engine.modelId === model.id) {
    state.modelCached = true;
  }
  renderModelPanel();
}

async function applyModelChoice() {
  const model = selectedModel();
  const next = model ? model.id : "";
  state.modelCached = null;

  if (next === state.settings.modelId) {
    await refreshModelPanel({ checkCache: true });
    return;
  }

  state.settings.modelId = next;
  await saveSettingsPatch({ modelId: next });

  if (!model) {
    await engine.unloadModel();
    toast("Using the built-in assistant.");
  } else if (
    state.modelSupport &&
    !engine.modelSupportReason(model, state.modelSupport) &&
    (await engine.hasCachedModel(model.id))
  ) {
    await loadSelectedModel(model.id);
  }

  await refreshModelPanel({ checkCache: true });
}

async function downloadSelectedModel() {
  const model = selectedModel();
  if (!model) return;

  // Re-measure free storage right before downloading: it changes as the
  // browser fills up, and the warning has to reflect the current state.
  // Already-cached models only need loading, so there is nothing to confirm.
  if (state.modelCached !== true && state.modelSupport) {
    state.deviceProfile = await detectDeviceProfile(state.modelSupport.available);
    renderModelPanel();
  }

  const fit =
    state.modelCached !== true && state.deviceProfile
      ? assessModelFit(model, state.deviceProfile)
      : null;
  if (fit?.level === "too-large") {
    const ok = await confirmDialog({
      title: "This model may not fit this device",
      body: `${fit.reasons.join(" ")} Download ${model.label} anyway?`,
      confirmLabel: "Download anyway",
    });
    if (!ok) return;
  }

  await loadSelectedModel(model.id);
}

let activeLicense: ((value: boolean) => void) | null = null;

function resolveLicense(value: boolean) {
  const resolve = activeLicense;
  activeLicense = null;
  if (dom["license-dialog"].open) dom["license-dialog"].close();
  resolve?.(value);
}

/**
 * Ask before a download when the model's terms require it. Verified permissive
 * licenses and previously accepted licenses pass straight through.
 */
function confirmLicense(model: LocalModel): Promise<boolean> {
  if (!needsLicenseAcceptance(model)) return Promise.resolve(true);
  if (isLicenseAccepted(model, state.settings.acceptedLicenses)) return Promise.resolve(true);

  const license = licenseFor(model);
  dom["license-model"].textContent = `You are about to download ${model.label}.`;
  dom["license-terms"].textContent =
    license.source === "unverified"
      ? "LocalMind has no verified license metadata for this model, so it cannot tell you the terms. Review the model card before downloading; the license may restrict commercial use or require attribution."
      : `This model is published under the ${license.name}. Accepting is required before the download starts.`;
  dom["license-accept-label"].textContent =
    license.source === "unverified"
      ? "I have reviewed this model's card and license, and I accept its terms."
      : `I accept the ${license.name}.`;
  dom["license-accept"].checked = false;
  dom["license-ok"].disabled = true;

  const link = dom["license-link"];
  dom["license-link-row"].hidden = !license.url;
  if (license.url) link.href = license.url;

  return new Promise<boolean>((resolve) => {
    if (activeLicense) activeLicense(false);
    activeLicense = resolve;
    if (!dom["license-dialog"].open) dom["license-dialog"].showModal();
    dom["license-accept"].focus();
  });
}

/**
 * Give the model's memory back after a long idle spell. The weights stay in the
 * cache, so the next message reloads them instead of downloading again.
 */
const idleRelease = createIdleRelease({
  onRelease: () => void releaseIdleModel(),
  onReleaseFailed: () =>
    recordDiagnostic({
      level: "warn",
      source: "engine",
      message: "Releasing an idle model failed.",
    }),
});

async function releaseIdleModel() {
  if (state.generating) return;
  if (engine.getState().mode !== "model") return;
  const label = selectedModel()?.label ?? "The model";
  await engine.unloadModel();
  state.modelReleased = true;
  updateEngineChrome(engine.getState());
  renderModelPanel();
  toast(`${label} was unloaded after ten idle minutes. Its memory is free.`);
}

/** Called whenever the engine may hold memory or stop holding it. */
function syncMemoryWatch() {
  const loaded = engine.getState().mode === "model";
  if (!loaded) {
    idleRelease.stop();
    return;
  }
  if (state.generating) idleRelease.block();
  else {
    idleRelease.unblock();
    idleRelease.touch();
  }
}

async function loadSelectedModel(id: string) {
  const model = engine.models.find((item) => item.id === id) ?? null;
  if (!model) return;

  const cached = await engine.hasCachedModel(id);
  if (offlineModeActive() && !cached) {
    toast("Offline mode is on. Turn it off in Settings to download a model.");
    return;
  }

  // A cached model is only being loaded, so there is nothing new to accept.
  if (!cached) {
    if (!(await confirmLicense(model))) {
      toast("Download cancelled. The license was not accepted.");
      renderModelPanel();
      return;
    }
    // Record the acceptance itself: a download that later fails must not ask
    // the user to accept the same terms again.
    const key = licenseAcceptanceKey(model);
    if (!state.settings.acceptedLicenses.includes(key)) {
      await saveSettingsPatch({ acceptedLicenses: [...state.settings.acceptedLicenses, key] });
    }
  }

  state.settings.modelId = id;
  await saveSettingsPatch({ modelId: id });

  try {
    await engine.useModel(id);
    state.modelCached = true;
    toast(`${model.label} is ready on this device.`);
  } catch (error) {
    state.modelCached = false;
    toast(friendlyError(error));
  }
  renderModelPanel();
}

async function deleteSelectedModel() {
  const model = selectedModel();
  if (!model) return;

  const ok = await confirmDialog({
    title: "Delete model download?",
    body: `Downloaded files for ${model.label} will be removed from this browser. You can download them again later.`,
    confirmLabel: "Delete",
  });
  if (!ok) return;

  try {
    await engine.deleteModel(model.id);
    state.modelCached = false;
    toast("Model download deleted.");
  } catch {
    toast("Could not delete the model download.");
  }
  await refreshModelPanel({ checkCache: true });
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
  if (meta) meta.setAttribute("content", theme === "light" ? "#f7f3ef" : "#05080a");
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
  if (vaultLocked()) {
    toast("Unlock your encrypted chats in Settings first.");
    openVaultDialog("unlock");
    return;
  }
  cancelEdit();
  await stopAndWait();
  await saveCurrent();
  state.conversation = createConversation({ mode: state.settings.mode });
  renderSidebar();
  renderConversation();
  closeSidebar();
  focusInput();
}

async function openConversation(id: string) {
  if (state.conversation?.id === id) {
    closeSidebar();
    return;
  }
  cancelEdit();
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

async function onHistoryClick(event: MouseEvent) {
  const target = event.target as Element | null;
  const remove = target?.closest<HTMLElement>("[data-delete-conversation]");
  if (remove) {
    event.stopPropagation();
    await deleteChatById(remove.dataset.deleteConversation ?? "");
    return;
  }

  const item = target?.closest<HTMLElement>("[data-conversation-id]");
  if (item) await openConversation(item.dataset.conversationId ?? "");
}

async function deleteChatById(id: string) {
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
    state.conversation = createConversation({ mode: state.settings.mode });
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

function upsertSummary(conversation: Conversation) {
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
   Settings
--------------------------------------------------------------- */

function openSettings({ scrollToDiagnostics = false }: { scrollToDiagnostics?: boolean } = {}) {
  syncSettingsForm();
  void refreshDeviceProfile();
  void refreshModelPanel({ checkCache: true });
  void renderEnvironment();
  if (!dom["settings-dialog"].open) dom["settings-dialog"].showModal();
  if (scrollToDiagnostics) {
    // A bug report starts here: `?debug=true` opens Settings on the diagnostics.
    dom["diagnostic-env"].scrollIntoView({ block: "start" });
  }
}

async function saveSettingsPatch(patch: Partial<Settings>) {
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
    const conversations: Conversation[] = [];
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
  // The embedding worker holds the MiniLM weights; without this they stay in
  // memory after the user asked for everything to be deleted.
  disposeEmbeddings();
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
  if (vaultLocked()) {
    toast("Unlock your encrypted chats in Settings first.");
    openVaultDialog("unlock");
    return;
  }
  const text = dom.input.value.trim();
  if (!text) return;

  if (!engine.isReady()) {
    toast(
      state.engine.phase === "loading"
        ? "The on-device model is still loading. Try again in a moment."
        : "The assistant is still starting. Try again in a second.",
    );
    return;
  }

  const warning = piiWarning(text);
  if (warning) toast(warning);

  if (state.editingId) truncateForEdit(state.editingId);
  state.editingId = null;
  dom["edit-banner"].hidden = true;

  dom.input.value = "";
  autoResize();
  updateComposerState();
  sendUserMessage(text);
}

function truncateForEdit(id: string) {
  const conversation = state.conversation;
  if (!conversation) return;
  const index = conversation.messages.findIndex((message) => message.id === id);
  if (index < 0) return;
  conversation.messages = conversation.messages.slice(0, index);
  if (!conversation.messages.length) conversation.title = "New chat";
  conversation.updatedAt = Date.now();
}

function startEdit(message: Message) {
  if (state.generating) {
    toast("Wait for the reply to finish, then edit.");
    return;
  }
  state.editingId = message.id;
  dom.input.value = message.content;
  dom["edit-banner"].hidden = false;
  autoResize();
  updateComposerState();
  focusInput();
}

function cancelEdit() {
  if (!state.editingId) return;
  state.editingId = null;
  dom["edit-banner"].hidden = true;
  dom.input.value = "";
  autoResize();
  updateComposerState();
}

async function sendUserMessage(text: string) {
  const command = parseMemoryCommand(text);
  if (command && vaultLocked()) {
    toast("Memory is locked. Unlock it in Settings to change notes.");
    return;
  }
  state.memoryOutcome = command ? applyMemoryCommand(state.settings.memory, command) : null;
  if (state.memoryOutcome?.changed) {
    await commitMemory(state.memoryOutcome.memory);
  }

  const conversation = ensureConversation();
  const userMessage = createMessage("user", text);
  conversation.messages.push(userMessage);
  conversation.mode = state.settings.mode;
  conversation.updatedAt = Date.now();
  if (conversation.title === "New chat") conversation.title = deriveTitle(text);

  const assistant = createMessage("assistant", "", { streaming: true });
  conversation.messages.push(assistant);
  state.autoScroll = true;

  await saveCurrent();
  renderConversation();
  runGeneration(assistant.id);
}

function ensureConversation(): Conversation {
  const existing = state.conversation;
  if (existing) return existing;
  const created = createConversation({ mode: state.settings.mode });
  state.conversation = created;
  return created;
}

/**
 * If the model was unloaded to free memory and the user still has it selected,
 * bring it back before answering rather than silently replying from the rule
 * engine. Failing that, say so and continue with the built-in assistant.
 */
async function restoreReleasedModel() {
  const modelId = state.settings.modelId;
  if (!state.modelReleased || !modelId) return;
  if (!engine.models.some((model) => model.id === modelId)) return;

  state.modelReleased = false;
  try {
    await engine.useModel(modelId);
    toast(`${selectedModel()?.label ?? "The model"} was reloaded.`);
  } catch (error) {
    state.modelCached = false;
    toast(`${friendlyError(error)} Using the built-in assistant instead.`);
  }
  updateEngineChrome(engine.getState());
}

async function runGeneration(assistantId: string) {
  const conversation = state.conversation;
  const assistant = conversation?.messages.find((message) => message.id === assistantId);
  if (!conversation || !assistant) return;

  await restoreReleasedModel();

  const latestUser =
    [...conversation.messages]
      .reverse()
      .find((message) => message.role === "user" && message.id !== assistantId)?.content ?? "";

  // The rule engine cannot read a grounding block, so retrieval only runs for
  // the neural path. Otherwise the UI would claim sources a reply never used.
  let knowledge: Awaited<ReturnType<typeof retrieveKnowledge>> = null;
  if (engine.getState().mode === "model" && latestUser.trim() && state.knowledge.length) {
    try {
      knowledge = await retrieveKnowledge(latestUser);
    } catch (error) {
      console.warn("Knowledge retrieval skipped", error);
    }
  }

  const redactionRun = state.settings.redactPii ? await loadRedactor().catch(() => null) : null;
  const messagesForEngine = buildEngineMessages(
    conversation,
    assistantId,
    knowledge?.block ?? null,
    redactionRun,
  );
  if (!messagesForEngine) {
    assistant.streaming = false;
    assistant.error = "There is no message to answer.";
    renderConversation({ scroll: false });
    return;
  }

  const runId = ++state.runId;
  state.generating = true;
  syncMemoryWatch();
  announce("Assistant is responding.");
  state.partialText = "";
  state.streamSignal = engine.newGenerationSignal();
  state.generationDone = new Promise<void>((resolve) => {
    state.resolveGeneration = () => resolve();
  });
  state.autoScroll = true;
  updateComposerState();
  updateEngineChrome(engine.getState());

  const started = performance.now();
  let firstTokenAt: number | null = null;
  let accumulated = "";
  let usage: { completion_tokens: number; total_tokens: number } | null = null;
  let aborted = false;
  let errorMessage: string | null = null;
  let lastSave = performance.now();

  try {
    for await (const chunk of engine.generate({
      messages: messagesForEngine,
      signal: state.streamSignal,
      maxTokens: generationOutputBudget(messagesForEngine),
      demo: {
        buildDemoReply: state.settings.mode === "coder" ? demoCodingReply : null,
        memory: state.settings.memory || [],
        memoryOutcome: state.memoryOutcome,
      },
    })) {
      if (runId !== state.runId) return;

      if ("text" in chunk && chunk.text) {
        firstTokenAt ??= performance.now();
        accumulated += chunk.text;
        state.partialText = accumulated;
        const node = dom.messages.querySelector<HTMLElement>(
          `[data-message-id="${cssEscape(assistantId)}"]`,
        );
        if (node) queueStreamPaint(node, accumulated);

        if (performance.now() - lastSave > 2500) {
          assistant.content = accumulated;
          conversation.updatedAt = Date.now();
          saveConversation(conversation).catch(() => {});
          lastSave = performance.now();
        }
      }

      if ("usage" in chunk) usage = chunk.usage;
    }
  } catch (error) {
    if ((error instanceof Error && error.name === "AbortError") || state.streamSignal?.aborted)
      aborted = true;
    else errorMessage = friendlyError(error);
  }

  if (runId !== state.runId) {
    resolveGenerationRun();
    return;
  }

  cancelStreamPaint();
  assistant.streaming = false;
  assistant.content = accumulated.trimEnd();
  const stoppedByUser = aborted || Boolean(state.streamSignal?.aborted);
  announce(
    errorMessage
      ? `Response failed: ${errorMessage}`
      : stoppedByUser
        ? "Response stopped."
        : "Response complete.",
  );
  assistant.stopped = stoppedByUser;

  if (errorMessage) {
    assistant.error = errorMessage;
  } else {
    assistant.sources = knowledge?.sources;
    assistant.retrieval = knowledge?.trace;
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
          ...(firstTokenAt === null ? {} : { ttftMs: Math.round(firstTokenAt - started) }),
        };
      }
    }
  }

  state.generating = false;
  state.streamSignal = null;
  state.partialText = "";
  updateComposerState();
  syncMemoryWatch();
  resolveGenerationRun();
  await saveCurrent();
  renderConversation({ scroll: false });
  // The reply is finished, but the reader may have scrolled away to read
  // something else. Only follow when they were still at the end.
  if (state.autoScroll) scrollToBottom();
  else syncScrollCue();
  updateEngineChrome(engine.getState());
  focusInput();
}

function generationOutputBudget(messages: ChatMessage[]): number {
  const requested = effortById(state.settings.effort).maxTokens;
  const modelId = engine.getState().modelId;
  const contextWindow = modelId
    ? (engine.models.find((model) => model.id === modelId)?.contextWindow ?? null)
    : null;
  return contextLimitsFor({
    contextWindow,
    systemPromptChars: messages.reduce((total, message) => total + message.content.length, 0),
    outputTokens: requested,
  }).maxOutputTokens;
}

function buildEngineMessages(
  conversation: Conversation,
  excludeId: string,
  knowledgeBlock: string | null = null,
  redactionRun: typeof import("./privacy/redact.js") | null = null,
): ChatMessage[] | null {
  const mode = modeById(state.settings.mode);
  const latestUser =
    [...conversation.messages]
      .reverse()
      .find(
        (message) => message.role === "user" && message.id !== excludeId && message.content?.trim(),
      )?.content || "";

  const effort = effortById(state.settings.effort);
  let systemPrompt = `${mode.prompt}\n\n${CONVERSATION_SKILLS}\n\n${UNDERSTANDING_SKILLS}\n\n${SYSTEM_GUARDRAIL}\n\n${effort.prompt}`;

  // Retrieved passages are the user's own documents, so they are redacted exactly
  // like the prompt when the setting is on. The counts are reported; values never are.
  const redaction: RedactionResult = { text: "", counts: {}, total: 0 };
  const redactor = redactionRun?.redactPII ?? null;
  // `compactHistory` measures the same text it later returns, so counting there
  // would report every message twice. Only the final content is counted.
  const collect = (value: string, count = true) => {
    if (!redactor) return value;
    const result = redactor(value);
    if (count) {
      redaction.total += result.total;
      for (const [kind, amount] of Object.entries(result.counts)) {
        const key = kind as keyof typeof redaction.counts;
        redaction.counts[key] = (redaction.counts[key] ?? 0) + (amount ?? 0);
      }
    }
    return result.text;
  };

  const memoryPrompt = buildMemoryPrompt(state.settings.memory, latestUser, state.memoryOutcome);
  if (memoryPrompt) systemPrompt += `\n\n${memoryPrompt}`;

  const hint = understandingHint(analyzeIntent(latestUser));
  if (hint) systemPrompt += `\n\n${hint}`;

  const safeKnowledge = knowledgeBlock ? collect(knowledgeBlock) : null;
  if (safeKnowledge) systemPrompt += `\n\n${safeKnowledge}`;

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

  const measure = (message: ChatMessage, count = true) =>
    collect(
      message.role === "user" ? expandShorthand(normalizeText(message.content)) : message.content,
      count,
    );
  const activeModelId = engine.getState().modelId;
  const contextWindow = activeModelId
    ? (engine.models.find((model) => model.id === activeModelId)?.contextWindow ?? null)
    : null;
  const contextLimits = contextLimitsFor({
    contextWindow,
    // Include room for the extractive summary appended after the dropped turns are known.
    systemPromptChars: systemPrompt.length + 600,
    outputTokens: effort.maxTokens,
  });
  const { kept, summary } = compactHistory(history, contextLimits, (message) =>
    measure(message, false),
  );
  const note = formatCompactionNote(summary);
  if (note) systemPrompt += `\n\n${note}`;

  const trimmed: ChatMessage[] = kept.map((message) => ({
    role: message.role,
    content: measure(message),
  }));

  if (!trimmed.length) return null;
  if (redaction.total && redactionRun) {
    // The counts are recorded; the values never are.
    recordDiagnostic({
      level: "info",
      source: "privacy",
      message: redactionRun.describeRedaction({
        text: "",
        counts: redaction.counts,
        total: redaction.total,
      }),
    });
  }
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
    new Promise<void>((resolve) => window.setTimeout(resolve, 2500)),
  ]);
  if (state.generating) forceFinishGeneration();
}

function forceFinishGeneration() {
  state.runId += 1;
  cancelStreamPaint();
  state.generating = false;
  state.streamSignal = null;
  syncMemoryWatch();

  const conversation = state.conversation;
  const assistant = conversation?.messages.at(-1);
  if (assistant?.streaming) {
    assistant.streaming = false;
    assistant.content = state.partialText.trimEnd() || "_Stopped._";
    assistant.stopped = true;
    assistant.error = undefined;
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

function onMessagesClick(event: MouseEvent) {
  const target = event.target as Element | null;
  if (target?.closest("[data-load-model]")) {
    const recommendation = getWelcomeModelRecommendation();
    const fallback = engine.models.find((model) => model.id === state.settings.modelId);
    const modelId = recommendation?.modelId || fallback?.id;
    if (modelId) {
      void loadSelectedModel(modelId);
    } else {
      openSettings();
      toast("Choose a compatible on-device model to download.");
    }
    return;
  }
  const copyButton = target?.closest<HTMLElement>("[data-copy-code]");
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

  const actionButton = target?.closest<HTMLElement>("[data-action]");
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
    if (action === "edit") {
      const message = state.conversation?.messages.find(
        (item) => item.id === actionButton.dataset.messageId,
      );
      if (message) startEdit(message);
      return;
    }
    if (action === "regenerate" || action === "retry") {
      regenerate();
      return;
    }
    if (action === "show-earlier") {
      state.messageWindow += MESSAGE_WINDOW_STEP;
      // Keep the viewport on the message the reader was looking at.
      const anchor = dom.messages.querySelector<HTMLElement>(".msg");
      const offset = anchor ? anchor.offsetTop : 0;
      renderConversation({ scroll: false });
      window.requestAnimationFrame(() => {
        const nextAnchor = dom.messages.querySelector<HTMLElement>(".msg");
        if (nextAnchor) dom["chat-scroll"].scrollTop += nextAnchor.offsetTop - offset;
      });
      return;
    }
  }

  const suggestion = target?.closest<HTMLElement>("[data-suggestion]");
  if (suggestion) {
    dom.input.value = suggestion.dataset.suggestion ?? "";
    autoResize();
    updateComposerState();
    focusInput();
  }
}

/* ---------------------------------------------------------------
   Utilities
--------------------------------------------------------------- */

function deriveTitle(text: string) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "New chat";
  return clean.length > 52 ? `${clean.slice(0, 49).trimEnd()}...` : clean;
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

function friendlyError(error: unknown) {
  const raw = error instanceof Error ? error.message : error;
  const message = String(raw || error || "Unknown error");
  return message.length > 260 ? `${message.slice(0, 257)}...` : message;
}

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function autoResize() {
  dom.input.style.height = "auto";
  dom.input.style.height = `${Math.min(dom.input.scrollHeight, 190)}px`;
}

/** How close to the end still counts as "following the reply". */
const BOTTOM_SLACK = 90;

let streamFrame: number | null = null;
let streamTarget: HTMLElement | null = null;
let streamValue = "";

/**
 * Paint the newest streamed text once per frame. A fast stream can deliver
 * dozens of deltas between paints; writing each one sets the text, forces
 * layout, and reads the scroll position again for no visible benefit.
 */
function queueStreamPaint(node: HTMLElement, text: string) {
  streamTarget = node;
  streamValue = text;
  if (streamFrame !== null) return;
  streamFrame = window.requestAnimationFrame(() => {
    streamFrame = null;
    const target = streamTarget;
    const value = streamValue;
    streamTarget = null;
    if (!target?.isConnected) return;
    streamText(target, value, state.autoScroll);
    noteStreamWhilePaused();
  });
}

/** Drop any queued paint; the caller is about to render the final state. */
function cancelStreamPaint() {
  if (streamFrame !== null) window.cancelAnimationFrame(streamFrame);
  streamFrame = null;
  streamTarget = null;
}
let scrollFrame: number | null = null;
let lastDistance = Number.POSITIVE_INFINITY;
let cuePending = false;

function distanceFromBottom() {
  const scroller = dom["chat-scroll"];
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
}

/**
 * The cue is the only affordance for "the reply is still streaming while you
 * read further up", so it has to be honest: visible only when the view is not
 * at the end, and marked when new text arrived after the pause.
 */
function syncScrollCue() {
  const empty = !dom.messages.childElementCount;
  const show = !empty && distanceFromBottom() > BOTTOM_SLACK;
  dom["scroll-bottom"].hidden = !show;
  dom["scroll-bottom"].dataset.pending = show && cuePending ? "true" : "false";
}

/**
 * Called after streamed text was appended. "Pending" means the reader is no
 * longer at the end and new text arrived, which is measured, not assumed.
 */
function noteStreamWhilePaused() {
  cuePending = distanceFromBottom() > BOTTOM_SLACK;
  syncScrollCue();
}

/**
 * Jump to the newest message. This runs synchronously on purpose: a deferred
 * jump is a second writer racing the streaming loop, and it lands on the reader
 * who scrolled away in the meantime. Reading `scrollHeight` forces the layout
 * anyway, so there is nothing to wait for.
 */
function scrollToBottom({ smooth = false }: { smooth?: boolean } = {}) {
  const scroller = dom["chat-scroll"];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (smooth && !reduceMotion) {
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  } else {
    scroller.scrollTop = scroller.scrollHeight;
  }
  state.autoScroll = true;
  cuePending = false;
  lastDistance = distanceFromBottom();
  syncScrollCue();
}

function focusInput() {
  if (window.matchMedia("(pointer: coarse)").matches) return;
  dom.input.focus();
}

async function copyText(text: string) {
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

function announce(message: string) {
  dom.announcement.textContent = "";
  window.requestAnimationFrame(() => {
    dom.announcement.textContent = message;
  });
}

function toast(message: string) {
  window.clearTimeout(state.toastTimer ?? undefined);
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  state.toastTimer = window.setTimeout(() => {
    dom.toast.classList.remove("show");
  }, 2800);
}

/* ---------------------------------------------------------------
   Offline mode
--------------------------------------------------------------- */

function offlineModeActive(): boolean {
  return Boolean(state.settings.offlineMode);
}

/**
 * The first-run introduction. It states what this device can actually run instead
 * of guessing, and the primary action is the zero-download path, because that is
 * the honest recommendation for most people.
 */
function maybeShowWelcome() {
  if (state.settings.onboarded) return false;
  const recommendation = getWelcomeModelRecommendation();
  dom["welcome-device-title"].textContent = recommendation
    ? recommendation.title
    : "The built-in assistant is the right place to start";
  dom["welcome-device-reason"].textContent = recommendation
    ? recommendation.reason
    : "This device does not report a usable GPU, so a neural model would be slow or would not fit. The built-in assistant needs no download and works offline.";
  dom["welcome-model"].hidden = !recommendation;
  if (!dom["welcome-dialog"].open) dom["welcome-dialog"].showModal();
  return true;
}

function closeWelcome() {
  // Persist before closing: a reload straight after dismissing must not greet the
  // same person again, and the write is what makes that true.
  void settleWelcome().finally(() => closeDialog(dom["welcome-dialog"]));
}

/** Escape and backdrop clicks count as a choice too, so it never shows twice. */
async function settleWelcome() {
  if (state.settings.onboarded) return;
  await saveSettingsPatch({ onboarded: true });
}

function renderRedactionSetting() {
  const enabled = Boolean(state.settings.redactPii);
  dom["redact-pii"].checked = enabled;
  dom["redact-pii-note"].textContent = enabled
    ? "On. The prompt sent to a model has identifiers replaced; the chat still shows what you typed."
    : "Off. The prompt reaches the model exactly as you typed it.";
}

function renderOfflineMode() {
  const supported = offlineModeSupported();
  const active = offlineModeActive();

  dom["offline-mode"].checked = active;
  dom["offline-mode"].disabled = !supported;
  dom["offline-badge"].hidden = !active;
  dom["offline-mode-note"].textContent = !supported
    ? "This browser cannot enforce offline mode: it needs service workers and Cache Storage over HTTPS."
    : active
      ? "On. Every request to another origin is refused by the service worker. Model downloads and document embedding downloads will fail until you turn this off."
      : "Off. Downloads are allowed only when you start them from Settings.";
}

async function setOfflineMode() {
  const enabled = dom["offline-mode"].checked;

  if (enabled && !offlineModeSupported()) {
    toast("This browser cannot enforce offline mode.");
    renderOfflineMode();
    return;
  }

  const written = await writeOfflineModeMarker(enabled);
  if (enabled && !written) {
    toast("Could not arm offline mode in this browser.");
    renderOfflineMode();
    return;
  }

  await saveSettingsPatch({ offlineMode: enabled });
  await refreshServiceWorker();
  renderOfflineMode();
  recordDiagnostic({
    level: "info",
    source: "offline",
    message: enabled ? "Offline mode enabled." : "Offline mode disabled.",
  });
  announce(
    enabled
      ? "Offline mode on. The app will refuse every outbound network request."
      : "Offline mode off.",
  );
  toast(
    enabled
      ? "Offline mode on: network access is blocked."
      : "Offline mode off: downloads are allowed again.",
  );
}

/**
 * Keep the stored setting and the service worker marker in sync. A stale marker
 * from a previous session must never block a user who turned the switch off.
 */
async function reconcileOfflineMode() {
  const armed = await readOfflineModeMarker();
  if (armed === offlineModeActive()) return;
  await writeOfflineModeMarker(offlineModeActive());
}

/* ---------------------------------------------------------------
   Diagnostics
--------------------------------------------------------------- */

const SKIP_MODEL_RESTORE_FLAG = "localmind:skip-model-restore";
const MEMORY_RELOAD_FLAG = "localmind:memory-reload";

function readSessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeSessionFlag(key: string, value: boolean): void {
  try {
    if (value) sessionStorage.setItem(key, "1");
    else sessionStorage.removeItem(key);
  } catch {
    // Session storage may be blocked; the flags are only a loop guard.
  }
}

/** Context is copy-only. Nothing here is ever sent over the network. */
function diagnosticsContext(): Record<string, string> {
  const context: Record<string, string> = {
    app: `LocalMind ${APP_VERSION}`,
    engine:
      state.engine.mode === "model" ? `on-device model (${state.engine.modelId})` : "built-in",
  };
  if (state.settings.hardwareStats && state.deviceProfile) {
    context.device = deviceSummary(state.deviceProfile);
    context.screen = `${window.screen.width}x${window.screen.height}`;
    context.browser = navigator.userAgent;
  }
  return context;
}

function renderDiagnostics() {
  const list = dom["diagnostic-list"];
  list.textContent = "";
  const entries = listDiagnostics().slice().reverse();

  if (!entries.length) {
    list.append(h("li", { class: "log-empty", text: "No local errors recorded." }));
    dom["diagnostics-copy"].disabled = true;
    return;
  }

  dom["diagnostics-copy"].disabled = false;
  for (const entry of entries.slice(0, 20)) list.append(diagnosticRow(entry));
}

function diagnosticRow(entry: DiagnosticEntry): HTMLElement {
  const time = new Date(entry.at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return h(
    "li",
    {
      class: `log-entry${entry.level === "error" ? " is-error" : entry.level === "warn" ? " is-warn" : ""}`,
    },
    h("span", { text: `${time} · ${entry.source}` }),
    h("div", { text: entry.message }),
    ...(entry.detail ? [h("div", { text: entry.detail })] : []),
  );
}

async function copyDiagnostics() {
  const text = formatDiagnostics(listDiagnostics(), diagnosticsContext());
  if (await copyText(text)) toast("Diagnostics copied. Review it before sharing.");
}

// Cached so opening Settings does not ask the adapter for limits on every render.
let environmentCache: { gpu: GpuAdapterInfo; storage: StorageUsage } | null = null;

async function readEnvironment() {
  if (environmentCache) return environmentCache;
  const { readGpuAdapterInfo, readStorageUsage } = await diagnosticsBundle();
  const [gpu, storage] = await Promise.all([readGpuAdapterInfo(), readStorageUsage()]);
  environmentCache = { gpu, storage };
  return environmentCache;
}

function gpuSummary(gpu: GpuAdapterInfo) {
  if (!gpu.webgpuExposed) return "Not exposed by this browser";
  if (!gpu.available) return "Available, no adapter";
  const model = [gpu.vendor, gpu.architecture, gpu.device].filter(Boolean).join(" ");
  const buffer = gpu.limits?.maxStorageBufferBindingSize;
  const size = buffer ? ` - ${Math.round(buffer / 1_000_000)} MB buffers` : "";
  return `${model || "Adapter ready"}${size}`;
}

function storageSummary(storage: StorageUsage) {
  if (storage.usageMB === null) return "Not reported";
  const quota = storage.quotaMB === null ? "" : ` of ${storage.quotaMB} MB`;
  const opfs = storage.opfs
    ? ` - ${storage.opfs.megabytes} MB in ${storage.opfs.entries} files`
    : "";
  return `${storage.usageMB} MB used${quota}${opfs}`;
}

/**
 * The readout in Settings: what this device actually offers, so a bug report can
 * start with facts instead of guesses. Values are cached after the first read.
 */
async function renderEnvironment() {
  const { gpu, storage } = await readEnvironment();
  dom["env-gpu"].textContent = gpuSummary(gpu);
  dom["env-memory"].textContent = state.deviceProfile
    ? deviceSummary(state.deviceProfile)
    : "Unknown";
  dom["env-storage"].textContent = storageSummary(storage);
}

/**
 * Download the bundle as a file. The user hands it over themselves; the app makes
 * no request, and no chat, document, or settings value is included.
 */
async function exportDiagnosticsBundle() {
  try {
    const { bundleFileName, bundleToJson, buildDiagnosticsBundle } = await diagnosticsBundle();
    const { gpu, storage } = await readEnvironment();
    const bundle = buildDiagnosticsBundle({
      app: diagnosticsContext(),
      diagnostics: listDiagnostics(),
      gpu,
      storage,
    });
    const blob = new Blob([bundleToJson(bundle)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = bundleFileName();
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("Diagnostics bundle downloaded. Read it before you attach it.");
    recordDiagnostic({
      level: "info",
      source: "diagnostics",
      message: "Diagnostics bundle exported by the user.",
    });
  } catch (error) {
    console.error("Could not export diagnostics", error);
    toast("Could not build the diagnostics bundle.");
  }
}

function showEngineAlert(title: string, message: string) {
  dom["engine-alert-title"].textContent = title;
  dom["engine-alert-text"].textContent = message;
  dom["engine-alert"].hidden = false;
}

function hideEngineAlert() {
  dom["engine-alert"].hidden = true;
}

function reloadApp() {
  window.location.reload();
}

/**
 * Reload once after an out-of-memory kill so the GPU context is released. The
 * reload skips the previous model, otherwise restoring it would crash again.
 */
function scheduleMemoryReload() {
  if (readSessionFlag(MEMORY_RELOAD_FLAG)) return;
  writeSessionFlag(MEMORY_RELOAD_FLAG, true);
  writeSessionFlag(SKIP_MODEL_RESTORE_FLAG, true);
  recordDiagnostic({
    level: "warn",
    source: "app",
    message: "Reloading after an out-of-memory model crash.",
  });
  announce("Out of memory. Reloading without the model.");
  window.setTimeout(() => window.location.reload(), 3500);
}

let activeConfirm: ((value: boolean) => void) | null = null;

function confirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  tone = "danger",
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  tone?: string;
}): Promise<boolean> {
  if (activeConfirm) activeConfirm(false);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const onCancel = (event: Event) => {
      event.preventDefault();
      finish(false);
    };
    const onBackdrop = (event: MouseEvent) => {
      if (event.target === dom["confirm-dialog"]) finish(false);
    };
    const finish = (value: boolean) => {
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

function closeDialog(dialog: HTMLDialogElement | null) {
  if (dialog?.open) dialog.close();
}
