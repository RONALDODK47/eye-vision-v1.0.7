import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { LoanParams, LoanRow } from './loanCalculator';

interface PdfContractMeta {
  companyName?: string;
  contractNumber?: string;
  bankName?: string;
  valorIof?: number;
}

/**
 * jsPDF usa fontes padrão com encoding limitado; símbolos como × ÷ − (Unicode) quebram a saída.
 * Normaliza para ASCII na exportação (evita caracteres "fantasma" / corrupção no leitor).
 */
function pdfSafe(str: string): string {
  return str
    .replace(/\u00D7/g, 'x')
    .replace(/\u00F7/g, '/')
    .replace(/\u2212/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-')
    .replace(/\u00A0/g, ' ');
}

const formatCurrency = (value: number) => {
  return pdfSafe(
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, '\u00A0')
  );
};

export function exportToPDF(params: LoanParams, schedule: LoanRow[], meta?: PdfContractMeta) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Título e logo placeholders
  doc.setFontSize(22);
  doc.setTextColor(30, 64, 175); // Azul escuro
  doc.text(pdfSafe('Relatório Profissional de Empréstimo'), 14, 22);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(
    pdfSafe(`Gerado em: ${format(new Date(), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}`),
    14,
    30
  );
  
  // Resumo dos Parâmetros
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(pdfSafe('Parâmetros da Simulação'), 14, 45);
  doc.setLineWidth(0.5);
  doc.line(14, 47, 283, 47);
  
  doc.setFontSize(10);
  
  const effectiveFixedRateStr = params.fixedRateType === 'value' 
    ? `${formatCurrency(params.fixedRateMonth)} (Taxa efe. ${((params.fixedRateMonth / params.principal)*100).toFixed(4)}% a.m.)` 
    : `${params.fixedRateMonth.toFixed(4)}% a.m.`;

  const opCostStr =
    params.monthlyOperationCost === 0
      ? params.monthlyOpCostType === 'percent'
        ? '0% a.m. s/ saldo (ref. mensal)'
        : `${formatCurrency(0)} tarifa mensal (ref.)`
      : params.monthlyOpCostType === 'percent'
        ? `${params.monthlyOperationCost}% a.m. s/ saldo (pós-car.)`
        : `${formatCurrency(params.monthlyOperationCost)} tarifa mensal (pós-car.)`;

  const custoRateioCurto =
    params.operationalCostDayBasis === 'calendar365' ? 'Calendário' : 'Mês comercial';

  const graceRateStrPdf =
    params.graceFixedRateType === 'value'
      ? `${formatCurrency(params.graceFixedRateMonth)} (${params.principal > 0 ? ((params.graceFixedRateMonth / params.principal) * 100).toFixed(4) : '0'}% a.m. car.)`
      : `${params.graceFixedRateMonth.toFixed(4)}% a.m. (car.)`;
  const graceCostStrPdf =
    params.graceMonthlyOpCostType === 'percent'
      ? `${params.graceMonthlyOperationCost}% s/ saldo (car.)`
      : `${formatCurrency(params.graceMonthlyOperationCost)} (car.)`;

  const iofModePdf = params.iofMode ?? 'financed';
  const valorIofPdf = Math.max(0, params.valorIof ?? meta?.valorIof ?? 0);
  const valorContratoTotalPdf =
    params.principal + (iofModePdf === 'financed' ? valorIofPdf : 0);

  const leftCol = [
    `Empresa: ${meta?.companyName?.trim() || '-'}`,
    `Contrato: ${meta?.contractNumber?.trim() || '-'}`,
    `Banco: ${meta?.bankName?.trim() || '-'}`,
    `Sistema: ${params.system}`,
    ...(valorIofPdf > 0
      ? [
          `Valor do contrato (principal): ${formatCurrency(params.principal)}`,
          `IOF (${iofModePdf === 'financed' ? 'financiado' : 'pago à parte'}): ${formatCurrency(valorIofPdf)}`,
          iofModePdf === 'financed'
            ? `Valor total do contrato (principal + IOF): ${formatCurrency(valorContratoTotalPdf)}`
            : `Saldo financiado (sem IOF na parcela): ${formatCurrency(params.principal)}`,
        ]
      : [`Valor Financiado: ${formatCurrency(params.principal)}`]),
    `Prazo de Amortização: ${params.months} meses`,
    `Carência: ${params.gracePeriod} meses (${params.graceType === 'capitalized' ? 'Juros Capitalizados' : 'Juros Pagos'})`,
    `Juros base (carência): ${graceRateStrPdf}`,
    `Custo op. (carência): ${graceCostStrPdf}`,
  ];
  
  const effectiveFixed = params.fixedRateType === 'value' ? (params.fixedRateMonth / params.principal)*100 : params.fixedRateMonth;

  const modoJuros = params.proRataDieMode === 'compound' ? 'Exponencial' : 'Linear';

  const sacRoundPdf =
    params.system === 'SAC'
      ? params.sacMoneyRounding === 'truncateCentavos'
        ? 'truncado para baixo nos centavos'
        : 'meia-distância em centavos'
      : '';

  const sacAccrPdfParts: string[] = [];
  if (params.system === 'SAC') {
    let base = '';
    if (params.sacInterestAccrual === 'proRataMesCivil')
      base = 'Amortização SAC: juros com dias corridos / dias do mês civil';
    else if (params.sacInterestAccrual === 'proRataCorridos')
      base = 'Amortização SAC: juros proporcionais dias corridos ÷30';
    else base = 'Amortização SAC: juros mensal inteiro (saldo x taxa x 1)';
    sacAccrPdfParts.push(base);
    if (sacRoundPdf) sacAccrPdfParts.push(`Arredondamento SAC: ${sacRoundPdf}`);
  }
  const sacAccrPdf = sacAccrPdfParts.join(' — ');

  const priceAccrPdf =
    params.system === 'PRICE'
      ? params.priceInterestAccrual === 'proRataMesCivil'
        ? 'PRICE amort.: juros com dias corridos / dias mes civil'
        : params.priceInterestAccrual === 'mensalContrato'
          ? 'PRICE amort.: juros competencia inteira (fator 1)'
          : 'PRICE amort.: juros proporcionais dias corridos /30'
      : '';

  const mesmoAnoPdf = 'parcelas restantes no mesmo ano civil da linha';
  const curtoPdfHead = 'Curto';
  const cpcDemoLines = [
    'Demonstracao curto/longo (CPC fiscal):',
    `Curto = soma das parcelas liquidas restantes no mesmo ano civil (${mesmoAnoPdf}). O saldo de curto diminui a cada pagamento.`,
    'Em 31/12: uma reclassificacao anual — provisiona parcelas liquidas do ano civil seguinte (ate 12). Se o emprestimo encerrar no ano, provisiona so o restante.',
    'Longo = saldo devedor menos curto. Export TXT: transferencia LP para CP somente em 31/12 (uma vez por ano).',
  ];

  const indexadorPdf =
    params.varIndexMode === 'selic_over_diaria'
      ? 'Selic Over diaria BCB 11 (fator acumulado entre vencimentos)'
      : params.varIndexMode === 'none'
        ? 'Sem indexador'
        : `Indexador mensal ${params.varRateMonth.toFixed(4)}% a.m.`;

  const rightCol = [
    `Spread/Juros Base: ${effectiveFixedRateStr}`,
    `Indexador Projetado: ${indexadorPdf}`,
    ...(params.varIndexMode !== 'selic_over_diaria'
      ? [
          `Proj. variação (% a.m.): ${params.varRateMonth.toFixed(4)}%`,
          `Taxa efetiva mensal (legado): ${(((1 + effectiveFixed / 100) * (1 + params.varRateMonth / 100) - 1) * 100).toFixed(4)}%`,
        ]
      : [
          `PRICE + Selic: ${params.priceSelicAdjustment === 'recalculo_pmt' ? 'recalculo PMT mensal' : 'PMT fixa 1a competencia'}`,
        ]),
    `Custo op. (pós-car.): ${opCostStr}`,
    `Juros (pós-car.): ${modoJuros}`,
    ...(params.system === 'SAC' ? [`${sacAccrPdf}` as const] : []),
    ...(params.system === 'PRICE' && priceAccrPdf ? [`${priceAccrPdf}` as const] : []),
    `Rateio custo op.: ${custoRateioCurto}`,
  ];

  const drawWrappedColumn = (items: string[], x: number, startY: number, maxWidth: number) => {
    let y = startY;
    for (const item of items) {
      const lines = doc.splitTextToSize(pdfSafe(item), maxWidth) as string[];
      doc.text(lines, x, y);
      y += lines.length * 5 + 2;
    }
    return y;
  };

  const marginRight = 14;
  const gap = 12;
  const leftX = 14;
  const rightX = 145;
  const rightMaxWidth = pageWidth - rightX - marginRight;
  const leftMaxWidth = rightX - leftX - gap;

  const leftEndY = drawWrappedColumn(leftCol, leftX, 55, leftMaxWidth);
  const rightEndY = drawWrappedColumn(rightCol, rightX, 55, rightMaxWidth);
  const fullTextWidth = pageWidth - leftX - marginRight;
  const cpcEndY = drawWrappedColumn(cpcDemoLines, leftX, Math.max(leftEndY, rightEndY) + 4, fullTextWidth);
  const totalsY = cpcEndY + 3;

  // Totais
  const totalGeralPago = schedule.reduce((acc, row) => acc + row.installment, 0);
  const totalJuros = schedule.reduce((acc, row) => acc + row.interest, 0);
  const totalCustos = schedule.reduce((acc, row) => acc + row.monthlyCost, 0);
  
  doc.text(pdfSafe(`Total Pago: ${formatCurrency(totalGeralPago)}`), 14, totalsY);
  doc.text(pdfSafe(`Total de Juros: ${formatCurrency(totalJuros)}`), 105, totalsY);
  doc.text(pdfSafe(`Total Custos Op.: ${formatCurrency(totalCustos)}`), 195, totalsY);

  // Tabela única — colunas Curto/Longo alinhadas ao modo contábil ou fiscal (igual à aba Tabela da web).
  const schedulePdfRow = (row: LoanRow): string[] => [
    row.month === 0 ? '-' : row.month.toString() + (row.isGrace ? ' (Carencia)' : ''),
    format(row.date, 'dd/MM/yyyy'),
    row.month === 0 ? '-' : String(row.accrualDays),
    row.selicAccumulatedFactor != null && row.selicAccumulatedFactor !== 1
      ? row.selicAccumulatedFactor.toFixed(8)
      : '-',
    row.effectivePctInPeriod != null
      ? `${row.effectivePctInPeriod.toFixed(
          row.selicBusinessDays != null && row.selicBusinessDays > 0 ? 6 : 4,
        )}%`
      : '-',
    formatCurrency(row.initialBalance),
    row.month === 0 || row.installment === 0 ? '-' : formatCurrency(row.installment),
    row.month === 0 ? '-' : formatCurrency(row.amortization),
    row.month === 0 ? '-' : formatCurrency(row.interest),
    row.month === 0 ? '-' : formatCurrency(row.monthlyCost),
    row.iof > 0 ? formatCurrency(row.iof) : row.month === 0 ? '-' : formatCurrency(0),
    formatCurrency(row.finalBalance),
    row.shortTermBalance >= 0.005 ? formatCurrency(row.shortTermBalance) : '-',
    row.longTermBalance >= 0.005 ? formatCurrency(row.longTermBalance) : '-',
  ];

  const tableData = schedule.map((row) => schedulePdfRow(row).map((cell) => pdfSafe(String(cell))));

  const scheduleHeadRow: string[] = [
    'Mes',
    'Data',
    'Dias',
    'Fator SELIC',
    'Taxa %',
    'SD Inicial',
    'Parcela',
    'Parcela Liquida',
    'Juros',
    'Custo Op.',
    'IOF',
    'SD Final',
    curtoPdfHead,
    'Longo',
  ];

  autoTable(doc, {
    startY: totalsY + 8,
    head: [scheduleHeadRow.map((h) => pdfSafe(h))],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 64, 175] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 8, cellPadding: 2, halign: 'right', cellWidth: 'wrap' },
    columnStyles: { 0: { halign: 'center' }, 1: { halign: 'center' } },
  });

  doc.save(`simulacao_${params.system.toLowerCase()}_${new Date().getTime()}.pdf`);
}
