import { describe, expect, it } from 'vitest';
import { parseSpedNotasFiscaisFromRecords } from '../../extratoVision/utils/spedNotasFiscaisParser';
import { buildFiscalAcumuladorGroups } from '../logic/fiscalAcumuladorModel';
import type { ParsedSpedFiscal } from '../../extratoVision/utils/spedFiscalParser';

describe('spedNotasFiscaisParser', () => {
  it('extrai C100 com participante 0150 e tributos do C170', () => {
    const records = [
      { reg: '0150', fields: ['', '0150', 'FORN01', 'FORNECEDOR ABC LTDA', '01058', '12345678000199'], lineNum: 10 },
      {
        reg: 'C100',
        fields: [
          '',
          'C100',
          '0',
          '1',
          'FORN01',
          '55',
          '00',
          '1',
          '12345',
          '35260123456789012345678901234567890123456789',
          '15032026',
          '15032026',
          '1500,00',
        ],
        lineNum: 20,
      },
      {
        reg: 'C170',
        fields: [
          '',
          'C170',
          '1',
          'PROD1',
          'ITEM TESTE',
          '10',
          'UN',
          '1500,00',
          '0,00',
          '0',
          '000',
          '1102',
          '0',
          '1500,00',
          '18,00',
          '270,00',
          '0,00',
          '0,00',
          '0,00',
          '0,00',
          '0,00',
          '0,00',
          '01',
          '1500,00',
          '1,65',
          '24,75',
          '01',
          '1500,00',
          '7,60',
          '114,00',
        ],
        lineNum: 21,
      },
    ];

    const notas = parseSpedNotasFiscaisFromRecords(records);
    expect(notas).toHaveLength(1);
    expect(notas[0]!.nomeParticipante).toBe('FORNECEDOR ABC LTDA');
    expect(notas[0]!.numero).toBe('12345');
    expect(notas[0]!.valorTotal).toBe(1500);
    expect(notas[0]!.valorPis).toBeGreaterThan(0);
    expect(notas[0]!.valorCofins).toBeGreaterThan(0);
    expect(notas[0]!.cfop).toBe('1102');
  });

  it('usa CFOP predominante quando há vários itens C170', () => {
    const records = [
      { reg: '0150', fields: ['', '0150', 'F1', 'FORN', '01058', '12345678000199'], lineNum: 1 },
      {
        reg: 'C100',
        fields: ['', 'C100', '0', '1', 'F1', '55', '00', '1', '99', '', '01032026', '01032026', '3000,00'],
        lineNum: 10,
      },
      {
        reg: 'C170',
        fields: ['', 'C170', '1', 'P1', 'A', '1', 'UN', '1000,00', '0', '0', '000', '1556', '0', '1000,00'],
        lineNum: 11,
      },
      {
        reg: 'C170',
        fields: ['', 'C170', '2', 'P2', 'B', '1', 'UN', '2000,00', '0', '0', '000', '1102', '0', '2000,00'],
        lineNum: 12,
      },
    ];
    const notas = parseSpedNotasFiscaisFromRecords(records);
    expect(notas[0]!.cfop).toBe('1102');
  });

  it('descobre CFOP no C190 do próprio documento (sem C170)', () => {
    const records = [
      { reg: '0150', fields: ['', '0150', 'F1', 'FORN', '01058', '12345678000199'], lineNum: 1 },
      {
        reg: 'C100',
        fields: ['', 'C100', '0', '0', 'F1', '55', '00', '1', '732', '', '01122025', '01122025', '1500,00'],
        lineNum: 10,
      },
      {
        reg: 'C190',
        fields: ['', 'C190', '041', '1102', '0,00', '1500,00', '0,00', '0,00', '0,00', '0,00', '0,00'],
        lineNum: 11,
      },
    ];
    const notas = parseSpedNotasFiscaisFromRecords(records);
    expect(notas[0]!.cfop).toBe('1102');
    expect(notas[0]!.indOper).toBe('0');
  });

  it('não mistura C190 de outro documento', () => {
    const records = [
      { reg: '0150', fields: ['', '0150', 'F1', 'FORN', '01058', '12345678000199'], lineNum: 1 },
      {
        reg: 'C100',
        fields: ['', 'C100', '0', '0', 'F1', '55', '00', '1', '100', '', '01122025', '01122025', '1000,00'],
        lineNum: 10,
      },
      {
        reg: 'C190',
        fields: ['', 'C190', '041', '1102', '0,00', '1000,00', '0,00', '0,00', '0,00', '0,00', '0,00'],
        lineNum: 11,
      },
      {
        reg: 'C100',
        fields: ['', 'C100', '0', '0', 'F1', '55', '00', '1', '101', '', '01122025', '01122025', '2000,00'],
        lineNum: 20,
      },
      {
        reg: 'C190',
        fields: ['', 'C190', '041', '1905', '0,00', '2000,00', '0,00', '0,00', '0,00', '0,00', '0,00'],
        lineNum: 21,
      },
    ];
    const notas = parseSpedNotasFiscaisFromRecords(records);
    expect(notas[0]!.cfop).toBe('1102');
    expect(notas[1]!.cfop).toBe('1905');
  });
});

describe('buildFiscalAcumuladorGroups', () => {
  it('agrupa acumuladores e vincula NFs por imposto', () => {
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
        {
          chave: '1',
          numero: '100',
          serie: '1',
          data: '15/03/2026',
          codParticipante: 'F1',
          nomeParticipante: 'FORNECEDOR',
          valorTotal: 1000,
          valorPis: 16.5,
          valorCofins: 76,
          valorIcms: 0,
          valorIpi: 0,
          codContribuicao: '',
          linha: 20,
        },
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

    const groups = buildFiscalAcumuladorGroups([{ id: 'a1', parsed }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.notasFiscais).toHaveLength(1);
    expect(groups[0]!.notasFiscais[0]!.nomeParticipante).toBe('FORNECEDOR');
  });
});
