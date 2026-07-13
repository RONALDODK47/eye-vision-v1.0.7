import { loadPlanoCompletoForContaResolve } from './planoContasAiContext';
import { assertSomenteCodigoReduzido } from './planoContasMapper';
import { readManagerData, writeManagerData } from './companyWorkspace';
import {
  emptyFiscalContasImposto,
  FISCAL_IMPOSTOS,
  type FiscalContasImpostoConfig,
} from './fiscalContasImposto';

function normalizeContaCampo(raw: string, plano: ReturnType<typeof loadPlanoCompletoForContaResolve>): string {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  return assertSomenteCodigoReduzido(v, plano);
}

export function loadFiscalContasImposto(companyName: string): FiscalContasImpostoConfig {
  const base = emptyFiscalContasImposto();
  const plano = loadPlanoCompletoForContaResolve(companyName);
  const rows = readManagerData<Partial<FiscalContasImpostoConfig>>(companyName, 'fiscalContasImposto');
  const stored = rows[0];
  if (!stored || typeof stored !== 'object') return base;
  for (const id of FISCAL_IMPOSTOS) {
    const par = stored[id];
    if (par && typeof par === 'object') {
      base[id] = {
        debito: normalizeContaCampo(String(par.debito ?? ''), plano),
        credito: normalizeContaCampo(String(par.credito ?? ''), plano),
        debitoRecuperar: normalizeContaCampo(String(par.debitoRecuperar ?? ''), plano),
        creditoRecuperar: normalizeContaCampo(String(par.creditoRecuperar ?? ''), plano),
      };
    }
  }
  return base;
}

export function saveFiscalContasImposto(companyName: string, config: FiscalContasImpostoConfig): void {
  writeManagerData(companyName, 'fiscalContasImposto', [config]);
}
