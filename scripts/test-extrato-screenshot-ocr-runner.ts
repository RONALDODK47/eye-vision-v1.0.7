import {
  extractGenericRowsFromMapping,
  mappingGenericoEmCoordsOcr,
  refinarItensOcr,
  type PosicionadoItem,
} from '../src/lib/parcelamentoColunasExtract';
import { suggestExtratoBancarioColumns } from '../src/lib/pdfNativeTextItems';
import { parseExtratoMoneyValue } from '../src/extratoVision/utils/extratoMoneyParse';

/** Ground truth parcial — extrato Bradesco abr/2026 (screenshot). */
export const EXPECTED_ROWS: Array<{
  data: string;
  descContains: string;
  credito?: number;
  debito?: number;
}> = [
  { data: '31/03/2026', descContains: 'SALDO ANTERIOR' },
  { data: '01/04/2026', descContains: 'LIQUIDACAO DE COBRANCA VALOR DISPONIVEL', credito: 423.37 },
  { data: '01/04/2026', descContains: 'LIQUIDACAO COBRANCA DESC', credito: 293.04 },
  { data: '01/04/2026', descContains: 'TRANSFERENCIA PIX REM: SUPERMERCADO', credito: 2635.98 },
  { data: '01/04/2026', descContains: 'RENTAB.INVEST FACILCRED', credito: 0.11 },
  { data: '01/04/2026', descContains: 'TARIFA REGISTRO COBRANCA', debito: 60.8 },
  { data: '01/04/2026', descContains: 'DESPESAS DE PROTESTO', debito: 9.19 },
  { data: '01/04/2026', descContains: 'PAGTO ELETRON COBRANCA POLICO', debito: 2947.28 },
  { data: '01/04/2026', descContains: 'PIX QR CODE ESTATICO', debito: 318.04 },
  { data: '02/04/2026', descContains: 'LIQUIDACAO COBRANCA DESC', credito: 502.27 },
  { data: '02/04/2026', descContains: 'TRANSFERENCIA PIX REM: H E MARMORES', credito: 508 },
  { data: '06/04/2026', descContains: 'LIQUIDACAO DE COBRANCA VALOR DISPONIVEL', credito: 1187.36 },
  { data: '06/04/2026', descContains: 'DEVOLUCAO PIX REM: PIX Marketplace', credito: 156 },
];

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function moneyClose(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.02;
}

function findMatchingRow(
  rows: Record<string, string>[],
  exp: (typeof EXPECTED_ROWS)[0],
): Record<string, string> | null {
  const descKey = norm(exp.descContains);
  return (
    rows.find((r) => {
      const d = norm(r.data ?? '');
      const desc = norm(r.descricao ?? r.historicoOperacao ?? '');
      if (!d.includes(norm(exp.data.slice(0, 5)))) return false;
      if (!desc.includes(descKey.slice(0, Math.min(12, descKey.length)))) return false;
      const cred = parseExtratoMoneyValue(r.valorCredito ?? '');
      const deb = parseExtratoMoneyValue(r.valorDebito ?? '');
      if (exp.credito != null && !moneyClose(cred, exp.credito)) return false;
      if (exp.debito != null && !moneyClose(deb, exp.debito)) return false;
      return true;
    }) ?? null
  );
}

export function runExtractionPipeline(
  words: PosicionadoItem[],
  imgWidth: number,
  imgHeight: number,
): { rows: Record<string, string>[]; suggested: boolean; errors: string[] } {
  const errors: string[] = [];
  let items = refinarItensOcr(words);
  const suggested = suggestExtratoBancarioColumns(items, imgWidth);

  if (!suggested) {
    errors.push('Não foi possível sugerir colunas do extrato (cabeçalho OCR ilegível).');
    return { rows: [], suggested: false, errors };
  }

  const mapping = mappingGenericoEmCoordsOcr(
    suggested.columns,
    { startY: suggested.faixaStart, endY: suggested.faixaEnd },
    imgWidth,
    imgHeight,
    imgWidth,
    imgHeight,
  );

  const rows = extractGenericRowsFromMapping(items, mapping, imgHeight, imgWidth, {
    dataColIds: ['data', 'descricao', 'valorCredito', 'valorDebito', 'valorMisto'],
    headerKeywords: ['saldo anterior', 'data', 'lançamento', 'lancamento', 'crédito', 'credito', 'débito', 'debito'],
    allowFaixaFallback: true,
    extratoPositional: true,
    statementYear: '2026',
  });

  for (const exp of EXPECTED_ROWS) {
    const hit = findMatchingRow(rows, exp);
    if (!hit) {
      errors.push(`Faltando: ${exp.data} · ${exp.descContains}`);
    }
  }

  const comValor = rows.filter((r) => {
    const c = parseExtratoMoneyValue(r.valorCredito ?? '');
    const d = parseExtratoMoneyValue(r.valorDebito ?? '');
    return c > 0 || d > 0;
  });
  if (comValor.length < 30) {
    errors.push(`Poucas linhas com valor: ${comValor.length} (esperado ≥ 30)`);
  }

  const semData = rows.filter((r) => {
    const v =
      parseExtratoMoneyValue(r.valorCredito ?? '') || parseExtratoMoneyValue(r.valorDebito ?? '');
    return v > 0 && !(r.data ?? '').trim();
  });
  if (semData.length > 2) {
    errors.push(`${semData.length} linhas com valor mas sem data`);
  }

  return { rows, suggested: true, errors };
}
