import type { VisionBalanceteRow, VisionPlanoRow } from '../../extratoVision/types/accounting';
import { enrichBalanceteComTipo } from '../../extratoVision/utils/demonstracoesContabeis';
import {
  enrichNaturezaSaldoImportado,
  formatSaldoFinalBalancete,
  listarContasInvertidas,
} from '../../extratoVision/utils/naturezaContabil';
import { inferAccountTypes } from '../../extratoVision/utils/planilhaModelo';
import {
  isValidRazaoLinha,
  montarBalanceteComPlano,
  parseDataRazao,
  processarRazaoImportado,
} from '../../extratoVision/utils/razaoContabil';
import type { GenericOcrRow } from '../../lib/parcelamentoColunasExtract';
import {
  codeLengthToPlanoLevel,
  derivePlanoGroupFromCode,
  derivePlanoNatureFromGroup,
  sanitizeCodigoReduzido,
  visionPlanoToAccountPlan,
} from './planoContasMapper';

export type AccountPlanLike = {
  code: string;
  name: string;
  codigoReduzido?: string;
  tipo?: 'S' | 'A';
  nivel?: number;
  group?: string;
  nature?: 'DEVEDORA' | 'CREDORA';
};

export function accountPlansToVisionPlano(plans: AccountPlanLike[]): VisionPlanoRow[] {
  return inferAccountTypes(
    plans.map((p) => ({
      codigo: p.code,
      nome: p.name,
      codigoReduzido: p.codigoReduzido,
      tipo: p.tipo,
      nivel: p.nivel ?? codeLengthToPlanoLevel(p.code),
    })),
  );
}

export function finalizePlanoImport(plans: AccountPlanLike[]): AccountPlanLike[] {
  const vision = inferAccountTypes(
    plans.map((p) => ({
      codigo: p.code,
      nome: p.name,
      codigoReduzido: sanitizeCodigoReduzido(p.codigoReduzido),
      tipo: p.tipo,
      nivel: p.nivel ?? codeLengthToPlanoLevel(p.code),
    })),
  );
  return vision.map((v) => visionPlanoToAccountPlan(v));
}

export function normalizeRazaoImport(rows: VisionBalanceteRow[]): VisionBalanceteRow[] {
  return rows
    .filter(isValidRazaoLinha)
    .map((r, i) => ({
      ...r,
      data: r.data ? parseDataRazao(r.data) : r.data,
      ordem: r.ordem ?? i + 1,
      saldoInicial: r.saldoInicial ?? 0,
      saldoFinal: r.saldoFinal ?? 0,
      debito: r.debito ?? 0,
      credito: r.credito ?? 0,
    }));
}

export function ocrRowToVisionRazao(row: GenericOcrRow, index: number): VisionBalanceteRow | null {
  const debito = parseNum(row.debito);
  const credito = parseNum(row.credito);
  const fromDc = parseValorDc(row.valorDc);
  const deb = debito > 0 ? debito : fromDc.debito;
  const cred = credito > 0 ? credito : fromDc.credito;
  const contaPartida = row.contaPartida?.trim() || row.classificacao?.trim() || '';
  const classificacao = contaPartida || row.classificacao?.trim() || row.codigo?.trim() || '';
  const codigo =
    row.codigo?.trim() ||
    (classificacao.includes('.') ? classificacao.replace(/\./g, '') : classificacao);
  const nome = (row.descricao || row.historico || 'LANCAMENTO').trim();
  if (!codigo && !classificacao && !nome) return null;

  const candidate: VisionBalanceteRow = {
    codigo,
    classificacao: classificacao || undefined,
    nome: nome.toUpperCase(),
    data: row.data ? parseDataRazao(row.data) : undefined,
    ordem: index + 1,
    saldoInicial: 0,
    debito: deb,
    credito: cred,
    saldoFinal: 0,
  };
  return isValidRazaoLinha(candidate) ? candidate : null;
}

function parseNum(raw: string | undefined, fallback = 0): number {
  if (!raw?.trim()) return fallback;
  const s = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.abs(n) : fallback;
}

function parseValorDc(raw: string | undefined): { debito: number; credito: number } {
  if (!raw?.trim()) return { debito: 0, credito: 0 };
  const t = raw.trim().toUpperCase();
  const n = parseNum(raw);
  if (t.endsWith('D')) return { debito: n, credito: 0 };
  if (t.endsWith('C')) return { debito: 0, credito: n };
  return { debito: n, credito: 0 };
}

/** Converte linhas legadas (flat balancete) em movimentos de razão. */
export function migrateLegacyBalanceteToRazao(
  rows: Array<{
    dataInicio?: string;
    codigo?: string;
    classificacao?: string;
    descricao?: string;
    debito?: number;
    credito?: number;
    saldoInicial?: number;
  }>,
): VisionBalanceteRow[] {
  return normalizeRazaoImport(
    rows.map((r, i) => ({
      codigo: r.codigo ?? '',
      classificacao: r.classificacao ?? r.codigo ?? '',
      nome: r.descricao ?? 'LANCAMENTO',
      data: r.dataInicio ? parseDataRazao(r.dataInicio) : undefined,
      ordem: i + 1,
      saldoInicial: r.saldoInicial ?? 0,
      debito: r.debito ?? 0,
      credito: r.credito ?? 0,
      saldoFinal: 0,
    })),
  );
}

export function formatVisionRazaoDate(data?: string): string {
  if (!data?.trim()) return '—';
  const parsed = parseDataRazao(data);
  return parsed || data;
}

export function computeContabilViews(plano: AccountPlanLike[], razaoRaw: VisionBalanceteRow[]) {
  const planoVision = accountPlansToVisionPlano(plano);
  const razaoNorm = normalizeRazaoImport(razaoRaw);
  const processed = processarRazaoImportado(razaoNorm, planoVision);
  const balanceteBase = montarBalanceteComPlano(processed.analiticas, planoVision);
  const enriquecido = balanceteBase.map((r) => enrichNaturezaSaldoImportado(r, balanceteBase));
  const balanceteLinhas = enrichBalanceteComTipo(enriquecido, planoVision);
  const invertidas = new Set(
    listarContasInvertidas(balanceteLinhas).map(
      (r) => `${r.classificacao ?? r.codigo}|${r.nome}`,
    ),
  );

  return {
    planoVision,
    razaoLinhas: processed.linhas,
    balanceteLinhas,
    invertidas,
  };
}

export function balanceteSaldoDisplay(row: VisionBalanceteRow, allRows: VisionBalanceteRow[] = []): string {
  const s = formatSaldoFinalBalancete(row, allRows);
  if (s.valorFmt === '—') return '—';
  return `${s.valorFmt} ${s.indicador ?? ''}`.trim();
}

export function isBalanceteRowInvertida(
  row: VisionBalanceteRow,
  invertidas: Set<string>,
): boolean {
  return invertidas.has(`${row.classificacao ?? row.codigo}|${row.nome}`);
}

export function visionPlanoRowsToAccountPlans(rows: VisionPlanoRow[]): AccountPlanLike[] {
  return finalizePlanoImport(rows.map((r) => visionPlanoToAccountPlan(r)));
}

/** TXT+ partida dobrada → duas pernas no razão (débito e crédito). */
export function parseTxtPlusToRazaoVision(
  rows: Array<{
    date: string;
    description: string;
    value: number;
    accountDebit?: string;
    accountCredit?: string;
  }>,
): VisionBalanceteRow[] {
  const out: VisionBalanceteRow[] = [];
  rows.forEach((row, index) => {
    const data = parseDataRazao(row.date);
    const nome = row.description.toUpperCase();
    const val = row.value;
    if (val <= 0) return;
    const deb = row.accountDebit?.trim();
    const cred = row.accountCredit?.trim();
    if (deb) {
      out.push({
        codigo: deb,
        classificacao: deb,
        nome,
        data,
        ordem: index * 2 + 1,
        saldoInicial: 0,
        debito: val,
        credito: 0,
        saldoFinal: 0,
      });
    }
    if (cred) {
      out.push({
        codigo: cred,
        classificacao: cred,
        nome,
        data,
        ordem: index * 2 + 2,
        saldoInicial: 0,
        debito: 0,
        credito: val,
        saldoFinal: 0,
      });
    }
  });
  return normalizeRazaoImport(out);
}
