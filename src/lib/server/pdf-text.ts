async function preparePdfRuntime() {
  const canvas = await import("@napi-rs/canvas");
  const pdfGlobal = globalThis as Record<string, unknown>;

  pdfGlobal.DOMMatrix ??= canvas.DOMMatrix;
  pdfGlobal.ImageData ??= canvas.ImageData;
  pdfGlobal.Path2D ??= canvas.Path2D;

  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
}

export async function extractPdfTextFromBuffer(buffer: Buffer, includePageLabels = false) {
  await preparePdfRuntime();

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  });
  const document = await loadingTask.promise;

  try {
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");

      pages.push(includePageLabels ? `[Page ${pageNumber}]\n${pageText}` : pageText);
      page.cleanup();
    }

    return pages.join("\n\n");
  } finally {
    await document.destroy();
  }
}
