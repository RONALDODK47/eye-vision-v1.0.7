import { parseISO, isValid, format } from 'date-fns';
import { downloadDominioTXT } from '../../lib/dominioExporter';
import { montarLinhaTxtDominio } from '../../lib/dominioTxtLinha';
import {
  isDominioLancamentosTxt,
  parseDominioLancamentosTxt,
  readTextFileSmart,
} from '../../extratoVision/utils/dominioLancamentosTxt';
import type { VisionBalanceteRow } from '../../extratoVision/types/accounting';

export { isDominioLancamentosTxt, readTextFileSmart };

function brDateToIso(data: string | undefined): string {
  const t = String(data ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/(\d{2})\/(\d{2})(?:\/(\d{2,4}))?/);
  if (!m) return new Date().toISOString().split('T')[0];
  const yearPart = m[3] ?? String(new Date().getFullYear());
  const year = yearPart.length === 2 ? `20${yearPart}` : yearPart;
  return `${year}-${m[2]}-${m[1]}`;
}

function parseDateForDominio(dateStr: string): Date {
  const iso = brDateToIso(dateStr);
  const d = parseISO(iso);
  return isValid(d) ? d : new Date();
}

export type BalanceteImportRow = {
  id: string;
  dataInicio: string;
  codigo: string;
  classificacao: string;
  descricao: string;
  saldoInicial: number;
  debito: number;
  credito: number;
  saldoFinal: number;
  natureza: 'D' | 'C';
};

export type FolhaRelatorioImportRow = {
  id: string;
  date: string;
  description: string;
  debito: number;
  credito: number;
};

export type ExtratoExportRow = {
  date: string;
  description: string;
  value: number;
  nature: 'D' | 'C';
  accountDebit?: string;
  accountCredit?: string;
  /** Fallback legado (só banco) quando D/C ainda não foram preenchidos. */
  accountCode?: string;
  operationName?: string;
};

function digitsOnly(code: string | undefined): string {
  return String(code ?? '').replace(/\D/g, '');
}

/**
 * Monta a partida Domínio a partir da linha do extrato.
 * Entrada (C): banco no DÉBITO · Saída (D): banco no CRÉDITO.
 * Nunca devolve débito = crédito.
 */
export function resolvePartidaDominioExtrato(
  row: ExtratoExportRow,
  contaBancoPreferida?: string,
): { contaDebito: string; contaCredito: string } | null {
  const banco = digitsOnly(contaBancoPreferida);
  let deb = digitsOnly(row.accountDebit);
  let cred = digitsOnly(row.accountCredit);
  const code = digitsOnly(row.accountCode);

  // Completa lado do banco com accountCode legado, se faltar
  if (code) {
    if (row.nature === 'C' && !deb) deb = code;
    if (row.nature === 'D' && !cred) cred = code;
  }

  const pickContra = (a: string, b: string): string => {
    if (banco) {
      if (a && a !== banco) return a;
      if (b && b !== banco) return b;
      return '';
    }
    return a || b || '';
  };

  if (banco) {
    if (row.nature === 'C') {
      const contra = pickContra(cred, deb);
      if (!contra || contra === banco) return null;
      return { contaDebito: banco, contaCredito: contra };
    }
    const contra = pickContra(deb, cred);
    if (!contra || contra === banco) return null;
    return { contaDebito: contra, contaCredito: banco };
  }

  // Sem conta banco preferida: usa o par já gravado, se válido
  if (deb && cred && deb !== cred) {
    return { contaDebito: deb, contaCredito: cred };
  }
  return null;
}

/** Agrupa linhas 03 do Domínio (débito/crédito separados) em pares para export TXT+. */
function pairDominioMovementRows(rows: VisionBalanceteRow[]): Array<{
  date: string;
  historico: string;
  debito: number;
  credito: number;
  contaDeb: string;
  contaCred: string;
}> {
  const out: Array<{
    date: string;
    historico: string;
    debito: number;
    credito: number;
    contaDeb: string;
    contaCred: string;
  }> = [];
  const byKey = new Map<string, VisionBalanceteRow[]>();

  for (const row of rows) {
    if ((row.saldoInicial ?? 0) > 0 && row.debito === 0 && row.credito === 0) continue;
    const key = `${row.data ?? ''}|${row.ordem ?? row.nome}|${row.nome}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  for (const group of byKey.values()) {
    const deb = group.find((r) => r.debito > 0);
    const cred = group.find((r) => r.credito > 0);
    if (!deb && !cred) continue;
    out.push({
      date: deb?.data ?? cred?.data ?? '',
      historico: (deb?.nome ?? cred?.nome ?? 'LANCAMENTO').toUpperCase(),
      debito: deb?.debito ?? 0,
      credito: cred?.credito ?? 0,
      contaDeb: deb?.codigo ?? '',
      contaCred: cred?.codigo ?? '',
    });
  }

  return out;
}

export function visionRowsToBalanceteImports(rows: VisionBalanceteRow[]): BalanceteImportRow[] {
  return rows.map((v, index) => {
    const dataIso = brDateToIso(v.data);
    const debito = v.debito ?? 0;
    const credito = v.credito ?? 0;
    const saldoIni = v.saldoInicial ?? 0;
    return {
      id: `dom-${index}-${v.codigo}-${v.ordem ?? 0}`,
      dataInicio: dataIso,
      codigo: v.codigo ?? '',
      classificacao: v.classificacao ?? v.codigo ?? '',
      descricao: (v.nome ?? 'LANCAMENTO').toUpperCase(),
      saldoInicial: saldoIni,
      debito,
      credito,
      saldoFinal: v.saldoFinal ?? saldoIni + debito - credito,
      natureza: debito >= credito ? 'D' : 'C',
    };
  });
}

export function visionRowsToFolhaRelatorio(rows: VisionBalanceteRow[]): FolhaRelatorioImportRow[] {
  const paired = pairDominioMovementRows(rows);
  return paired.map((p, i) => ({
    id: `folha-dom-${i}-${Date.now()}`,
    date: brDateToIso(p.date),
    description: p.historico,
    debito: p.debito,
    credito: p.credito,
  }));
}

export async function parseDominioTxtFile(text: string): Promise<{
  balancete: BalanceteImportRow[];
  folha: FolhaRelatorioImportRow[];
}> {
  if (!isDominioLancamentosTxt(text)) {
    throw new Error(
      'Arquivo não reconhecido como exportação Domínio (Utilitários > Exportação > Lançamentos).',
    );
  }
  const parsed = parseDominioLancamentosTxt(text);
  if (parsed.length === 0) {
    throw new Error('Nenhum lançamento válido encontrado no TXT Domínio.');
  }
  return {
    balancete: visionRowsToBalanceteImports(parsed),
    folha: visionRowsToFolhaRelatorio(parsed),
  };
}

/**
 * Exporta partidas já conciliadas para TXT+ Domínio.
 * Entrada (C): banco no débito · Saída (D): banco no crédito.
 * Nunca gera linha com Débito = Crédito.
 */
export function buildTxtPlusFromExtratoRows(
  rows: ExtratoExportRow[],
  contaBancoPreferida?: string,
): string {
  const lines: string[] = [];
  for (const row of rows) {
    if (!(row.value > 0)) continue;
    const partida = resolvePartidaDominioExtrato(row, contaBancoPreferida);
    if (!partida) continue;
    lines.push(
      montarLinhaTxtDominio({
        date: parseDateForDominio(row.date),
        debContaStr: partida.contaDebito,
        credContaStr: partida.contaCredito,
        value: row.value,
        historico: (row.operationName || row.description || 'LANCAMENTO').toUpperCase(),
      }),
    );
  }
  return lines.join('\r\n');
}

export function buildTxtPlusFromFolhaRelatorio(
  rows: FolhaRelatorioImportRow[],
  defaultDeb = '1000001',
  defaultCred = '2000001',
): string {
  const lines: string[] = [];
  for (const row of rows) {
    const val = Math.max(row.debito, row.credito);
    if (val <= 0) continue;
    lines.push(
      montarLinhaTxtDominio({
        date: parseDateForDominio(row.date),
        debContaStr: row.debito > 0 ? defaultDeb : defaultCred,
        credContaStr: row.credito > 0 ? defaultCred : defaultDeb,
        value: val,
        historico: row.description,
      }),
    );
  }
  return lines.join('\r\n');
}

export function buildTxtPlusFromBalanceteImports(rows: BalanceteImportRow[]): string {
  const visionLike: VisionBalanceteRow[] = rows.flatMap((r) => {
    const base = { data: format(parseDateForDominio(r.dataInicio), 'dd/MM/yyyy'), nome: r.descricao, ordem: 0 };
    const out: VisionBalanceteRow[] = [];
    if (r.debito > 0) {
      out.push({ ...base, codigo: r.codigo, debito: r.debito, credito: 0, saldoInicial: 0, saldoFinal: 0 });
    }
    if (r.credito > 0) {
      out.push({ ...base, codigo: r.codigo, debito: 0, credito: r.credito, saldoInicial: 0, saldoFinal: 0 });
    }
    return out;
  });
  return buildTxtPlusFromRazaoVision(visionLike);
}

/** Export TXT+ a partir de lançamentos brutos do razão (mesmo motor da interface antiga). */
export function buildTxtPlusFromRazaoVision(rows: VisionBalanceteRow[]): string {
  const paired = pairDominioMovementRows(rows);
  const lines = paired.map((p) =>
    montarLinhaTxtDominio({
      date: parseDateForDominio(p.date),
      debContaStr: p.contaDeb || '0',
      credContaStr: p.contaCred || '0',
      value: Math.max(p.debito, p.credito),
      historico: p.historico,
    }),
  );
  return lines.join('\r\n');
}

export function downloadTxtPlusDominio(content: string, filename: string) {
  if (!content.trim()) {
    throw new Error('Nenhuma linha TXT+ Domínio para exportar.');
  }
  downloadDominioTXT(content, filename.endsWith('.txt') ? filename : `${filename}.txt`);
}

function parseTxtPlusValor(raw: string): number {
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

export function isTxtPlusDominio(text: string): boolean {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^01\d/.test(l));
  if (!line) return false;
  const parts = line.split(';');
  if (parts.length < 6) return false;
  return (
    /^\d{2}\/\d{2}\/\d{4}$/.test(parts[0].trim()) &&
    /^[\d.\s-]+$/.test(parts[1]?.trim() ?? '') &&
    /^[\d.\s-]+$/.test(parts[2]?.trim() ?? '')
  );
}

export function parseTxtPlusToExtratoRows(text: string): ExtratoExportRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ExtratoExportRow[] = [];
  for (const line of lines) {
    if (/^0[123]\d/.test(line)) continue;
    const parts = line.split(';');
    if (parts.length < 4) continue;
    const dateStr = parts[0].trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) continue;
    const contaDeb = parts[1]?.trim() ?? '';
    const contaCred = parts[2]?.trim() ?? '';
    const value = parseTxtPlusValor(parts[3] ?? '');
    const historico = (parts[5]?.trim() || parts[4]?.trim() || 'LANCAMENTO').toUpperCase();
    if (value <= 0) continue;
    out.push({
      date: brDateToIso(dateStr),
      description: historico,
      value,
      nature: 'D',
      accountDebit: contaDeb,
      accountCredit: contaCred,
      operationName: historico,
    });
  }
  return out;
}

export function dominioVisionToExtratoRows(rows: VisionBalanceteRow[]): ExtratoExportRow[] {
  return pairDominioMovementRows(rows).map((p) => ({
    date: brDateToIso(p.date),
    description: p.historico,
    value: Math.max(p.debito, p.credito),
    nature: p.debito >= p.credito ? 'D' : 'C',
    accountDebit: p.contaDeb,
    accountCredit: p.contaCred,
    operationName: p.historico,
  }));
}

export function parseTxtPlusToBalanceteImports(text: string): BalanceteImportRow[] {
  return parseTxtPlusToExtratoRows(text).map((row, index) => ({
    id: `txtplus-${index}-${Date.now()}`,
    dataInicio: row.date,
    codigo: row.accountDebit || row.accountCredit || '',
    classificacao: row.accountDebit || row.accountCredit || '',
    descricao: row.description,
    saldoInicial: 0,
    debito: row.nature === 'D' ? row.value : 0,
    credito: row.nature === 'C' ? row.value : 0,
    saldoFinal: row.nature === 'D' ? row.value : -row.value,
    natureza: row.nature,
  }));
}

export function parseTxtPlusToFolhaRelatorio(text: string): FolhaRelatorioImportRow[] {
  return parseTxtPlusToExtratoRows(text).map((row, index) => ({
    id: `folha-txtplus-${index}-${Date.now()}`,
    date: row.date,
    description: row.description,
    debito: row.nature === 'D' ? row.value : 0,
    credito: row.nature === 'C' ? row.value : 0,
  }));
}
