/**
 * Pastas de extratos conciliados — cada item ligado à conta banco.
 * Com STORAGE Postgres: metadata no PG + PDF no MinIO (isolado por office_token).
 * Sem servidor: fallback localStorage (comportamento anterior).
 */
import { writePersistedLocalStorageJson, readPersistedLocalStorageJson } from '../../lib/persistentLocalStorage';
import { companyStorageSlug } from './companyWorkspace';
import { flushPersistenceAfterCriticalWrite } from './eyeVisionPersistenceFlush';
import { normContaBancoCode } from './extratoRegrasContasStorage';
import { readStoredCompanyAccessToken } from './eyeVisionAdmin';
import {
  apiDownloadExtratoPastaPdf,
  apiListExtratoPastas,
  apiRemoveExtratoPasta,
  apiSaveExtratoPasta,
  isPostgresStorageClientEnabled,
  probeWorkspaceStorageHealth,
} from '../../gestaoContabil/dbClientPostgres';

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
  /** PDF conciliado em base64 (sem data: prefix) — só no fallback local. */
  pdfBase64?: string;
  pdfFilename?: string;
  /** Chave MinIO quando persistido no servidor. */
  pdfObjectKey?: string;
};

function metaKey(company: string): string {
  return `contabilfacil_${companyStorageSlug(company)}_extrato_pastas_v1`;
}

function normalizeItem(x: ExtratoPastaItem): ExtratoPastaItem {
  return {
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
    pdfObjectKey: x.pdfObjectKey,
  };
}

function loadAllLocal(company: string): ExtratoPastaItem[] {
  const raw = readPersistedLocalStorageJson<ExtratoPastaItem[]>(metaKey(company), []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === 'object' && Array.isArray(x.rows) && String(x.contaBanco || '').trim())
    .map(normalizeItem);
}

function saveAllLocal(company: string, items: ExtratoPastaItem[]): ExtratoPastaItem[] {
  writePersistedLocalStorageJson(metaKey(company), items);
  void flushPersistenceAfterCriticalWrite();
  return items;
}

async function useRemotePastas(): Promise<boolean> {
  if (!isPostgresStorageClientEnabled()) return false;
  const token = readStoredCompanyAccessToken();
  if (!token) return false;
  return probeWorkspaceStorageHealth();
}

export function listExtratoPastas(company: string): ExtratoPastaItem[] {
  return loadAllLocal(company).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Lista remota (Postgres) e espelha no LS para UI síncrona. */
export async function syncExtratoPastasFromServer(company: string): Promise<ExtratoPastaItem[]> {
  const token = readStoredCompanyAccessToken();
  if (!token || !(await useRemotePastas())) {
    return listExtratoPastas(company);
  }
  const slug = companyStorageSlug(company);
  const remote = await apiListExtratoPastas(token, slug);
  const local = listExtratoPastas(company);
  // Remoto vazio não apaga pastas locais (evita sumiço após migrate/token).
  if (remote.length === 0) {
    return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const items = remote.map((r) =>
    normalizeItem({
      id: r.id,
      contaBanco: r.contaBanco,
      bancoNome: r.bancoNome,
      label: r.label,
      createdAt: r.createdAt,
      saldoAnterior: r.saldoAnterior,
      total: r.total,
      conciliadas: r.conciliadas,
      pendentes: r.pendentes,
      rows: r.rows as ExtratoPastaRow[],
      pdfFilename: r.pdfFilename,
      pdfObjectKey: r.pdfObjectKey,
    }),
  );
  // Une remoto + locais que ainda não estão no servidor (por id).
  const remoteIds = new Set(items.map((i) => i.id));
  for (const loc of local) {
    if (!remoteIds.has(loc.id)) items.push(loc);
  }
  saveAllLocal(company, items);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  return loadAllLocal(company).length;
}

export function getExtratoPastaById(
  company: string,
  id: string,
): ExtratoPastaItem | null {
  return loadAllLocal(company).find((i) => i.id === id) ?? null;
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
    // No LS local não guarda PDF gigante se formos subir ao MinIO — mantém se offline.
    pdfBase64: input.pdfBase64,
    pdfFilename: input.pdfFilename,
  };

  const all = loadAllLocal(company);
  all.unshift(item);
  saveAllLocal(company, all.slice(0, 40));

  // Fire-and-forget: sobe para Postgres/MinIO no token ativo
  void persistPastaRemote(company, item).catch((err) => {
    console.warn('[extratoPastas] falha ao salvar no servidor', err);
  });

  return item;
}

async function persistPastaRemote(company: string, item: ExtratoPastaItem): Promise<void> {
  if (!(await useRemotePastas())) return;
  const token = readStoredCompanyAccessToken();
  if (!token) return;
  const saved = await apiSaveExtratoPasta(token, companyStorageSlug(company), {
    id: item.id,
    contaBanco: item.contaBanco,
    bancoNome: item.bancoNome,
    label: item.label,
    createdAt: item.createdAt,
    saldoAnterior: item.saldoAnterior,
    rows: item.rows,
    pdfBase64: item.pdfBase64,
    pdfFilename: item.pdfFilename,
  });
  // Atualiza espelho local sem pdfBase64 (economiza cota) se MinIO guardou
  const all = loadAllLocal(company).map((x) =>
    x.id === item.id
      ? normalizeItem({
          ...x,
          pdfObjectKey: saved.pdfObjectKey,
          pdfFilename: saved.pdfFilename || x.pdfFilename,
          pdfBase64: saved.pdfObjectKey ? undefined : x.pdfBase64,
        })
      : x,
  );
  saveAllLocal(company, all);
}

export function removeExtratoDaPasta(company: string, id: string): ExtratoPastaItem[] {
  const next = loadAllLocal(company).filter((i) => i.id !== id);
  const saved = saveAllLocal(company, next);
  const token = readStoredCompanyAccessToken();
  if (token) {
    void useRemotePastas().then((ok) => {
      if (ok) void apiRemoveExtratoPasta(token, id);
    });
  }
  return saved;
}

export function downloadExtratoPastaPdf(item: ExtratoPastaItem): void {
  const token = readStoredCompanyAccessToken();
  if (item.pdfObjectKey && token) {
    void apiDownloadExtratoPastaPdf(token, item.id, item.pdfFilename).catch(() => {
      if (item.pdfBase64) downloadLocalPdf(item);
      else throw new Error('Não foi possível baixar o PDF do servidor.');
    });
    return;
  }
  if (!item.pdfBase64) {
    throw new Error('Este extrato não tem PDF salvo. Selecione-o e exporte o PDF de novo.');
  }
  downloadLocalPdf(item);
}

function downloadLocalPdf(item: ExtratoPastaItem): void {
  if (!item.pdfBase64) return;
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
