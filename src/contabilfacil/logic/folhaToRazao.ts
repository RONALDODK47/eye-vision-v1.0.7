import type { VisionBalanceteRow } from '../../extratoVision/types/accounting';
import type { FolhaRelatorioImportRow } from './dominioTxtIO';
import {
  contasParaFolhaRubrica,
  FOLHA_RUBRICA_LABELS,
  resolveFolhaRubrica,
  type FolhaContasAutomacaoConfig,
  type FolhaRubricaId,
} from './folhaContasAutomacao';

export const FOLHA_RAZAO_MARCA = 'FOLHA-AUTO';

export type FolhaPayrollLinha = {
  id: string;
  name: string;
  baseSalary: number;
  inss: number;
  fgts: number;
  irrf: number;
  net: number;
  date?: string;
};

export type BuildFolhaRazaoResult = {
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

function pushPartida(
  rows: VisionBalanceteRow[],
  ordem: number,
  params: {
    data: string;
    historico: string;
    rubrica: FolhaRubricaId;
    debitoConta: string;
    creditoConta: string;
    valor: number;
    tag: string;
  },
): number {
  const valor = Math.abs(params.valor);
  if (valor < 0.0001) return ordem;
  const deb = normalizeConta(params.debitoConta);
  const cred = normalizeConta(params.creditoConta);
  const historico = params.historico.trim().toUpperCase();
  const classificacao = `${FOLHA_RAZAO_MARCA} · ${params.rubrica} · ${params.tag}`;

  rows.push({
    codigo: deb.codigo,
    classificacao: deb.classificacao,
    nome: historico,
    data: params.data,
    debito: valor,
    credito: 0,
    saldoInicial: 0,
    saldoFinal: 0,
    ordem,
    tipo: 'A',
  });
  ordem += 1;
  rows.push({
    codigo: cred.codigo,
    classificacao: cred.classificacao,
    nome: historico,
    data: params.data,
    debito: 0,
    credito: valor,
    saldoInicial: 0,
    saldoFinal: 0,
    ordem,
    tipo: 'A',
  });
  return ordem + 1;
}

function gerarPartidaRubrica(
  rows: VisionBalanceteRow[],
  ordem: number,
  contas: FolhaContasAutomacaoConfig,
  pendencias: string[],
  params: {
    data: string;
    historico: string;
    rubrica: FolhaRubricaId;
    valor: number;
    tag: string;
  },
): { ordem: number; gerados: number } {
  const valor = Math.abs(params.valor);
  if (valor < 0.0001) return { ordem, gerados: 0 };

  const par = contasParaFolhaRubrica(contas, params.rubrica);
  if (!par.debito.trim() || !par.credito.trim()) {
    pendencias.push(
      `${FOLHA_RUBRICA_LABELS[params.rubrica]}: configure débito e crédito na subaba Contas`,
    );
    return { ordem, gerados: 0 };
  }

  const nextOrdem = pushPartida(rows, ordem, {
    data: params.data,
    historico: params.historico,
    rubrica: params.rubrica,
    debitoConta: par.debito,
    creditoConta: par.credito,
    valor,
    tag: params.tag,
  });
  return { ordem: nextOrdem, gerados: 1 };
}

export function isFolhaRazaoRow(row: VisionBalanceteRow): boolean {
  return (row.classificacao ?? '').startsWith(FOLHA_RAZAO_MARCA);
}

export function buildRazaoFromFolhaRelatorio(
  linhas: FolhaRelatorioImportRow[],
  contas: FolhaContasAutomacaoConfig,
  ordemInicial = 1,
): BuildFolhaRazaoResult {
  const rows: VisionBalanceteRow[] = [];
  const pendencias: string[] = [];
  let ordem = ordemInicial;
  let gerados = 0;

  for (const linha of linhas) {
    const valor = Math.max(linha.debito ?? 0, linha.credito ?? 0);
    if (valor < 0.0001) continue;

    const rubrica = resolveFolhaRubrica(linha.description);
    if (!rubrica) {
      pendencias.push(`Sem rubrica: «${linha.description}» — ajuste o histórico ou configure manualmente`);
      continue;
    }

    const data = brDateToDisplay(linha.date);
    const result = gerarPartidaRubrica(rows, ordem, contas, pendencias, {
      data,
      historico: linha.description,
      rubrica,
      valor,
      tag: linha.id,
    });
    ordem = result.ordem;
    gerados += result.gerados;
  }

  return { rows, gerados, pendencias };
}

export function buildRazaoFromFolhaPayroll(
  registros: FolhaPayrollLinha[],
  contas: FolhaContasAutomacaoConfig,
  ordemInicial = 1,
): BuildFolhaRazaoResult {
  const rows: VisionBalanceteRow[] = [];
  const pendencias: string[] = [];
  let ordem = ordemInicial;
  let gerados = 0;

  for (const reg of registros) {
    const data = brDateToDisplay(reg.date);
    const baseHist = reg.name.toUpperCase();

    const partidas: Array<{ rubrica: FolhaRubricaId; valor: number; hist: string }> = [
      { rubrica: 'SALARIO', valor: reg.net, hist: `SALARIO LIQUIDO · ${baseHist}` },
      { rubrica: 'INSS_RECOLHER', valor: reg.inss, hist: `INSS · ${baseHist}` },
      { rubrica: 'FGTS_RECOLHER', valor: reg.fgts, hist: `FGTS · ${baseHist}` },
      { rubrica: 'IRRF_RECOLHER', valor: reg.irrf, hist: `IRRF · ${baseHist}` },
    ];

    for (const p of partidas) {
      const result = gerarPartidaRubrica(rows, ordem, contas, pendencias, {
        data,
        historico: p.hist,
        rubrica: p.rubrica,
        valor: p.valor,
        tag: reg.id,
      });
      ordem = result.ordem;
      gerados += result.gerados;
    }
  }

  return { rows, gerados, pendencias };
}

export function mergeFolhaRazaoComExistente(
  existente: VisionBalanceteRow[],
  novos: VisionBalanceteRow[],
): VisionBalanceteRow[] {
  const base = existente.filter((r) => !isFolhaRazaoRow(r));
  const maxOrdem = base.reduce((m, r) => Math.max(m, r.ordem ?? 0), 0);
  const reordenados = novos.map((r, i) => ({ ...r, ordem: maxOrdem + i + 1 }));
  return [...base, ...reordenados];
}
