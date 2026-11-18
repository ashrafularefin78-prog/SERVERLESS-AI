import { readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "vite";

// GitHub Pages cannot set response headers, so the production CSP ships as a meta tag.
// This build is model-free, so scripts and connections stay same-origin. Enabling the
// dormant WebLLM/wllama backends again requires adding 'wasm-unsafe-eval' and the
// Hugging Face/GitHub download origins back to this policy.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "inject-csp",
      apply: "build",
      transformIndexHtml(html) {
        return html.replace(
          "<!-- CONTENT_SECURITY_POLICY -->",
          `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        );
      },
    },
    {
      name: "version-service-worker",
      apply: "build",
      async closeBundle() {
        const file = new URL("./dist/sw.js", import.meta.url);
        try {
          const source = await readFile(file, "utf8");
          const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
          await writeFile(
            file,
            source.replace(
              /const VERSION = "localmind-[^"]*";/,
              `const VERSION = "localmind-${stamp}";`,
            ),
          );
        } catch {
          // Public files may be copied after this hook in future Vite versions.
        }
      },
    },
  ],
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 8000,
  },
  optimizeDeps: {
    exclude: ["@mlc-ai/web-llm"],
  },
});
