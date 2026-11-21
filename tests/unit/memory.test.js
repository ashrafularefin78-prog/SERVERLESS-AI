import { describe, expect, it, vi } from "vitest";
import {
  MODEL_IDLE_RELEASE_MS,
  createIdleRelease,
  shouldReleaseOnHide,
} from "../../src/engine/memory.js";

function harness({ idleMs = 1000, now = 0 } = {}) {
  const released = [];
  const failures = [];
  let clock = now;
  let scheduled = null;
  const api = createIdleRelease({
    idleMs,
    onRelease: () => released.push(clock),
    onReleaseFailed: (error) => failures.push(error),
    now: () => clock,
    setTimer: (fn, ms) => {
      scheduled = { fn, ms };
      return scheduled;
    },
    clearTimer: (handle) => {
      if (scheduled === handle) scheduled = null;
    },
  });
  return {
    api,
    released,
    failures,
    get pending() {
      return scheduled;
    },
    advance(ms) {
      clock += ms;
      return scheduled;
    },
    get clock() {
      return clock;
    },
  };
}

describe("createIdleRelease", () => {
  it("arms a countdown that releases once", () => {
    const h = harness();
    h.api.touch();
    expect(h.pending.ms).toBe(1000);
    h.advance(1000);
    const timer = h.pending;
    timer.fn();
    expect(h.released).toEqual([1000]);
    expect(h.api.armed()).toBe(false);
  });

  it("restarts the countdown on activity", () => {
    const h = harness();
    h.api.touch();
    h.advance(600);
    h.api.touch();
    expect(h.pending.ms).toBe(1000);
    h.advance(600);
    expect(h.released).toEqual([]);
  });

  it("re-arms instead of releasing when activity lands before the timer fires", () => {
    const h = harness();
    h.api.touch();
    const stale = h.pending;
    h.advance(400);
    h.api.touch();
    stale.fn(); // a cancelled timer that still fires must not release
    expect(h.released).toEqual([]);
    // Activity restarts the whole window, not the remainder of the old one.
    expect(h.pending.ms).toBe(1000);
  });

  it("does not release while blocked, and resumes afterwards", () => {
    const h = harness();
    h.api.touch();
    h.api.block();
    expect(h.api.armed()).toBe(false);
    expect(h.pending).toBeNull();
    h.api.unblock();
    expect(h.api.armed()).toBe(true);
    expect(h.released).toEqual([]);
  });

  it("stays blocked until every block is released", () => {
    const h = harness();
    h.api.block();
    h.api.block();
    h.api.unblock();
    expect(h.api.armed()).toBe(false);
    h.api.unblock();
    expect(h.api.armed()).toBe(true);
  });

  it("stop clears the countdown", () => {
    const h = harness();
    h.api.touch();
    h.api.stop();
    expect(h.api.armed()).toBe(false);
    expect(h.pending).toBeNull();
  });

  it("reports a failing release instead of throwing", async () => {
    const failures = [];
    const api = createIdleRelease({
      idleMs: 10,
      onRelease: () => Promise.reject(new Error("unload failed")),
      onReleaseFailed: (error) => failures.push(error),
      setTimer: (fn) => {
        queueMicrotask(fn);
        return 1;
      },
      clearTimer: () => {},
    });
    api.touch();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(failures.map((error) => error.message)).toEqual(["unload failed"]);
  });

  it("uses a ten minute default, which is well past any generation", () => {
    expect(MODEL_IDLE_RELEASE_MS).toBe(600_000);
  });
});

describe("shouldReleaseOnHide", () => {
  it("releases when the page is really gone", () => {
    expect(shouldReleaseOnHide({ persisted: false })).toBe(true);
    expect(shouldReleaseOnHide({})).toBe(true);
  });

  it("keeps the model when the page goes into the back/forward cache", () => {
    // Restoring would otherwise show a dead model.
    expect(shouldReleaseOnHide({ persisted: true })).toBe(false);
  });
});

describe("timer injection", () => {
  it("uses the provided clock rather than wall time", () => {
    vi.useFakeTimers();
    const released = [];
    const api = createIdleRelease({
      idleMs: 50,
      onRelease: () => released.push("released"),
    });
    api.touch();
    vi.advanceTimersByTime(60);
    expect(released).toEqual(["released"]);
    vi.useRealTimers();
  });
});
