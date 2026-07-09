import { describe, expect, it } from 'vitest';
import { classificarNotaFiscal } from '../logic/fiscalNotaAcumuladorClass';
import { buildFiscalNotaAcumuladorArvore } from '../logic/fiscalNotaAcumuladorTree';
import { parseSpedNotasFiscaisFromRecords } from '../../extratoVision/utils/spedNotasFiscaisParser';
import type { SpedNotaFiscal } from '../../extratoVision/utils/spedNotasFiscaisParser';

function nf(partial: Partial<SpedNotaFiscal> & Pick<SpedNotaFiscal, 'cfop'>): SpedNotaFiscal {
  return {
    chave: '',
    numero: '1',
    serie: '1',
    data: '01/03/2026',
    codParticipante: 'P1',
    nomeParticipante: 'TESTE',
    valorTotal: 100,
    valorPis: 0,
    valorCofins: 0,
    valorIcms: 0,
    valorIpi: 0,
    codContribuicao: '',
    linha: 1,
    ...partial,
  };
}

describe('classificarNotaFiscal', () => {
  it('classifica compra para revenda (entrada)', () => {
    const c = classificarNotaFiscal(nf({ cfop: '1102', indOper: '0' }));
    expect(c.sentido).toBe('entrada');
    expect(c.familia).toBe('revenda');
    expect(c.bucketKey).toBe('NF|ENTRADA|REVENDA');
    expect(c.titulo).toBe('Compras para revenda');
  });

  it('separa uso e consumo de compra para revenda na entrada', () => {
    const revenda = classificarNotaFiscal(nf({ cfop: '1102', indOper: '0' }));
    const uso = classificarNotaFiscal(nf({ cfop: '1556', indOper: '0' }));
    expect(revenda.familia).toBe('revenda');
    expect(uso.familia).toBe('uso_consumo');
    expect(uso.titulo).toBe('Material de uso e consumo');
    expect(revenda.bucketKey).not.toBe(uso.bucketKey);
  });

  it('classifica receita de vendas (saída)', () => {
    const c = classificarNotaFiscal(nf({ cfop: '5102', indOper: '1' }));
    expect(c.sentido).toBe('saida');
    expect(c.familia).toBe('mercadoria');
    expect(c.bucketKey).toBe('NF|SAIDA|MERCADORIA');
    expect(c.titulo).toBe('Receita de vendas');
  });

  it('usa IND_OPER quando CFOP ausente', () => {
    const c = classificarNotaFiscal(nf({ cfop: '', indOper: '1' }));
    expect(c.sentido).toBe('saida');
    expect(c.familia).toBe('mercadoria');
    expect(c.titulo).toBe('Receita de vendas');
  });

  it('classifica imobilizado', () => {
    const c = classificarNotaFiscal(nf({ cfop: '1551' }));
    expect(c.familia).toBe('imobilizado');
    expect(c.bucketKey).toBe('NF|ENTRADA|IMOBILIZADO');
  });

  it('classifica uso e consumo', () => {
    const c = classificarNotaFiscal(nf({ cfop: '1556' }));
    expect(c.familia).toBe('uso_consumo');
  });

  it('classifica devolução de venda e de compra', () => {
    expect(classificarNotaFiscal(nf({ cfop: '1202' })).familia).toBe('devolucao');
    expect(classificarNotaFiscal(nf({ cfop: '1202' })).titulo).toBe('Devolução de vendas');
    expect(classificarNotaFiscal(nf({ cfop: '5202', indOper: '1' })).titulo).toBe('Devolução de compras');
  });

  it('classifica compensação', () => {
    expect(classificarNotaFiscal(nf({ cfop: '1603' })).familia).toBe('compensacao');
    expect(classificarNotaFiscal(nf({ cfop: '5603', indOper: '1' })).familia).toBe('compensacao');
  });

  it('classifica serviços tomados e prestados', () => {
    expect(classificarNotaFiscal(nf({ cfop: '1933' })).familia).toBe('servicos');
    expect(classificarNotaFiscal(nf({ cfop: '5933', indOper: '1' })).familia).toBe('servicos');
    expect(classificarNotaFiscal(nf({ cfop: '5933', indOper: '1' })).titulo).toBe('Receita de serviços prestados');
  });

  it('classifica uso e consumo na saída', () => {
    const c = classificarNotaFiscal(nf({ cfop: '5556', indOper: '1' }));
    expect(c.familia).toBe('uso_consumo');
    expect(c.titulo).toBe('Saída de uso e consumo');
  });

  it('classifica remessa sem misturar com bonificação', () => {
    expect(classificarNotaFiscal(nf({ cfop: '5905', indOper: '1' })).familia).toBe('remessa');
    expect(classificarNotaFiscal(nf({ cfop: '5910', indOper: '1' })).familia).toBe('bonificacao');
  });

  it('classifica CFOP 6120 como receita de vendas', () => {
    const c = classificarNotaFiscal(nf({ cfop: '6120', indOper: '1' }));
    expect(c.familia).toBe('mercadoria');
    expect(c.titulo).toBe('Receita de vendas');
  });

  it('enriquece CFOP a partir do C190 quando C170 ausente', () => {
    const records = [
      { reg: '0150', fields: ['', '0150', 'C1', 'CLIENTE', '01058', '12345678000199'], lineNum: 1 },
      {
        reg: 'C100',
        fields: ['', 'C100', '1', '0', 'C1', '55', '00', '1', '500', '', '15032026', '15032026', '8000,00'],
        lineNum: 10,
      },
      {
        reg: 'C190',
        fields: ['', 'C190', '041', '6120', '0,00', '8000,00', '0,00', '0,00', '0,00', '0,00', '0,00'],
        lineNum: 20,
      },
    ];
    const notas = parseSpedNotasFiscaisFromRecords(records);
    expect(notas[0]!.cfop).toBe('6120');
    const c = classificarNotaFiscal(notas[0]!);
    expect(c.titulo).toBe('Receita de vendas');
  });

  it('descobre CFOP de remessa no C190 do documento e bloqueia importação', () => {
    const records = [
      {
        reg: '0150',
        fields: ['', '0150', 'M1', 'MUNICIPIO DE GALILEIA', '01058', '12345678000199'],
        lineNum: 1,
      },
      {
        reg: 'C100',
        fields: ['', 'C100', '0', '0', 'M1', '55', '00', '1', '733', '', '01122025', '01122025', '5000,00'],
        lineNum: 10,
      },
      {
        reg: 'C190',
        fields: ['', 'C190', '041', '1905', '0,00', '5000,00', '0,00', '0,00', '0,00', '0,00', '0,00'],
        lineNum: 11,
      },
      {
        reg: 'C100',
        fields: ['', 'C100', '0', '0', 'M1', '55', '00', '1', '734', '', '01122025', '01122025', '3000,00'],
        lineNum: 20,
      },
      {
        reg: 'C190',
        fields: ['', 'C190', '041', '1102', '0,00', '3000,00', '0,00', '0,00', '0,00', '0,00', '0,00'],
        lineNum: 21,
      },
    ];
    const notas = parseSpedNotasFiscaisFromRecords(records);
    expect(notas[0]!.cfop).toBe('1905');
    expect(notas[1]!.cfop).toBe('1102');

    const remessa = classificarNotaFiscal(notas[0]!);
    expect(remessa.familia).toBe('remessa');

    const compra = classificarNotaFiscal(notas[1]!);
    expect(compra.familia).toBe('revenda');
  });

  it('entrada sem CFOP identificável vai para Outras entradas, não revenda', () => {
    const c = classificarNotaFiscal(nf({ indOper: '0' }));
    expect(c.familia).toBe('outros');
    expect(c.titulo).toBe('Outras entradas');
    expect(c.bucketKey).toBe('NF|ENTRADA|OUTROS');
  });
});

describe('buildFiscalNotaAcumuladorArvore', () => {
  it('sempre retorna Entradas e Saídas', () => {
    const arvore = buildFiscalNotaAcumuladorArvore([
      {
        id: 'a1',
        parsed: {
          tipo: 'FISCAL',
          fileName: 'f.txt',
          cnpj: '',
          empresa: 'X',
          dtIni: '',
          dtFin: '',
          dtFinLabel: '',
          issues: [],
          notasFiscais: [nf({ cfop: '1102', numero: '10' })],
          itens: [],
        },
      },
    ]);

    expect(arvore).toHaveLength(2);
    expect(arvore[0]!.titulo).toBe('Entradas');
    expect(arvore[1]!.titulo).toBe('Saídas');
    expect(arvore[0]!.totalNotas).toBe(1);
    expect(arvore[1]!.totalNotas).toBe(0);
  });

  it('agrupa notas em Entradas e Saídas por família', () => {
    const arvore = buildFiscalNotaAcumuladorArvore([
      {
        id: 'a1',
        parsed: {
          tipo: 'FISCAL',
          fileName: 'f.txt',
          cnpj: '',
          empresa: 'X',
          dtIni: '',
          dtFin: '',
          dtFinLabel: '',
          issues: [],
          notasFiscais: [
            nf({ cfop: '1102', numero: '10' }),
            nf({ cfop: '5102', numero: '20', indOper: '1' }),
            nf({ cfop: '1551', numero: '30' }),
          ],
          itens: [],
        },
      },
    ]);

    expect(arvore[0]!.buckets.map((b) => b.familia)).toContain('revenda');
    expect(arvore[0]!.buckets.map((b) => b.familia)).toContain('imobilizado');
    expect(arvore[1]!.buckets[0]!.titulo).toBe('Receita de vendas');
    expect(arvore[0]!.totalNotas).toBe(2);
    expect(arvore[1]!.totalNotas).toBe(1);
  });

  it('agrupa notas sem quebrar quando participante está vazio', () => {
    const arvore = buildFiscalNotaAcumuladorArvore([
      {
        id: 'a1',
        parsed: {
          tipo: 'FISCAL',
          fileName: 'f.txt',
          cnpj: '',
          empresa: 'X',
          dtIni: '',
          dtFin: '',
          dtFinLabel: '',
          issues: [],
          notasFiscais: [
            {
              chave: '',
              numero: '1',
              serie: '1',
              data: '01/03/2026',
              codParticipante: 'P1',
              nomeParticipante: '',
              valorTotal: 100,
              valorPis: 0,
              valorCofins: 0,
              valorIcms: 0,
              valorIpi: 0,
              codContribuicao: '',
              cfop: '1102',
              linha: 1,
            },
          ],
          itens: [],
        },
      },
    ]);
    expect(arvore[0]!.totalNotas).toBe(1);
  });
});
