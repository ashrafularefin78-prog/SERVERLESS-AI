import { describe, expect, it } from "vitest";
import { isCrossOrigin, shouldBlockRequest } from "../../src/offline.js";

const ORIGIN = "https://localmind.example";

describe("isCrossOrigin", () => {
  it("treats the same origin as local, whatever the path", () => {
    expect(isCrossOrigin("https://localmind.example/assets/app.js", ORIGIN)).toBe(false);
    expect(isCrossOrigin(`${ORIGIN}/`, ORIGIN)).toBe(false);
    expect(isCrossOrigin("./index.html", ORIGIN)).toBe(false);
  });

  it("detects other origins, schemes and ports", () => {
    expect(isCrossOrigin("https://huggingface.co/model.gguf", ORIGIN)).toBe(true);
    expect(isCrossOrigin("http://localmind.example/app.js", ORIGIN)).toBe(true);
    expect(isCrossOrigin("https://localmind.example:8443/app.js", ORIGIN)).toBe(true);
    expect(isCrossOrigin("https://cdn.localmind.example/app.js", ORIGIN)).toBe(true);
  });

  it("counts an unparseable URL as remote", () => {
    expect(isCrossOrigin("http://[invalid", ORIGIN)).toBe(true);
  });
});

describe("shouldBlockRequest", () => {
  it("allows everything while offline mode is off", () => {
    expect(
      shouldBlockRequest({
        url: "https://huggingface.co/m.gguf",
        appOrigin: ORIGIN,
        offlineMode: false,
      }),
    ).toBe(false);
  });

  it("blocks only cross-origin traffic while offline mode is on", () => {
    expect(
      shouldBlockRequest({
        url: "https://huggingface.co/m.gguf",
        appOrigin: ORIGIN,
        offlineMode: true,
      }),
    ).toBe(true);
    expect(
      shouldBlockRequest({ url: `${ORIGIN}/assets/app.js`, appOrigin: ORIGIN, offlineMode: true }),
    ).toBe(false);
  });

  it("blocks the model hosts the CSP allows once armed", () => {
    for (const url of [
      "https://huggingface.co/org/repo/resolve/abc/model.gguf",
      "https://cdn-lfs.huggingface.co/file",
      "https://raw.githubusercontent.com/owner/repo/main/catalogue.json",
    ]) {
      expect(shouldBlockRequest({ url, appOrigin: ORIGIN, offlineMode: true })).toBe(true);
    }
  });
});
