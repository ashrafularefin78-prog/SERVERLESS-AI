import {
  APP_VERSION,
  CONVERSATION_SKILLS,
  CONTEXT_LIMITS,
  DEFAULT_SETTINGS,
  SUGGESTIONS,
  SYSTEM_GUARDRAIL,
  UNDERSTANDING_SKILLS,
  modeById,
} from "./config.js";
import {
  MAX_MEMORIES,
  applyMemoryCommand,
  buildMemoryPrompt,
  parseMemoryCommand,
} from "./memory.js";
import { analyzeIntent, expandShorthand, normalizeText, understandingHint } from "./understand.js";
import { compactHistory, formatCompactionNote } from "./context.js";
import {
  MEMORY_VERIFIER,
  checkVerifier,
  decryptJson,
  deriveMemoryKey,
  encryptJson,
  randomSalt,
} from "./crypto.js";
import * as engine from "./engine/manager.js";
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
import { h, renderHistory, renderMessage, renderWelcome, streamText } from "./ui/render.js";
import { buildCodingPrompt, coderSuggestions, demoCodingReply } from "./coder/languages.js";
import { piiWarning } from "./guardrails.js";
import type {
  ChatMessage,
  Conversation,
  ConversationSummary,
  EngineState,
  MemoryNote,
  MemoryOutcome,
  MemoryVault,
  Message,
  Settings,
  Theme,
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
  "memory-add-row": HTMLElement;
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
  "import-data": HTMLButtonElement;
  "import-file": HTMLInputElement;
  "theme-select": HTMLSelectElement;
  "export-data": HTMLButtonElement;
  "clear-data": HTMLButtonElement;
  "confirm-dialog": HTMLDialogElement;
  "confirm-title": HTMLElement;
  "confirm-body": HTMLElement;
  "confirm-ok": HTMLButtonElement;
  "confirm-cancel": HTMLButtonElement;
  toast: HTMLElement;
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
  vaultMode: "enable" | "unlock" | null;
}

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
  vaultMode: null,
};

export async function boot() {
  cacheDom();
  bindEvents();
  applyTheme();

  const [settings, conversations] = await Promise.all([getSettings(), listConversations()]);
  state.settings = { ...DEFAULT_SETTINGS, ...settings };
  if (state.settings.memoryVault) state.settings.memory = [];
  state.conversations = conversations;

  applyTheme();
  syncSettingsForm();
  updateModeSelect();

  state.conversation = await initialConversation();
  renderAll();
  engine.subscribe(onEngineState);

  await engine.init();

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
    "chat-scroll",
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
    "memory-add-row",
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
    "import-data",
    "import-file",
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
  dom["open-settings"].addEventListener("click", openSettings);
  dom["open-settings-2"].addEventListener("click", openSettings);

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
  dom["theme-select"].addEventListener("change", () => {
    state.settings.theme = dom["theme-select"].value as Theme;
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

/* ---------------------------------------------------------------
   Rendering
--------------------------------------------------------------- */

function renderSidebar() {
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
      }),
    );
  } else {
    const last = conversation.messages.at(-1);
    const canRegenerate = last?.role === "assistant" && !last.streaming && !last.error;
    for (const message of conversation.messages) {
      dom.messages.append(
        renderMessage(message, {
          canRegenerate: message === last && canRegenerate,
          canEdit: !state.generating,
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
  dom["chat-sub"].textContent = `${mode.label} mode - built-in assistant`;
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

function syncSettingsForm() {
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

  if (memoryLocked()) {
    list.append(h("li", { class: "memory-empty", text: "Memory is locked. Unlock to view notes." }));
    renderVaultControls();
    return;
  }

  if (!memory.length) {
    list.append(h("li", { class: "memory-empty", text: "Nothing remembered yet." }));
    renderVaultControls();
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
  renderVaultControls();
}

function memoryLocked(): boolean {
  return Boolean(state.settings.memoryVault) && !state.memoryKey;
}

function renderVaultControls() {
  const vault = state.settings.memoryVault;
  const locked = memoryLocked();
  dom["vault-status"].textContent = vault
    ? locked
      ? "Encrypted with a passphrase. Locked until you unlock it."
      : "Encrypted with a passphrase. Unlocked for this session."
    : "Stored unencrypted on this device.";
  dom["vault-enable"].hidden = Boolean(vault);
  dom["vault-unlock"].hidden = !locked;
  dom["vault-lock"].hidden = !vault || locked;
  dom["vault-disable"].hidden = !vault || locked;
  dom["memory-add-row"].hidden = locked;
}

async function commitMemory(notes: MemoryNote[]) {
  state.settings.memory = notes;
  const vault = state.settings.memoryVault;
  try {
    if (vault && state.memoryKey) {
      const next: MemoryVault = { ...vault, notes: await encryptJson(state.memoryKey, notes) };
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

function openVaultDialog(mode: "enable" | "unlock") {
  state.vaultMode = mode;
  dom["vault-title"].textContent = mode === "enable" ? "Encrypt memory" : "Unlock memory";
  dom["vault-sub"].textContent =
    mode === "enable"
      ? "Choose a passphrase. Notes are encrypted with AES-GCM before they are saved."
      : "Enter the passphrase you set on this device.";
  dom["vault-confirm-field"].hidden = mode !== "enable";
  dom["vault-hint"].textContent =
    mode === "enable"
      ? "There is no recovery: if you forget the passphrase, the notes cannot be read. Use at least 8 characters."
      : "The passphrase is never stored; it only unlocks notes for this session.";
  dom["vault-pass"].value = "";
  dom["vault-confirm"].value = "";
  dom["vault-dialog"].showModal();
  dom["vault-pass"].focus();
}

async function confirmVault() {
  const mode = state.vaultMode;
  const pass = dom["vault-pass"].value;
  if (!mode) return;

  if (mode === "enable") {
    if (pass.length < 8) {
      toast("Use a passphrase of at least 8 characters.");
      return;
    }
    if (pass !== dom["vault-confirm"].value) {
      toast("Passphrases do not match.");
      return;
    }
    const salt = randomSalt();
    const key = await deriveMemoryKey(pass, salt);
    const vault: MemoryVault = {
      salt,
      verifier: await encryptJson(key, MEMORY_VERIFIER),
      notes: await encryptJson(key, state.settings.memory || []),
    };
    state.settings.memoryVault = vault;
    state.memoryKey = key;
    await saveSettings({ memoryVault: vault, memory: [] });
    closeDialog(dom["vault-dialog"]);
    renderMemoryList();
    toast("Memory encrypted on this device.");
    return;
  }

  const vault = state.settings.memoryVault;
  if (!vault) return;
  const key = await deriveMemoryKey(pass, vault.salt);
  if (!(await checkVerifier(key, vault.verifier))) {
    toast("Wrong passphrase.");
    return;
  }
  state.memoryKey = key;
  state.settings.memory = await decryptJson<MemoryNote[]>(key, vault.notes);
  closeDialog(dom["vault-dialog"]);
  renderMemoryList();
  toast("Memory unlocked for this session.");
}

function lockMemory() {
  state.memoryKey = null;
  state.settings.memory = [];
  renderMemoryList();
  toast("Memory locked.");
}

async function disableEncryption() {
  const ok = await confirmDialog({
    title: "Disable memory encryption?",
    body: "Notes will be stored unencrypted on this device.",
    confirmLabel: "Disable",
  });
  if (!ok) return;
  const notes = state.settings.memory || [];
  state.settings.memoryVault = null;
  state.memoryKey = null;
  await saveSettings({ memoryVault: null, memory: notes });
  renderMemoryList();
  toast("Memory encryption disabled.");
}

async function importChats(file: File) {
  try {
    const payload = JSON.parse(await file.text());
    if (payload?.app !== "LocalMind" || !Array.isArray(payload.conversations)) {
      toast("Not a LocalMind export.");
      return;
    }
    for (const conversation of payload.conversations) await saveConversation(conversation);
    const source = payload.settings || {};
    const patch: Partial<Settings> = {};
    if (typeof source.mode === "string") patch.mode = source.mode;
    if (typeof source.theme === "string") patch.theme = source.theme as Theme;
    if (source.memoryVault) {
      patch.memoryVault = source.memoryVault;
      patch.memory = [];
    } else if (Array.isArray(source.memory)) {
      patch.memory = source.memory;
    }
    await saveSettings(patch);
    toast("Imported. Reloading...");
    window.setTimeout(() => window.location.reload(), 500);
  } catch (error) {
    console.error(error);
    toast("Import failed.");
  }
}

async function addMemoryFromInput() {
  if (memoryLocked()) {
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

function openSettings() {
  syncSettingsForm();
  if (!dom["settings-dialog"].open) dom["settings-dialog"].showModal();
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
  if (command && memoryLocked()) {
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

async function runGeneration(assistantId: string) {
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
  state.generationDone = new Promise<void>((resolve) => {
    state.resolveGeneration = () => resolve();
  });
  state.autoScroll = true;
  updateComposerState();
  updateEngineChrome(engine.getState());

  const started = performance.now();
  let accumulated = "";
  let usage: { completion_tokens: number; total_tokens: number } | null = null;
  let aborted = false;
  let errorMessage: string | null = null;
  let lastSave = performance.now();

  try {
    for await (const chunk of engine.generate({
      messages: messagesForEngine,
      signal: state.streamSignal,
      demo: {
        buildDemoReply: state.settings.mode === "coder" ? demoCodingReply : null,
        memory: state.settings.memory || [],
        memoryOutcome: state.memoryOutcome,
      },
    })) {
      if (runId !== state.runId) return;

      if ("text" in chunk && chunk.text) {
        accumulated += chunk.text;
        state.partialText = accumulated;
        const node = dom.messages.querySelector<HTMLElement>(
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

function buildEngineMessages(conversation: Conversation, excludeId: string): ChatMessage[] | null {
  const mode = modeById(state.settings.mode);
  const latestUser =
    [...conversation.messages]
      .reverse()
      .find(
        (message) => message.role === "user" && message.id !== excludeId && message.content?.trim(),
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

  const measure = (message: ChatMessage) =>
    message.role === "user" ? expandShorthand(normalizeText(message.content)) : message.content;
  const { kept, summary } = compactHistory(history, CONTEXT_LIMITS, measure);
  const note = formatCompactionNote(summary);
  if (note) systemPrompt += `\n\n${note}`;

  const trimmed: ChatMessage[] = kept.map((message) => ({
    role: message.role,
    content: measure(message),
  }));

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
    new Promise<void>((resolve) => window.setTimeout(resolve, 2500)),
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

function toast(message: string) {
  window.clearTimeout(state.toastTimer ?? undefined);
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  state.toastTimer = window.setTimeout(() => {
    dom.toast.classList.remove("show");
  }, 2800);
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
