// The local feedback path.
//
// The app has no telemetry and no feedback endpoint, so "report a bug" opens a
// pre-filled GitHub issue in a new tab. Everything in the link is information the
// user can already see in the app: the version, which engine is running, the
// browser's own user agent string, and the platform. Nothing is sent until they
// press submit on GitHub, and they can edit or delete any of it there.
//
// Chat text, memory notes, document titles, and vault contents are never added,
// and the link is short enough to survive URL length limits on every browser.

import { APP_NAME, APP_VERSION, REPO_URL } from "./config.js";

/** GitHub stops accepting much beyond this, and long links get truncated in clients. */
export const MAX_REPORT_URL = 6000;

export interface EnvironmentReport {
  version?: string;
  engine?: string;
  modelId?: string | null;
  userAgent?: string;
  platform?: string;
  language?: string;
}

export interface BugReportInput {
  repoUrl?: string;
  environment: EnvironmentReport;
}

const TEMPLATE_BODY_LIMIT = 3200;

function line(label: string, value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return `**${label}:** ${trimmed}`;
}

/**
 * The body mirrors the issue form's fields so a report filed this way still
 * contains what a maintainer needs: what happened, and on what.
 */
export function buildReportBody(environment: EnvironmentReport): string {
  const environmentLines = [
    line("App version", environment.version ?? APP_VERSION),
    line("Engine", environment.engine),
    line("Model", environment.modelId),
    line("Browser", environment.userAgent),
    line("Platform", environment.platform),
    line("Language", environment.language),
  ].filter(Boolean);

  const body = [
    "### What happened",
    "",
    "<!-- Replace this line with what you expected and what happened instead. -->",
    "",
    "### Steps to reproduce",
    "",
    "1. ",
    "",
    "### Environment",
    "",
    ...environmentLines,
    "",
    "_Remove anything from the environment list you would rather not share. If the",
    "problem involves an on-device model, Settings → Local diagnostics has a",
    '"Copy diagnostics" button; paste the result here. Do not include passwords,',
    "chat contents, or document text._",
  ].join("\n");

  return body.slice(0, TEMPLATE_BODY_LIMIT);
}

/**
 * A blank-issue URL rather than the YAML form: issue forms ignore pre-filled
 * bodies, and the point of this link is to carry the environment with it.
 */
export function buildBugReportUrl({ repoUrl = REPO_URL, environment }: BugReportInput): string {
  const base = repoUrl.replace(/\/+$/, "");
  const title = `[Bug] ${APP_NAME} ${environment.version ?? APP_VERSION}: `;
  const params = new URLSearchParams({
    title,
    body: buildReportBody(environment),
    labels: "bug",
  });
  const url = `${base}/issues/new?${params.toString()}`;
  return url.length > MAX_REPORT_URL ? url.slice(0, MAX_REPORT_URL) : url;
}

/** Platform string for the report, from the browser rather than the build. */
export function readPlatform(nav: {
  userAgentData?: { platform?: string };
  platform?: string;
}): string {
  return nav.userAgentData?.platform || nav.platform || "";
}
