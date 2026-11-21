// Resumable HTTP downloads for community GGUF weights.
//
// The app owns this HTTP path, so it can ask for a byte range and keep partial
// bytes in OPFS. A tab that closes at 80% therefore continues from 80% instead
// of restarting. Anything unexpected (a changed ETag, a server that ignores
// ranges, blocked storage) restarts cleanly rather than mixing two file
// versions.
//
// WebLLM's own artifact cache has no partial-download API, so WebGPU models
// still restart; see docs/architecture.md.

export interface DownloadProgress {
  loaded: number;
  total: number;
  resumedFrom: number;
}

export interface StoredPartial {
  /** Bytes already on disk. */
  bytes: number;
  /** Validator the stored bytes were downloaded under, when known. */
  etag: string | null;
  /** Full size announced by the server, when known. */
  total: number | null;
}

/** Storage seam so resume logic can be tested without a browser. */
export interface PartialStore {
  stat(): Promise<StoredPartial | null>;
  append(chunk: Uint8Array): Promise<void>;
  reset(): Promise<void>;
  /** Read stored bytes back once the download is complete. */
  open(): Promise<Blob | null>;
}

export interface DownloadResult {
  blob: Blob;
  bytes: number;
  resumedFrom: number;
  etag: string | null;
}

export type ResumePlan =
  | { action: "start"; range: null }
  | { action: "resume"; range: string }
  | { action: "complete" }
  | { action: "restart" };

/**
 * Decide how to continue a download. `expectedSize` is the catalogue size, used
 * to reject a partial file that cannot possibly be right.
 */
export function planResume({
  stored,
  expectedSize,
  remoteEtag,
}: {
  stored: StoredPartial | null;
  expectedSize: number | null;
  remoteEtag: string | null;
}): ResumePlan {
  if (!stored || stored.bytes <= 0) return { action: "start", range: null };

  const size = expectedSize ?? stored.total;
  if (size !== null && stored.bytes === size) return { action: "complete" };
  if (size !== null && stored.bytes > size) return { action: "restart" };

  // A changed validator means the upstream file was replaced. Never splice a
  // new file onto old bytes.
  if (stored.etag && remoteEtag && stored.etag !== remoteEtag) return { action: "restart" };

  return { action: "resume", range: `bytes=${stored.bytes}-` };
}

function parseTotal(contentRange: string | null): number | null {
  const match = contentRange?.match(/\/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

function abortError(): Error {
  const error = new Error("The download was stopped.");
  error.name = "AbortError";
  return error;
}

export interface DownloadDeps {
  fetchImpl?: typeof fetch;
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * Download `url` into `store`, continuing from whatever it already holds.
 * Throws on a hard failure and leaves the partial bytes in place, so a later
 * attempt can resume.
 */
export async function downloadResumable({
  url,
  store,
  expectedSize = null,
  signal,
  fetchImpl = fetch,
  onProgress,
}: {
  url: string;
  store: PartialStore;
  expectedSize?: number | null;
  signal?: AbortSignal;
} & DownloadDeps): Promise<DownloadResult> {
  if (signal?.aborted) throw abortError();

  // Probe first so a resumed request can name the validator it expects. A
  // host that refuses HEAD still gets a normal ranged GET below.
  let remoteEtag: string | null = null;
  let remoteSize: number | null = null;
  let acceptsRanges = false;
  try {
    const probe = await fetchImpl(url, { method: "HEAD", signal });
    if (probe.ok) {
      remoteEtag = probe.headers.get("etag");
      const remoteSizeHeader = probe.headers.get("content-length");
      remoteSize = remoteSizeHeader ? Number(remoteSizeHeader) : null;
      acceptsRanges = /bytes/i.test(probe.headers.get("accept-ranges") ?? "");
    }
  } catch {
    // HEAD is an optimization; the GET below is authoritative.
  }

  const stored = await store.stat();
  const plan = planResume({
    stored,
    expectedSize: expectedSize ?? remoteSize,
    remoteEtag,
  });

  if (plan.action === "complete") {
    const blob = await store.open();
    if (blob)
      return {
        blob,
        bytes: blob.size,
        resumedFrom: stored?.bytes ?? 0,
        etag: stored?.etag ?? null,
      };
    await store.reset();
  }

  if (plan.action === "restart") await store.reset();
  const range = plan.action === "resume" && acceptsRanges ? plan.range : null;
  // Resuming is impossible without a range, so start from a clean file.
  if (plan.action === "resume" && !range) await store.reset();
  const resumedFrom = range ? (stored?.bytes ?? 0) : 0;

  const headers: Record<string, string> = {};
  if (range) headers.Range = range;
  if (range && stored?.etag) headers["If-Range"] = stored.etag;

  const response = await fetchImpl(url, { headers, signal });
  if (!response.ok && response.status !== 206) {
    throw new Error(`The model download failed (HTTP ${response.status}).`);
  }

  // A 206 means the bytes continue at the offset we asked for. Anything else
  // is the whole file, which must not be appended to existing bytes.
  const partial = response.status === 206;
  if (range && !partial) await store.reset();
  const finalEtag = response.headers.get("etag") ?? remoteEtag;

  const total =
    parseTotal(response.headers.get("content-range")) ??
    (response.headers.get("content-length")
      ? Number(response.headers.get("content-length"))
      : null);

  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    await store.append(buffer);
    const blob = await store.open();
    if (!blob) throw new Error("The downloaded model could not be stored.");
    return { blob, bytes: blob.size, resumedFrom, etag: finalEtag };
  }

  const reader = response.body.getReader();
  let loaded = resumedFrom;
  onProgress?.({ loaded, total: total ?? 0, resumedFrom });

  try {
    while (true) {
      if (signal?.aborted) throw abortError();
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      await store.append(value);
      loaded += value.length;
      onProgress?.({ loaded, total: total ?? loaded, resumedFrom });
    }
  } catch (error) {
    // Keep the partial bytes for the next attempt.
    if (signal?.aborted) throw abortError();
    throw error;
  } finally {
    reader.releaseLock();
  }

  const blob = await store.open();
  if (!blob) throw new Error("The downloaded model could not be stored.");
  if (expectedSize !== null && blob.size !== expectedSize) {
    await store.reset();
    throw new Error(
      `The model download is ${blob.size} bytes but ${expectedSize} were expected. Try again.`,
    );
  }
  return { blob, bytes: blob.size, resumedFrom, etag: finalEtag };
}

/* ---------------------------------------------------------------
   OPFS-backed store
--------------------------------------------------------------- */

const DIRECTORY = "localmind-models";

interface StoredMeta extends StoredPartial {
  url: string;
  complete: boolean;
}

/** Stable, filesystem-safe key for a model URL. */
export function modelCacheKey(url: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const extension = url.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]?.toLowerCase() ?? "bin";
  return `${hash.toString(16).padStart(8, "0")}.${extension}`;
}

async function modelDirectory(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage?.getDirectory?.();
    if (!root) return null;
    return await root.getDirectoryHandle(DIRECTORY, { create });
  } catch {
    return null;
  }
}

let supportProbe: Promise<boolean> | null = null;

/**
 * True only when this browser can actually write a model file. A present
 * `getDirectory` is not enough: private modes and test doubles expose shapes
 * that cannot create a writable file, and those must fall back cleanly.
 */
export function supportsResumableStore(): Promise<boolean> {
  supportProbe ??= (async () => {
    try {
      const directory = await modelDirectory(true);
      if (!directory || typeof directory.getFileHandle !== "function") return false;
      const name = `probe-${Date.now().toString(36)}.tmp`;
      const handle = await directory.getFileHandle(name, { create: true });
      const usable =
        typeof handle.createWritable === "function" && typeof handle.getFile === "function";
      await directory.removeEntry(name).catch(() => {});
      return usable;
    } catch {
      return false;
    }
  })();
  return supportProbe;
}

/** Test hook: forget the cached capability probe. */
export function resetResumableStoreProbe(): void {
  supportProbe = null;
}

export function createOpfsStore(url: string): PartialStore & {
  key: string;
  readMeta(): Promise<StoredMeta | null>;
  markComplete(total: number, etag: string | null): Promise<void>;
} {
  const key = modelCacheKey(url);

  async function handle(create: boolean): Promise<FileSystemFileHandle | null> {
    const directory = await modelDirectory(create);
    if (!directory) return null;
    try {
      return await directory.getFileHandle(`${key}.part`, { create });
    } catch {
      return null;
    }
  }

  async function readMeta(): Promise<StoredMeta | null> {
    const directory = await modelDirectory(false);
    if (!directory) return null;
    try {
      const metaHandle = await directory.getFileHandle(`${key}.json`);
      const text = await (await metaHandle.getFile()).text();
      const parsed = JSON.parse(text) as Partial<StoredMeta>;
      if (parsed.url !== url) return null;
      return {
        url,
        bytes: Number(parsed.bytes ?? 0),
        total: parsed.total ?? null,
        etag: parsed.etag ?? null,
        complete: Boolean(parsed.complete),
      };
    } catch {
      return null;
    }
  }

  async function writeMeta(meta: StoredMeta): Promise<void> {
    const directory = await modelDirectory(true);
    if (!directory) return;
    const metaHandle = await directory.getFileHandle(`${key}.json`, { create: true });
    const writable = await metaHandle.createWritable();
    await writable.write(JSON.stringify(meta));
    await writable.close();
  }

  return {
    key,
    readMeta,
    async stat() {
      const meta = await readMeta();
      const fileHandle = await handle(false);
      const size = fileHandle ? (await fileHandle.getFile()).size : 0;
      if (!meta && !size) return null;
      if (meta?.complete && size > 0) {
        return { bytes: size, etag: meta.etag, total: meta.total ?? size };
      }
      return { bytes: size, etag: meta?.etag ?? null, total: meta?.total ?? null };
    },
    async append(chunk) {
      const fileHandle = await handle(true);
      if (!fileHandle) throw new Error("Model storage is unavailable in this browser.");
      const existing = (await fileHandle.getFile()).size;
      const writable = await fileHandle.createWritable({ keepExistingData: true });
      // Copy into a fresh buffer so the DOM types see a plain ArrayBuffer.
      const bytes = new Uint8Array(chunk.length);
      bytes.set(chunk);
      try {
        await writable.seek(existing);
        await writable.write(bytes);
      } finally {
        await writable.close();
      }
    },
    async reset() {
      const directory = await modelDirectory(false);
      if (directory) {
        await directory.removeEntry(`${key}.part`).catch(() => {});
        await directory.removeEntry(`${key}.json`).catch(() => {});
      }
    },
    async open() {
      const fileHandle = await handle(false);
      if (!fileHandle) return null;
      const file = await fileHandle.getFile();
      return file.size ? file : null;
    },
    async markComplete(total, etag) {
      await writeMeta({ url, bytes: total, total, etag, complete: true });
    },
  };
}

/** Delete a stored model, including its partial bytes. */
export async function deleteStoredModel(url: string): Promise<void> {
  const store = createOpfsStore(url);
  await store.reset();
}

/** True when this URL's weights are stored and complete. */
export async function isStoredModelComplete(url: string, expectedSize: number): Promise<boolean> {
  const store = createOpfsStore(url);
  const meta = await store.readMeta();
  if (!meta?.complete) return false;
  const blob = await store.open();
  return blob !== null && blob.size === expectedSize;
}
