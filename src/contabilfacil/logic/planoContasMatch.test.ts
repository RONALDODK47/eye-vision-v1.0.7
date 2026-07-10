import { describe, expect, it } from 'vitest';
import {
  contaTemSentidoLogicoParaHistorico,
  pickBestPlanoContasParaHistorico,
  scorePlanoContaParaHistorico,
} from './planoContasMatch';

const plano = [
  { code: '111', name: 'BANCO SICOOB', codigoReduzido: '100', group: 'ATIVO' },
  { code: '211', name: 'FORNECEDORES DIVERSOS', codigoReduzido: '200', group: 'PASSIVO' },
  { code: '312', name: 'TARIFAS BANCARIAS', codigoReduzido: '500', group: 'DESPESA' },
  { code: '410', name: 'RECEITA FINANCEIRA', codigoReduzido: '510', group: 'RECEITA' },
  { code: '114', name: 'A.J.T.F. LTDA', codigoReduzido: '1094', group: 'ATIVO' },
];

describe('planoContasMatch', () => {
  it('tarifa bancária combina com histórico de tarifa', () => {
    const score = scorePlanoContaParaHistorico('TARIFA PACOTE SERVICOS', 'D', plano[2]!);
    expect(score).toBeGreaterThanOrEqual(36);
    expect(contaTemSentidoLogicoParaHistorico('TARIFA PACOTE SERVICOS', 'TARIFAS BANCARIAS', 'D')).toBe(true);
  });

  it('rendimento combina com receita financeira', () => {
    const hits = pickBestPlanoContasParaHistorico('REND PAGO APLIC BB RENDE', 'C', plano);
    expect(hits[0]?.reduzido).toBe('510');
  });

  it('coligada AJTF combina com conta nominal', () => {
    const hits = pickBestPlanoContasParaHistorico('PIX ENVIADO A J T F LTDA', 'D', plano);
    expect(hits[0]?.reduzido).toBe('1094');
  });

  it('PIX REC não combina com imposto de renda (falso positivo REC/RENDA)', () => {
    const planoImposto = [
      ...plano,
      { code: '220', name: 'IMPOSTO DE RENDA A RECOLHER', codigoReduzido: '32', group: 'PASSIVO' },
      { code: '112', name: 'CLIENTES DIVERSOS', codigoReduzido: '300', group: 'ATIVO' },
    ];
    const scoreIr = scorePlanoContaParaHistorico('PIX REC', 'C', planoImposto[4]!);
    expect(scoreIr).toBeLessThan(36);
    expect(
      contaTemSentidoLogicoParaHistorico('PIX REC', 'IMPOSTO DE RENDA A RECOLHER', 'C', planoImposto[4]),
    ).toBe(false);
    const hits = pickBestPlanoContasParaHistorico('PIX REC CLIENTE ABC', 'C', planoImposto);
    expect(hits[0]?.reduzido).toBe('300');
  });
});
