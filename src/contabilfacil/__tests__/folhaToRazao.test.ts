import { describe, expect, it } from 'vitest';
import {
  buildRazaoFromFolhaRelatorio,
  mergeFolhaRazaoComExistente,
  FOLHA_RAZAO_MARCA,
} from '../logic/folhaToRazao';
import { emptyFolhaContasAutomacao } from '../logic/folhaContasAutomacao';
import { resolveFolhaRubrica } from '../logic/folhaContasAutomacao';

describe('folhaToRazao', () => {
  it('classifica salário e pró-labore', () => {
    expect(resolveFolhaRubrica('SALARIOS A PAGAR')).toBe('SALARIO');
    expect(resolveFolhaRubrica('PRO LABORE MARIA')).toBe('PROLABORE');
    expect(resolveFolhaRubrica('INSS A RECOLHER')).toBe('INSS_RECOLHER');
    expect(resolveFolhaRubrica('INSS A COMPENSAR')).toBe('INSS_RECUPERAR');
  });

  it('gera débito e crédito nas contas configuradas', () => {
    const cfg = emptyFolhaContasAutomacao();
    cfg.SALARIO = { debito: '4.1.01.01', credito: '2.1.03.01' };
    const { rows, gerados, pendencias } = buildRazaoFromFolhaRelatorio(
      [
        {
          id: '1',
          date: '2026-04-30',
          description: 'SALARIOS A PAGAR',
          debito: 15000,
          credito: 0,
        },
      ],
      cfg,
    );
    expect(pendencias).toHaveLength(0);
    expect(gerados).toBe(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].debito).toBe(15000);
    expect(rows[0].classificacao).toBe('4.1.01.01');
    expect(rows[1].credito).toBe(15000);
  });

  it('substitui lançamentos folha anteriores no merge', () => {
    const existente = [
      {
        codigo: '1',
        classificacao: `${FOLHA_RAZAO_MARCA} · antigo`,
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
    const merged = mergeFolhaRazaoComExistente(existente, novos);
    expect(merged.filter((r) => r.classificacao?.startsWith(FOLHA_RAZAO_MARCA))).toHaveLength(0);
    expect(merged).toHaveLength(2);
    expect(merged[0].classificacao).toBe('MANUAL');
  });
});
