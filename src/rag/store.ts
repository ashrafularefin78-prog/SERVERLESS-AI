// IndexedDB persistence for the knowledge base. Documents and their chunk
// vectors live in two stores added in database version 2; the upgrade is
// additive, so existing chats and settings are untouched.
import { openDb, transactionDone } from "../storage/db.js";
import type { KnowledgeDoc, StoredChunk } from "../types.js";

export async function listKnowledgeDocs(): Promise<KnowledgeDoc[]> {
  const db = await openDb();
  const tx = db.transaction("knowledge", "readonly");
  const rows = await new Promise<KnowledgeDoc[]>((resolve, reject) => {
    const request = tx.objectStore("knowledge").getAll();
    request.onsuccess = () => resolve(request.result as KnowledgeDoc[]);
    request.onerror = () => reject(request.error);
  });
  await transactionDone(tx);
  return rows.sort((a, b) => b.addedAt - a.addedAt);
}

export async function saveKnowledgeDoc(doc: KnowledgeDoc, chunks: StoredChunk[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["knowledge", "knowledgeChunks"], "readwrite");
  tx.objectStore("knowledge").put(doc);
  const store = tx.objectStore("knowledgeChunks");
  for (const chunk of chunks) store.put(chunk);
  await transactionDone(tx);
}

export async function deleteKnowledgeDoc(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["knowledge", "knowledgeChunks"], "readwrite");
  tx.objectStore("knowledge").delete(id);

  const chunks = tx.objectStore("knowledgeChunks");
  const index = chunks.index("docId");
  const cursorRequest = index.openCursor(IDBKeyRange.only(id));

  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  await transactionDone(tx);
}

export async function loadAllChunks(): Promise<StoredChunk[]> {
  const db = await openDb();
  const tx = db.transaction("knowledgeChunks", "readonly");
  const rows = await new Promise<StoredChunk[]>((resolve, reject) => {
    const request = tx.objectStore("knowledgeChunks").getAll();
    request.onsuccess = () => resolve(request.result as StoredChunk[]);
    request.onerror = () => reject(request.error);
  });
  await transactionDone(tx);
  return rows;
}
