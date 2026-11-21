import { expect, test } from "@playwright/test";
import { GGUF_MODELS, WEBLLM_MODELS } from "../../src/engine/models.js";
import { pickModel } from "./helpers.js";

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
      composerGap: Math.max(0, Math.round(window.innerHeight - composer.bottom)),
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
    "rgb(16, 11, 18)",
  );

  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    "rgb(255, 247, 248)",
  );

  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("red palettes and ambient interface animations are active", async ({ page }) => {
  await page.goto("/");
  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== "dark") {
    await page.locator("#theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  }

  const darkPalette = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return ["--accent", "--accent-2", "--accent-3"].map((name) =>
      styles.getPropertyValue(name).trim(),
    );
  });
  expect(darkPalette).toEqual(["#f0445e", "#ff6b68", "#ff9caf"]);

  const animations = await page.evaluate(() =>
    [".aurora-a", ".brand-mark", ".welcome h2 span", ".suggestion"].map(
      (selector) => getComputedStyle(document.querySelector(selector)).animationName,
    ),
  );
  expect(animations).toEqual(["aurora-a", "brand-breathe", "red-gradient", "suggestion-in"]);

  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const lightPalette = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return ["--accent", "--accent-2", "--accent-3"].map((name) =>
      styles.getPropertyValue(name).trim(),
    );
  });
  expect(lightPalette).toEqual(["#c52240", "#e74855", "#a61836"]);
});

test("light theme faint text meets AA contrast", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const contrast = await page.evaluate(() => {
    const channel = (value) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const luminance = ([r, g, b]) =>
      0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    const hex = (value) => {
      const clean = value.trim().replace("#", "");
      return [0, 2, 4].map((i) => Number.parseInt(clean.slice(i, i + 2), 16));
    };
    const styles = getComputedStyle(document.documentElement);
    const faint = luminance(hex(styles.getPropertyValue("--faint")));
    const bg = luminance(hex(styles.getPropertyValue("--bg")));
    return (Math.max(faint, bg) + 0.05) / (Math.min(faint, bg) + 0.05);
  });

  expect(contrast).toBeGreaterThanOrEqual(4.5);
});

test("model picker options are readable in both themes", async ({ page }) => {
  const optionContrast = () =>
    page.evaluate(() => {
      const option = document.querySelector("#model-list .model-option");
      const pop = document.querySelector("#model-pop");
      const style = getComputedStyle(option);
      const popStyle = pop ? getComputedStyle(pop) : style;
      const rgb = (value) => value.match(/\d+/g).slice(0, 3).map(Number);
      const channel = (value) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      const luminance = ([r, g, b]) =>
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      const fg = luminance(rgb(style.color));
      const bg = luminance(rgb(popStyle.backgroundColor));
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });

  await page.goto("/");
  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== "dark") {
    await page.locator("#theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  }
  await page.locator("#open-settings").click();
  await page.locator("#model-trigger").click();
  expect(await optionContrast()).toBeGreaterThanOrEqual(4.5);

  await page.locator("#settings-dialog [data-close-dialog]").click();
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator("#open-settings").click();
  await page.locator("#model-trigger").click();
  expect(await optionContrast()).toBeGreaterThanOrEqual(4.5);
});

test("model picker filters by search and groups by family", async ({ page }) => {
  await page.goto("/");
  await page.locator("#open-settings").click();
  await page.locator("#model-trigger").click();
  await expect(page.locator("#model-search")).toBeVisible();
  await expect(page.locator("#model-count")).toHaveText(/models$/);
  await expect(page.locator(".model-section").first()).toBeVisible();
  await expect(page.locator(".model-group").first()).toBeVisible();
  expect(await page.locator("#model-list [data-model-id]").count()).toBeGreaterThan(
    GGUF_MODELS.length + 1,
  );
  await expect(page.locator("#model-empty")).toBeHidden();

  await page.locator("#model-search").fill("granite 3.2");
  await expect(page.locator("#model-count")).toHaveText(/\d+ match/);
  const graniteModels = [...GGUF_MODELS, ...WEBLLM_MODELS].filter((model) =>
    /granite 3\.2/i.test(model.label),
  );
  expect(graniteModels.length).toBeGreaterThan(0);
  await expect(page.locator("#model-list .model-option")).toHaveCount(graniteModels.length);
  for (const row of await page.locator("#model-list .model-option").all()) {
    expect(await row.textContent()).toMatch(/granite/i);
  }
  await page.locator("#model-search").fill("zqzxqzx");
  await expect(page.locator("#model-empty")).toBeVisible();
  await expect(page.locator("#model-list [data-model-id]")).toHaveCount(0);

  await page.locator("#model-search").fill("zqzxqzx");
  await expect(page.locator("#model-empty")).toBeVisible();
  await expect(page.locator("#model-list [data-model-id]")).toHaveCount(0);
  await page.locator("#model-search").fill("");
  await expect(page.locator("#model-count")).toHaveText(/models$/);
  await expect(page.locator("#model-list [data-model-id]")).toHaveCount(
    GGUF_MODELS.length + WEBLLM_MODELS.length + 1,
  );
  const families = await page
    .locator("#model-list .model-group span")
    .evaluateAll((nodes) => nodes.map((n) => n.textContent?.trim() ?? ""));
  expect(families.some((f) => /^Qwen2\.5$/.test(f))).toBe(true);
  expect(families.some((f) => /^Llama 3\.2$/.test(f))).toBe(true);
  await pickModel(page, GGUF_MODELS[0].id);
  await expect(page.locator("#model-select")).toHaveValue(GGUF_MODELS[0].id);
  await page.locator("#settings-dialog [data-close-dialog]").click();
});

test("model picker family list is exhaustive", async ({ page }) => {
  await page.goto("/");
  await page.locator("#open-settings").click();
  await page.locator("#model-trigger").click();
  const families = await page
    .locator("#model-list .model-group span")
    .evaluateAll((nodes) => nodes.map((n) => n.textContent?.trim() ?? ""));
  expect(families.some((f) => /^Qwen2\.5$/.test(f))).toBe(true);
  expect(families.some((f) => /^Llama 3\.2$/.test(f))).toBe(true);

  await page.locator("#model-search").fill("");
  await expect(page.locator("#model-list [data-model-id]")).toHaveCount(
    GGUF_MODELS.length + WEBLLM_MODELS.length + 1,
  );

  await pickModel(page, GGUF_MODELS[0].id);
  await expect(page.locator("#model-select")).toHaveValue(GGUF_MODELS[0].id);

  await page.locator("#settings-dialog [data-close-dialog]").click();
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
