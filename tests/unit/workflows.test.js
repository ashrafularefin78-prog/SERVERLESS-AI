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

    it("gives the OSV job the permissions its reusable workflow declares", async () => {
      // The missing grant is what made every run fail at startup.
      const source = await readFile(
        path.join(process.cwd(), ".github", "workflows", "ci.yml"),
        "utf8",
      );
      const osv = source.slice(source.indexOf("  osv:"));
      expect(osv).toMatch(/actions: read/);
      expect(osv).toMatch(/security-events: write/);
    });
  });
});
