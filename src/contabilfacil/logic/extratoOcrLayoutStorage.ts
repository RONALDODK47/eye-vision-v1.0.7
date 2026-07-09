import type { GenericColunaDef } from '../../lib/parcelamentoColunasExtract';
import { companyStorageSlug } from './companyWorkspace';
import { writePersistedLocalStorageJson } from '../../lib/persistentLocalStorage';

export type ExtratoFaixaPaginaSaved = {
  faixaStartNorm: number;
  faixaEndNorm: number;
  faixaInicioMarcado: boolean;
  faixaFimMarcado: boolean;
  semDelimitacaoVertical?: boolean;
};

export type ExtratoOcrLayoutColumnNorm = {
  id: string;
  startNorm: number;
  endNorm: number;
};

export type ExtratoOcrLayoutSaved = {
  id: string;
  bancoNome: string;
  contaBanco: string;
  ignoreLineWords: string;
  semDelimitacaoVertical: boolean;
  columns: GenericColunaDef[];
  /** Posição normalizada 0–1 na largura da imagem (independe de escala). */
  columnsNorm?: ExtratoOcrLayoutColumnNorm[];
  faixaStart: number;
  faixaEnd: number;
  /** Posição normalizada 0–1 na altura da imagem (legado — preferir faixaPorPagina). */
  faixaStartNorm?: number;
  faixaEndNorm?: number;
  faixaInicioMarcado: boolean;
  faixaFimMarcado: boolean;
  /** Delimitação por página: «1» = verde abaixo do saldo; última = vermelha no fim. */
  faixaPorPagina?: Record<string, ExtratoFaixaPaginaSaved>;
  /** Página onde a linha verde (início) foi marcada. */
  faixaInicioPagina?: number;
  /** Página onde a linha vermelha (fim) foi marcada. */
  faixaFimPagina?: number;
  imgWidth: number;
  imgHeight: number;
  createdAt: string;
  updatedAt: string;
};

type ExtratoOcrLayoutStore = {
  layouts: ExtratoOcrLayoutSaved[];
  activeLayoutId: string | null;
};

function storageKey(companyName: string): string {
  return `contabilfacil_${companyStorageSlug(companyName)}_extrato_ocr_layouts_v1`;
}

function readStore(companyName: string): ExtratoOcrLayoutStore {
  try {
    const raw = localStorage.getItem(storageKey(companyName));
    if (!raw?.trim()) return { layouts: [], activeLayoutId: null };
    const parsed = JSON.parse(raw) as Partial<ExtratoOcrLayoutStore>;
    return {
      layouts: Array.isArray(parsed.layouts) ? parsed.layouts : [],
      activeLayoutId: parsed.activeLayoutId ?? null,
    };
  } catch {
    return { layouts: [], activeLayoutId: null };
  }
}

function writeStore(companyName: string, store: ExtratoOcrLayoutStore): void {
  writePersistedLocalStorageJson(storageKey(companyName), store);
}

export function listExtratoOcrLayouts(companyName: string): ExtratoOcrLayoutSaved[] {
  return readStore(companyName).layouts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getActiveExtratoOcrLayout(companyName: string): ExtratoOcrLayoutSaved | null {
  const store = readStore(companyName);
  if (!store.activeLayoutId) return null;
  return store.layouts.find((l) => l.id === store.activeLayoutId) ?? null;
}

export function getExtratoBancoConta(companyName: string): string {
  return getActiveExtratoOcrLayout(companyName)?.contaBanco?.trim() ?? '';
}

export function getExtratoBancoNome(companyName: string): string {
  return getActiveExtratoOcrLayout(companyName)?.bancoNome?.trim() ?? '';
}

/**
 * Define a conta contábil do banco usada na conciliação (lado banco D/C).
 * Atualiza o layout ativo ou cria um layout mínimo se ainda não existir.
 */
export function setExtratoContaBancoAtiva(
  companyName: string,
  contaBanco: string,
  bancoNome?: string,
): ExtratoOcrLayoutSaved {
  const code = contaBanco.trim();
  const active = getActiveExtratoOcrLayout(companyName);
  const nome =
    (bancoNome ?? '').trim() ||
    active?.bancoNome?.trim() ||
    `Banco ${code}`;
  return saveExtratoBancoParaImportacao(companyName, nome, code);
}

export function saveExtratoOcrLayout(
  companyName: string,
  layout: Omit<ExtratoOcrLayoutSaved, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): ExtratoOcrLayoutSaved {
  const store = readStore(companyName);
  const now = new Date().toISOString();
  const existingIdx = layout.id ? store.layouts.findIndex((l) => l.id === layout.id) : -1;
  const saved: ExtratoOcrLayoutSaved = {
    id: layout.id ?? crypto.randomUUID(),
    bancoNome: layout.bancoNome.trim(),
    contaBanco: layout.contaBanco.trim(),
    ignoreLineWords: layout.ignoreLineWords,
    semDelimitacaoVertical: layout.semDelimitacaoVertical,
    columns: layout.columns,
    columnsNorm: layout.columnsNorm,
    faixaStart: layout.faixaStart,
    faixaEnd: layout.faixaEnd,
    faixaStartNorm: layout.faixaStartNorm,
    faixaEndNorm: layout.faixaEndNorm,
    faixaInicioMarcado: layout.faixaInicioMarcado,
    faixaFimMarcado: layout.faixaFimMarcado,
    faixaPorPagina: layout.faixaPorPagina,
    faixaInicioPagina: layout.faixaInicioPagina,
    faixaFimPagina: layout.faixaFimPagina,
    imgWidth: layout.imgWidth,
    imgHeight: layout.imgHeight,
    createdAt: existingIdx >= 0 ? store.layouts[existingIdx]!.createdAt : now,
    updatedAt: now,
  };
  if (existingIdx >= 0) {
    store.layouts[existingIdx] = saved;
  } else {
    store.layouts.unshift(saved);
  }
  store.activeLayoutId = saved.id;
  writeStore(companyName, store);
  return saved;
}

export function setActiveExtratoOcrLayout(companyName: string, layoutId: string): void {
  const store = readStore(companyName);
  if (!store.layouts.some((l) => l.id === layoutId)) return;
  store.activeLayoutId = layoutId;
  writeStore(companyName, store);
}

export function deleteExtratoOcrLayout(companyName: string, layoutId: string): void {
  const store = readStore(companyName);
  store.layouts = store.layouts.filter((l) => l.id !== layoutId);
  if (store.activeLayoutId === layoutId) {
    store.activeLayoutId = store.layouts[0]?.id ?? null;
  }
  writeStore(companyName, store);
}

/** Grava banco + conta contábil ao importar OFX (sem mapeamento OCR). */
export function saveExtratoBancoParaImportacao(
  companyName: string,
  bancoNome: string,
  contaBanco: string,
): ExtratoOcrLayoutSaved {
  const normBanco = bancoNome.trim();
  const normConta = contaBanco.trim();
  const store = readStore(companyName);
  const existing = store.layouts.find(
    (l) => l.bancoNome === normBanco && l.contaBanco === normConta,
  );
  const base = existing ?? getActiveExtratoOcrLayout(companyName);
  return saveExtratoOcrLayout(companyName, {
    id: existing?.id,
    bancoNome: normBanco,
    contaBanco: normConta,
    ignoreLineWords: base?.ignoreLineWords ?? '',
    semDelimitacaoVertical: base?.semDelimitacaoVertical ?? true,
    columns: base?.columns ?? [],
    faixaStart: base?.faixaStart ?? 0,
    faixaEnd: base?.faixaEnd ?? 1,
    faixaInicioMarcado: base?.faixaInicioMarcado ?? false,
    faixaFimMarcado: base?.faixaFimMarcado ?? false,
    imgWidth: base?.imgWidth ?? 1,
    imgHeight: base?.imgHeight ?? 1,
  });
}
