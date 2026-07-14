import type { GenericColunaDef } from '../../lib/parcelamentoColunasExtract';
import { companyStorageSlug } from './companyWorkspace';
import {
  readPersistedLocalStorageJson,
  writePersistedLocalStorageJson,
} from '../../lib/persistentLocalStorage';

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
  /** plano | balancete | extrato | folha | … — separa layouts salvos por módulo */
  kind?: string;
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
  valorSignHeuristic?: 'automatic' | 'color_blue_c_red_d' | 'color_blue_d_red_c';
};

type ExtratoOcrLayoutStore = {
  layouts: ExtratoOcrLayoutSaved[];
  activeLayoutId: string | null;
  activeByKind?: Record<string, string>;
};

function layoutKindOf(layout: Pick<ExtratoOcrLayoutSaved, 'kind' | 'contaBanco'>): string {
  if (layout.kind?.trim()) return layout.kind.trim();
  const conta = layout.contaBanco.trim();
  if (conta === 'plano' || conta === 'balancete' || conta === 'folha' || conta === 'fiscal') {
    return conta;
  }
  return 'extrato';
}

function storageKey(companyName: string): string {
  return `contabilfacil_${companyStorageSlug(companyName)}_extrato_ocr_layouts_v1`;
}

function readStore(companyName: string): ExtratoOcrLayoutStore {
  const parsed = readPersistedLocalStorageJson<Partial<ExtratoOcrLayoutStore>>(
    storageKey(companyName),
    { layouts: [], activeLayoutId: null },
  );
  return {
    layouts: Array.isArray(parsed.layouts) ? parsed.layouts : [],
    activeLayoutId: parsed.activeLayoutId ?? null,
    activeByKind:
      parsed.activeByKind && typeof parsed.activeByKind === 'object'
        ? (parsed.activeByKind as Record<string, string>)
        : undefined,
  };
}

function writeStore(companyName: string, store: ExtratoOcrLayoutStore): void {
  writePersistedLocalStorageJson(storageKey(companyName), store);
}

export function listExtratoOcrLayouts(companyName: string, kind?: string): ExtratoOcrLayoutSaved[] {
  const sorted = readStore(companyName).layouts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (!kind) return sorted;
  return sorted.filter((l) => layoutKindOf(l) === kind);
}

export function getActiveExtratoOcrLayout(
  companyName: string,
  kind = 'extrato',
): ExtratoOcrLayoutSaved | null {
  const store = readStore(companyName);
  const id = store.activeByKind?.[kind] ?? (kind === 'extrato' ? store.activeLayoutId : null);
  if (!id) return null;
  const hit = store.layouts.find((l) => l.id === id) ?? null;
  if (!hit) return null;
  if (layoutKindOf(hit) !== kind) return null;
  return hit;
}

export function getExtratoBancoConta(companyName: string): string {
  return getActiveExtratoOcrLayout(companyName, 'extrato')?.contaBanco?.trim() ?? '';
}

export function getExtratoBancoNome(companyName: string): string {
  return getActiveExtratoOcrLayout(companyName, 'extrato')?.bancoNome?.trim() ?? '';
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
  const active = getActiveExtratoOcrLayout(companyName, 'extrato');
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
    kind: layout.kind?.trim() || layoutKindOf(layout),
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
    valorSignHeuristic: layout.valorSignHeuristic,
  };
  if (existingIdx >= 0) {
    store.layouts[existingIdx] = saved;
  } else {
    store.layouts.unshift(saved);
  }
  const kind = layoutKindOf(saved);
  store.activeByKind = { ...(store.activeByKind ?? {}), [kind]: saved.id };
  if (kind === 'extrato') store.activeLayoutId = saved.id;
  writeStore(companyName, store);
  return saved;
}

export function setActiveExtratoOcrLayout(
  companyName: string,
  layoutId: string,
  kind?: string,
): void {
  const store = readStore(companyName);
  const layout = store.layouts.find((l) => l.id === layoutId);
  if (!layout) return;
  const resolvedKind = kind?.trim() || layoutKindOf(layout);
  store.activeByKind = { ...(store.activeByKind ?? {}), [resolvedKind]: layoutId };
  if (resolvedKind === 'extrato') store.activeLayoutId = layoutId;
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

/**
 * Grava/atualiza banco + conta contábil usada na conciliação.
 * Preferência: atualizar o layout ativo (preserva colunas/faixas),
 * em vez de criar um layout novo e “perder” a configuração.
 */
export function saveExtratoBancoParaImportacao(
  companyName: string,
  bancoNome: string,
  contaBanco: string,
): ExtratoOcrLayoutSaved {
  const normBanco = bancoNome.trim();
  const normConta = contaBanco.trim();
  const store = readStore(companyName);
  const byPair = store.layouts.find(
    (l) => l.bancoNome === normBanco && l.contaBanco === normConta,
  );
  const active = getActiveExtratoOcrLayout(companyName, 'extrato');
  // Atualiza o ativo se existir (mesmo que a conta tenha mudado) — evita layout órfão.
  const base = byPair ?? active ?? null;
  return saveExtratoOcrLayout(companyName, {
    id: base?.id,
    kind: 'extrato',
    bancoNome: normBanco,
    contaBanco: normConta,
    ignoreLineWords: base?.ignoreLineWords ?? '',
    semDelimitacaoVertical: base?.semDelimitacaoVertical ?? true,
    columns: base?.columns ?? [],
    columnsNorm: base?.columnsNorm,
    faixaStart: base?.faixaStart ?? 0,
    faixaEnd: base?.faixaEnd ?? 1,
    faixaStartNorm: base?.faixaStartNorm,
    faixaEndNorm: base?.faixaEndNorm,
    faixaInicioMarcado: base?.faixaInicioMarcado ?? false,
    faixaFimMarcado: base?.faixaFimMarcado ?? false,
    faixaPorPagina: base?.faixaPorPagina,
    faixaInicioPagina: base?.faixaInicioPagina,
    faixaFimPagina: base?.faixaFimPagina,
    imgWidth: base?.imgWidth ?? 1,
    imgHeight: base?.imgHeight ?? 1,
    valorSignHeuristic: base?.valorSignHeuristic,
  });
}
