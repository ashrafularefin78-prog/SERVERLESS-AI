import { DEFAULT_SETTINGS, STORAGE } from "../config.js";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE.dbName, STORAGE.dbVersion);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("conversations")) {
        const store = db.createObjectStore("conversations", { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted."));
  });
}

export async function listConversations() {
  const db = await openDb();
  const tx = db.transaction("conversations", "readonly");
  const items = await requestToPromise(tx.objectStore("conversations").getAll());
  await transactionDone(tx);
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConversation(id) {
  const db = await openDb();
  const tx = db.transaction("conversations", "readonly");
  const item = await requestToPromise(tx.objectStore("conversations").get(id));
  await transactionDone(tx);
  return item ?? null;
}

export async function saveConversation(conversation) {
  const db = await openDb();
  const tx = db.transaction("conversations", "readwrite");
  tx.objectStore("conversations").put(conversation);
  await transactionDone(tx);
  return conversation;
}

export async function deleteConversation(id) {
  const db = await openDb();
  const tx = db.transaction("conversations", "readwrite");
  tx.objectStore("conversations").delete(id);
  await transactionDone(tx);
}

export async function getSettings() {
  const db = await openDb();
  const tx = db.transaction("settings", "readonly");
  const rows = await requestToPromise(tx.objectStore("settings").getAll());
  await transactionDone(tx);

  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row && typeof row.key === "string") settings[row.key] = row.value;
  }
  return settings;
}

export async function saveSettings(partial) {
  const db = await openDb();
  const tx = db.transaction("settings", "readwrite");
  const store = tx.objectStore("settings");
  for (const [key, value] of Object.entries(partial)) {
    store.put({ key, value });
  }
  await transactionDone(tx);
}

export async function clearDatabase() {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      // Ignore a connection that is already closed.
    }
    dbPromise = null;
  }

  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(STORAGE.dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createConversation(settings = {}) {
  const now = Date.now();
  return {
    id: newId(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    mode: settings.mode || "general",
    modelKey: settings.modelKey || null,
    messages: [],
  };
}

export function createMessage(role, content = "", extra = {}) {
  return {
    id: newId(),
    role,
    content,
    createdAt: Date.now(),
    ...extra,
  };
}
