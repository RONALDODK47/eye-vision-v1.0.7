import type { VisionBalanceteRow } from '../../extratoVision/types/accounting';
import {
  honorariosContasProntas,
  type HonorariosContasAutomacaoConfig,
} from './honorariosContasAutomacao';

export const HONORARIOS_RAZAO_MARCA = 'HONOR-AUTO';

export type HonorariosLancamento = {
  id: string;
  date: string;
  valor: number;
  historico: string;
  anoRef?: number;
  mesRef?: number;
  automatico?: boolean;
};

export type BuildHonorariosRazaoResult = {
  rows: VisionBalanceteRow[];
  gerados: number;
  pendencias: string[];
};

function normalizeConta(conta: string): { codigo: string; classificacao: string } {
  const classificacao = conta.trim();
  const codigo = classificacao.replace(/\./g, '') || classificacao;
  return { codigo, classificacao };
}

function brDateToDisplay(iso: string | undefined): string {
  const t = String(iso ?? '').trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return t;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
}

export function isHonorariosRazaoRow(row: VisionBalanceteRow): boolean {
  return (row.classificacao ?? '').startsWith(HONORARIOS_RAZAO_MARCA);
}

export function buildRazaoFromHonorarios(
  lancamentos: HonorariosLancamento[],
  contas: HonorariosContasAutomacaoConfig,
  ordemInicial = 1,
): BuildHonorariosRazaoResult {
  const rows: VisionBalanceteRow[] = [];
  const pendencias: string[] = [];
  let ordem = ordemInicial;
  let gerados = 0;

  if (!honorariosContasProntas(contas)) {
    pendencias.push('Configure débito e crédito na subaba Contas.');
    return { rows, gerados, pendencias };
  }

  const deb = normalizeConta(contas.debito);
  const cred = normalizeConta(contas.credito);

  for (const lan of lancamentos) {
    const valor = Math.abs(lan.valor);
    if (valor < 0.0001) continue;

    const data = brDateToDisplay(lan.date);
    const historico = (lan.historico || 'HONORÁRIOS').trim().toUpperCase();
    const classificacao = `${HONORARIOS_RAZAO_MARCA} · ${lan.id}`;

    rows.push({
      codigo: deb.codigo,
      classificacao: deb.classificacao,
      nome: historico,
      data,
      debito: valor,
      credito: 0,
      saldoInicial: 0,
      saldoFinal: 0,
      ordem: ordem++,
      tipo: 'A',
    });
    rows.push({
      codigo: cred.codigo,
      classificacao: cred.classificacao,
      nome: historico,
      data,
      debito: 0,
      credito: valor,
      saldoInicial: 0,
      saldoFinal: 0,
      ordem: ordem++,
      tipo: 'A',
    });
    gerados += 1;
  }

  return { rows, gerados, pendencias };
}

export function mergeHonorariosRazaoComExistente(
  existente: VisionBalanceteRow[],
  novos: VisionBalanceteRow[],
): VisionBalanceteRow[] {
  const base = existente.filter((r) => !isHonorariosRazaoRow(r));
  const maxOrdem = base.reduce((m, r) => Math.max(m, r.ordem ?? 0), 0);
  const reordenados = novos.map((r, i) => ({ ...r, ordem: maxOrdem + i + 1 }));
  return [...base, ...reordenados];
}
