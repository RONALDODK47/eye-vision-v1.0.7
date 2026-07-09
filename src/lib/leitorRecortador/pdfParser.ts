import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { PDFTextItem, RenderedPDFPage } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFTextItem };

export interface RenderedPDFPageWithNum extends RenderedPDFPage {
  pageNumber: number;
}

async function renderPdfPage(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
): Promise<RenderedPDFPageWithNum> {
  const page = await pdfDoc.getPage(pageNumber);
  const scale = 2.0;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  const textContent = await page.getTextContent();
  const textItems: PDFTextItem[] = [];

  textContent.items.forEach((item) => {
    if (!('str' in item) || !item.str || !String(item.str).trim()) return;
    const pdfX = item.transform[4]!;
    const pdfY = item.transform[5]!;
    const [canvasX, canvasY] = viewport.convertToViewportPoint(pdfX, pdfY);
    const scaledWidth = item.width * scale;
    const scaledHeight = (item.height || 12) * scale;
    textItems.push({
      text: String(item.str),
      x: canvasX,
      y: canvasY - scaledHeight,
      width: scaledWidth,
      height: scaledHeight,
    });
  });

  return {
    canvas,
    textItems,
    width: viewport.width,
    height: viewport.height,
    pageNumber,
  };
}

export async function parseAndRenderPDFPage(file: File, pageNumber: number): Promise<RenderedPDFPageWithNum> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  if (pageNumber < 1 || pageNumber > pdfDoc.numPages) {
    throw new Error(`Página ${pageNumber} inválida. O documento tem ${pdfDoc.numPages} páginas.`);
  }
  return renderPdfPage(pdfDoc, pageNumber);
}

export async function parseAndRenderAllPDFPages(file: File): Promise<RenderedPDFPageWithNum[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: RenderedPDFPageWithNum[] = [];
  for (let p = 1; p <= pdfDoc.numPages; p += 1) {
    pages.push(await renderPdfPage(pdfDoc, p));
  }
  return pages;
}

export async function parseAndRenderImage(file: File): Promise<RenderedPDFPageWithNum> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not render image.');
    ctx.drawImage(img, 0, 0);
    return {
      canvas,
      textItems: [],
      width: img.width,
      height: img.height,
      pageNumber: 1,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
