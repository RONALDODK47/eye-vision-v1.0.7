import { describe, expect, it } from 'vitest';
import {
  gerarLancamentosAnoHonorarios,
  gerarLancamentosHonorariosAutomacao,
  mesesRepeticaoAno,
  mesclarLancamentosHonorarios,
} from '../logic/honorariosScheduler';
import type { HonorariosAutomacaoSettings } from '../logic/honorariosAutomacaoStorage';

const baseSettings = (): HonorariosAutomacaoSettings => ({
  automationEnabled: true,
  repeticoesPorAno: 4,
  mesInicial: 1,
  diaLancamento: 10,
  valorPadrao: 1500,
  historicoPadrao: 'HONORARIOS CONTABEIS',
  anoInicio: 2026,
});

describe('honorariosScheduler', () => {
  it('gera N meses consecutivos a partir do mês inicial', () => {
    expect(mesesRepeticaoAno({ repeticoesPorAno: 4, mesInicial: 1 })).toEqual([1, 2, 3, 4]);
    expect(mesesRepeticaoAno({ repeticoesPorAno: 12, mesInicial: 1 })).toHaveLength(12);
  });

  it('gera lançamentos por ano com valor padrão', () => {
    const rows = gerarLancamentosAnoHonorarios(2026, baseSettings(), []);
    expect(rows).toHaveLength(4);
    expect(rows[0]!.valor).toBe(1500);
    expect(rows[0]!.date).toBe('2026-01-10');
    expect(rows[3]!.mesRef).toBe(4);
  });

  it('usa valor específico por mês/ano', () => {
    const rows = gerarLancamentosAnoHonorarios(2026, baseSettings(), [
      { ano: 2026, mes: 2, valor: 2000 },
    ]);
    expect(rows.find((r) => r.mesRef === 2)!.valor).toBe(2000);
    expect(rows.find((r) => r.mesRef === 1)!.valor).toBe(1500);
  });

  it('gera de anoInicio até ano atual', () => {
    const s = baseSettings();
    s.anoInicio = 2025;
    s.repeticoesPorAno = 2;
    const rows = gerarLancamentosHonorariosAutomacao(s, [], 2026);
    expect(rows).toHaveLength(4);
  });

  it('mescla manuais com automáticos substituindo ids auto', () => {
    const merged = mesclarLancamentosHonorarios(
      [
        { id: 'manual-1', date: '2025-01-01', valor: 100, historico: 'X' },
        { id: 'honor-auto-2026-01', date: '2026-01-10', valor: 1, historico: 'OLD' },
      ],
      [{ id: 'honor-auto-2026-01', date: '2026-01-10', valor: 1500, historico: 'NEW', automatico: true }],
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.id === 'honor-auto-2026-01')!.valor).toBe(1500);
  });
});
