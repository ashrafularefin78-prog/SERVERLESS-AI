import { expect, test } from "@playwright/test";

// Auto-scroll has one rule with two halves: follow the reply while the reader is
// at the end, and stop the moment they scroll away. These tests drive both.

async function seedLongChat(page, messages = 24) {
  await page.goto("/");
  await page.evaluate(async (count) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("localmind");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = [];
    for (let index = 0; index < count; index += 1) {
      rows.push({
        id: `m${index}`,
        role: index % 2 === 0 ? "user" : "assistant",
        content: `Message ${index}. ${"This line exists to make the conversation longer. ".repeat(6)}`,
        createdAt: index,
      });
    }
    const tx = db.transaction("conversations", "readwrite");
    tx.objectStore("conversations").put({
      id: "long-chat",
      title: "Long chat",
      updatedAt: 2,
      messages: rows,
    });
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
  }, messages);
  await page.reload();
  await page.locator("#history").getByText("Long chat").click();
}

const metrics = (page) =>
  page.evaluate(() => {
    const scroller = document.getElementById("chat-scroll");
    return {
      top: scroller.scrollTop,
      max: scroller.scrollHeight - scroller.clientHeight,
      cueVisible: !document.getElementById("scroll-bottom").hidden,
      pending: document.getElementById("scroll-bottom").dataset.pending === "true",
    };
  });

test("follows new text while at the end, then pauses when the reader scrolls up", async ({
  page,
}) => {
  await seedLongChat(page);
  await expect.poll(async () => (await metrics(page)).max).toBeGreaterThan(400);
  await expect
    .poll(async () => Math.round((await metrics(page)).top))
    .toBe(
      await page.evaluate(() => {
        const scroller = document.getElementById("chat-scroll");
        return Math.round(scroller.scrollHeight - scroller.clientHeight);
      }),
    );
  expect((await metrics(page)).cueVisible).toBe(false);

  await page.evaluate(() => {
    document.getElementById("chat-scroll").scrollTop = 0;
  });
  await expect(page.locator("#scroll-bottom")).toBeVisible();
  expect((await metrics(page)).pending).toBe(false);

  // Scrolling away *during* a reply must hold the view where the reader put it.
  await page.evaluate(() => {
    const scroller = document.getElementById("chat-scroll");
    scroller.scrollTop = scroller.scrollHeight;
  });
  // This prompt streams for roughly two seconds, which is long enough to
  // interrupt it deliberately rather than racing the demo engine.
  const repliesBefore = await page.locator(".msg.assistant .msg-text").count();
  await page.locator("#input").fill("write a python script that reads a csv and prints totals");
  await page.locator("#send").click();
  // Wait for the *new* reply node: `last()` alone matches the previous turn.
  await expect(page.locator(".msg.assistant .msg-text")).toHaveCount(repliesBefore + 1);
  await expect(page.locator(".msg.assistant .msg-text").last()).not.toBeEmpty();
  await page.evaluate(() => {
    document.getElementById("chat-scroll").scrollTop = 0;
  });
  await expect(page.locator("#scroll-bottom")).toBeVisible();

  const beforeGrowth = await metrics(page);
  await expect
    .poll(async () => (await metrics(page)).max, { timeout: 5000 })
    .toBeGreaterThan(beforeGrowth.max);

  // The pause is signalled, so the reader knows a reply is still arriving.
  await expect(page.locator("#scroll-bottom")).toHaveAttribute("data-pending", "true");
  const paused = await metrics(page);
  expect(paused.top).toBeLessThan(120);

  await page.locator("#scroll-bottom").click();
  await expect
    .poll(async () => {
      const now = await metrics(page);
      return now.max - now.top;
    })
    .toBeLessThan(90);
  await expect(page.locator("#scroll-bottom")).toBeHidden();
});

test("resumes following after jumping back to the newest message", async ({ page }) => {
  await seedLongChat(page);
  await expect.poll(async () => (await metrics(page)).max).toBeGreaterThan(400);

  await page.evaluate(() => {
    const scroller = document.getElementById("chat-scroll");
    scroller.scrollTop = 40;
  });
  await expect(page.locator("#scroll-bottom")).toBeVisible();
  await page.locator("#scroll-bottom").click();
  await expect(page.locator("#scroll-bottom")).toBeHidden();

  // Reaching the bottom is what re-arms auto-scroll, not the click itself.
  await page.evaluate(() => {
    document.getElementById("chat-scroll").scrollTop -= 200;
  });
  await expect(page.locator("#scroll-bottom")).toBeVisible();
  await page.evaluate(() => {
    const scroller = document.getElementById("chat-scroll");
    scroller.scrollTop = scroller.scrollHeight;
  });
  await expect(page.locator("#scroll-bottom")).toBeHidden();
});
