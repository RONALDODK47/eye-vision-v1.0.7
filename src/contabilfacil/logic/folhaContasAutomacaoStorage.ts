import { assertSomenteCodigoReduzido, sanitizeCodigoReduzido } from './planoContasMapper';
import { readManagerData, writeManagerData } from './companyWorkspace';
import {
  emptyFolhaContasAutomacao,
  FOLHA_RUBRICAS,
  type FolhaContasAutomacaoConfig,
} from './folhaContasAutomacao';

function loadPlanoCompletoForContaResolve(companyName: string): Array<{
  code: string;
  name: string;
  codigoReduzido?: string;
  tipo?: string;
}> {
  return readManagerData<{
    code?: string;
    name?: string;
    codigoReduzido?: string;
    tipo?: string;
  }>(companyName, 'plano')
    .map((r) => ({
      code: String(r.code ?? '').trim(),
      name: String(r.name ?? '').trim(),
      codigoReduzido: sanitizeCodigoReduzido(r.codigoReduzido),
      tipo: r.tipo,
    }))
    .filter((r) => r.code || r.codigoReduzido);
}

function normalizeContaCampo(raw: string, plano: ReturnType<typeof loadPlanoCompletoForContaResolve>): string {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  return assertSomenteCodigoReduzido(v, plano);
}

export function loadFolhaContasAutomacao(companyName: string): FolhaContasAutomacaoConfig {
  const base = emptyFolhaContasAutomacao();
  const plano = loadPlanoCompletoForContaResolve(companyName);
  const rows = readManagerData<Partial<FolhaContasAutomacaoConfig>>(companyName, 'folhaContasAutomacao');
  const stored = rows[0];
  if (!stored || typeof stored !== 'object') return base;
  for (const id of FOLHA_RUBRICAS) {
    const par = stored[id];
    if (par && typeof par === 'object') {
      base[id] = {
        debito: normalizeContaCampo(String(par.debito ?? ''), plano),
        credito: normalizeContaCampo(String(par.credito ?? ''), plano),
      };
    }
  }
  return base;
}

export function saveFolhaContasAutomacao(companyName: string, config: FolhaContasAutomacaoConfig): void {
  writeManagerData(companyName, 'folhaContasAutomacao', [config]);
}
