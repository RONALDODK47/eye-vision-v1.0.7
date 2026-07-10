import type { VisionBalanceteRow } from '../../extratoVision/types/accounting';
import {
  coletarLancamentosDominio,
  type DominioExportConfig,
} from '../../lib/dominioExporter';
import type { LoanRow } from '../../lib/loanCalculator';
import {
  normalizeCompanyName,
  readManagerData,
  writeManagerData,
  flushManagerDataWrites,
} from './companyWorkspace';
import { normalizeRazaoImport } from './contabilPipeline';
import {
  buildRazaoFromDominioPlain,
  mergeDominioPlainRazaoComExistente,
} from './dominioPlainToRazao';

export const EMPRESTIMO_RAZAO_MARCA = 'EMPRESTIMO-AUTO';

function dispatchRazaoUpdated(companyName: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('contabilfacil-razao-updated', { detail: { company: companyName } }),
  );
}

/**
 * Publica lançamentos do empréstimo (cronograma + contas) no balancete/razão.
 * Só sob ação explícita — recebe o schedule já calculado da UI.
 */
export function postEmprestimoNoRazao(
  companyName: string,
  contractId: string,
  schedule: LoanRow[],
  config: DominioExportConfig,
): { gerados: number; pendencias: string[] } {
  const company = normalizeCompanyName(companyName);
  const id = contractId.trim() || 'contrato';
  const pendencias: string[] = [];

  if (!schedule.length) {
    return { gerados: 0, pendencias: ['Cronograma vazio — calcule o empréstimo antes de enviar.'] };
  }

  const plain = coletarLancamentosDominio(schedule, config);
  if (plain.length === 0) {
    return {
      gerados: 0,
      pendencias: ['Nenhum lançamento gerado — configure as contas na aba Contas.'],
    };
  }

  const { rows, gerados } = buildRazaoFromDominioPlain(plain, EMPRESTIMO_RAZAO_MARCA, id);
  const existente = readManagerData<VisionBalanceteRow>(company, 'razao');
  const merged = normalizeRazaoImport(
    mergeDominioPlainRazaoComExistente(existente, rows, EMPRESTIMO_RAZAO_MARCA, id),
  );
  writeManagerData(company, 'razao', merged);
  flushManagerDataWrites();
  dispatchRazaoUpdated(company);

  if (gerados <= 0) pendencias.push('Nada novo para enviar ao balancete.');
  return { gerados, pendencias };
}
