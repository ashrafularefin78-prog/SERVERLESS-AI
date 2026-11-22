import { expect, test } from "@playwright/test";

import { open } from "./helpers.js";

/**
 * Ingesting a real PDF, end to end, in the built app.
 *
 * This exists because two bugs shipped that every other spec missed: pdf.js was
 * handed its worker URL as a string and the page's Trusted Types policy refused it,
 * and the embedding worker was inlined by Vite as a `data:` URL, which the same
 * policy also refuses. Both failures look identical from the outside - the document
 * sits on "Reading …" forever - so the assertion that matters is that it *finishes*.
 *
 * The embedding model is a real ~25 MB download from Hugging Face on the first run.
 * Set PDF_INGEST_E2E=0 to skip the spec when running without network.
 */

const SKIP = process.env.PDF_INGEST_E2E === "0";

/** A minimal, valid PDF with selectable text. */
function buildPdf(lines) {
  const escape = (text) => text.replace(/([()\\])/g, "\\$1");
  const body = lines
    .map((line, index) => `BT /F1 14 Tf 72 ${720 - index * 24} Td (${escape(line)}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

test("a dropped PDF is parsed, embedded and listed without a data: URL worker", async ({
  page,
}) => {
  test.skip(SKIP, "PDF_INGEST_E2E=0");

  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await open(page);
  await page.locator("#open-settings").click();

  await page.locator("#knowledge-file").setInputFiles({
    name: "meridian-contract.pdf",
    mimeType: "application/pdf",
    buffer: buildPdf([
      "Meridian Services Agreement",
      "Clause 4. Notice periods.",
      "Either party may terminate this agreement with ninety (90) days written notice.",
    ]),
  });

  // The first run downloads the embedding model, so this is minutes, not seconds.
  await expect(page.locator("#knowledge-list")).toContainText("meridian-contract", {
    timeout: 240_000,
  });
  await expect(page.locator("#knowledge-progress")).toBeHidden();

  const text = await page.locator("#knowledge-list").innerText();
  expect(text).toContain("meridian-contract");

  // The old failure surfaced as a Trusted Types error in the console, so an empty
  // error list is part of the assertion.
  const trustedTypesErrors = errors.filter((message) =>
    /TrustedScriptURL|TrustedHTML/i.test(message),
  );
  expect(trustedTypesErrors, trustedTypesErrors.join(" | ")).toEqual([]);
});
