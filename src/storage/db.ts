import { DEFAULT_SETTINGS, STORAGE } from "../config.js";
import { decryptJson, encryptJson, recordAAD } from "../crypto.js";
import type {
  Conversation,
  EncryptedBlob,
  MemoryVault,
  Message,
  Role,
  Settings,
} from "../types.js";

let dbPromise: Promise<IDBDatabase> | null = null;

// The vault key lives only in this module, only for this tab's lifetime.
// Nothing writes it to disk, and it is non-extractable once derived.
let vaultKey: CryptoKey | null = null;
let vaultVersion: 1 | 2 = 2;

// Whether a vault exists in this database, independent of whether its key is in
// memory. `null` means "not looked up yet"; the first save resolves it.
let vaultPresent: boolean | null = null;

interface StoredConversation {
  id: string;
  updatedAt: number;
  encrypted?: EncryptedBlob;
  title?: string;
  createdAt?: number;
  mode?: string;
  messages?: Message[];
}

export function setVaultKey(key: CryptoKey | null, version: 1 | 2 = 2): void {
  vaultKey = key;
  vaultVersion = key ? version : 2;
}

export function hasVaultKey(): boolean {
  return vaultKey !== null;
}

/**
 * True when the database holds an encrypted vault. Read by the write paths so a
 * locked vault refuses to store plaintext, rather than trusting every caller to
 * remember to check.
 */
export async function vaultExists(): Promise<boolean> {
  if (vaultPresent !== null) return vaultPresent;

  if (!(await databaseExists())) {
    vaultPresent = false;
    return false;
  }

  const db = await openDb();
  const tx = db.transaction("settings", "readonly");
  const row = await requestToPromise(tx.objectStore("settings").get("memoryVault"));
  await transactionDone(tx);
  vaultPresent = Boolean((row as { value?: unknown } | undefined)?.value);
  return vaultPresent;
}

/** True when a persisted database exists, so a fresh profile is not created early. */
async function databaseExists(): Promise<boolean> {
  if (typeof indexedDB.databases === "function") {
    try {
      const databases = await indexedDB.databases();
      return databases.some((entry) => entry.name === STORAGE.dbName);
    } catch {
      // Fall through to opening it.
    }
  }
  return true;
}

/** Atomically re-wrap legacy chat records and publish the new v2 vault metadata. */
export async function migrateVaultRecords(
  oldKey: CryptoKey,
  newKey: CryptoKey,
  oldVersion: 1 | 2,
  vault: MemoryVault,
): Promise<number> {
  const db = await openDb();
  const readTx = db.transaction("conversations", "readonly");
  const rows = (await requestToPromise(
    readTx.objectStore("conversations").getAll(),
  )) as StoredConversation[];
  await transactionDone(readTx);

  const updates: StoredConversation[] = [];
  for (const row of rows) {
    // A plaintext row in a vault database is not a reason to block the upgrade:
    // refusing here would leave it readable forever. It is re-encrypted with the
    // new key like everything else.
    const conversation = row.encrypted
      ? await decryptJson<Conversation>(
          oldKey,
          row.encrypted,
          oldVersion === 2 ? recordAAD("conversations", row.id) : undefined,
        )
      : (row as unknown as Conversation);
    updates.push({
      id: row.id,
      updatedAt: conversation.updatedAt,
      encrypted: await encryptJson(newKey, conversation, recordAAD("conversations", row.id)),
    });
  }

  const tx = db.transaction(["conversations", "settings"], "readwrite");
  const conversations = tx.objectStore("conversations");
  for (const update of updates) conversations.put(update);
  tx.objectStore("settings").put({ key: "memoryVault", value: vault });
  tx.objectStore("settings").put({ key: "memory", value: [] });
  await transactionDone(tx);
  vaultPresent = true;
  return updates.length;
}

const REQUIRED_STORES = ["conversations", "settings", "knowledge", "knowledgeChunks"] as const;

/** Open (or create) the database and make sure every store this build needs exists. */
function openAt(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request =
      version > 0 ? indexedDB.open(STORAGE.dbName, version) : indexedDB.open(STORAGE.dbName);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("conversations")) {
        const store = db.createObjectStore("conversations", { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("knowledge")) {
        db.createObjectStore("knowledge", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("knowledgeChunks")) {
        const chunks = db.createObjectStore("knowledgeChunks", { keyPath: "id" });
        chunks.createIndex("docId", "docId");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    // Open the existing version first: requesting a fixed version would throw
    // VersionError on a profile that already upgraded past it.
    let db = await openAt(0);
    if (db.version < STORAGE.dbVersion) {
      const target = STORAGE.dbVersion;
      db.close();
      db = await openAt(target);
    }

    // Never rely on an upgrade alone: a profile could have opened an earlier
    // version of this schema (or a partial upgrade) without the new stores.
    // Reopening at version + 1 runs the same idempotent creation path.
    const missing = REQUIRED_STORES.filter((name) => !db.objectStoreNames.contains(name));
    if (missing.length) {
      const nextVersion = db.version + 1;
      db.close();
      db = await openAt(nextVersion);
    }

    db.onversionchange = () => {
      db.close();
      dbPromise = null;
    };
    return db;
  })();

  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted."));
  });
}

async function decodeConversation(
  row: StoredConversation | undefined,
): Promise<Conversation | null> {
  if (!row) return null;
  if (!row.encrypted) return row as unknown as Conversation;
  if (!vaultKey) return null;
  try {
    return await decryptJson<Conversation>(
      vaultKey,
      row.encrypted,
      vaultVersion === 2 ? recordAAD("conversations", row.id) : undefined,
    );
  } catch {
    console.warn("Could not decrypt a stored conversation");
    return null;
  }
}

export async function listConversations(): Promise<Conversation[]> {
  const db = await openDb();
  const tx = db.transaction("conversations", "readonly");
  const items = await requestToPromise(tx.objectStore("conversations").getAll());
  await transactionDone(tx);

  const conversations: Conversation[] = [];
  for (const row of items as StoredConversation[]) {
    const conversation = await decodeConversation(row);
    if (conversation) conversations.push(conversation);
  }
  return conversations.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const db = await openDb();
  const tx = db.transaction("conversations", "readonly");
  const item = await requestToPromise(tx.objectStore("conversations").get(id));
  await transactionDone(tx);
  return decodeConversation(item as StoredConversation | undefined);
}

export async function saveConversation(conversation: Conversation): Promise<Conversation> {
  // Fail closed: with a vault present but no key in memory, writing the record
  // would store the whole chat as plaintext. Callers cannot be trusted to check,
  // because a streaming reply keeps saving while the tab is hidden.
  if (!vaultKey && (await vaultExists())) {
    throw new Error("The vault is locked, so the conversation was not saved.");
  }

  // Encrypt before opening the write transaction: a transaction auto-commits
  // when the microtask queue drains, and a spec-strict IndexedDB rejects awaits
  // on WebCrypto inside one.
  const encrypted = vaultKey
    ? await encryptJson(vaultKey, conversation, recordAAD("conversations", conversation.id))
    : null;

  const db = await openDb();
  const tx = db.transaction("conversations", "readwrite");
  tx.objectStore("conversations").put(
    encrypted
      ? { id: conversation.id, updatedAt: conversation.updatedAt, encrypted }
      : conversation,
  );
  await transactionDone(tx);
  return conversation;
}

/**
 * Re-encrypt every plaintext conversation with the current vault key.
 * Encryption happens before the write transaction so the transaction never
 * auto-commits while a WebCrypto promise is pending.
 */
export async function encryptStoredConversations(): Promise<number> {
  const key = vaultKey;
  if (!key) throw new Error("Unlock the vault first.");

  const db = await openDb();
  const readTx = db.transaction("conversations", "readonly");
  const rows = await requestToPromise(readTx.objectStore("conversations").getAll());
  await transactionDone(readTx);

  const updates: StoredConversation[] = [];
  for (const row of rows as StoredConversation[]) {
    if (row.encrypted) continue;
    updates.push({
      id: row.id,
      updatedAt: row.updatedAt,
      encrypted: await encryptJson(key, row, recordAAD("conversations", row.id)),
    });
  }

  if (updates.length) {
    const tx = db.transaction("conversations", "readwrite");
    for (const update of updates) tx.objectStore("conversations").put(update);
    await transactionDone(tx);
  }

  vaultPresent = true;
  return updates.length;
}

/** Rewrite every encrypted conversation as plaintext before encryption is removed. */
export async function decryptStoredConversations(): Promise<number> {
  const key = vaultKey;
  if (!key) throw new Error("Unlock the vault first.");

  const db = await openDb();
  const readTx = db.transaction("conversations", "readonly");
  const rows = await requestToPromise(readTx.objectStore("conversations").getAll());
  await transactionDone(readTx);

  const plaintext: Conversation[] = [];
  for (const row of rows as StoredConversation[]) {
    if (!row.encrypted) continue;
    try {
      plaintext.push(
        await decryptJson<Conversation>(
          key,
          row.encrypted,
          vaultVersion === 2 ? recordAAD("conversations", row.id) : undefined,
        ),
      );
    } catch {
      // Leave records this key cannot read untouched rather than deleting them.
      console.warn("Skipped a conversation that this key cannot decrypt");
    }
  }

  if (plaintext.length) {
    const tx = db.transaction("conversations", "readwrite");
    for (const conversation of plaintext) tx.objectStore("conversations").put(conversation);
    await transactionDone(tx);
  }

  vaultPresent = false;
  return plaintext.length;
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("conversations", "readwrite");
  tx.objectStore("conversations").delete(id);
  await transactionDone(tx);
}

export async function getSettings(): Promise<Settings> {
  const db = await openDb();
  const tx = db.transaction("settings", "readonly");
  const rows = await requestToPromise(tx.objectStore("settings").getAll());
  await transactionDone(tx);

  const settings: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows as { key: string; value: unknown }[]) {
    if (row && typeof row.key === "string") {
      (settings as unknown as Record<string, unknown>)[row.key] = row.value;
    }
  }
  vaultPresent = Boolean(settings.memoryVault);
  return settings;
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  if ("memoryVault" in partial) vaultPresent = Boolean(partial.memoryVault);
  const db = await openDb();
  const tx = db.transaction("settings", "readwrite");
  const store = tx.objectStore("settings");
  for (const [key, value] of Object.entries(partial)) {
    store.put({ key, value });
  }
  await transactionDone(tx);
}

export async function clearDatabase(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      // Ignore a connection that is already closed.
    }
    dbPromise = null;
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(STORAGE.dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });

  vaultPresent = null;
}

export function newId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createConversation(settings: { mode?: string } = {}): Conversation {
  const now = Date.now();
  return {
    id: newId(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    mode: settings.mode || "general",
    messages: [],
  };
}

export function createMessage(role: Role, content = "", extra: Partial<Message> = {}): Message {
  return {
    id: newId(),
    role,
    content,
    createdAt: Date.now(),
    ...extra,
  };
}
