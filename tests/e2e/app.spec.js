import { expect, test } from "@playwright/test";

test("sends a message and streams a local reply", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "New chat" })).toBeVisible();

  await page.locator("#input").fill("hello");
  await page.locator("#send").click();

  await expect(page.locator(".msg.user .msg-text")).toContainText("hello");
  const assistant = page.locator(".msg.assistant .msg-text").last();
  await expect(assistant).toContainText("Hey");
  await expect(assistant).not.toHaveClass(/streaming/);

  expect(errors).toEqual([]);
});

test("remembers and forgets a note through chat and settings", async ({ page }) => {
  await page.goto("/");

  await page.locator("#input").fill("remember my favorite color is teal");
  await page.locator("#send").click();

  const reply = page.locator(".msg.assistant .msg-text").last();
  await expect(reply).toContainText("Got it, I'll remember that my favorite color is teal");
  await expect(reply).not.toHaveClass(/streaming/);

  await page.locator("#open-settings").click();
  await expect(page.locator("#memory-list .memory-item")).toContainText(
    "my favorite color is teal",
  );
  await page.locator("#settings-dialog [data-close-dialog]").click();

  await page.locator("#input").fill("forget favorite color");
  await page.locator("#send").click();
  await expect(page.locator(".msg.assistant .msg-text").last()).toContainText(
    "Done, I forgot 1 note matching that",
  );

  await page.locator("#open-settings").click();
  await expect(page.locator("#memory-list")).toContainText("Nothing remembered yet.");
});

test("clears chats and settings from the browser", async ({ page }) => {
  await page.goto("/");

  await page.locator("#input").fill("hello");
  await page.locator("#send").click();
  await expect(page.locator(".msg.assistant .msg-text").last()).not.toHaveClass(/streaming/);

  await page.locator("#open-settings").click();
  await page.locator("#clear-data").click();
  await expect(page.locator("#confirm-dialog")).toBeVisible();

  const reloaded = page.waitForEvent("load");
  await page.locator("#confirm-ok").click();
  await reloaded;

  await expect(page.locator(".msg")).toHaveCount(0);
  await expect(page.locator("#chat-title")).toHaveText("New chat");

  await page.locator("#open-settings").click();
  await expect(page.locator("#memory-list")).toContainText("Nothing remembered yet.");
});

test("makes no cross-origin requests during a chat", async ({ page }) => {
  const external = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4173") external.push(request.url());
  });

  await page.goto("/");
  await page.locator("#input").fill("tell me a joke");
  await page.locator("#send").click();
  await expect(page.locator(".msg.assistant .msg-text").last()).not.toHaveClass(/streaming/);

  expect(external).toEqual([]);
});
