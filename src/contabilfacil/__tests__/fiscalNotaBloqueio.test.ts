import { describe, expect, it } from 'vitest';
import type { SpedNotaFiscal } from '../../extratoVision/utils/spedNotasFiscaisParser';
import {
  avaliarBloqueioNotaFiscal,
  filtrarNotasFiscais,
  separarNotasFiscais,
  type FiscalNotaBloqueioConfig,
} from '../logic/fiscalNotaBloqueio';
import { buildFiscalAcumuladorGroups } from '../logic/fiscalAcumuladorModel';
import type { ParsedSpedFiscal } from '../../extratoVision/utils/spedFiscalParser';

function nota(partial: Partial<SpedNotaFiscal> & Pick<SpedNotaFiscal, 'linha'>): SpedNotaFiscal {
  return {
    chave: '',
    numero: '1',
    serie: '1',
    data: '01/01/2026',
    codParticipante: 'F1',
    nomeParticipante: 'FORNECEDOR',
    valorTotal: 100,
    valorPis: 1,
    valorCofins: 2,
    valorIcms: 0,
    valorIpi: 0,
    codContribuicao: '',
    linha: partial.linha,
    ...partial,
  };
}

const configRemessa: FiscalNotaBloqueioConfig = {
  bloquearValorZero: true,
  bloquearRemessa: false,
  regras: [
    {
      id: '1',
      tipo: 'texto',
      valor: 'remessa',
      rotulo: 'Remessa',
      criadoEm: '2026-01-01T00:00:00.000Z',
    },
    {
      id: '2',
      tipo: 'cfop',
      valor: '5901',
      rotulo: 'CFOP 5901',
      criadoEm: '2026-01-01T00:00:00.000Z',
    },
  ],
};

describe('fiscalNotaBloqueio', () => {
  it('bloqueia nota com valor zero', () => {
    const r = avaliarBloqueioNotaFiscal(
      nota({ linha: 1, valorTotal: 0, valorPis: 0, valorCofins: 0 }),
      { bloquearValorZero: true, bloquearRemessa: true, regras: [] },
    );
    expect(r.bloqueada).toBe(true);
    expect(r.motivo).toBe('Valor zero');
  });

  it('bloqueia nota por texto remessa no fornecedor', () => {
    const r = avaliarBloqueioNotaFiscal(
      nota({ linha: 2, nomeParticipante: 'CLIENTE REMESSA INDUSTRIAL' }),
      configRemessa,
    );
    expect(r.bloqueada).toBe(true);
    expect(r.motivo).toBe('Remessa');
  });

  it('bloqueia nota por CFOP', () => {
    const r = avaliarBloqueioNotaFiscal(nota({ linha: 3, cfop: '5901' }), configRemessa);
    expect(r.bloqueada).toBe(true);
    expect(r.motivo).toBe('CFOP 5901');
  });

  it('bloqueia remessa automaticamente por CFOP', () => {
    const rSaida = avaliarBloqueioNotaFiscal(nota({ linha: 4, cfop: '5905', valorTotal: 1000 }), {
      bloquearValorZero: false,
      bloquearRemessa: true,
      regras: [],
    });
    expect(rSaida.bloqueada).toBe(true);
    expect(rSaida.motivo).toContain('Saída de remessa');

    const rEntrada = avaliarBloqueioNotaFiscal(nota({ linha: 41, cfop: '1905', valorTotal: 500 }), {
      bloquearValorZero: false,
      bloquearRemessa: true,
      regras: [],
    });
    expect(rEntrada.bloqueada).toBe(true);
    expect(rEntrada.motivo).toContain('Entrada de remessa');
  });

  it('não bloqueia bonificação como remessa', () => {
    const r = avaliarBloqueioNotaFiscal(nota({ linha: 5, cfop: '5910', valorTotal: 100 }), {
      bloquearValorZero: false,
      bloquearRemessa: true,
      regras: [],
    });
    expect(r.bloqueada).toBe(false);
  });

  it('filtra notas bloqueadas dos acumuladores', () => {
    const notas = [
      nota({ linha: 10, valorTotal: 0, valorPis: 0, valorCofins: 0 }),
      nota({ linha: 11, cfop: '5901', valorTotal: 500 }),
      nota({ linha: 12, valorTotal: 1000, valorPis: 16 }),
    ];
    const { aceitas, bloqueadas } = separarNotasFiscais(notas, configRemessa);
    expect(aceitas).toHaveLength(1);
    expect(bloqueadas).toHaveLength(2);
    expect(filtrarNotasFiscais(notas, configRemessa)).toHaveLength(1);
  });
});

describe('buildFiscalAcumuladorGroups com bloqueio', () => {
  it('não vincula NFs bloqueadas ao acumulador', () => {
    const parsed: ParsedSpedFiscal = {
      tipo: 'CONTRIBUICOES',
      fileName: 'contrib.txt',
      cnpj: '',
      empresa: 'TESTE',
      dtIni: '01032026',
      dtFin: '31032026',
      dtFinLabel: '31/03/2026',
      issues: [],
      notasFiscais: [
        nota({ linha: 20, valorTotal: 0, valorPis: 5, valorCofins: 0 }),
        nota({ linha: 21, valorTotal: 1000, valorPis: 16.5, valorCofins: 76 }),
      ],
      itens: [
        {
          kind: 'acumulador',
          natureza: 'devedora',
          registro: 'M210',
          codigo: '01',
          descricao: 'PIS detalhe',
          imposto: 'PIS/Pasep',
          valor: 16.5,
          linha: 100,
          data: '31/03/2026',
        },
      ],
    };

    const semBloqueio = buildFiscalAcumuladorGroups([{ id: 'a1', parsed }]);
    expect(semBloqueio[0]!.notasFiscais).toHaveLength(2);

    const comBloqueio = buildFiscalAcumuladorGroups([{ id: 'a1', parsed }], {
      bloquearValorZero: true,
      bloquearRemessa: true,
      regras: [],
    });
    expect(comBloqueio[0]!.notasFiscais).toHaveLength(1);
    expect(comBloqueio[0]!.notasFiscais[0]!.valorTotal).toBe(1000);
  });
});
