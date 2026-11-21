// Local-only diagnostics. Nothing here is uploaded, and nothing is sent
// anywhere: entries live in this tab's session storage so a user can copy them
// into a bug report. Callers must never record prompt, document, or chat text.

export type DiagnosticLevel = "info" | "warn" | "error";

export interface DiagnosticEntry {
  id: string;
  at: number;
  level: DiagnosticLevel;
  /** Where it happened, for example "model-worker" or "rag". */
  source: string;
  message: string;
  detail?: string;
}

export const DIAGNOSTICS_LIMIT = 60;
const STORAGE_KEY = "localmind:diagnostics";
const MAX_FIELD_CHARS = 400;

const listeners = new Set<() => void>();

// In-memory fallback for environments without session storage (Node tests,
// privacy modes that block storage). The tab still sees its own entries.
let memoryEntries: DiagnosticEntry[] = [];
let usingMemory = false;

function sanitize(value: string): string {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > MAX_FIELD_CHARS ? `${text.slice(0, MAX_FIELD_CHARS - 3)}...` : text;
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function isEntry(value: unknown): value is DiagnosticEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<DiagnosticEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.at === "number" &&
    (entry.level === "info" || entry.level === "warn" || entry.level === "error") &&
    typeof entry.source === "string" &&
    typeof entry.message === "string"
  );
}

/** Entries recorded so far, oldest first. */
export function listDiagnostics(): DiagnosticEntry[] {
  const store = storage();
  if (!store || usingMemory) return [...memoryEntries];
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [...memoryEntries];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [...memoryEntries];
  }
}

function persist(entries: DiagnosticEntry[]): void {
  const store = storage();
  const trimmed = entries.slice(-DIAGNOSTICS_LIMIT);
  if (!store) {
    memoryEntries = trimmed;
    return;
  }
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    if (usingMemory) {
      usingMemory = false;
      memoryEntries = [];
    }
  } catch {
    // Session storage can be full or blocked; keep entries in memory instead.
    usingMemory = true;
    memoryEntries = trimmed;
  }
}

export function recordDiagnostic(entry: {
  level: DiagnosticLevel;
  source: string;
  message: string;
  detail?: string;
}): DiagnosticEntry {
  const next: DiagnosticEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
    at: Date.now(),
    level: entry.level,
    source: sanitize(entry.source).slice(0, 60),
    message: sanitize(entry.message),
    ...(entry.detail ? { detail: sanitize(entry.detail) } : {}),
  };

  persist([...listDiagnostics(), next]);
  for (const listener of listeners) listener();
  return next;
}

export function clearDiagnostics(): void {
  const store = storage();
  memoryEntries = [];
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore blocked storage.
  }
  for (const listener of listeners) listener();
}

/** Fires after every change so a settings panel can re-render. */
export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Render entries as plain text for a GitHub issue. `context` is for values the
 * caller is willing to publish, such as a version string or a coarse device
 * summary; never pass chat, prompt, or document content.
 */
export function formatDiagnostics(
  entries: DiagnosticEntry[] = listDiagnostics(),
  context: Record<string, string> = {},
): string {
  const lines = ["LocalMind diagnostics", ""];
  for (const [key, value] of Object.entries(context)) {
    if (value) lines.push(`${key}: ${value}`);
  }
  if (lines[lines.length - 1] !== "") lines.push("");

  if (!entries.length) {
    lines.push("No local errors recorded.");
    return lines.join("\n");
  }

  for (const entry of entries) {
    const time = new Date(entry.at).toISOString();
    lines.push(`[${time}] ${entry.level.toUpperCase()} ${entry.source}: ${entry.message}`);
    if (entry.detail) lines.push(`  ${entry.detail}`);
  }
  return lines.join("\n");
}
