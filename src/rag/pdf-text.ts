// Pure helpers for turning pdf.js text items into indexable text. Kept apart
// from the parser so they can be tested without loading pdf.js.

export interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
}

export function isPdfFile(file: { name: string; type?: string }): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Join one page's text items, keeping line breaks where pdf.js reports them. */
export function assemblePageText(items: readonly PdfTextItem[]): string {
  let out = "";

  for (const item of items) {
    const text = item.str;
    if (!text) continue;
    out += text;
    out += item.hasEOL ? "\n" : " ";
  }

  return out
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
