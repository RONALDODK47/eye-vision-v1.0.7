import type { VisionBalanceteRow } from '../types/accounting';

/** Detecta exportação Domínio: Utilitários > Exportação > Lançamentos (registros 01/02/03). */
export function isDominioLancamentosTxt(text: string): boolean {
  const sample = text.slice(0, 8000);
  if (!/^01\d/m.test(sample.trimStart())) return false;
  return /^02\d{7}[VX]/m.test(sample) && /^03\d{7}/m.test(sample);
}

function parseCentavosField(field: string): number {
  let n = parseInt(field, 10) || 0;
  while (n > 999_999) n = Math.floor(n / 10);
  return n / 100;
}

function parseAmountBlock(line: string): number {
  const intPartRaw = line.substring(23, 34).replace(/\D/g, '');
  const fracPartRaw = line.substring(34, 45).replace(/\D/g, '');

  // Formato TXT Domínio (03): valor quebrado em 2 blocos de 11 dígitos.
  // Ex.: int=00000000018 frac=99830000000 => 1.899,83
  if (intPartRaw || fracPartRaw) {
    const intPart = parseInt(intPartRaw || '0', 10);
    const fracPart = parseInt(fracPartRaw || '0', 10);
    const value = intPart * 100 + fracPart / 1_000_000_000;
    if (Number.isFinite(value) && value > 0) return value;
  }

  // Fallback para variações legadas de layout.
  const vD = parseCentavosField(line.substring(23, 34));
  const vC = parseCentavosField(line.substring(34, 45));
  const fieldVal = Math.max(vD, vC);
  if (fieldVal >= 1) return fieldVal;
  const combined = parseCentavosField(line.substring(23, 45));
  return fieldVal || combined;
}

function parseHistorico(line: string): string {
  return line
    .substring(45, 345)
    .replace(/\s+\d{7}\s*$/, '')
    .trim();
}

function parseDataLote02(line: string): string | undefined {
  const m = line.match(/^02\d{7}[VX](\d{2}\/\d{2}\/\d{4})/);
  return m?.[1];
}

function padCodigoReduzido(cod: string): string {
  const digits = cod.replace(/\D/g, '');
  if (!digits) return '';
  return digits.padStart(7, '0').slice(-7);
}

function isSaldoInicial(hist: string): boolean {
  // Domínio e variações: "REFERENTE SALDO INICIAL", "SALDO INICIAL", "S.I."
  return /saldo\s*inicial|referente\s+saldo|^\s*s\.?\s*i\.?\s*$/i.test(hist.trim());
}

/** Converte TXT Domínio (registros 02/03) em linhas de razão. */
export function parseDominioLancamentosTxt(text: string): VisionBalanceteRow[] {
  const rows: VisionBalanceteRow[] = [];
  let dataAtual: string | undefined;
  let ordemFallback = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    if (line.startsWith('02')) {
      dataAtual = parseDataLote02(line);
      continue;
    }

    if (!line.startsWith('03') || line.length < 45) continue;

    const hist = parseHistorico(line);
    const saldoInicialLine = isSaldoInicial(hist);

    const contaDeb = padCodigoReduzido(line.substring(9, 16));
    const contaCred = padCodigoReduzido(line.substring(16, 23));
    const valor = parseAmountBlock(line);
    if (!valor || (!contaDeb && !contaCred)) continue;

    const seqArquivo = parseInt(line.substring(2, 9), 10) || 0;
    const ordem = seqArquivo > 0 ? seqArquivo : ++ordemFallback;

    const base = {
      data: dataAtual,
      ordem,
      nome: hist || '—',
      saldoInicial: 0,
      saldoFinal: 0,
    };

    if (saldoInicialLine) {
      // Saldo inicial exportado pelo Domínio: preserva conta e valor para não "sumir"
      // no balancete consolidado quando a conta não tem movimento no período.
      if (contaDeb && contaDeb !== '0000000') {
        rows.push({
          ...base,
          codigo: contaDeb,
          saldoInicial: valor,
          naturezaSaldoInicial: 'D',
          debito: 0,
          credito: 0,
        });
      }
      if (contaCred && contaCred !== '0000000') {
        rows.push({
          ...base,
          codigo: contaCred,
          saldoInicial: valor,
          naturezaSaldoInicial: 'C',
          debito: 0,
          credito: 0,
        });
      }
      continue;
    }

    if (contaDeb && contaDeb !== '0000000') {
      rows.push({
        ...base,
        codigo: contaDeb,
        debito: valor,
        credito: 0,
      });
    }

    if (contaCred && contaCred !== '0000000') {
      rows.push({
        ...base,
        codigo: contaCred,
        debito: 0,
        credito: valor,
      });
    }
  }

  return rows;
}

export async function readTextFileSmart(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    const text1252 = new TextDecoder('windows-1252').decode(buf);
    if (!text1252.includes('\uFFFD')) return text1252;
  } catch {
    // ignore
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}
