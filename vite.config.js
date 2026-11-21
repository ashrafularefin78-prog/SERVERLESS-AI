import { readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "vite";

// GitHub Pages cannot set response headers, so the production CSP ships as a meta tag.
// Scripts stay same-origin; `wasm-unsafe-eval` is required to compile the on-device
// inference runtime. Connections are limited to the pinned model host (Hugging Face
// weights/CDN) and the model-library host, and only happen after the user opts in to
// a model download. Nothing else can be reached.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  // Every HTML sink goes through one audited policy in src/trusted-types.ts.
  // `dompurify` is allowed because DOMPurify creates its own internal policy.
  "require-trusted-types-for 'script'",
  "trusted-types localmind dompurify",
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
  build: {
    target: "es2022",
  },
});
