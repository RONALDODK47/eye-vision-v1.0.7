import { readManagerData, writeManagerData } from './companyWorkspace';
import {
  emptyFiscalContasImposto,
  FISCAL_IMPOSTOS,
  type FiscalContasImpostoConfig,
} from './fiscalContasImposto';

export function loadFiscalContasImposto(companyName: string): FiscalContasImpostoConfig {
  const base = emptyFiscalContasImposto();
  const rows = readManagerData<Partial<FiscalContasImpostoConfig>>(companyName, 'fiscalContasImposto');
  const stored = rows[0];
  if (!stored || typeof stored !== 'object') return base;
  for (const id of FISCAL_IMPOSTOS) {
    const par = stored[id];
    if (par && typeof par === 'object') {
      base[id] = {
        debito: String(par.debito ?? '').trim(),
        credito: String(par.credito ?? '').trim(),
        debitoRecuperar: String(par.debitoRecuperar ?? '').trim(),
        creditoRecuperar: String(par.creditoRecuperar ?? '').trim(),
      };
    }
  }
  return base;
}

export function saveFiscalContasImposto(companyName: string, config: FiscalContasImpostoConfig): void {
  writeManagerData(companyName, 'fiscalContasImposto', [config]);
}
