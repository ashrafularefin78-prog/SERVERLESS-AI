import { describe, expect, it } from "vitest";
import {
  COMPACTION_HEADER,
  buildHistorySummary,
  compactHistory,
  formatCompactionNote,
  readCompactionSummary,
  recapReply,
} from "../../src/context.js";
import { CONTEXT_LIMITS } from "../../src/config.js";
import { demoChatReply } from "../../src/chat/replies.js";

const msg = (role, content) => ({ role, content });
const limits = { maxMessages: 16, maxChars: 8500 };

describe("compactHistory", () => {
  it("keeps everything and drops nothing when within limits", () => {
    const history = [msg("user", "hello"), msg("assistant", "hi")];
    const result = compactHistory(history, limits);
    expect(result.kept).toEqual(history);
    expect(result.dropped).toEqual([]);
    expect(result.summary).toBeNull();
  });

  it("keeps a tail suffix bounded by maxMessages", () => {
    const history = [
      msg("user", "first topic"),
      msg("assistant", "a"),
      msg("user", "second topic"),
      msg("assistant", "b"),
    ];
    const result = compactHistory(history, { maxMessages: 2, maxChars: 8500 });
    expect(result.kept).toEqual(history.slice(2));
    expect(result.dropped).toEqual(history.slice(0, 2));
    expect(result.summary).toContain("first topic");
  });

  it("bounds by maxChars using the measure function", () => {
    const history = [msg("user", "aaaaaaaaaa"), msg("user", "bbbbbbbbbb")];
    const raw = compactHistory(history, { maxMessages: 16, maxChars: 10 });
    expect(raw.kept).toHaveLength(1);
    const measured = compactHistory(history, { maxMessages: 16, maxChars: 10 }, () => "");
    expect(measured.kept).toHaveLength(2);
  });

  it("keeps the whole conversation when the app limits are infinite", () => {
    const history = Array.from({ length: 400 }, (_, index) =>
      msg(index % 2 ? "assistant" : "user", "x".repeat(400)),
    );
    const result = compactHistory(history, CONTEXT_LIMITS);
    expect(result.kept).toEqual(history);
    expect(result.dropped).toEqual([]);
    expect(result.summary).toBeNull();
  });

  it("always keeps at least the newest message even if it alone exceeds maxChars", () => {
    const history = [msg("user", "x".repeat(100))];
    const result = compactHistory(history, { maxMessages: 16, maxChars: 10 });
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toEqual([]);
  });
});

describe("buildHistorySummary", () => {
  it("extracts user topics as bullets and ignores assistant turns", () => {
    const summary = buildHistorySummary([
      msg("user", "I like green tea"),
      msg("assistant", "noted"),
      msg("user", "My name is Ada"),
    ]);
    expect(summary).toBe("- I like green tea\n- My name is Ada");
  });

  it("deduplicates case-insensitively", () => {
    const summary = buildHistorySummary([msg("user", "I like tea"), msg("user", "i like TEA")]);
    expect(summary).toBe("- I like tea");
  });

  it("caps the number of items", () => {
    const dropped = Array.from({ length: 10 }, (_, i) => msg("user", `topic ${i}`));
    const summary = buildHistorySummary(dropped);
    expect(summary.split("\n")).toHaveLength(6);
  });

  it("truncates long topics with an ellipsis", () => {
    const summary = buildHistorySummary([msg("user", "y".repeat(200))]);
    expect(summary.length).toBeLessThanOrEqual(92);
    expect(summary).toContain("…");
  });

  it("returns null when there are no user topics", () => {
    expect(buildHistorySummary([])).toBeNull();
    expect(buildHistorySummary([msg("assistant", "only assistant")])).toBeNull();
  });
});

describe("compaction note round-trip", () => {
  it("formats and reads back the digest", () => {
    const note = formatCompactionNote("- I like tea");
    expect(note).toContain(COMPACTION_HEADER);
    const messages = [msg("system", `base prompt\n\n${note}`), msg("user", "hi")];
    expect(readCompactionSummary(messages)).toBe("- I like tea");
  });

  it("returns null when there is nothing to carry", () => {
    expect(formatCompactionNote(null)).toBeNull();
    expect(readCompactionSummary([msg("system", "base"), msg("user", "hi")])).toBeNull();
    expect(readCompactionSummary([])).toBeNull();
  });
});

describe("recapReply", () => {
  it("ignores non-recap prompts", () => {
    expect(recapReply([msg("user", "hello")])).toBeNull();
    expect(recapReply([msg("user", "summarize this paragraph about whales")])).toBeNull();
    expect(recapReply([msg("user", "what is 2 + 2")])).toBeNull();
  });

  it("says there is little to recap at the start", () => {
    expect(recapReply([msg("user", "recap our conversation")])).toContain("just getting started");
  });

  it("lists prior user topics from the kept window", () => {
    const messages = [
      msg("user", "I like green tea"),
      msg("assistant", "noted"),
      msg("user", "can you recap what we talked about"),
    ];
    const reply = recapReply(messages);
    expect(reply).toContain("I like green tea");
    expect(reply).not.toContain("can you recap");
  });

  it("includes topics recovered from the compaction digest", () => {
    const messages = [
      msg("system", `base\n\n${COMPACTION_HEADER}\n- I like green tea`),
      msg("user", "My name is Ada"),
      msg("assistant", "hi Ada"),
      msg("user", "what did we discuss earlier"),
    ];
    const reply = recapReply(messages);
    expect(reply).toContain("I like green tea");
    expect(reply).toContain("My name is Ada");
  });
});

describe("demoChatReply recap integration", () => {
  it("answers a recap from compacted context", () => {
    const messages = [
      msg("system", `base\n\n${COMPACTION_HEADER}\n- I like green tea`),
      msg("user", "recap our conversation so far"),
    ];
    const reply = demoChatReply({ prompt: "recap our conversation so far", messages });
    expect(reply).toContain("I like green tea");
  });

  it("does not hijack passage-summarize into a conversation recap", () => {
    const reply = demoChatReply({ prompt: "summarize this paragraph about whales" });
    expect(reply).not.toContain("Here's the thread so far");
    expect(reply).not.toContain("just getting started");
  });
});
