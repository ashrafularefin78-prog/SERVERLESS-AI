// The pdf.js parser runs in this module Worker. It must see the same binary
// helpers as the page, because it fingerprints the file off the main thread.
import "pdfjs-dist/build/pdf.worker.min.mjs";
import { installBinaryHelpers } from "./pdf-compat.js";

installBinaryHelpers();
