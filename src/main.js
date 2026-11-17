import { boot } from "./app.js";

boot().catch((error) => {
  console.error("LocalMind failed to start", error);
  showFatalError(error);
});

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(new URL("sw.js", document.baseURI).href)
      .catch((error) => console.warn("Service worker registration failed", error));
  });
}

function showFatalError(error) {
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
  body.textContent =
    String(error?.message || error || "Unknown error.") +
    " Reload the page to try again. If the problem continues, clear this site's data.";

  const hint = document.createElement("p");
  hint.className = "fatal-hint";
  hint.textContent = "Reloading usually fixes a transient startup problem. If not, clear this site's data.";

  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "btn primary";
  reload.textContent = "Reload";
  reload.addEventListener("click", () => window.location.reload());

  card.append(title, body, hint, reload);
  overlay.append(card);
  document.body.append(overlay);
}
