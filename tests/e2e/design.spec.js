import { expect, test } from "@playwright/test";

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

async function welcomeLayout(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const scroller = document.querySelector(".chat-scroll");
    const composer = document.querySelector(".composer-wrap").getBoundingClientRect();
    const eyebrow = document.querySelector(".welcome .eyebrow").getBoundingClientRect();
    const scrollerBox = scroller.getBoundingClientRect();
    return {
      overflowX: root.scrollWidth - root.clientWidth,
      scrollTop: Math.round(scroller.scrollTop),
      composerGap: Math.round(window.innerHeight - composer.bottom),
      eyebrowClipped: eyebrow.top < scrollerBox.top - 1,
      theme: root.dataset.theme,
    };
  });
}

test("desktop shell renders the hero welcome without overflow or clipped content", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "New chat" })).toBeVisible();
  await expect(page.locator(".welcome .eyebrow")).toBeVisible();
  await expect(page.locator(".welcome h2")).toBeVisible();
  await expect(page.locator(".hero-orb")).toBeVisible();
  await expect(page.locator(".hero-stat")).toHaveCount(3);
  await expect(page.locator(".suggestion")).toHaveCount(5);

  const layout = await welcomeLayout(page);
  expect(layout.overflowX).toBe(0);
  expect(layout.scrollTop).toBe(0);
  expect(layout.composerGap).toBe(0);
  expect(layout.eyebrowClipped).toBe(false);

  // The sidebar is permanent on desktop, so the phone-only close button must stay hidden.
  await expect(page.locator(".sidebar-close")).toBeHidden();
});

test("phone welcome starts at the top and the drawer opens and closes cleanly", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto("/");

  await expect(page.locator(".hero-orb")).toBeHidden();
  await expect(page.locator(".welcome .eyebrow")).toBeVisible();
  await expect(page.locator(".suggestion")).toHaveCount(5);

  const welcome = await welcomeLayout(page);
  expect(welcome.overflowX).toBe(0);
  expect(welcome.scrollTop).toBe(0);
  expect(welcome.eyebrowClipped).toBe(false);

  await page.locator("#open-sidebar").click();
  await expect(page.locator("#sidebar")).toHaveClass(/open/);
  await expect(page.locator("#scrim")).toBeVisible();

  await page.locator(".sidebar-close").click();
  await expect(page.locator("#sidebar")).not.toHaveClass(/open/);
  await expect(page.locator("#scrim")).toBeHidden();
});

test("theme toggle swaps palettes and the choice survives a reload", async ({ page }) => {
  await page.goto("/");

  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== "dark") {
    await page.locator("#theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  }
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    "rgb(5, 8, 10)",
  );

  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    "rgb(242, 245, 239)",
  );

  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("disables decorative animation", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      true,
    );

    for (const selector of [".hero-orb", ".brand-mark", ".welcome .eyebrow"]) {
      const animation = await page.locator(selector).evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          name: style.animationName,
          duration: Number.parseFloat(style.animationDuration),
        };
      });
      const stillAnimates = animation.name !== "none" && animation.duration > 0.01;
      expect(stillAnimates, `${selector}: ${JSON.stringify(animation)}`).toBe(false);
    }
  });
});

test("conversation keeps messages aligned and the composer pinned", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/");

  await page.locator("#input").fill("hello");
  await page.locator("#send").click();
  await expect(page.locator(".msg.assistant .msg-text").last()).not.toHaveClass(/streaming/);

  const layout = await page.evaluate(() => {
    const composer = document.querySelector(".composer-wrap").getBoundingClientRect();
    const user = getComputedStyle(document.querySelector(".msg.user"));
    const assistant = document.querySelector(".msg.assistant .msg-body").getBoundingClientRect();
    const column = document.querySelector(".messages").getBoundingClientRect();
    return {
      composerGap: Math.round(window.innerHeight - composer.bottom),
      userDirection: user.flexDirection,
      assistantWidth: Math.round(assistant.width),
      columnWidth: Math.round(column.width),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(layout.composerGap).toBe(0);
  expect(layout.userDirection).toBe("row-reverse");
  expect(layout.assistantWidth).toBeGreaterThan(0);
  expect(layout.assistantWidth).toBeLessThanOrEqual(layout.columnWidth);
  expect(layout.overflowX).toBe(0);
});
