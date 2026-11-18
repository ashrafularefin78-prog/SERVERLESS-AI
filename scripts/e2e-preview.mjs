// Run the Playwright suite against the production build so the injected CSP,
// service worker, and hashed assets are exercised too.
import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "npx.cmd playwright test" : "npx playwright test";
const child = spawn(command, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PLAYWRIGHT_PREVIEW: "1" },
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
