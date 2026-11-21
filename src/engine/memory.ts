// Releasing the on-device model's GPU memory.
//
// WebLLM owns its `GPUBuffer` and `GPUTexture` objects, so the app cannot call
// `destroy()` on them — reaching into the runtime's allocations would corrupt
// it. The supported release paths are `MLCEngine.unload()`, which drops the
// weights and the KV cache, and terminating the worker, which tears down the
// `GPUDevice` and everything allocated on it. `src/engine/local.ts` does both in
// `unload()`, and switching models calls it first.
//
// What is left to get wrong is *when* to release. A tab that keeps a 1 GB model
// resident forever is how browsers run out of VRAM or the OS kills the tab, so
// an idle tab gives the memory back.

/** How long a model may sit idle before its memory is released. */
export const MODEL_IDLE_RELEASE_MS = 10 * 60_000;

export interface IdleRelease {
  /** Report activity; restarts the countdown. */
  touch: () => void;
  /** Suspend the countdown (for example while a reply is streaming). */
  block: () => void;
  /** Resume after a block. */
  unblock: () => void;
  /** Stop and clear the timer. */
  stop: () => void;
  /** Whether a countdown is currently armed. */
  armed: () => boolean;
}

/**
 * A countdown that fires once after `idleMs` without `touch()`. Kept pure and
 * timer-injectable so the behavior is testable without waiting ten minutes.
 */
export function createIdleRelease({
  idleMs = MODEL_IDLE_RELEASE_MS,
  onRelease,
  onReleaseFailed,
  setTimer = (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimer = (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now = () => Date.now(),
}: {
  idleMs?: number;
  onRelease: () => void | Promise<void>;
  onReleaseFailed?: (error: unknown) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}): IdleRelease {
  let handle: unknown = null;
  let blocked = 0;
  let lastActivity = now();

  const disarm = () => {
    if (handle !== null) {
      clearTimer(handle);
      handle = null;
    }
  };

  const arm = () => {
    disarm();
    if (blocked > 0) return;
    const remaining = Math.max(0, idleMs - (now() - lastActivity));
    handle = setTimer(() => {
      handle = null;
      // Re-check: activity may have arrived between scheduling and firing.
      if (blocked > 0 || now() - lastActivity < idleMs) {
        arm();
        return;
      }
      try {
        const result = onRelease();
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch((error) => onReleaseFailed?.(error));
        }
      } catch (error) {
        onReleaseFailed?.(error);
      }
    }, remaining);
  };

  return {
    touch() {
      lastActivity = now();
      arm();
    },
    block() {
      blocked += 1;
      disarm();
    },
    unblock() {
      blocked = Math.max(0, blocked - 1);
      if (blocked === 0) arm();
    },
    stop() {
      disarm();
      blocked = 0;
    },
    armed: () => handle !== null,
  };
}

/**
 * Whether a page hide should release memory. A document going into the
 * back/forward cache is not going away, and unloading would make the restore
 * land on a dead model.
 */
export function shouldReleaseOnHide(event: { persisted?: boolean }): boolean {
  return event.persisted !== true;
}
