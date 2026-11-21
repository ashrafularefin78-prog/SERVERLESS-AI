import { describe, expect, it, vi } from "vitest";
import {
  downloadResumable,
  modelCacheKey,
  planResume,
} from "../../src/engine/resumable-download.js";

/** In-memory stand-in for the OPFS store. */
function memoryStore(initial = []) {
  const bytes = [...initial];
  return {
    bytes,
    async stat() {
      return bytes.length ? { bytes: bytes.length, etag: "v1", total: null } : null;
    },
    async append(chunk) {
      bytes.push(...chunk);
    },
    async reset() {
      bytes.length = 0;
    },
    async open() {
      return bytes.length ? new Blob([new Uint8Array(bytes)]) : null;
    },
  };
}

function textResponse(text, { status = 200, headers = {} } = {}) {
  const body = new TextEncoder().encode(text);
  return new Response(body, { status, headers });
}

describe("planResume", () => {
  it("starts from zero with nothing stored", () => {
    expect(planResume({ stored: null, expectedSize: 10, remoteEtag: null })).toEqual({
      action: "start",
      range: null,
    });
  });

  it("resumes from the stored byte count", () => {
    expect(
      planResume({
        stored: { bytes: 4, etag: "v1", total: 10 },
        expectedSize: 10,
        remoteEtag: "v1",
      }),
    ).toEqual({ action: "resume", range: "bytes=4-" });
  });

  it("reports a complete download", () => {
    expect(
      planResume({
        stored: { bytes: 10, etag: "v1", total: 10 },
        expectedSize: 10,
        remoteEtag: "v1",
      }),
    ).toEqual({ action: "complete" });
  });

  it("restarts when the stored bytes exceed the expected size", () => {
    expect(
      planResume({
        stored: { bytes: 12, etag: "v1", total: null },
        expectedSize: 10,
        remoteEtag: "v1",
      }),
    ).toEqual({ action: "restart" });
  });

  it("restarts when the upstream file changed", () => {
    expect(
      planResume({
        stored: { bytes: 4, etag: "v1", total: 10 },
        expectedSize: 10,
        remoteEtag: "v2",
      }),
    ).toEqual({ action: "restart" });
  });
});

describe("downloadResumable", () => {
  it("downloads a whole file and reports progress", async () => {
    const store = memoryStore();
    const onProgress = vi.fn();
    const fetchImpl = vi.fn(async (url, init) =>
      init?.method === "HEAD"
        ? textResponse("", { headers: { "content-length": "5" } })
        : textResponse("hello"),
    );

    const result = await downloadResumable({
      url: "https://example.test/model.gguf",
      store,
      expectedSize: 5,
      fetchImpl,
      onProgress,
    });

    expect(new TextDecoder().decode(new Uint8Array(await result.blob.arrayBuffer()))).toBe("hello");
    expect(result.resumedFrom).toBe(0);
    expect(onProgress).toHaveBeenCalled();
  });

  it("resumes with a Range request and appends only the missing bytes", async () => {
    const store = memoryStore([..."hel"].map((char) => char.charCodeAt(0)));
    const fetchImpl = vi.fn(async (url, init) => {
      if (init?.method === "HEAD") {
        return textResponse("", {
          headers: { "content-length": "5", "accept-ranges": "bytes", etag: "v1" },
        });
      }
      expect(init?.headers?.Range).toBe("bytes=3-");
      expect(init?.headers?.["If-Range"]).toBe("v1");
      return textResponse("lo", {
        status: 206,
        headers: { "content-range": "bytes 3-4/5" },
      });
    });

    const result = await downloadResumable({
      url: "https://example.test/model.gguf",
      store,
      expectedSize: 5,
      fetchImpl,
    });

    expect(result.resumedFrom).toBe(3);
    expect(new TextDecoder().decode(new Uint8Array(await result.blob.arrayBuffer()))).toBe("hello");
  });

  it("restarts when the server ignores the range", async () => {
    const store = memoryStore([..."hel"].map((char) => char.charCodeAt(0)));
    const fetchImpl = vi.fn(async (url, init) =>
      init?.method === "HEAD"
        ? textResponse("", {
            headers: { "content-length": "5", "accept-ranges": "bytes", etag: "v1" },
          })
        : textResponse("hello"),
    );

    const result = await downloadResumable({
      url: "https://example.test/model.gguf",
      store,
      expectedSize: 5,
      fetchImpl,
    });

    expect(result.resumedFrom).toBe(3);
    expect(new TextDecoder().decode(new Uint8Array(await result.blob.arrayBuffer()))).toBe("hello");
  });

  it("skips the network when the stored file is already complete", async () => {
    const store = memoryStore([..."hello"].map((char) => char.charCodeAt(0)));
    const fetchImpl = vi.fn(async () => textResponse("", { headers: { "content-length": "5" } }));

    const result = await downloadResumable({
      url: "https://example.test/model.gguf",
      store,
      expectedSize: 5,
      fetchImpl,
    });

    expect(result.blob.size).toBe(5);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a download whose size does not match the catalogue", async () => {
    const store = memoryStore();
    const fetchImpl = vi.fn(async (url, init) =>
      init?.method === "HEAD"
        ? textResponse("", { headers: { "content-length": "4" } })
        : textResponse("hi"),
    );

    await expect(
      downloadResumable({
        url: "https://example.test/model.gguf",
        store,
        expectedSize: 5,
        fetchImpl,
      }),
    ).rejects.toThrow(/2 bytes but 5 were expected/);
    expect(store.bytes).toHaveLength(0);
  });

  it("surfaces an HTTP failure", async () => {
    const store = memoryStore();
    const fetchImpl = vi.fn(async (url, init) =>
      init?.method === "HEAD"
        ? textResponse("", { headers: {} })
        : textResponse("no", { status: 404 }),
    );

    await expect(
      downloadResumable({ url: "https://example.test/model.gguf", store, fetchImpl }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("stops before downloading when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    await expect(
      downloadResumable({
        url: "https://example.test/model.gguf",
        store: memoryStore(),
        fetchImpl,
        signal: controller.signal,
      }),
    ).rejects.toThrow(/stopped/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("modelCacheKey", () => {
  it("is stable, URL-specific and safe for a filesystem", () => {
    const url = "https://huggingface.co/org/repo/resolve/abc/model-Q4_K_M.gguf";
    const key = modelCacheKey(url);
    expect(key).toBe(modelCacheKey(url));
    expect(key).toMatch(/^[0-9a-f]{8}\.gguf$/);
    expect(key).not.toBe(modelCacheKey(`${url}?download=true`));
  });
});
