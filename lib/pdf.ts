// Lazy pdf.js loader. pdfjs-dist (~1MB + worker) is imported on demand so it
// never ships to non-slide views, and the worker is self-hosted from /public
// (no external CDN — same-origin only). Call these from client code only.
import type { PDFDocumentProxy } from "pdfjs-dist";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return pdfjsPromise;
}

/** Open a PDF from a same/cross-origin URL or raw bytes. Caller destroys it. */
export async function loadPdf(
  src: string | ArrayBuffer
): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  const params = typeof src === "string" ? { url: src } : { data: src };
  return pdfjs.getDocument(params).promise;
}

/** Count pages in a PDF (used at upload to bound slide ranges). */
export async function pdfPageCount(src: string | ArrayBuffer): Promise<number> {
  const doc = await loadPdf(src);
  const n = doc.numPages;
  void doc.destroy();
  return n;
}
