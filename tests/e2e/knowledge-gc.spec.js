import { expect, test } from "@playwright/test";
import { open } from "./helpers.js";

// Deleting a document has to remove its vectors, not just the document row.
// A row that stays behind keeps every Float32Array alive in IndexedDB, which is
// how a browser profile fills up with data the app can no longer see.

test("removing a document deletes its stored vectors", async ({ page }) => {
  await open(page);

  const seeded = await page.evaluate(async () => {
    const open = () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("localmind");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await open();
    const tx = db.transaction(["knowledge", "knowledgeChunks"], "readwrite");
    tx.objectStore("knowledge").put({
      id: "doc-1",
      title: "Notes on queues",
      text: "A queue is a FIFO structure.",
      chunkCount: 3,
      addedAt: 1,
    });
    const chunks = tx.objectStore("knowledgeChunks");
    for (let index = 0; index < 3; index += 1) {
      chunks.put({
        id: `doc-1:${index}`,
        docId: "doc-1",
        title: "Notes on queues",
        index,
        text: `Chunk ${index}`,
        vector: new Float32Array([index, index + 1, index + 2]),
      });
    }
    // An unrelated document that must survive the delete.
    tx.objectStore("knowledge").put({
      id: "doc-2",
      title: "Keep me",
      text: "Unrelated.",
      chunkCount: 1,
      addedAt: 2,
    });
    chunks.put({
      id: "doc-2:0",
      docId: "doc-2",
      title: "Keep me",
      index: 0,
      text: "Keep",
      vector: new Float32Array([9, 9, 9]),
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return true;
  });
  expect(seeded).toBe(true);

  await page.reload();
  await page.locator("#open-settings").click();
  await expect(page.locator("#knowledge-list")).toContainText("Notes on queues");

  await page.locator('#knowledge-list button[data-knowledge-id="doc-1"]').click();
  // Deleting anything asks first, because it cannot be undone.
  await expect(page.locator("#confirm-dialog")).toBeVisible();
  await expect(page.locator("#confirm-body")).toContainText("embeddings will be deleted");
  await page.locator("#confirm-ok").click();
  await expect(page.locator("#knowledge-list")).not.toContainText("Notes on queues");

  const counts = await page.evaluate(
    async () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("localmind");
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["knowledge", "knowledgeChunks"], "readonly");
          const docs = tx.objectStore("knowledge").getAll();
          const chunks = tx.objectStore("knowledgeChunks").getAll();
          tx.oncomplete = () => {
            const visible = docs.result.map((doc) => doc.id);
            const vectors = chunks.result.map((chunk) => chunk.docId);
            db.close();
            resolve({
              visible,
              vectors,
              sized: chunks.result.every((chunk) => chunk.vector?.length),
            });
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );

  expect(counts.visible).toEqual(["doc-2"]);
  expect(counts.vectors).toEqual(["doc-2"]);
  expect(counts.sized).toBe(true);
});
