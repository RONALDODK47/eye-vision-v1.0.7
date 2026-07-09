import { describe, expect, it } from 'vitest';
import {
  enriquecerAchadoAuditoria,
  resolverReferenciaNormativaAchado,
} from '../utils/auditoriaReferenciasNormativas';

describe('auditoriaReferenciasNormativas', () => {
  it('partidas dobradas inclui paragrafo e trecho ITG 2000', () => {
    const ref = resolverReferenciaNormativaAchado({
      id: 'partida-dobrada',
      titulo: 'Diferença entre débitos e créditos',
      detalhe: 'Diferença atual: 100,00.',
      norma: 'ITG 2000',
    });
    expect(ref.normaParagrafo).toMatch(/partidas dobradas/i);
    expect(ref.normaTrecho).toMatch(/soma dos débitos/i);
    expect(ref.explicacao).toMatch(/não fecha/i);
  });

  it('banco invertido cita CPC 26 e NBC TG 03', () => {
    const ref = resolverReferenciaNormativaAchado({
      id: 'inv-111',
      titulo: 'Banco ou disponibilidade com saldo invertido',
      detalhe: 'Saldo C, esperado D.',
      norma: 'CPC 26',
    });
    expect(ref.norma).toMatch(/CPC 26|NBC TG 03/i);
    expect(ref.normaTrecho).toMatch(/Caixa e equivalentes/i);
  });

  it('enriquecerAchadoAuditoria preenche campos no achado', () => {
    const a = enriquecerAchadoAuditoria({
      id: 'banco-grupo-1',
      severidade: 'critico',
      titulo: 'Conta bancária fora do ativo (grupo 1)',
      detalhe: 'grupo 2',
      norma: 'ECD',
      conta: '2150100001 — EMPRESTIMO',
    });
    expect(a.explicacao).toBeTruthy();
    expect(a.normaParagrafo).toMatch(/I155|grupo 1/i);
    expect(a.normaTrecho).toBeTruthy();
  });
});
