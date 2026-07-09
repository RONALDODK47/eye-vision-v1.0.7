import { readManagerData, writeManagerData } from './companyWorkspace';
import {
  emptyHonorariosContasAutomacao,
  type HonorariosContasAutomacaoConfig,
} from './honorariosContasAutomacao';

export function loadHonorariosContasAutomacao(companyName: string): HonorariosContasAutomacaoConfig {
  const base = emptyHonorariosContasAutomacao();
  const rows = readManagerData<Partial<HonorariosContasAutomacaoConfig>>(
    companyName,
    'honorariosContasAutomacao',
  );
  const stored = rows[0];
  if (!stored || typeof stored !== 'object') return base;
  return {
    debito: String(stored.debito ?? '').trim(),
    credito: String(stored.credito ?? '').trim(),
  };
}

export function saveHonorariosContasAutomacao(
  companyName: string,
  config: HonorariosContasAutomacaoConfig,
): void {
  writeManagerData(companyName, 'honorariosContasAutomacao', [config]);
}
