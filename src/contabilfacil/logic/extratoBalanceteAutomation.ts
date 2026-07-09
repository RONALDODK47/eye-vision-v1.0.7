import type { VisionBalanceteRow } from '../../extratoVision/types/accounting';
import { readManagerData, writeManagerData, flushManagerDataWrites } from './companyWorkspace';
import { normalizeRazaoImport } from './contabilPipeline';
import { isExtratoLancamentoConciliado, type ExtratoBankRow } from './extratoConciliacaoBank';
import {
  buildRazaoFromExtratoLancamentos,
  mergeExtratoRazaoComExistente,
} from './extratoToRazao';

/**
 * Publica no balancete/razão apenas linhas conciliadas do extrato.
 * Não altera saldo anterior, saldo final OCR nem os lançamentos do extrato importado.
 */
export function postExtratoConciliadosNoRazao(
  companyName: string,
  extratoRows?: ExtratoBankRow[],
): { gerados: number } {
  const rows = extratoRows ?? readManagerData<ExtratoBankRow>(companyName, 'extrato');
  const conciliados = rows.filter(isExtratoLancamentoConciliado);
  const { rows: razaoRows, gerados } = buildRazaoFromExtratoLancamentos(conciliados);
  if (gerados <= 0) {
    const existente = readManagerData<VisionBalanceteRow>(companyName, 'razao');
    const merged = mergeExtratoRazaoComExistente(existente, []);
    if (merged.length !== existente.length) {
      const normalized = normalizeRazaoImport(merged);
      writeManagerData(companyName, 'razao', normalized);
      flushManagerDataWrites();
      dispatchRazaoUpdated(companyName);
    }
    return { gerados: 0 };
  }

  const existente = readManagerData<VisionBalanceteRow>(companyName, 'razao');
  const merged = normalizeRazaoImport(mergeExtratoRazaoComExistente(existente, razaoRows));
  writeManagerData(companyName, 'razao', merged);
  flushManagerDataWrites();
  dispatchRazaoUpdated(companyName);
  return { gerados };
}

function dispatchRazaoUpdated(companyName: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('contabilfacil-razao-updated', { detail: { company: companyName } }),
  );
}
