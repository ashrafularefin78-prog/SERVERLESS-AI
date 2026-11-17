import { readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "vite";

// GitHub Pages cannot set response headers, so the production CSP ships as a meta tag.
// Hosts: model weights come from Hugging Face, compiled kernels from GitHub raw.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://*.xethub.hf.co https://raw.githubusercontent.com",
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
