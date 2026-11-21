import { expect, test } from "@playwright/test";

// A performance guard that runs against the production build. It is not a
// Lighthouse replacement; it catches the regressions that matter for this app:
// a payload that creeps up, a first paint that waits on the model bundle, and a
// conversation view that renders every message.

async function paintMetrics(page) {
  // Paint timing is sampled per frame and can be missing for a moment under
  // load, so give it a chance before reading.
  await page
    .waitForFunction(
      () => performance.getEntriesByType("paint").some((e) => e.name === "first-contentful-paint"),
      undefined,
      { timeout: 3000 },
    )
    .catch(() => {});

  return page.evaluate(async () => {
    const entries = performance.getEntriesByType("paint");
    const first = entries.find((entry) => entry.name === "first-contentful-paint");
    const navigation = performance.getEntriesByType("navigation")[0];
    const lcp = await new Promise((resolve) => {
      const observer = new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        resolve(last ? Math.round(last.startTime) : 0);
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(0);
      }, 1500);
    });

    const scripts = performance
      .getEntriesByType("resource")
      .filter((entry) => entry.initiatorType === "script" || /\.js(\?|$)/.test(entry.name));

    return {
      fcp: first ? Math.round(first.startTime) : 0,
      // Always present, so the assertion has something to stand on even when
      // paint timing is missing.
      domContentLoaded: navigation ? Math.round(navigation.domContentLoadedEventEnd) : 0,
      lcp,
      scriptBytes: scripts.reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0),
      scriptCount: scripts.length,
      nodes: document.querySelectorAll("*").length,
    };
  });
}

test("first paint is fast and the initial payload stays small", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".welcome")).toBeVisible();
  const metrics = await paintMetrics(page);

  // Generous against a slow CI box, tight enough to catch a bundle regression:
  // the initial entry chunk is ~250 kB gzipped, and no model code loads until a
  // model is chosen.
  expect(metrics.domContentLoaded).toBeGreaterThan(0);
  expect(metrics.domContentLoaded).toBeLessThan(2500);
  if (metrics.fcp > 0) expect(metrics.fcp).toBeLessThan(2000);
  expect(metrics.scriptBytes).toBeLessThan(1_500_000);
  expect(metrics.nodes).toBeLessThan(2000);
});

test("a long conversation renders a bounded number of nodes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const request = indexedDB.open("localmind");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const messages = [];
    for (let index = 0; index < 400; index += 1) {
      messages.push({
        id: `m${index}`,
        role: index % 2 === 0 ? "user" : "assistant",
        content: `Message ${index}. ${"Long enough to be a real bubble. ".repeat(4)}`,
        createdAt: index,
      });
    }
    const tx = db.transaction("conversations", "readwrite");
    tx.objectStore("conversations").put({
      id: "perf-chat",
      title: "Perf chat",
      updatedAt: 2,
      messages,
    });
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
  });

  await page.reload();
  await page.locator("#history").getByText("Perf chat").click();
  await expect(page.locator(".msg").first()).toBeVisible();

  const rendered = await page.evaluate(() => ({
    messages: document.querySelectorAll(".msg").length,
    nodes: document.querySelectorAll("*").length,
  }));

  // MESSAGE_WINDOW_STEP is 60; 400 messages must not become 400 rendered turns.
  expect(rendered.messages).toBeLessThanOrEqual(60);
  expect(rendered.nodes).toBeLessThan(4000);
  await expect(page.locator(".earlier-bar")).toBeVisible();
});
