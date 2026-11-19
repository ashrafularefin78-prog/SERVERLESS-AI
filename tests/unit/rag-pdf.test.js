import { describe, expect, it } from "vitest";
import { assemblePageText, isPdfFile } from "../../src/rag/pdf-text.js";

describe("PDF ingestion helpers", () => {
  it("recognises PDFs by MIME type or extension", () => {
    expect(isPdfFile({ name: "paper.pdf", type: "" })).toBe(true);
    expect(isPdfFile({ name: "PAPER.PDF", type: "" })).toBe(true);
    expect(isPdfFile({ name: "download", type: "application/pdf" })).toBe(true);
    expect(isPdfFile({ name: "notes.txt", type: "text/plain" })).toBe(false);
    expect(isPdfFile({ name: "report.pdf.txt", type: "text/plain" })).toBe(false);
  });

  it("keeps the line breaks pdf.js reports", () => {
    expect(
      assemblePageText([
        { str: "Hello", hasEOL: false },
        { str: "world", hasEOL: true },
        { str: "Second line", hasEOL: true },
      ]),
    ).toBe("Hello world\nSecond line");
  });

  it("ignores empty items and collapses layout whitespace", () => {
    expect(
      assemblePageText([
        { str: "" },
        { str: "  spaced  " },
        { str: "text", hasEOL: true },
        { str: "next" },
      ]),
    ).toBe("spaced text\nnext");
  });

  it("returns an empty string for a page with no text", () => {
    expect(assemblePageText([])).toBe("");
    expect(assemblePageText([{ str: "   " }, { str: "\n" }])).toBe("");
  });
});
