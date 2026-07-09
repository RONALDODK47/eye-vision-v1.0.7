import type { VisionBalanceteRow, VisionPlanoRow } from '../types/accounting';
import {
  compareClassificacaoContabil,
  getClassificacao,
  resolveTipoConta,
  sortRowsByClassificacao,
} from './demonstracoesContabeis';
import { parseBrDateToTime } from './dateBounds';
import { buildRowKey, recalcularSaldoFinalRow } from './mergeRazaoSaldoInicial';
import {
  sliceRazaoIndexBefore,
  sliceRazaoIndexByPeriod,
  type RazaoTimeIndex,
} from './razaoTimeIndex';

export { buildRazaoTimeIndex, shouldIndexRazao } from './razaoTimeIndex';

function normCls(cls: string): string {
  return cls.replace(/\./g, '').replace(/\s/g, '');
}

function normReducedCode(code: string): string {
  const digits = code.replace(/\D/g, '');
  if (!digits) return '';
  const normalized = digits.replace(/^0+/, '');
  return normalized || '0';
}

/** Mapas O(1) para lookup do plano (evita .find em cada lançamento). */
export type PlanoLookup = {
  byCls: Map<string, VisionPlanoRow>;
  byReduced: Map<string, VisionPlanoRow>;
};

export function buildPlanoLookup(planoRows: VisionPlanoRow[]): PlanoLookup {
  const byCls = new Map<string, VisionPlanoRow>();
  const byReduced = new Map<string, VisionPlanoRow>();
  for (const p of planoRows) {
    const cls = normCls(p.codigo);
    if (cls && !byCls.has(cls)) byCls.set(cls, p);
    if (p.codigoReduzido) {
      const red = normReducedCode(p.codigoReduzido);
      if (red && !byReduced.has(red)) byReduced.set(red, p);
    }
  }
  return { byCls, byReduced };
}

function findPlanoRow(
  row: VisionBalanceteRow,
  planoRows: VisionPlanoRow[],
  lookup?: PlanoLookup,
): VisionPlanoRow | undefined {
  const cls = normCls(getClassificacao(row));
  const codReduced = normReducedCode(normCls(row.codigo ?? ''));
  if (lookup) {
    if (cls) {
      const hit = lookup.byCls.get(cls);
      if (hit) return hit;
    }
    if (codReduced) {
      const hit = lookup.byReduced.get(codReduced);
      if (hit) return hit;
    }
    return undefined;
  }
  return planoRows.find((p) => {
    const pc = normCls(p.codigo);
    if (pc === cls) return true;
    if (p.codigoReduzido && normReducedCode(p.codigoReduzido) === codReduced) return true;
    return false;
  });
}

function enrichNomeDoPlano(
  row: VisionBalanceteRow,
  planoRows: VisionPlanoRow[],
  lookup?: PlanoLookup,
): VisionBalanceteRow {
  const plano = findPlanoRow(row, planoRows, lookup);
  if (!plano) return row;
  return {
    ...row,
    nome: row.nome?.trim() ? row.nome : plano.nome,
    classificacao: plano.codigo,
    codigo: row.codigo?.trim() ? row.codigo : (plano.codigoReduzido ?? plano.codigo),
  };
}

function isNomeGrupoSintetico(nome: string): boolean {
  const n = nome.trim();
  if (n.length < 3) return false;
  return n === n.toUpperCase() && /[A-ZÁÉÍÓÚÃÕÇ]/.test(n) && !/[a-záéíóúãõç]/.test(n);
}

/** Remove contas sintéticas — totais vêm do plano de contas (CPC). */
export function filtrarContasAnaliticas(
  linhas: VisionBalanceteRow[],
  planoRows: VisionPlanoRow[] = [],
  lookup?: PlanoLookup,
): VisionBalanceteRow[] {
  const planoLookup = lookup ?? (planoRows.length > 0 ? buildPlanoLookup(planoRows) : undefined);
  const enriched = linhas.map((r) => enrichNomeDoPlano(r, planoRows, planoLookup));

  return enriched.filter((r) => {
    if (planoRows.length > 0) {
      const plano = findPlanoRow(r, planoRows, planoLookup);
      if (plano?.tipo === 'S') return false;
      if (plano?.tipo === 'A') return true;
      return resolveTipoConta(r, enriched, planoRows) === 'A';
    }
    if (isNomeGrupoSintetico(r.nome ?? '')) return false;
    if (r.tipo === 'S') return false;
    return true;
  });
}

/** @deprecated use filtrarContasAnaliticas */
export const filtrarLinhasAnaliticasRazao = filtrarContasAnaliticas;

/** Compara datas DD/MM/AAAA ou ISO YYYY-MM-DD (cronológica). */
export function compareDataRazao(a?: string, b?: string): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const na = parseDataRazao(a) || a;
  const nb = parseDataRazao(b) || b;
  const ta = parseBrDateToTime(na);
  const tb = parseBrDateToTime(nb);
  if (ta !== null && tb !== null) return ta - tb;
  return na.localeCompare(nb);
}

function valorMovimentoRazao(n: unknown): number {
  if (typeof n === 'number') return Number.isFinite(n) ? Math.abs(n) : 0;
  if (typeof n === 'string') {
    const t = n.trim().replace(/\s/g, '');
    if (!t) return 0;
    const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
    const v = Math.abs(parseFloat(normalized));
    return Number.isFinite(v) ? v : 0;
  }
  return 0;
}

function isHistoricoSaldoInicialRazao(nome?: string): boolean {
  const n = (nome ?? '').trim();
  if (!n) return false;
  return /saldo\s*inicial|referente\s+saldo|^\s*s\.?\s*i\.?\s*$/i.test(n);
}

function anoDaDataRazao(data: string): number | null {
  const br = parseDataRazao(data) || data;
  const t = parseBrDateToTime(br);
  if (t === null) return null;
  return new Date(t).getFullYear();
}

/**
 * Menor e maior data com lançamento real (D ou C > 0) no razão (DD/MM/AAAA).
 * Ignora saldo inicial e anos-fantasma (ex.: 2001 com quase nada quando o movimento é 2026).
 * De/Até amplo no filtro continua válido — as colunas usam só meses com lançamento.
 */
export function extrairPeriodoRazao(linhas: VisionBalanceteRow[]): { min?: string; max?: string } {
  const candidatos: { data: string; ano: number; mov: number }[] = [];
  for (const r of linhas) {
    if (isHistoricoSaldoInicialRazao(r.nome)) continue;
    const raw = r.data?.trim();
    if (!raw) continue;
    const deb = valorMovimentoRazao(r.debito);
    const cred = valorMovimentoRazao(r.credito);
    if (deb < 0.01 && cred < 0.01) continue;
    const data = parseDataRazao(raw) || raw;
    const ano = anoDaDataRazao(data);
    if (ano === null) continue;
    candidatos.push({ data, ano, mov: deb + cred });
  }
  if (!candidatos.length) return {};

  const porAno = new Map<number, number>();
  for (const c of candidatos) {
    porAno.set(c.ano, (porAno.get(c.ano) ?? 0) + c.mov);
  }
  let anoPrincipal = 0;
  let maxMov = 0;
  for (const [ano, mov] of porAno) {
    if (mov > maxMov) {
      maxMov = mov;
      anoPrincipal = ano;
    }
  }
  const limiar = maxMov * 0.01;
  const anosOk = new Set<number>();
  for (const [ano, mov] of porAno) {
    const dist = Math.abs(ano - anoPrincipal);
    if (porAno.size === 1 || dist <= 1 || mov >= limiar) anosOk.add(ano);
  }

  const datas = candidatos.filter((c) => anosOk.has(c.ano)).map((c) => c.data);
  if (!datas.length) return {};
  const sorted = [...datas].sort(compareDataRazao);
  return { min: sorted[0], max: sorted[sorted.length - 1] };
}

export type MontarBalanceteCtx = {
  razaoIndex?: RazaoTimeIndex;
  planoLookup?: PlanoLookup;
};

/** Filtra lançamentos por intervalo (DD/MM/AAAA). De/até opcionais — aberto se omitido. */
export function filtrarRazaoPorPeriodo(
  linhas: VisionBalanceteRow[],
  de?: string,
  ate?: string,
  razaoIndex?: RazaoTimeIndex,
): VisionBalanceteRow[] {
  const fromStr = de?.trim() ?? '';
  const toStr = ate?.trim() ?? '';
  if (razaoIndex && (fromStr || toStr)) {
    return sliceRazaoIndexByPeriod(razaoIndex, de, ate);
  }
  if (!fromStr && !toStr) return linhas;

  let fTime = 0;
  let tTime = Number.MAX_SAFE_INTEGER;

  if (fromStr) {
    const t = parseBrDateToTime(fromStr);
    if (t !== null) fTime = t;
  }
  if (toStr) {
    const t = parseBrDateToTime(toStr);
    if (t !== null) tTime = t;
  }
  if (fTime > tTime) [fTime, tTime] = [tTime, fTime];

  return linhas.filter((r) => {
    if (!r.data?.trim()) return false;
    const dTime = parseBrDateToTime(r.data);
    if (dTime === null) return false;
    return dTime >= fTime && dTime <= tTime;
  });
}

/** Lançamentos estritamente anteriores à data (para saldo inicial do período). */
export function filtrarRazaoAntesDe(
  linhas: VisionBalanceteRow[],
  dataInicio?: string,
  razaoIndex?: RazaoTimeIndex,
): VisionBalanceteRow[] {
  const de = dataInicio?.trim() ?? '';
  if (!de) return [];
  if (razaoIndex) return sliceRazaoIndexBefore(razaoIndex, dataInicio);
  const deTime = parseBrDateToTime(de);
  if (deTime === null) return [];
  return linhas.filter((r) => {
    if (!r.data?.trim()) return false;
    const t = parseBrDateToTime(r.data);
    return t !== null && t < deTime;
  });
}

function liquidoMovimentoParaSaldo(
  debito: number,
  credito: number,
): Pick<VisionBalanceteRow, 'saldoInicial' | 'naturezaSaldoInicial'> {
  const liq = debito - credito;
  if (Math.abs(liq) < 0.001) return { saldoInicial: 0, naturezaSaldoInicial: undefined };
  return {
    saldoInicial: Math.abs(liq),
    naturezaSaldoInicial: liq > 0 ? 'D' : 'C',
  };
}

function chaveContaRazao(r: VisionBalanceteRow): string {
  const cls = normCls(getClassificacao(r));
  return cls ? `cls:${cls}` : buildRowKey(r);
}

/** Balancete do período: SI = movimentos anteriores; D/C = no intervalo; SF recalculado. */
export function montarBalanceteComPeriodo(
  todasLinhas: VisionBalanceteRow[],
  linhasNoPeriodo: VisionBalanceteRow[],
  planoRows: VisionPlanoRow[],
  dataInicio?: string,
  dataFim?: string,
  ctx?: MontarBalanceteCtx,
): VisionBalanceteRow[] {
  const planoLookup = ctx?.planoLookup ?? (planoRows.length > 0 ? buildPlanoLookup(planoRows) : undefined);
  const razaoIndex = ctx?.razaoIndex;

  const analiticasPeriodo = filtrarContasAnaliticas(linhasNoPeriodo, planoRows, planoLookup);
  const aggPeriodo = agregarRazaoPorConta(analiticasPeriodo, planoRows, planoLookup);

  const aggAntes = agregarRazaoPorConta(
    filtrarContasAnaliticas(
      filtrarRazaoAntesDe(todasLinhas, dataInicio, razaoIndex),
      planoRows,
      planoLookup,
    ),
    planoRows,
    planoLookup,
  );

  const siMap = new Map<string, Pick<VisionBalanceteRow, 'saldoInicial' | 'naturezaSaldoInicial'>>();
  for (const r of aggAntes) {
    const key = chaveContaRazao(r);
    if (key) siMap.set(key, liquidoMovimentoParaSaldo(r.debito, r.credito));
  }

  const keysPeriodo = new Set(aggPeriodo.map((r) => chaveContaRazao(r)).filter(Boolean));
  const dataRef = dataFim?.trim() || dataInicio?.trim();

  const merged: VisionBalanceteRow[] = aggPeriodo.map((r) => {
    const key = chaveContaRazao(r);
    const si = key ? siMap.get(key) : undefined;
    return {
      ...r,
      saldoInicial: si?.saldoInicial ?? 0,
      naturezaSaldoInicial: si?.naturezaSaldoInicial,
      data: dataRef || r.data,
    };
  });

  for (const r of aggAntes) {
    const key = chaveContaRazao(r);
    if (!key || keysPeriodo.has(key)) continue;
    const si = siMap.get(key)!;
    if (Math.abs(si.saldoInicial) < 0.001) continue;
    merged.push({
      ...r,
      ...si,
      debito: 0,
      credito: 0,
      saldoFinal: 0,
      data: dataRef || r.data,
    });
  }

  return montarBalanceteComPlano(merged, planoRows, [], planoLookup);
}

/** Ordem Domínio: data crescente → sequência do lançamento → débito antes do crédito. */
export function sortRowsByDataRazao(rows: VisionBalanceteRow[]): VisionBalanceteRow[] {
  return [...rows].sort((a, b) => {
    const dateDiff = compareDataRazao(a.data, b.data);
    if (dateDiff !== 0) return dateDiff;

    const ordemA = a.ordem ?? Number.MAX_SAFE_INTEGER;
    const ordemB = b.ordem ?? Number.MAX_SAFE_INTEGER;
    if (ordemA !== ordemB) return ordemA - ordemB;

    const ladoA = a.debito > 0 ? 0 : 1;
    const ladoB = b.debito > 0 ? 0 : 1;
    if (ladoA !== ladoB) return ladoA - ladoB;

    return (a.codigo ?? '').localeCompare(b.codigo ?? '', 'pt-BR');
  });
}

/** Agrega lançamentos por conta analítica (chave = classificação canônica). */
export function agregarRazaoPorConta(
  linhas: VisionBalanceteRow[],
  planoRows: VisionPlanoRow[] = [],
  lookup?: PlanoLookup,
): VisionBalanceteRow[] {
  const planoLookup = lookup ?? (planoRows.length > 0 ? buildPlanoLookup(planoRows) : undefined);
  const map = new Map<string, VisionBalanceteRow>();

  for (const raw of linhas) {
    const r = enrichNomeDoPlano(raw, planoRows, planoLookup);
    const clsKey = normCls(getClassificacao(r));
    const key = clsKey ? `cls:${clsKey}` : buildRowKey(r);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        codigo: r.codigo,
        classificacao: r.classificacao,
        nome: r.nome,
        saldoInicial: 0,
        debito: 0,
        credito: 0,
        saldoFinal: 0,
        data: r.data,
        naturezaSaldoInicial: r.naturezaSaldoInicial,
        tipo: 'A',
      });
    }

    const target = map.get(key)!;
    target.saldoInicial += r.saldoInicial;
    target.debito += r.debito;
    target.credito += r.credito;
    if (r.nome) target.nome = r.nome;
    if (r.codigo) target.codigo = r.codigo;
    if (r.classificacao) target.classificacao = r.classificacao;
    if (r.naturezaSaldoInicial) target.naturezaSaldoInicial = r.naturezaSaldoInicial;
    if (r.data && (!target.data || compareDataRazao(r.data, target.data) < 0)) {
      target.data = r.data;
    }
  }

  return sortRowsByClassificacao([...map.values()]);
}

function isFilhaDe(paiCls: string, filhaCls: string): boolean {
  const p = normCls(paiCls);
  const f = normCls(filhaCls);
  if (!p || !f || f === p) return false;
  return f.startsWith(p) && f.length > p.length;
}

function isContaFolha(cls: string, todas: string[]): boolean {
  const n = normCls(cls);
  return !todas.some((k) => k !== n && k.startsWith(n) && k.length > n.length);
}

/** Monta balancete único: analíticas importadas + sintéticas calculadas do plano (sem duplicar). */
export function montarBalanceteComPlano(
  mergedRows: VisionBalanceteRow[],
  planoRows: VisionPlanoRow[],
  saldoInicialRows: VisionBalanceteRow[] = [],
  lookup?: PlanoLookup,
): VisionBalanceteRow[] {
  const planoLookup = lookup ?? (planoRows.length > 0 ? buildPlanoLookup(planoRows) : undefined);
  const sinteticasSi = new Map<string, VisionBalanceteRow>();
  for (const raw of saldoInicialRows) {
    const r = enrichNomeDoPlano(raw, planoRows, planoLookup);
    const plano = findPlanoRow(r, planoRows, planoLookup);
    const isSintetica =
      plano?.tipo === 'S' || r.tipo === 'S' || isNomeGrupoSintetico(r.nome ?? '');
    if (!isSintetica) continue;
    const k = normCls(getClassificacao(r));
    if (k) sinteticasSi.set(k, r);
  }

  const analiticas = filtrarContasAnaliticas(mergedRows, planoRows, planoLookup);
  const agregadas = agregarRazaoPorConta(analiticas, planoRows, planoLookup);

  if (planoRows.length === 0) {
    return agregadas.map((r) => recalcularSaldoFinalRow(r));
  }

  const byCls = new Map<string, VisionBalanceteRow>();
  for (const r of agregadas) {
    byCls.set(normCls(getClassificacao(r)), r);
  }

  const clsKeys = [...byCls.keys()];
  const folhas = clsKeys.filter((k) => isContaFolha(k, clsKeys));

  const planoUnico = new Map<string, VisionPlanoRow>();
  for (const p of planoRows) {
    const k = normCls(p.codigo);
    if (!k) continue;
    if (!planoUnico.has(k)) planoUnico.set(k, p);
  }

  const planoSorted = [...planoUnico.values()].sort((a, b) =>
    compareClassificacaoContabil(a.codigo, b.codigo),
  );

  const result: VisionBalanceteRow[] = [];
  const incluidas = new Set<string>();

  for (const p of planoSorted) {
    const pNorm = normCls(p.codigo);
    if (incluidas.has(pNorm)) continue;

    if (p.tipo === 'A') {
      const row = byCls.get(pNorm);
      if (!row) continue;
      result.push(
        recalcularSaldoFinalRow({
          ...row,
          nome: p.nome,
          classificacao: p.codigo,
          codigo: p.codigoReduzido ?? row.codigo,
          tipo: 'A',
          nivel: p.nivel,
        }),
      );
      incluidas.add(pNorm);
      continue;
    }

    if (p.tipo === 'S') {
      const descendentes = folhas
        .filter((k) => isFilhaDe(p.codigo, k))
        .map((k) => byCls.get(k)!)
        .filter(Boolean);

      if (descendentes.length > 0) {
        const totais = descendentes.reduce(
          (acc, r) => ({
            saldoInicial: acc.saldoInicial + r.saldoInicial,
            debito: acc.debito + r.debito,
            credito: acc.credito + r.credito,
          }),
          { saldoInicial: 0, debito: 0, credito: 0 },
        );

        const datas = descendentes.map((r) => r.data).filter(Boolean) as string[];
        const primeiraData = datas.sort(compareDataRazao)[0];

        result.push(
          recalcularSaldoFinalRow({
            codigo: p.codigoReduzido ?? p.codigo,
            classificacao: p.codigo,
            nome: p.nome,
            saldoInicial: totais.saldoInicial,
            debito: totais.debito,
            credito: totais.credito,
            saldoFinal: 0,
            data: primeiraData,
            tipo: 'S',
            nivel: p.nivel,
          }),
        );
        incluidas.add(pNorm);
        continue;
      }

      const si = sinteticasSi.get(pNorm);
      if (!si) continue;

      result.push(
        recalcularSaldoFinalRow({
          codigo: p.codigoReduzido ?? si.codigo,
          classificacao: p.codigo,
          nome: p.nome,
          saldoInicial: si.saldoInicial,
          debito: si.debito,
          credito: si.credito,
          saldoFinal: si.saldoFinal,
          naturezaSaldoInicial: si.naturezaSaldoInicial,
          naturezaSaldoFinal: si.naturezaSaldoFinal,
          tipo: 'S',
          nivel: p.nivel,
        }),
      );
      incluidas.add(pNorm);
    }
  }

  // Quando há plano importado, o balancete deve refletir apenas contas do plano.
  // Linhas sem correspondência permanecem no Razão (auditoria), mas não entram
  // no balancete para evitar "conta analítica fora do plano".
  if (planoRows.length === 0) {
    for (const [k, row] of byCls) {
      if (!incluidas.has(k)) {
        result.push(recalcularSaldoFinalRow({ ...row, tipo: 'A' }));
      }
    }
  }

  return sortRowsByClassificacao(result);
}

/** Pipeline razão: filtra sintéticas, agrega por conta; lançamentos em ordem cronológica Domínio. */
export function processarRazaoImportado(
  linhas: VisionBalanceteRow[],
  planoRows: VisionPlanoRow[] = [],
): { linhas: VisionBalanceteRow[]; analiticas: VisionBalanceteRow[] } {
  const linhasOrdenadas = sortRowsByDataRazao(
    linhas.map((r, i) => ({
      ...r,
      ordem: r.ordem ?? i + 1,
    })),
  );

  const filtradas = filtrarContasAnaliticas(linhasOrdenadas, planoRows).map((r, i) => ({
    ...r,
    ordem: r.ordem ?? i + 1,
  }));
  const analiticas = agregarRazaoPorConta(filtradas, planoRows);
  // A aba "Lançamentos" deve refletir tudo que foi importado (inclusive contas sintéticas).
  // A filtragem para analíticas fica restrita ao cálculo do balancete/demonstrações.
  return { linhas: linhasOrdenadas, analiticas };
}

export function isValidRazaoLinha(r: VisionBalanceteRow): boolean {
  const hasCode =
    Boolean(r.codigo?.trim()) ||
    Boolean(r.classificacao?.trim() && /^\d/.test(r.classificacao.trim()));
  const hasMovement = r.debito > 0 || r.credito > 0;
  const hasSaldo = (r.saldoInicial ?? 0) > 0 || (r.saldoFinal ?? 0) > 0;
  const hasDate = Boolean(r.data?.trim());
  if (!hasCode) return false;
  if (r.nome?.toLowerCase().includes('página')) return false;
  return hasMovement || hasSaldo || hasDate;
}

/**
 * Normaliza data do razão para DD/MM/AAAA.
 * Extrato/OFX usam ISO (YYYY-MM-DD) — NÃO pode ser lido como DD/MM/AA
 * (bug clássico: 2026-06-01 virava 26/06/2001).
 */
export function parseDataRazao(val: unknown): string {
  if (!val) return '';
  const s = String(val).trim();
  if (!s || s === '—') return s;

  // ISO YYYY-MM-DD (ou YYYY-MM-DDTHH:mm…)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) {
    const yyyy = iso[1];
    const mm = iso[2];
    const dd = iso[3];
    return `${dd}/${mm}/${yyyy}`;
  }

  // DD/MM/AAAA, D/M/AA, DD-MM-YYYY, DD.MM.YYYY (âncoras evitam casar dentro de ISO)
  const br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (br) {
    const dd = br[1].padStart(2, '0');
    const mm = br[2].padStart(2, '0');
    let yyyy = br[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${dd}/${mm}/${yyyy}`;
  }

  return s;
}
