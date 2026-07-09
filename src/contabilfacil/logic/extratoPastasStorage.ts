/**
 * Pastas de extratos conciliados — cada item ligado à conta banco.
 * Ao selecionar, restaura lançamentos e ativa o banco (regras correspondentes).
 */
import { writePersistedLocalStorageJson, readPersistedLocalStorageJson } from '../../lib/persistentLocalStorage';
import { companyStorageSlug } from './companyWorkspace';
import { flushPersistenceAfterCriticalWrite } from './eyeVisionPersistenceFlush';
import { normContaBancoCode } from './extratoRegrasContasStorage';

export type ExtratoPastaRow = {
  id: string;
  date: string;
  description: string;
  value: number;
  nature: 'D' | 'C';
  accountCode?: string;
  accountDebit?: string;
  accountCredit?: string;
  operationName?: string;
  status?: 'CONCILIADO' | 'PENDENTE';
};

export type ExtratoPastaItem = {
  id: string;
  /** Código reduzido da conta banco a que o extrato pertence. */
  contaBanco: string;
  bancoNome: string;
  /** Rótulo exibido (ex.: Extrato Jun/2026). */
  label: string;
  createdAt: string;
  saldoAnterior: number;
  total: number;
  conciliadas: number;
  pendentes: number;
  rows: ExtratoPastaRow[];
  /** PDF conciliado em base64 (sem data: prefix), se couber. */
  pdfBase64?: string;
  pdfFilename?: string;
};

function metaKey(company: string): string {
  return `contabilfacil_${companyStorageSlug(company)}_extrato_pastas_v1`;
}

function loadAll(company: string): ExtratoPastaItem[] {
  const raw = readPersistedLocalStorageJson<ExtratoPastaItem[]>(metaKey(company), []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === 'object' && Array.isArray(x.rows) && String(x.contaBanco || '').trim())
    .map((x) => ({
      ...x,
      id: x.id || crypto.randomUUID(),
      contaBanco: String(x.contaBanco).trim(),
      bancoNome: String(x.bancoNome || '').trim(),
      label: String(x.label || 'Extrato').trim() || 'Extrato',
      createdAt: x.createdAt || new Date().toISOString(),
      saldoAnterior: Number(x.saldoAnterior) || 0,
      total: Number(x.total) || x.rows.length,
      conciliadas: Number(x.conciliadas) || 0,
      pendentes: Number(x.pendentes) || 0,
      rows: x.rows,
      pdfBase64: x.pdfBase64,
      pdfFilename: x.pdfFilename,
    }));
}

function saveAll(company: string, items: ExtratoPastaItem[]): ExtratoPastaItem[] {
  writePersistedLocalStorageJson(metaKey(company), items);
  void flushPersistenceAfterCriticalWrite();
  return items;
}

export function listExtratoPastas(company: string): ExtratoPastaItem[] {
  return loadAll(company).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listExtratoPastasPorBanco(
  company: string,
  contaBanco: string,
): ExtratoPastaItem[] {
  const norm = normContaBancoCode(contaBanco);
  if (!norm) return listExtratoPastas(company);
  return listExtratoPastas(company).filter(
    (i) => normContaBancoCode(i.contaBanco) === norm,
  );
}

export function countExtratoPastas(company: string): number {
  return loadAll(company).length;
}

export function getExtratoPastaById(
  company: string,
  id: string,
): ExtratoPastaItem | null {
  return loadAll(company).find((i) => i.id === id) ?? null;
}

export type SaveExtratoPastaInput = {
  contaBanco: string;
  bancoNome?: string;
  label?: string;
  saldoAnterior?: number;
  rows: ExtratoPastaRow[];
  pdfBase64?: string;
  pdfFilename?: string;
};

function defaultLabel(rows: ExtratoPastaRow[], createdAt: string): string {
  const dates = rows
    .map((r) => r.date)
    .filter(Boolean)
    .sort();
  const first = dates[0] || '';
  const last = dates[dates.length - 1] || '';
  const fmt = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
  };
  if (first && last && first !== last) return `Extrato ${fmt(first)} a ${fmt(last)}`;
  if (first) return `Extrato ${fmt(first)}`;
  const d = new Date(createdAt);
  return `Extrato ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function saveExtratoNaPasta(
  company: string,
  input: SaveExtratoPastaInput,
): ExtratoPastaItem {
  const contaBanco = String(input.contaBanco || '').trim();
  if (!contaBanco) {
    throw new Error('Defina a conta banco do extrato antes de salvar na pasta.');
  }
  if (!input.rows.length) {
    throw new Error('Nenhum lançamento para salvar.');
  }

  const createdAt = new Date().toISOString();
  const conciliadas = input.rows.filter(
    (r) => Boolean(r.accountDebit?.trim()) && Boolean(r.accountCredit?.trim()),
  ).length;
  const item: ExtratoPastaItem = {
    id: crypto.randomUUID(),
    contaBanco,
    bancoNome: (input.bancoNome || '').trim() || `Banco ${contaBanco}`,
    label: (input.label || '').trim() || defaultLabel(input.rows, createdAt),
    createdAt,
    saldoAnterior: Number(input.saldoAnterior) || 0,
    total: input.rows.length,
    conciliadas,
    pendentes: input.rows.length - conciliadas,
    rows: input.rows.map((r) => ({ ...r })),
    pdfBase64: input.pdfBase64,
    pdfFilename: input.pdfFilename,
  };

  const all = loadAll(company);
  all.unshift(item);
  // Limita a 40 extratos salvos por empresa (evita estourar cota)
  saveAll(company, all.slice(0, 40));
  return item;
}

export function removeExtratoDaPasta(company: string, id: string): ExtratoPastaItem[] {
  const next = loadAll(company).filter((i) => i.id !== id);
  return saveAll(company, next);
}

export function downloadExtratoPastaPdf(item: ExtratoPastaItem): void {
  if (!item.pdfBase64) {
    throw new Error('Este extrato não tem PDF salvo. Selecione-o e exporte o PDF de novo.');
  }
  const filename = item.pdfFilename || `extrato_${item.contaBanco}_${item.id.slice(0, 8)}.pdf`;
  const bin = atob(item.pdfBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Agrupa pastas por conta banco para a UI. */
export function groupExtratoPastasPorBanco(
  items: ExtratoPastaItem[],
): Array<{ contaBanco: string; bancoNome: string; items: ExtratoPastaItem[] }> {
  const map = new Map<string, { contaBanco: string; bancoNome: string; items: ExtratoPastaItem[] }>();
  for (const it of items) {
    const key = normContaBancoCode(it.contaBanco) || it.contaBanco;
    const cur = map.get(key);
    if (cur) {
      cur.items.push(it);
      if (!cur.bancoNome && it.bancoNome) cur.bancoNome = it.bancoNome;
    } else {
      map.set(key, {
        contaBanco: it.contaBanco,
        bancoNome: it.bancoNome,
        items: [it],
      });
    }
  }
  return [...map.values()].sort((a, b) =>
    a.bancoNome.localeCompare(b.bancoNome, 'pt-BR') ||
    a.contaBanco.localeCompare(b.contaBanco),
  );
}
