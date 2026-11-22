// License metadata for models the app can download.
//
// LocalMind does not infer a license from a model's name: family names are
// shared by forks, merges, and re-uploads with different terms. A model gets a
// verified entry only when there is a curated record with an authoritative URL;
// everything else is reported as unverified and asks the user to review the
// model card before downloading.

import LICENSE_TABLE from "./model-license-table.json" with { type: "json" };

export interface ModelLicense {
  /** Short identifier, or "unknown" when no verified record exists. */
  id: string;
  name: string;
  /** Authoritative license or model-card URL, when one is known. */
  url: string | null;
  /** True when the terms require explicit acceptance before use. */
  requiresAcceptance: boolean;
  source: "curated" | "unverified";
}

export interface LicenseSubject {
  id: string;
  label: string;
  baseModel?: string;
  url?: string;
}

interface CuratedLicense {
  /** Matched against the base model (or label) at the start, case-insensitively. */
  pattern: RegExp;
  id: string;
  name: string;
  url: string;
  requiresAcceptance: boolean;
}

/**
 * Only licenses that are verified and stable are listed. Each entry points at
 * the license or model card it comes from, so a reader can check it.
 */
const CURATED: CuratedLicense[] = LICENSE_TABLE.map((entry) => ({
  ...entry,
  pattern: new RegExp(entry.pattern, entry.flags),
}));

const UNVERIFIED: ModelLicense = {
  id: "unknown",
  name: "Not verified by LocalMind",
  url: null,
  requiresAcceptance: true,
  source: "unverified",
};

/** Hugging Face repo page for a pinned file URL, used as the model card link. */
export function modelCardUrl(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/^https:\/\/huggingface\.co\/([^/]+)\/([^/]+)\/resolve\//);
  return match ? `https://huggingface.co/${match[1]}/${match[2]}` : null;
}

export function licenseFor(subject: LicenseSubject): ModelLicense {
  const name = (subject.baseModel ?? subject.label ?? "").trim();

  for (const entry of CURATED) {
    if (entry.pattern.test(name)) {
      return {
        id: entry.id,
        name: entry.name,
        url: entry.url,
        requiresAcceptance: entry.requiresAcceptance,
        source: "curated",
      };
    }
  }

  // Unknown terms still gate the download, but the app never guesses the
  // license: it points at the model card and says so plainly.
  return { ...UNVERIFIED, url: modelCardUrl(subject.url) };
}

/** True when this download must be explicitly accepted first. */
export function needsLicenseAcceptance(subject: LicenseSubject): boolean {
  return licenseFor(subject).requiresAcceptance;
}

/**
 * Acceptance is remembered per license, so every Llama derivative shares one
 * acknowledgement, while each unverified model needs its own.
 */
export function licenseAcceptanceKey(subject: LicenseSubject): string {
  const license = licenseFor(subject);
  return license.source === "unverified" ? `unknown:${subject.id}` : license.id;
}

export function isLicenseAccepted(subject: LicenseSubject, accepted: readonly string[]): boolean {
  return !needsLicenseAcceptance(subject) || accepted.includes(licenseAcceptanceKey(subject));
}
