import { renderMarkdown } from "../markdown.js";
import { setHTML } from "../trusted-types.js";
import type { ConversationSummary, EngineState, Message, RetrievalTrace } from "../types.js";

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: unknown[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value as string;
    else if (key === "text") node.textContent = value as string;
    else if (key === "html") setHTML(node, value as string);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style") Object.assign(node.style, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }

  appendChildren(node, children);
  return node;
}

/**
 * "Show your work" for a grounded answer: which passages were considered, how
 * each one scored, and whether the reply was allowed to answer at all. Costs
 * nothing until the user opens it, and holds no document text beyond a preview.
 */
function renderRetrievalTrace(trace: RetrievalTrace): HTMLElement {
  const details = h("details", { class: "msg-trace" });
  const summary = h("summary", {
    class: "msg-trace-summary",
    text: trace.grounded
      ? `How this answer was grounded (${trace.hits.length} of ${trace.chunks} passages)`
      : "No document passage was relevant enough",
  });
  details.append(summary);

  const stats = h(
    "p",
    { class: "msg-trace-stats" },
    h("span", { text: `${trace.documents} document${trace.documents === 1 ? "" : "s"}` }),
    h("span", { text: `best match ${trace.bestSemantic.toFixed(2)}` }),
    h("span", { text: `term coverage ${Math.round(trace.bestCoverage * 100)}%` }),
    h("span", { text: trace.grounded ? "answered from documents" : "asked to abstain" }),
  );
  details.append(stats);

  if (!trace.hits.length) {
    details.append(
      h("p", {
        class: "msg-trace-empty",
        text: "No passage cleared the relevance floor, so the model was told to say it could not find the answer.",
      }),
    );
    return details;
  }

  const list = h("ol", { class: "msg-trace-list" });
  for (const hit of trace.hits) {
    list.append(
      h(
        "li",
        { class: "msg-trace-hit" },
        h(
          "div",
          { class: "msg-trace-head" },
          h("strong", { text: hit.title }),
          h("span", {
            text: `match ${hit.semantic.toFixed(2)} · terms ${Math.round(hit.coverage * 100)}% · rank ${hit.score.toFixed(3)}`,
          }),
        ),
        h("p", { class: "msg-trace-preview", text: hit.preview }),
      ),
    );
  }
  details.append(list);
  return details;
}

function appendChildren(node: HTMLElement, children: unknown[]) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function icon(name: string, className = "") {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

export function iconLogo(className = "") {
  return `<svg class="${className}" viewBox="0 0 32 32" aria-hidden="true"><use href="#i-logo"></use></svg>`;
}

/* ---------------------------------------------------------------
   History
--------------------------------------------------------------- */

export function renderHistory(
  container: HTMLElement,
  conversations: ConversationSummary[],
  activeId: string | null,
) {
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

function groupByDate(conversations: ConversationSummary[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;

  const buckets = new Map<string, ConversationSummary[]>([
    ["Today", []],
    ["Yesterday", []],
    ["Previous 7 days", []],
    ["Older", []],
  ]);

  for (const conversation of conversations) {
    const stamp = new Date(conversation.updatedAt);
    const start = new Date(stamp.getFullYear(), stamp.getMonth(), stamp.getDate()).getTime();
    const age = (today - start) / day;
    if (age <= 0) buckets.get("Today")!.push(conversation);
    else if (age <= 1) buckets.get("Yesterday")!.push(conversation);
    else if (age <= 7) buckets.get("Previous 7 days")!.push(conversation);
    else buckets.get("Older")!.push(conversation);
  }

  return [...buckets.entries()]
    .filter(([, items]) => items.length)
    .map(([label, items]) => ({ label, items }));
}

/* ---------------------------------------------------------------
   Messages
--------------------------------------------------------------- */

export function renderMessage(
  message: Message,
  { canRegenerate = false, canEdit = false }: { canRegenerate?: boolean; canEdit?: boolean } = {},
) {
  const isUser = message.role === "user";
  const article = h("article", {
    class: `msg ${isUser ? "user" : "assistant"}`,
    dataset: { messageId: message.id, role: message.role },
  });

  const avatar = h("div", { class: "avatar", "aria-hidden": "true" });
  if (isUser) avatar.textContent = "You";
  else setHTML(avatar, iconLogo(""));

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
    const upgradeMarker = "[[LOAD_ON_DEVICE_MODEL]]";
    const upgradePrompt = (message.content || "").includes(upgradeMarker);
    const displayText = (message.content || "").replace(upgradeMarker, "").trim();
    setHTML(content, renderMarkdown(displayText));
    body.append(content);
    if (upgradePrompt) {
      content.append(
        h(
          "button",
          {
            class: "button button-primary model-upgrade-action",
            type: "button",
            dataset: { loadModel: "true" },
          },
          "Load an on-device model",
        ),
      );
    }
  }

  if (!isUser && message.sources?.length) {
    body.append(
      h("p", {
        class: "msg-sources",
        text: `From your documents: ${message.sources.join(", ")}`,
      }),
    );
  }

  if (!isUser && message.retrieval) body.append(renderRetrievalTrace(message.retrieval));

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
    if (isUser && canEdit && !message.streaming) {
      actions.append(
        h("button", {
          class: "msg-action",
          type: "button",
          dataset: { action: "edit", messageId: message.id },
          title: "Edit and resend",
          "aria-label": "Edit and resend",
          html: icon("edit"),
        }),
      );
    }
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
    meta.append(h("span", { class: "msg-time", text: formatTime(message.createdAt) }));
  }

  if (message.stats) {
    const bits = [];
    if (message.stats.tokens) bits.push(`${message.stats.tokens} tok`);
    if (message.stats.tokensPerSecond)
      bits.push(`${message.stats.tokensPerSecond.toFixed(1)} tok/s`);
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

/** How close to the end still counts as "following the reply". */
const STICK_SLACK = 90;

/**
 * Replace the streaming text and, if the reader is still at the end, stay
 * pinned there. The decision reads the actual scroll position rather than a
 * flag: a scroll event lands on the next frame, so a chunk that arrives in
 * between would otherwise drag the view back down over a reader who had just
 * scrolled away.
 */
export function streamText(node: HTMLElement, text: string, stickToBottom = true) {
  const content = node.querySelector("[data-content]");
  if (!content) return;
  content.classList.add("streaming");
  content.textContent = text;
  if (!stickToBottom) return;

  const scroller = node.closest(".chat-scroll");
  if (!scroller) return;
  const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
  if (distance <= STICK_SLACK) scroller.scrollTop = scroller.scrollHeight;
}

export function formatTime(timestamp: number | string) {
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
   Welcome
--------------------------------------------------------------- */

export function renderWelcome({
  engine,
  suggestions,
  recommendation = null,
}: {
  engine: EngineState;
  suggestions: string[];
  recommendation?: {
    title: string;
    reason: string;
    actionLabel: string;
    kind: "cpu" | "builtin";
  } | null;
}) {
  const welcome = h("section", { class: "welcome" });
  const hero = h("div", { class: "welcome-hero" });
  const copy = h("div", { class: "welcome-copy" });

  copy.append(h("p", { class: "eyebrow", text: "Private - on-device - no account" }));
  copy.append(h("h2", {}, "Your own AI,", h("br"), h("span", { text: "running in this tab." })));
  copy.append(
    h("p", {
      class: "welcome-lede",
      text:
        "Chat instantly with a built-in assistant - no setup, no API key, and nothing leaves " +
        "this device. Add an on-device model in Settings for full neural replies.",
    }),
  );

  const stats = h("div", { class: "hero-stats" });
  for (const [iconName, label] of [
    ["lock", "0 bytes uploaded"],
    ["spark", "Runs offline"],
    ["check", "No account needed"],
  ] as const) {
    const stat = h("span", { class: "hero-stat" });
    setHTML(stat, icon(iconName));
    stat.append(h("span", { text: label }));
    stats.append(stat);
  }
  copy.append(stats);

  const orb = h("div", { class: "hero-orb", "aria-hidden": "true" });
  setHTML(
    orb,
    '<span class="orb-glow"></span>' +
      '<span class="orb-ring orb-ring-1"></span>' +
      '<span class="orb-ring orb-ring-2"></span>' +
      '<span class="orb-ring orb-ring-3"></span>' +
      `<span class="orb-core">${iconLogo("")}</span>` +
      '<span class="orb-spark orb-spark-1"></span>' +
      '<span class="orb-spark orb-spark-2"></span>' +
      '<span class="orb-spark orb-spark-3"></span>',
  );

  hero.append(copy, orb);
  welcome.append(hero);

  const ready = engine.phase === "ready" || engine.phase === "generating";
  const notice =
    engine.phase === "loading"
      ? engine.progress?.text || "Loading the on-device model..."
      : engine.mode === "model" && ready
        ? "The on-device model is ready. Ask anything, or pick a suggestion below."
        : ready
          ? "The built-in assistant is ready. Ask anything, or pick a suggestion below."
          : "Starting the built-in assistant...";
  welcome.append(renderNotice(notice, false));
  if (recommendation?.kind === "cpu") {
    const card = h("aside", { class: "model-recommendation", role: "note" });
    card.append(
      h("strong", { text: recommendation.title }),
      h("p", { text: recommendation.reason }),
      h(
        "button",
        { class: "button button-primary", type: "button", dataset: { loadModel: "true" } },
        recommendation.actionLabel,
      ),
    );
    welcome.append(card);
  }
  welcome.append(h("p", { class: "suggestions-label", text: "Start with" }));

  const chips = h("div", { class: "suggestions" });
  for (const suggestion of suggestions) {
    const chip = h("button", {
      class: "suggestion",
      type: "button",
      dataset: { suggestion },
      title: suggestion,
    });
    chip.append(
      h("span", { class: "suggestion-text", text: suggestion }),
      h("span", { class: "suggestion-arrow", html: icon("arrow") }),
    );
    chips.append(chip);
  }
  welcome.append(chips);

  return welcome;
}

export function renderNotice(text: string, warn = false) {
  const notice = h("p", { class: `notice${warn ? " warn" : ""}` });
  setHTML(notice, icon(warn ? "info" : "lock"));
  notice.append(h("span", { text }));
  return notice;
}
