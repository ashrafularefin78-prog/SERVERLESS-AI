import { expect, test } from "@playwright/test";
import { open } from "./helpers.js";

// Trusted Types is only meaningful with enforcement switched on, so these tests
// assert the enforcement itself, then that the sanitizer behind the policy still
// removes executable markup, then that the app's own inline SVG survives.

async function seedChatWithMarkup(page, content) {
  await open(page);
  return seedAndOpen(page, content, "Markup chat");
}

async function seedAndOpen(page, content, title) {
  if (!page.url().includes("localhost")) await open(page);
  await page.evaluate(
    async ([text, title]) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("localmind");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const conversation = {
        id: `seed-${text.length}`,
        title: title,
        updatedAt: 2,
        messages: [
          { id: "m1", role: "user", content: text },
          { id: "m2", role: "assistant", content: text },
        ],
      };
      const tx = db.transaction("conversations", "readwrite");
      tx.objectStore("conversations").put(conversation);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    [content, title],
  );
  await page.reload();
  await page.locator("#history").getByText(title).click();
}

const collectViolations = () => {
  window.__ttViolations = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    window.__ttViolations.push({
      directive: event.violatedDirective || event.effectiveDirective,
      blocked: event.blockedURI,
      sample: String(event.sample).slice(0, 80),
    });
  });
};

test("enforces Trusted Types on string sinks", async ({ page }) => {
  await page.addInitScript(collectViolations);
  await open(page);

  const enforced = await page.evaluate(() => {
    const node = document.createElement("div");
    try {
      node.innerHTML = "<b>probe</b>";
      return { throws: false, trustedTypes: typeof window.trustedTypes };
    } catch {
      return { throws: true, trustedTypes: typeof window.trustedTypes };
    }
  });

  expect(enforced.trustedTypes).toBe("object");
  // This is the property the app relies on: a raw string cannot reach a sink.
  expect(enforced.throws).toBe(true);
});

test("raises no policy violations while the app renders and chats", async ({ page }) => {
  await page.addInitScript(collectViolations);
  await open(page);
  await expect(page.locator(".hero-stat")).toHaveCount(3);

  await page.locator("#input").fill("hello");
  await page.locator("#send").click();
  await expect(page.locator(".msg.assistant .msg-text").last()).toContainText("Hey");
  await seedAndOpen(page, "```js\nconst answer = 42;\n```", "Code chat");

  const violations = await page.evaluate(() => window.__ttViolations);
  expect(violations).toEqual([]);
});

test("sanitizes injected markup into text", async ({ page }) => {
  const dialogs = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.addInitScript(() => {
    window.__alerted = false;
    window.alert = () => {
      window.__alerted = true;
    };
  });

  await seedChatWithMarkup(
    page,
    '<img src=x onerror="window.__alerted=true"><script>window.__alerted=true</script>**bold**',
  );

  await expect(page.locator(".msg.user .msg-text")).toContainText("bold");
  const rendered = await page.evaluate(() => ({
    images: document.querySelectorAll(".msg-text img").length,
    scripts: document.querySelectorAll(".msg-text script").length,
    alerted: window.__alerted,
    bold: document.querySelectorAll(".msg-text strong").length,
  }));
  expect(rendered.images).toBe(0);
  expect(rendered.scripts).toBe(0);
  expect(rendered.alerted).toBe(false);
  expect(rendered.bold).toBeGreaterThan(0);
  expect(dialogs).toEqual([]);
});

test("keeps inline SVG icons and code blocks working under the policy", async ({ page }) => {
  await open(page);

  // Welcome view icons are inline SVG inserted through the policy.
  await expect(page.locator(".hero-stat svg use").first()).toHaveCount(1);
  await expect(page.locator("#open-settings")).toBeVisible();
  const iconHref = await page.locator(".hero-stat svg use").first().getAttribute("href");
  expect(iconHref).toMatch(/^#i-/);

  await seedChatWithMarkup(page, "```js\nconst a = 1;\n```");
  await expect(page.locator(".msg-text .code-block .code-copy svg use")).toHaveCount(1);
  // `js` maps to the `javascript` fence id, so the highlight path ran.
  await expect(page.locator(".msg-text .code-block")).toHaveAttribute(
    "data-language",
    "javascript",
  );
});
