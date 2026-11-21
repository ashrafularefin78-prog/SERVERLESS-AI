// Offline ("kill switch") mode: while it is on, the service worker refuses every
// cross-origin request, so the tab cannot phone home even if a script tried to.
//
// The marker lives in Cache Storage because the page and the service worker
// share it and it survives reloads. `public/sw.js` cannot import this module
// (it ships as a static file), so it mirrors `shouldBlockRequest`; the browser
// test in tests/e2e/app.spec.js checks the real contract end to end.

export const OFFLINE_MODE_CACHE = "localmind-offline-mode";
export const OFFLINE_MODE_KEY = "/__localmind-offline-mode__";
export const OFFLINE_BLOCKED_STATUS = 503;

/** True when this URL leaves the app's origin. Unparseable URLs count as remote. */
export function isCrossOrigin(url: string, appOrigin: string): boolean {
  try {
    return new URL(url, appOrigin).origin !== new URL(appOrigin).origin;
  } catch {
    return true;
  }
}

/** The whole policy: only cross-origin traffic is blocked, and only when armed. */
export function shouldBlockRequest({
  url,
  appOrigin,
  offlineMode,
}: {
  url: string;
  appOrigin: string;
  offlineMode: boolean;
}): boolean {
  return offlineMode && isCrossOrigin(url, appOrigin);
}

/** Can this browser actually enforce the switch? Cache Storage is required. */
export function offlineModeSupported(): boolean {
  return typeof caches !== "undefined";
}

export async function readOfflineModeMarker(): Promise<boolean> {
  if (!offlineModeSupported()) return false;
  try {
    const cache = await caches.open(OFFLINE_MODE_CACHE);
    return Boolean(await cache.match(OFFLINE_MODE_KEY));
  } catch {
    return false;
  }
}

export async function writeOfflineModeMarker(enabled: boolean): Promise<boolean> {
  if (!offlineModeSupported()) return false;
  try {
    const cache = await caches.open(OFFLINE_MODE_CACHE);
    if (enabled) {
      await cache.put(
        OFFLINE_MODE_KEY,
        new Response(String(Date.now()), {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
      );
    } else {
      await cache.delete(OFFLINE_MODE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask the browser to activate an updated worker immediately, so a freshly
 * armed switch takes effect without waiting for the page to be closed.
 */
export async function refreshServiceWorker(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    await registration?.update?.();
  } catch {
    // Updates are best effort; the active worker re-reads the marker per request.
  }
}
