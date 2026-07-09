import { describe, expect, it } from 'vitest';
import {
  buildRazaoFromHonorarios,
  mergeHonorariosRazaoComExistente,
  HONORARIOS_RAZAO_MARCA,
} from '../logic/honorariosToRazao';
import { emptyHonorariosContasAutomacao } from '../logic/honorariosContasAutomacao';

describe('honorariosToRazao', () => {
  it('gera débito e crédito nas contas configuradas', () => {
    const cfg = emptyHonorariosContasAutomacao();
    cfg.debito = '4.1.05.01';
    cfg.credito = '2.1.04.01';
    const { rows, gerados, pendencias } = buildRazaoFromHonorarios(
      [
        {
          id: 'h1',
          date: '2026-04-30',
          valor: 2500,
          historico: 'HONORARIOS CONTABEIS',
        },
      ],
      cfg,
    );
    expect(pendencias).toHaveLength(0);
    expect(gerados).toBe(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].debito).toBe(2500);
    expect(rows[0].classificacao).toBe('4.1.05.01');
    expect(rows[1].credito).toBe(2500);
    expect(rows[1].classificacao).toBe('2.1.04.01');
  });

  it('substitui lançamentos honorários anteriores no merge', () => {
    const existente = [
      {
        codigo: '1',
        classificacao: `${HONORARIOS_RAZAO_MARCA} · antigo`,
        nome: 'X',
        debito: 1,
        credito: 0,
        saldoInicial: 0,
        saldoFinal: 0,
      },
      {
        codigo: '9',
        classificacao: 'MANUAL',
        nome: 'Y',
        debito: 2,
        credito: 0,
        saldoInicial: 0,
        saldoFinal: 0,
      },
    ];
    const novos = [
      {
        codigo: '3',
        classificacao: '4.1',
        nome: 'N',
        debito: 10,
        credito: 0,
        saldoInicial: 0,
        saldoFinal: 0,
        ordem: 1,
      },
    ];
    const merged = mergeHonorariosRazaoComExistente(existente, novos);
    expect(merged.filter((r) => r.classificacao?.startsWith(HONORARIOS_RAZAO_MARCA))).toHaveLength(0);
    expect(merged).toHaveLength(2);
  });
});
