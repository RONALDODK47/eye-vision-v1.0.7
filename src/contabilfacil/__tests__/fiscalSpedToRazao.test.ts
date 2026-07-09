import { describe, expect, it } from 'vitest';
import {
  buildRazaoFromFiscalSped,
  mergeFiscalRazaoComExistente,
  parseDataLancamentoFiscal,
  FISCAL_RAZAO_MARCA,
} from '../logic/fiscalSpedToRazao';
import { emptyFiscalContasImposto } from '../logic/fiscalContasImposto';
import type { SpedFiscalItem } from '../../extratoVision/utils/spedFiscalParser';

describe('fiscalSpedToRazao', () => {
  it('usa data fim do período', () => {
    expect(parseDataLancamentoFiscal('01/12/2025 — 31/12/2025')).toBe('31/12/2025');
  });

  it('gera débito e crédito nas contas configuradas', () => {
    const cfg = emptyFiscalContasImposto();
    cfg.PIS = {
      debito: '3.1.01.01',
      credito: '2.1.08.05',
      debitoRecuperar: '',
      creditoRecuperar: '',
    };
    const item: SpedFiscalItem = {
      kind: 'imposto',
      natureza: 'credora',
      registro: 'M205',
      codigo: '691201',
      descricao: 'PIS a recolher',
      imposto: 'PIS/Pasep',
      valor: 2504.87,
      linha: 62,
      data: '31/12/2025',
    };
    const { rows, gerados, pendencias } = buildRazaoFromFiscalSped(
      [{ item, data: '01/12/2025 — 31/12/2025', fileName: 'sped.txt' }],
      cfg,
    );
    expect(pendencias).toHaveLength(0);
    expect(gerados).toBe(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].debito).toBe(2504.87);
    expect(rows[0].classificacao).toBe('3.1.01.01');
    expect(rows[1].credito).toBe(2504.87);
    expect(rows[1].classificacao).toBe('2.1.08.05');
  });

  it('usa contas a recuperar para natureza devedora', () => {
    const cfg = emptyFiscalContasImposto();
    cfg.ICMS = {
      debito: '3.1.02.01',
      credito: '2.1.08.02',
      debitoRecuperar: '1.1.08.03',
      creditoRecuperar: '3.1.02.05',
    };
    const item: SpedFiscalItem = {
      kind: 'imposto',
      natureza: 'devedora',
      registro: 'E110',
      codigo: 'SALDO',
      descricao: 'Saldo credor ICMS',
      imposto: 'ICMS',
      valor: 1200,
      linha: 80,
      data: '31/12/2025',
    };
    const { rows, gerados, pendencias } = buildRazaoFromFiscalSped(
      [{ item, data: '31/12/2025', fileName: 'efd.txt' }],
      cfg,
    );
    expect(pendencias).toHaveLength(0);
    expect(gerados).toBe(1);
    expect(rows[0].classificacao).toBe('1.1.08.03');
    expect(rows[1].classificacao).toBe('3.1.02.05');
    expect(rows[0].nome).toContain('RECUPERAR');
  });

  it('substitui lançamentos SPED anteriores no merge', () => {
    const existente = [
      {
        codigo: '1',
        classificacao: `${FISCAL_RAZAO_MARCA} · antigo`,
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
        classificacao: '3.1',
        nome: 'N',
        debito: 10,
        credito: 0,
        saldoInicial: 0,
        saldoFinal: 0,
        ordem: 1,
      },
    ];
    const merged = mergeFiscalRazaoComExistente(existente, novos);
    expect(merged.filter((r) => r.classificacao?.startsWith(FISCAL_RAZAO_MARCA))).toHaveLength(0);
    expect(merged).toHaveLength(2);
    expect(merged[0].classificacao).toBe('MANUAL');
  });
});
