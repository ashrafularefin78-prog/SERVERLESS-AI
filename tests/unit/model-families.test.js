import { describe, expect, it } from "vitest";
import {
  groupModelsByFamily,
  modelFamily,
} from "../../src/engine/model-families.js";
import { GGUF_MODELS, LOCAL_MODELS } from "../../src/engine/models.js";

const byLabel = (prefix) => GGUF_MODELS.find((m) => m.label.startsWith(prefix)) ?? GGUF_MODELS[0];

describe("model families", () => {
  it("labels well-known families correctly", () => {
    expect(modelFamily(byLabel("Qwen2.5 0.5B"))).toBe("Qwen2.5");
    expect(modelFamily(byLabel("Llama 3.2 1B"))).toBe("Llama 3.2");
    expect(modelFamily(byLabel("Gemma 2 2B"))).toBe("Gemma 2");
    expect(modelFamily(byLabel("Qwen3 0.6B"))).toBe("Qwen3");
    expect(modelFamily(byLabel("DeepSeek R1 Distill Qwen 1.5B"))).toBe("DeepSeek R1 Distill");
    expect(modelFamily(byLabel("Granite 3.2 2B"))).toBe("Granite");
    expect(modelFamily(byLabel("Falcon3 3B"))).toBe("Falcon");
    expect(modelFamily(byLabel("OLMo 2 1B"))).toBe("OLMo");
    expect(modelFamily(byLabel("Yi 1.5 6B"))).toBe("Yi");
    expect(modelFamily(byLabel("Dolphin3.0 Llama3.2 1B"))).toBe("Llama 3.2");
  });

  it("keeps every catalogue entry under a family", () => {
    for (const group of groupModelsByFamily(LOCAL_MODELS)) {
      expect(group.family).toBeTruthy();
      expect(group.models.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("covers every model exactly once", () => {
    const grouped = groupModelsByFamily(LOCAL_MODELS).flatMap((g) => g.models);
    expect(new Set(grouped.map((m) => m.id)).size).toBe(LOCAL_MODELS.length);
  });

  it("sorts alphabetically with Other last", () => {
    const groups = groupModelsByFamily(LOCAL_MODELS);
    const families = groups.map((g) => g.family);
    expect(families.lastIndexOf("Other")).toBe(families.length - 1);
    const top = families.filter((f) => f !== "Other");
    for (let i = 1; i < top.length; i += 1) {
      expect(top[i - 1].localeCompare(top[i])).toBeLessThanOrEqual(0);
    }
  });

  it("keeps models in catalogue order inside a family", () => {
    for (const group of groupModelsByFamily(LOCAL_MODELS)) {
      const ids = group.models.map((m) => m.id);
      for (let i = 1; i < ids.length; i += 1) {
        const prev = LOCAL_MODELS.findIndex((m) => m.id === ids[i - 1]);
        const next = LOCAL_MODELS.findIndex((m) => m.id === ids[i]);
        expect(prev).toBeLessThan(next);
      }
    }
  });

  it("returns at least 10 families", () => {
    expect(groupModelsByFamily(LOCAL_MODELS).length).toBeGreaterThan(10);
  });
});

