import { describe, expect, it } from "vitest";
import { GGUF_MODELS, WEBLLM_MODELS } from "../../src/engine/models.js";
import {
  isLicenseAccepted,
  licenseAcceptanceKey,
  licenseFor,
  modelCardUrl,
  needsLicenseAcceptance,
} from "../../src/engine/model-licenses.js";

const llama = {
  id: "gguf:llama",
  label: "Llama 3.2 1B Instruct (community)",
  baseModel: "Llama 3.2 1B",
};
const smol = { id: "smollm", label: "SmolLM2 360M Instruct" };
const qwen = { id: "gguf:qwen", label: "Qwen2.5 1.5B (community)", baseModel: "Qwen2.5 1.5B" };

describe("licenseFor", () => {
  it("recognises a verified permissive license without a gate", () => {
    const license = licenseFor(smol);
    expect(license.id).toBe("apache-2.0");
    expect(license.source).toBe("curated");
    expect(license.requiresAcceptance).toBe(false);
    expect(license.url).toContain("huggingface.co");
  });

  it("gates licenses whose terms require acceptance", () => {
    for (const model of [llama, { id: "x", label: "Gemma 2 2B IT", baseModel: "Gemma 2 2B" }]) {
      const license = licenseFor(model);
      expect(license.source).toBe("curated");
      expect(license.requiresAcceptance).toBe(true);
      expect(license.url).toMatch(/^https:\/\//);
    }
  });

  it("never infers a license it has no record for", () => {
    const license = licenseFor(qwen);
    expect(license.id).toBe("unknown");
    expect(license.source).toBe("unverified");
    // Unknown terms still gate the download.
    expect(license.requiresAcceptance).toBe(true);
  });

  it("matches the whole family name, not a substring", () => {
    // A model that merely mentions Llama in its name is not a Llama release.
    const fork = { id: "f", label: "Mixed Llama merge", baseModel: "Mixed Llama merge" };
    expect(licenseFor(fork).id).toBe("unknown");
    expect(licenseFor({ id: "l", label: "LLAMA-3.2-3B", baseModel: "LLAMA-3.2-3B" }).id).toBe(
      "llama-community",
    );
  });
});

describe("modelCardUrl", () => {
  it("derives the Hugging Face repo page from a pinned file URL", () => {
    expect(modelCardUrl("https://huggingface.co/org/repo/resolve/abc123/model.gguf")).toBe(
      "https://huggingface.co/org/repo",
    );
  });

  it("returns null for anything else", () => {
    expect(modelCardUrl(undefined)).toBeNull();
    expect(modelCardUrl("https://example.com/model.gguf")).toBeNull();
  });
});

describe("acceptance", () => {
  it("needs acceptance only for gated licenses", () => {
    expect(needsLicenseAcceptance(smol)).toBe(false);
    expect(needsLicenseAcceptance(llama)).toBe(true);
    expect(needsLicenseAcceptance(qwen)).toBe(true);
  });

  it("shares one acceptance between models under the same license", () => {
    const other = { id: "gguf:llama-3b", label: "Llama 3.2 3B", baseModel: "Llama 3.2 3B" };
    expect(licenseAcceptanceKey(llama)).toBe(licenseAcceptanceKey(other));
    expect(isLicenseAccepted(other, [licenseAcceptanceKey(llama)])).toBe(true);
  });

  it("keeps unverified models separate", () => {
    const otherQwen = { id: "gguf:qwen-3b", label: "Qwen2.5 3B", baseModel: "Qwen2.5 3B" };
    expect(licenseAcceptanceKey(qwen)).not.toBe(licenseAcceptanceKey(otherQwen));
    expect(isLicenseAccepted(otherQwen, [licenseAcceptanceKey(qwen)])).toBe(false);
  });

  it("treats a permissive license as always accepted", () => {
    expect(isLicenseAccepted(smol, [])).toBe(true);
  });
});

describe("the shipped catalogue", () => {
  it("gates or verifies every downloadable model", () => {
    for (const model of [...GGUF_MODELS, ...WEBLLM_MODELS]) {
      const license = licenseFor(model);
      expect(["curated", "unverified"]).toContain(license.source);
      // Unknown metadata must never read as permissive.
      if (license.source === "unverified") expect(license.requiresAcceptance).toBe(true);
    }
  });

  it("does not claim a license for most of the generated catalogue", () => {
    const verified = [...GGUF_MODELS, ...WEBLLM_MODELS].filter(
      (model) => licenseFor(model).source === "curated",
    );
    // A small curated list is the point: no blanket inference.
    expect(verified.length).toBeLessThan([...GGUF_MODELS, ...WEBLLM_MODELS].length / 2);
  });
});
