/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MockTextElement {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MockDocumentData {
  canvas: HTMLCanvasElement;
  textElements: MockTextElement[];
  defaultColumns: {
    date: { startX: number; width: number };
    history: { startX: number; width: number };
    value: { startX: number; width: number };
  };
}

export function generateMockStatement(): MockDocumentData {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  // Fill background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw a subtle border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  const textElements: MockTextElement[] = [];

  function drawText(text: string, x: number, y: number, font: string, color: string, align: 'left' | 'right' = 'left') {
    ctx!.font = font;
    ctx!.fillStyle = color;
    ctx!.textAlign = align;
    ctx!.fillText(text, x, y);

    const metrics = ctx!.measureText(text);
    const textWidth = metrics.width;
    const textHeight = parseInt(font, 10) || 12;

    textElements.push({
      text,
      x: align === 'right' ? x - textWidth : x,
      y: y - textHeight, // standard text baseline alignment
      width: textWidth,
      height: textHeight,
    });
  }

  // Header Title
  drawText('BANCO COOPERATIVO DE SÃO PAULO S.A.', 50, 60, 'bold 18px Inter, sans-serif', '#1e293b');
  drawText('EXTRATO DE CONTA CORRENTE - MENSAL', 50, 85, '12px Inter, sans-serif', '#64748b');

  // Metadata block
  drawText('CLIENTE: ANA SILVA OLIVEIRA', 50, 130, 'bold 13px Inter, sans-serif', '#334155');
  drawText('PERÍODO: 01/07/2026 A 08/07/2026', 50, 150, '12px Inter, sans-serif', '#475569');

  drawText('AGÊNCIA: 1234-5', 550, 130, 'bold 13px Inter, sans-serif', '#334155');
  drawText('CONTA CORRENTE: 98765-4', 550, 150, 'bold 13px Inter, sans-serif', '#334155');

  // Horizontal separator before headers
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(50, 185);
  ctx.lineTo(750, 185);
  ctx.stroke();

  // Column Headers
  // Data at 50, Histórico at 180, Valor at 750 (right aligned)
  drawText('DATA', 50, 205, 'bold 12px Inter, sans-serif', '#475569');
  drawText('LANCAMENTO / HISTÓRICO', 180, 205, 'bold 12px Inter, sans-serif', '#475569');
  drawText('VALOR (R$)', 750, 205, 'bold 12px Inter, sans-serif', '#475569', 'right');

  // Separator after headers
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(50, 215);
  ctx.lineTo(750, 215);
  ctx.stroke();

  // Define transactions list
  const transactions = [
    { date: '01/07/2026', history: 'SALDO ANTERIOR', value: '1.500,00 C' },
    { date: '02/07/2026', history: 'PIX RECEBIDO - CARLOS JUNIOR', value: '350,00 C' },
    { date: '02/07/2026', history: 'COMPRA NO DEBITO - SUPERMERCADO EXTRA', value: '-142,50' },
    { date: '04/07/2026', history: 'PAGAMENTO DE BOLETO - ENERGIA ELETRICA', value: '85,00 D' },
    { date: '05/07/2026', history: 'RENDIMENTO DE INVESTIMENTOS', value: '12,45 C' },
    { date: '05/07/2026', history: 'TARIFA DE SERVICOS COBRANCA', value: '-15,00 D' },
    { date: '07/07/2026', history: 'SAQUE BANCO 24 HORAS', value: '200,00 D' },
    { date: '08/07/2026', history: 'COMPRA NO DEBITO - POSTO DE GASOLINA', value: '-120,00' },
  ];

  let currentY = 245;
  const rowSpacing = 35;

  transactions.forEach((tx) => {
    // Draw row background or separator lines to look like an authentic bank statement
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50, currentY + 10);
    ctx.lineTo(750, currentY + 10);
    ctx.stroke();

    // Text color
    let valColor = '#334155';
    if (tx.value.includes('-') || tx.value.includes('D')) {
      valColor = '#b91c1c'; // Red-ish dark
    } else if (tx.value.includes('C')) {
      valColor = '#15803d'; // Green-ish dark
    }

    drawText(tx.date, 50, currentY, '12px Inter, sans-serif', '#334155');
    drawText(tx.history, 180, currentY, '12px Inter, sans-serif', '#334155');
    drawText(tx.value, 750, currentY, 'bold 12px Inter, sans-serif', valColor, 'right');

    currentY += rowSpacing;
  });

  // Footer / Balance recap
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(50, currentY + 10);
  ctx.lineTo(750, currentY + 10);
  ctx.stroke();

  drawText('SALDO FINAL DISPONÍVEL:', 480, currentY + 35, 'bold 12px Inter, sans-serif', '#334155');
  drawText('1.300,00 C', 750, currentY + 35, 'bold 13px Inter, sans-serif', '#15803d', 'right');

  // Define default column bounds (in percent of width, 800px total width)
  // Date: X: 40px to 160px (5% to 20%)
  // History: X: 170px to 560px (21.25% to 70%)
  // Value: X: 580px to 760px (72.5% to 95%)
  const defaultColumns = {
    date: { startX: 5, width: 15 },
    history: { startX: 21, width: 49 },
    value: { startX: 71.5, width: 23.5 },
  };

  return {
    canvas,
    textElements,
    defaultColumns,
  };
}
