import { describe, expect, it } from "vitest";
import {
  MAX_REPORT_URL,
  buildBugReportUrl,
  buildReportBody,
  readPlatform,
} from "../../src/feedback.js";
import { APP_VERSION } from "../../src/config.js";

const environment = {
  engine: "Built-in assistant (ready)",
  modelId: null,
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/142.0.0.0 Safari/537.36",
  platform: "Linux x86_64",
  language: "en-GB",
};

describe("buildBugReportUrl", () => {
  it("opens a new issue on the canonical repository", () => {
    const url = new URL(buildBugReportUrl({ environment }));
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/ashrafularefin78-prog/SERVERLESS-AI/issues/new");
    expect(url.searchParams.get("labels")).toBe("bug");
  });

  it("carries the environment the maintainer needs", () => {
    const url = new URL(buildBugReportUrl({ environment }));
    const body = url.searchParams.get("body");
    expect(body).toContain(`App version:** ${APP_VERSION}`);
    expect(body).toContain("Built-in assistant (ready)");
    expect(body).toContain("Chrome/142");
    expect(body).toContain("Linux x86_64");
    expect(body).toContain("en-GB");
    expect(url.searchParams.get("title")).toBe(`[Bug] LocalMind ${APP_VERSION}: `);
  });

  it("records the model only when one is loaded", () => {
    const withModel = new URL(
      buildBugReportUrl({ environment: { ...environment, modelId: "Qwen2.5-0.5B" } }),
    ).searchParams.get("body");
    expect(withModel).toContain("Qwen2.5-0.5B");

    const without = new URL(buildBugReportUrl({ environment })).searchParams.get("body");
    expect(without).not.toContain("**Model:**");
  });

  it("leaves the description empty for the reporter to fill in", () => {
    const body = buildReportBody(environment);
    expect(body).toContain("### What happened");
    expect(body).toContain("<!-- Replace this line");
    // Nothing resembling a message or a document may be pre-filled.
    expect(body).not.toMatch(/you said|assistant:|document:/i);
  });

  it("survives an empty environment without empty fields", () => {
    const url = new URL(buildBugReportUrl({ environment: {} }));
    const body = url.searchParams.get("body");
    expect(body).toContain(`App version:** ${APP_VERSION}`);
    expect(body).not.toContain("**Browser:**");
    expect(body).not.toContain("**Platform:**");
  });

  it("stays within a length a browser will keep", () => {
    const url = buildBugReportUrl({
      environment: { ...environment, userAgent: "x".repeat(4000) },
    });
    expect(url.length).toBeLessThanOrEqual(MAX_REPORT_URL);
  });

  it("respects a custom repository and trailing slash", () => {
    const url = new URL(buildBugReportUrl({ repoUrl: "https://example.test/fork/", environment }));
    expect(url.pathname).toBe("/fork/issues/new");
  });
});

describe("readPlatform", () => {
  it("prefers the reduced user-agent platform", () => {
    expect(readPlatform({ userAgentData: { platform: "Windows" }, platform: "Win32" })).toBe(
      "Windows",
    );
  });

  it("falls back to the legacy platform string", () => {
    expect(readPlatform({ platform: "MacIntel" })).toBe("MacIntel");
  });

  it("returns an empty string when nothing is available", () => {
    expect(readPlatform({})).toBe("");
  });
});
