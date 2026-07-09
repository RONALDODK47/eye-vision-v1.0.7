import type { SpedFiscalResumoArquivo } from './spedFiscalParser';

const KEY = 'extratoVision.spedFiscalUltimos';

export type SpedFiscalUltimosSalvos = {
  contrib?: SpedFiscalResumoArquivo;
  icms?: SpedFiscalResumoArquivo;
  updatedAt: string;
};

export function readSpedFiscalUltimos(): SpedFiscalUltimosSalvos | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SpedFiscalUltimosSalvos;
  } catch {
    return null;
  }
}

export function saveSpedFiscalUltimos(resumos: SpedFiscalResumoArquivo[]): void {
  const payload: SpedFiscalUltimosSalvos = {
    updatedAt: new Date().toISOString(),
  };
  for (const r of resumos) {
    if (r.tipo === 'CONTRIBUICOES') payload.contrib = r;
    if (r.tipo === 'ICMS_IPI') payload.icms = r;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // quota / privado
  }
}
