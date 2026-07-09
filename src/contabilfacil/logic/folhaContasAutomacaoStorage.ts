import { readManagerData, writeManagerData } from './companyWorkspace';
import {
  emptyFolhaContasAutomacao,
  FOLHA_RUBRICAS,
  type FolhaContasAutomacaoConfig,
} from './folhaContasAutomacao';

export function loadFolhaContasAutomacao(companyName: string): FolhaContasAutomacaoConfig {
  const base = emptyFolhaContasAutomacao();
  const rows = readManagerData<Partial<FolhaContasAutomacaoConfig>>(companyName, 'folhaContasAutomacao');
  const stored = rows[0];
  if (!stored || typeof stored !== 'object') return base;
  for (const id of FOLHA_RUBRICAS) {
    const par = stored[id];
    if (par && typeof par === 'object') {
      base[id] = {
        debito: String(par.debito ?? '').trim(),
        credito: String(par.credito ?? '').trim(),
      };
    }
  }
  return base;
}

export function saveFolhaContasAutomacao(companyName: string, config: FolhaContasAutomacaoConfig): void {
  writeManagerData(companyName, 'folhaContasAutomacao', [config]);
}
