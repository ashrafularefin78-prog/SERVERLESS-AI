import { expect, test, devices } from "@playwright/test";
import { GGUF_MODELS } from "../../src/engine/models.js";
import { lightestCpuModel } from "../../src/engine/device.js";
import { pickModel } from "./helpers.js";

// `defaultBrowserType` may only be set in the config, so copy the device's
// browser context options explicitly.
const pixel = devices["Pixel 5"];
const pixel5 = {
  viewport: pixel.viewport,
  userAgent: pixel.userAgent,
  deviceScaleFactor: pixel.deviceScaleFactor,
  isMobile: pixel.isMobile,
  hasTouch: pixel.hasTouch,
};

const bySize = [...GGUF_MODELS].sort((a, b) => a.downloadBytes - b.downloadBytes);
const lightest = lightestCpuModel(GGUF_MODELS);
const heaviest = bySize.at(-1);

async function stubDevice(page, { gpu, memory }) {
  await page.addInitScript(
    ({ gpu, memory }) => {
      Object.defineProperty(navigator, "gpu", {
        configurable: true,
        value: gpu
          ? {
              requestAdapter: async () => ({
                features: new Set(["shader-f16"]),
                limits: { maxStorageBufferBindingSize: 1024 * 1024 * 1024 },
              }),
            }
          : undefined,
      });
      if (memory !== null) {
        Object.defineProperty(navigator, "deviceMemory", {
          configurable: true,
          value: memory,
        });
      }
    },
    { gpu, memory },
  );
}

test.describe("touch laptop", () => {
  test.use({ hasTouch: true, viewport: { width: 1280, height: 900 } });

  test("is not treated as a phone", async ({ page }) => {
    await stubDevice(page, { gpu: false, memory: 8 });
    await page.goto("/");
    await page.locator("#open-settings").click();

    await expect(page.locator("#device-check-spec")).not.toContainText("phone/tablet");
    await expect(page.locator("#device-check-advice")).toContainText("lightest real model");
    await expect(page.locator("#device-check-advice")).toContainText("Qwen3 0.6B");
  });
});

test.describe("phone without WebGPU", () => {
  test.use(pixel5);

  test("recommends the built-in assistant", async ({ page }) => {
    await stubDevice(page, { gpu: false, memory: 4 });
    await page.goto("/");
    await page.locator("#open-sidebar").click();
    await page.locator("#open-settings").click();

    await expect(page.locator("#device-check")).toBeVisible();
    await expect(page.locator("#device-check-spec")).toContainText("No WebGPU");
    await expect(page.locator("#device-check-spec")).toContainText("phone/tablet");
    await expect(page.locator("#device-check-advice")).toContainText("built-in assistant");
    await expect(page.locator("#device-check-advice")).toContainText("Qwen3 0.6B");
    await expect(page.locator("#device-check-advice")).not.toContainText("Claude");
    await expect(page.locator("#device-recommend")).toBeDisabled();
    await expect(page.locator("#device-recommend")).toHaveText("Recommended model selected");
  });
});

test("recommends and selects the lightest CPU model on a desktop without WebGPU", async ({
  page,
}) => {
  await stubDevice(page, { gpu: false, memory: 8 });
  await page.goto("/");
  await page.locator("#open-settings").click();

  await expect(page.locator("#device-check-spec")).toContainText("No WebGPU");
  await expect(page.locator("#device-check-advice")).toContainText("lightest real model");
  await expect(page.locator("#device-check-advice")).toContainText("Qwen3 0.6B");
  await expect(page.locator("#device-check-advice")).not.toContainText("Claude");
  const recommend = page.locator("#device-recommend");
  await expect(recommend).toBeEnabled();

  await recommend.click();
  await expect(page.locator("#model-select")).toHaveValue(lightest.id);
  await expect(page.locator("#model-status")).toContainText("is not downloaded yet");
  await expect(page.locator("#model-load")).toBeEnabled();
  await expect(page.locator("#model-warning")).toBeHidden();
});

test("stays quiet when WebGPU is available", async ({ page }) => {
  await stubDevice(page, { gpu: true, memory: 8 });
  await page.goto("/");
  await page.locator("#open-settings").click();

  await expect(page.locator("#device-check-spec")).toContainText("WebGPU available");
  await expect(page.locator("#device-check-advice")).toBeHidden();
  await expect(page.locator("#device-recommend")).toBeHidden();
});

test("warns and asks before a download that cannot fit", async ({ page }) => {
  await stubDevice(page, { gpu: false, memory: 2 });
  await page.goto("/");
  await page.locator("#open-settings").click();

  await pickModel(page, heaviest.id);
  await expect(page.locator("#model-warning")).toBeVisible();
  await expect(page.locator("#model-warning")).toContainText("free memory");

  await page.locator("#model-load").click();
  await expect(page.locator("#confirm-dialog")).toBeVisible();
  await expect(page.locator("#confirm-title")).toContainText("may not fit");
  await expect(page.locator("#confirm-body")).toContainText("Download");

  await page.locator("#confirm-cancel").click();
  await expect(page.locator("#confirm-dialog")).toBeHidden();
  await expect(page.locator("#model-load")).toHaveText("Download and load");

  await pickModel(page, lightest.id);
  await expect(page.locator("#model-warning")).toBeHidden();
});

test.describe("iPhone", () => {
  const iphone = devices["iPhone 13"];
  test.use({
    viewport: iphone.viewport,
    userAgent: iphone.userAgent,
    deviceScaleFactor: iphone.deviceScaleFactor,
    isMobile: iphone.isMobile,
    hasTouch: iphone.hasTouch,
  });

  test("warns that a large model exceeds a Safari tab's memory", async ({ page }) => {
    // iOS reports no deviceMemory at all, which is exactly the case the tab
    // budget has to cover.
    await stubDevice(page, { gpu: false, memory: null });
    await page.goto("/");
    // The phone layout keeps settings behind the history drawer.
    await page.locator("#open-sidebar").click();
    await page.locator("#open-settings").click();

    const big = bySize.find((model) => model.downloadBytes > 700_000_000) ?? heaviest;
    await pickModel(page, big.id);
    await expect(page.locator("#model-warning")).toBeVisible();
    await expect(page.locator("#model-warning")).toContainText("Safari on iOS");

    // The smallest real model is still tight against a 1 GB tab, but it is no
    // longer a blocker, so the warning drops from danger to advice.
    await pickModel(page, lightest.id);
    await expect(page.locator("#model-warning")).not.toHaveClass(/is-danger/);
    await expect(page.locator("#model-warning")).toContainText("Safari tab");
  });
});
