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
      // includes the browser-only modules: 37.27% statements, 38.98% branches,
      // 35.29% functions, 38.13% lines. The rest is exercised by the Playwright
      // suite. Raise these as unit coverage improves; never lower them to make a
      // change pass.
      thresholds: {
        statements: 37,
        branches: 38,
        functions: 35,
        lines: 38,
      },
    },
  },
});
