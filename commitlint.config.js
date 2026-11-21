export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Keep subjects readable in the changelog.
    "header-max-length": [2, "always", 100],
    "subject-empty": [2, "never"],
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "test", "refactor", "perf", "build", "ci", "chore", "revert"],
    ],
    // A wrapping limit on the body is style, not correctness.
    "body-max-line-length": [1, "always", 100],
    "footer-max-line-length": [1, "always", 100],
  },
};
