import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.js", "tests/evals/**/*.test.js"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      // Every source module, including the ones only a browser can exercise:
      // app.ts, the renderer, the workers, IndexedDB access, and the model
      // runtimes are 0% here and covered by the Playwright suite instead. Keeping
      // them in the report is deliberate — the number is honest about what the
      // unit suite reaches, and the thresholds below are the floor it must hold.
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/types.ts"],
      // Measured with `npm run test:coverage` across the whole src tree, which
      // includes the browser-only modules. CI runs on Linux and reports slightly
      // lower numbers than a Windows checkout (38.29 / 39.87 / 36.42 / 39.14 in the
      // last run), so the floor is set from the CI figure with a margin rather than
      // from the local one - a threshold that passes locally and fails on CI teaches
      // people to ignore it. The rest of the tree is exercised by the Playwright
      // suite. Raise these as unit coverage improves; never lower them to make a
      // change pass - if a new feature cannot be tested here, test its pure half
      // (as `model-storage.test.js` does with fake OPFS and Cache Storage) rather
      // than moving the floor.
      thresholds: {
        statements: 38,
        branches: 39,
        functions: 36,
        lines: 39,
      },
    },
  },
});
