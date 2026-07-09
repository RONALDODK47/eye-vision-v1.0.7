/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as pdfjsLib from 'pdfjs-dist';

// Use a stable CDN worker URL so that Vite doesn't run into issues bundling it
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export interface PDFTextItem {
  text: string;
  x: number;      // Pixel coordinate on canvas
  y: number;      // Pixel coordinate on canvas
  width: number;  // Pixel width
  height: number; // Pixel height
}

export interface RenderedPDFPage {
  canvas: HTMLCanvasElement;
  textItems: PDFTextItem[];
  width: number;
  height: number;
}

export interface RenderedPDFPageWithNum extends RenderedPDFPage {
  pageNumber: number;
}

export async function parseAndRenderPDFPage(file: File, pageNumber: number): Promise<RenderedPDFPage> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Load PDF document
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  
  if (pageNumber < 1 || pageNumber > pdfDoc.numPages) {
    throw new Error(`Página ${pageNumber} inválida. O documento tem ${pdfDoc.numPages} páginas.`);
  }
  
  // Get the page
  const page = await pdfDoc.getPage(pageNumber);
  
  // We want a high-resolution render (2x scale) so crops look crisp
  const scale = 2.0;
  const viewport = page.getViewport({ scale });
  
  // Prepare canvas
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  
  // Render PDF page into canvas
  const renderContext = {
    canvasContext: ctx,
    viewport: viewport,
  };
  await page.render(renderContext).promise;
  
  // Extract text items with coordinates mapped to viewport pixels
  const textContent = await page.getTextContent();
  const textItems: PDFTextItem[] = [];
  
  textContent.items.forEach((item: any) => {
    if (!item.str || item.str.trim() === '') return;
    
    // transform contains [a, b, c, d, tx, ty]
    // tx = x, ty = y in PDF points
    const pdfX = item.transform[4];
    const pdfY = item.transform[5];
    
    // Map to viewport coordinates (top-left origin, scaled)
    const [canvasX, canvasY] = viewport.convertToViewportPoint(pdfX, pdfY);
    
    // Estimate width and height in viewport coordinates
    // Item width is in PDF points, so we scale it
    const scaledWidth = item.width * scale;
    const scaledHeight = item.height * scale;
    
    // Note: convertToViewportPoint maps bottom-left of character baseline, 
    // so we adjust canvasY to represent the top-left of the bounding box
    textItems.push({
      text: item.str,
      x: canvasX,
      y: canvasY - scaledHeight, // standard text alignment adjustment
      width: scaledWidth,
      height: scaledHeight || 12 * scale, // fallback height
    });
  });
  
  return {
    canvas,
    textItems,
    width: viewport.width,
    height: viewport.height,
  };
}

export async function parseAndRenderAllPDFPages(file: File): Promise<RenderedPDFPageWithNum[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;
  const pages: RenderedPDFPageWithNum[] = [];

  for (let p = 1; p <= totalPages; p++) {
    const page = await pdfDoc.getPage(p);
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    
    await page.render({ canvasContext: ctx, viewport }).promise;
    
    const textContent = await page.getTextContent();
    const textItems: PDFTextItem[] = [];
    
    textContent.items.forEach((item: any) => {
      if (!item.str || item.str.trim() === '') return;
      const pdfX = item.transform[4];
      const pdfY = item.transform[5];
      const [canvasX, canvasY] = viewport.convertToViewportPoint(pdfX, pdfY);
      const scaledWidth = item.width * scale;
      const scaledHeight = item.height * scale;
      textItems.push({
        text: item.str,
        x: canvasX,
        y: canvasY - scaledHeight,
        width: scaledWidth,
        height: scaledHeight || 12 * scale,
      });
    });

    pages.push({
      canvas,
      textItems,
      width: viewport.width,
      height: viewport.height,
      pageNumber: p,
    });
  }

  return pages;
}
