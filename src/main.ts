import { boot } from "./app.js";
import { trustedScriptURL } from "./trusted-types.js";

boot().catch((error) => {
  console.error("LocalMind failed to start", error);
  showFatalError(error);
});

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(trustedScriptURL(new URL("sw.js", document.baseURI).href) as string)
      .catch((error) => console.warn("Service worker registration failed", error));
  });
}

function showFatalError(error: unknown) {
  const existing = document.getElementById("fatal-error");
  if (existing) return;

  const overlay = document.createElement("div");
  overlay.id = "fatal-error";
  overlay.className = "fatal";

  const card = document.createElement("div");
  card.className = "fatal-card";

  const title = document.createElement("h1");
  title.textContent = "LocalMind could not start";

  const body = document.createElement("p");
  const raw = error instanceof Error ? error.message : error;
  body.textContent =
    String(raw || error || "Unknown error.") +
    " Reload the page to try again. If the problem continues, clear this site's data.";

  const hint = document.createElement("p");
  hint.className = "fatal-hint";
  hint.textContent =
    "Reloading usually fixes a transient startup problem. If not, clear this site's data.";

  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "btn primary";
  reload.textContent = "Reload";
  reload.addEventListener("click", () => window.location.reload());

  card.append(title, body, hint, reload);
  overlay.append(card);
  document.body.append(overlay);
}
