import { MODES } from "../config.js";
import { renderMarkdown } from "../markdown.js";
import {
  CPU_MODEL,
  GPU_MODELS,
  modelByKey,
  modelSizeLabel,
  modelVramLabel,
} from "../engine/catalog.js";
import { deviceSummary, deviceTags } from "../engine/device.js";

export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style") Object.assign(node.style, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }

  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function icon(name, className = "") {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

export function iconLogo(className = "") {
  return `<svg class="${className}" viewBox="0 0 32 32" aria-hidden="true"><use href="#i-logo"></use></svg>`;
}

/* ---------------------------------------------------------------
   History
--------------------------------------------------------------- */

export function renderHistory(container, conversations, activeId) {
  container.textContent = "";

  if (!conversations.length) {
    container.append(
      h(
        "p",
        { class: "history-empty" },
        "Chats appear here and stay on this device. Nothing is uploaded.",
      ),
    );
    return;
  }

  const groups = groupByDate(conversations);
  const fragment = document.createDocumentFragment();

  for (const group of groups) {
    const section = h("div", { class: "history-section" });
    section.append(h("div", { class: "history-label", text: group.label }));

    for (const conversation of group.items) {
      const entry = h("div", { class: "history-entry" });
      const item = h("button", {
        class: `history-item${conversation.id === activeId ? " active" : ""}`,
        type: "button",
        dataset: { conversationId: conversation.id },
        title: conversation.title,
        "aria-current": conversation.id === activeId ? "page" : null,
      });
      item.append(h("span", { class: "history-title", text: conversation.title }));
      const remove = h("button", {
        class: "history-del",
        type: "button",
        dataset: { deleteConversation: conversation.id },
        "aria-label": `Delete ${conversation.title}`,
        title: "Delete chat",
        html: icon("trash"),
      });
      entry.append(item, remove);
      section.append(entry);
    }

    fragment.append(section);
  }

  container.append(fragment);
}

function groupByDate(conversations) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;

  const buckets = new Map([
    ["Today", []],
    ["Yesterday", []],
    ["Previous 7 days", []],
    ["Older", []],
  ]);

  for (const conversation of conversations) {
    const stamp = new Date(conversation.updatedAt);
    const start = new Date(stamp.getFullYear(), stamp.getMonth(), stamp.getDate()).getTime();
    const age = (today - start) / day;
    if (age <= 0) buckets.get("Today").push(conversation);
    else if (age <= 1) buckets.get("Yesterday").push(conversation);
    else if (age <= 7) buckets.get("Previous 7 days").push(conversation);
    else buckets.get("Older").push(conversation);
  }

  return [...buckets.entries()]
    .filter(([, items]) => items.length)
    .map(([label, items]) => ({ label, items }));
}

/* ---------------------------------------------------------------
   Messages
--------------------------------------------------------------- */

export function renderMessage(message, { canRegenerate = false } = {}) {
  const isUser = message.role === "user";
  const article = h("article", {
    class: `msg ${isUser ? "user" : "assistant"}`,
    dataset: { messageId: message.id, role: message.role },
  });

  const avatar = h("div", { class: "avatar", "aria-hidden": "true" });
  if (isUser) avatar.textContent = "You";
  else avatar.innerHTML = iconLogo("");

  const body = h("div", { class: "msg-body" });
  const content = h("div", { class: "msg-text", dataset: { content: true } });

  if (message.error) {
    const error = h("div", { class: "msg-error" });
    error.append(h("span", { text: message.error }));
    error.append(
      h("button", {
        class: "btn",
        type: "button",
        dataset: { action: "retry" },
        text: "Retry",
      }),
    );
    body.append(error);
  } else if (isUser || message.streaming) {
    content.textContent = message.content || "";
    if (message.streaming) content.classList.add("streaming");
    body.append(content);
  } else {
    content.classList.add("md");
    content.innerHTML = renderMarkdown(message.content || "");
    body.append(content);
  }

  const meta = h("div", { class: "msg-meta" });
  const actions = h("div", { class: "msg-actions" });

  if (!message.error && message.content) {
    actions.append(
      h("button", {
        class: "msg-action",
        type: "button",
        dataset: { action: "copy", messageId: message.id },
        title: "Copy message",
        "aria-label": "Copy message",
        html: icon("copy"),
      }),
    );
  }

  if (!isUser && canRegenerate && !message.streaming) {
    actions.append(
      h("button", {
        class: "msg-action",
        type: "button",
        dataset: { action: "regenerate", messageId: message.id },
        title: "Regenerate reply",
        "aria-label": "Regenerate reply",
        html: icon("refresh"),
      }),
    );
  }

  if (actions.childElementCount) meta.append(actions);

  if (message.createdAt) {
    meta.append(
      h("span", { class: "msg-time", text: formatTime(message.createdAt) }),
    );
  }

  if (message.stats) {
    const bits = [];
    if (message.stats.tokens) bits.push(`${message.stats.tokens} tok`);
    if (message.stats.tokensPerSecond) bits.push(`${message.stats.tokensPerSecond.toFixed(1)} tok/s`);
    if (!bits.length && message.stats.seconds) bits.push(`${message.stats.seconds.toFixed(1)}s`);
    if (bits.length) meta.append(h("span", { class: "msg-stats", text: bits.join(" - ") }));
  }

  if (message.stopped) {
    meta.append(h("span", { class: "msg-stopped", text: "Stopped" }));
  }

  if (meta.childElementCount) body.append(meta);
  article.append(avatar, body);
  return article;
}

export function streamText(node, text, autoScroll = true) {
  const content = node.querySelector("[data-content]");
  if (!content) return;
  content.classList.add("streaming");
  content.textContent = text;
  if (!autoScroll) return;
  const scroller = node.closest(".chat-scroll");
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
}

export function formatTime(timestamp) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

/* ---------------------------------------------------------------
   Welcome / model picker
--------------------------------------------------------------- */

export function renderWelcome({ engine, suggestions }) {
  const welcome = h("section", { class: "welcome" });

  welcome.append(h("p", { class: "eyebrow", text: "Private - on-device - no account" }));
  welcome.append(
    h(
      "h2",
      {},
      "Your own AI,",
      h("br"),
      h("span", { text: "running in this tab." }),
    ),
  );
  welcome.append(
    h("p", {
      class: "welcome-lede",
      text:
        "Chat instantly with a built-in assistant - no setup, no API key, and nothing leaves " +
        "this device. It handles everyday chat, on-device memory, and coding help.",
    }),
  );

  const ready = engine.phase === "ready" || engine.phase === "generating";
  welcome.append(
    renderNotice(
      ready
        ? "The built-in assistant is ready. Ask anything, or pick a suggestion below."
        : "Starting the built-in assistant...",
      false,
    ),
  );

  const chips = h("div", { class: "suggestions" });
  for (const suggestion of suggestions) {
    chips.append(
      h("button", {
        class: "suggestion",
        type: "button",
        dataset: { suggestion },
        text: suggestion,
      }),
    );
  }
  welcome.append(chips);

  return welcome;
}

export function renderDeviceCard(device) {
  const card = h("div", { class: "device-card" });
  const iconBox = h("div", { class: "device-icon", html: icon("spark") });
  const text = h("div", { class: "device-text" });
  text.append(h("strong", { text: deviceSummary(device) }));
  const tags = deviceTags(device)
    .map((tag) => tag.label)
    .join(" - ");
  text.append(h("small", { text: tags || "Device details unavailable" }));
  const badge = h("span", {
    class: `device-badge${device.webgpu ? " good" : ""}`,
    text: device.webgpu ? "GPU ready" : "CPU mode",
  });
  card.append(iconBox, text, badge);
  return card;
}

export function renderNotice(text, warn = false) {
  const notice = h("p", { class: `notice${warn ? " warn" : ""}` });
  notice.innerHTML = icon(warn ? "info" : "lock");
  notice.append(h("span", { text }));
  return notice;
}

export function pickerModels(device) {
  return device.webgpu ? GPU_MODELS : [CPU_MODEL];
}

export function renderModelCard(model, { selected = false, device, currentKey = null } = {}) {
  const disabled = Boolean(model.requiresF16 && !device?.shaderF16);
  const card = h("button", {
    class: `model-card${selected ? " selected" : ""}`,
    type: "button",
    dataset: { modelKey: model.key },
    disabled,
    title: disabled ? "This model needs WebGPU shader-f16 support." : model.description,
    "aria-pressed": selected ? "true" : "false",
  });

  const top = h("span", { class: "model-top" });
  top.append(h("span", { class: "model-name", text: model.name }));
  if (currentKey === model.key) {
    top.append(h("span", { class: "model-badge", text: "Loaded" }));
  } else {
    top.append(h("span", { class: "model-badge", text: model.tagline }));
  }

  card.append(top);
  card.append(h("span", { class: "model-family", text: model.family }));
  card.append(h("span", { class: "model-desc", text: model.description }));

  const meta = h("span", { class: "model-meta" });
  meta.append(h("span", { text: modelSizeLabel(model.downloadMB) }));
  const vram = modelVramLabel(model.vramMB);
  if (vram) meta.append(h("span", { text: vram }));
  meta.append(h("span", { text: model.bestFor }));
  card.append(meta);

  return card;
}

export function renderModelDialogList(container, { device, currentKey, selectedKey }) {
  container.textContent = "";
  const models = device.webgpu ? [...GPU_MODELS, CPU_MODEL] : [CPU_MODEL];

  for (const model of models) {
    const disabled = Boolean(model.requiresF16 && !device.shaderF16);
    const option = h("button", {
      class: `model-option${model.key === (selectedKey || currentKey) ? " selected" : ""}`,
      type: "button",
      dataset: { modelKey: model.key },
      disabled,
      title: disabled ? "Needs shader-f16 support." : model.description,
    });
    option.append(h("strong", { text: `${model.name} - ${model.family}` }));
    option.append(h("small", { text: model.description }));

    const meta = h("span", { class: "model-meta" });
    meta.append(h("span", { text: modelSizeLabel(model.downloadMB) }));
    const vram = modelVramLabel(model.vramMB);
    if (vram) meta.append(h("span", { text: vram }));
    if (model.key === currentKey) meta.append(h("span", { text: "currently loaded" }));
    option.append(meta);
    container.append(option);
  }
}

export function renderDeviceSummary(container, device) {
  container.textContent = "";
  for (const tag of deviceTags(device)) {
    container.append(h("span", { class: tag.good ? "good" : "", text: tag.label }));
  }
  if (!deviceTags(device).length) {
    container.append(h("span", { text: "No GPU details available" }));
  }
}

export function modeOptions() {
  return MODES.map((mode) => ({
    value: mode.id,
    label: mode.label,
    hint: mode.hint,
  }));
}
