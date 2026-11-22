import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { checkWorkflow, checkWorkflows, actionRefs } from "../../scripts/check-workflows.mjs";

const pinned = (repo) => `${repo}@${"a".repeat(40)} # v1`;

describe("workflow guard", () => {
  it("accepts a pinned, runnable workflow", () => {
    const source = `
name: Test
on: [push]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: ${pinned("actions/checkout")}
      - run: npm test
`;
    expect(checkWorkflow("test.yml", source)).toEqual([]);
  });

  it("rejects an action pinned to a tag", () => {
    const source = `
name: Test
on: [push]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
`;
    expect(checkWorkflow("test.yml", source)).toContain(
      'test.yml: "actions/checkout@v5" is not pinned to a commit SHA',
    );
  });

  it("rejects a pin without a version comment", () => {
    // Dependabot needs the comment to know which version to move to.
    const source = `
name: Test
on: [push]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${"b".repeat(40)}
`;
    expect(checkWorkflow("test.yml", source)).toContain(
      `test.yml: "actions/checkout@${"b".repeat(40)}" has no "# vX.Y.Z" version comment`,
    );
  });

  it("rejects a job with neither a runner nor a reusable workflow", () => {
    const source = `
name: Test
on: [push]
jobs:
  quality:
    steps:
      - run: npm test
`;
    expect(checkWorkflow("test.yml", source)).toContain(
      'test.yml: job "quality" has neither runs-on nor a reusable workflow',
    );
  });

  it("requires explicit permissions on a reusable workflow call", () => {
    const source = `
name: Test
on: [push]
permissions:
  contents: read
jobs:
  scan:
    uses: ${pinned("google/osv-scanner-action/.github/workflows/osv-scanner-reusable.yml")}
`;
    expect(checkWorkflow("test.yml", source)).toContain(
      'test.yml: job "scan" calls a reusable workflow without permissions',
    );
  });

  it("reports invalid YAML instead of throwing", () => {
    expect(checkWorkflow("broken.yml", "jobs: [unclosed\n  - a: b: c")[0]).toMatch(
      /^broken\.yml: not valid YAML/,
    );
  });

  it("reads the version comment the YAML parser drops", () => {
    const source = `
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - uses: ${pinned("actions/checkout")}
        with:
          fetch-depth: 0
`;
    expect(actionRefs(source)).toEqual([
      { ref: `actions/checkout@${"a".repeat(40)}`, comment: "# v1" },
    ]);
  });

  describe("the repository's own workflows", () => {
    let result;
    beforeAll(async () => {
      result = await checkWorkflows();
    });

    it("all parse, are pinned, and can actually start", () => {
      expect(result.problems).toEqual([]);
      expect(result.checked).toBeGreaterThan(0);
    });

    it("keeps the OSV job to the permissions its scan needs", async () => {
      // It used to call a reusable workflow, which needed `actions: read` granted
      // explicitly and `security-events: write` for a SARIF upload that then never
      // happened. Calling the scanner action directly needs to read the repo only.
      const source = await readFile(
        path.join(process.cwd(), ".github", "workflows", "ci.yml"),
        "utf8",
      );
      const job = source.slice(source.indexOf("  osv:"), source.indexOf("  e2e:"));
      expect(job).toMatch(/contents: read/);
      expect(job).not.toMatch(/security-events/);
      expect(job).not.toMatch(/actions: read/);
      expect(job).toMatch(/google\/osv-scanner-action\/osv-scanner-action@[0-9a-f]{40}/);
    });
  });
});

describe("osv-scanner.toml", () => {
  const source = () => readFile(path.join(process.cwd(), "osv-scanner.toml"), "utf8");

  it("gives every ignored advisory a reason and a future expiry", async () => {
    const text = await source();
    const entries = text.split("[[IgnoredVulns]]").slice(1);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const id = /id = "([^"]+)"/.exec(entry)?.[1];
      const reason = /reason = "([^"]+)"/.exec(entry)?.[1] ?? "";
      const until = /ignoreUntil = (\d{4})-(\d{2})-(\d{2})/.exec(entry);
      expect(id).toBeTruthy();
      expect(reason.length).toBeGreaterThan(60);
      expect(until).toBeTruthy();
      const expiry = new Date(`${until[1]}-${until[2]}-${until[3]}T00:00:00Z`);
      expect(Number.isNaN(expiry.getTime())).toBe(false);
      expect(expiry.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("is passed to the scanner, so an ignore cannot be silently bypassed", async () => {
    const ci = await readFile(path.join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");
    expect(ci).toContain("--config=./osv-scanner.toml");
  });
});
