// PDF text extraction with pdf.js, entirely on the device.
//
// This module is imported only when a PDF is added, so the parser and its
// worker stay out of the initial bundle. pdf.js is given the file bytes rather
// than a URL, so a document cannot make the page fetch anything.
import workerUrl from "./pdf.worker.ts?worker&url";
import { installBinaryHelpers } from "./pdf-compat.js";
import { assemblePageText, type PdfTextItem } from "./pdf-text.js";

export async function extractPdfText(file: File): Promise<string> {
  installBinaryHelpers();
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });

  try {
    const pdf = await task.promise;
    const pages: string[] = [];

    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = assemblePageText(content.items as unknown as PdfTextItem[]);
      if (text) pages.push(text);
      page.cleanup();
    }

    return pages.join("\n\n");
  } finally {
    await task.destroy();
  }
}
