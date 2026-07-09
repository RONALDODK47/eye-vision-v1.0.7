import { describe, expect, it } from 'vitest';
import { matchExtratoRegraConta } from './extratoRegrasContasMatcher';
import type { ExtratoRegraConta } from './extratoRegrasContasStorage';
import { normalizeExtratoMatchText, filterExtratoRegrasPorBanco } from './extratoRegrasContasStorage';
import { normalizeSignificadoExtrato } from './extratoContaResolver';

const BANCO = '1110200001';

const regras: ExtratoRegraConta[] = [
  {
    id: '1',
    nome: 'Pagamento',
    descricao: 'PAGAMENTO',
    nature: 'D',
    contaBanco: BANCO,
    contaContrapartida: '2110100001',
  },
  {
    id: '2',
    nome: 'Compe',
    descricao: 'DOC.: DEB.TIT.COMPE.EFETI DOC.:',
    nature: 'D',
    contaBanco: BANCO,
    contaContrapartida: '2110100001',
  },
];

describe('normalizeExtratoMatchText', () => {
  it('alinha com normalizeSignificadoExtrato do extrato', () => {
    const raw = 'DOC.: DEB.TIT.COMPE.EFETI DOC.:';
    expect(normalizeExtratoMatchText(raw)).toBe(normalizeSignificadoExtrato(raw));
  });
});

describe('matchExtratoRegraConta', () => {
  it('identifica regra PAGAMENTO em histórico PIX', () => {
    const hist = normalizeSignificadoExtrato('PIX EMIT OUTRA PAGAMENTO');
    const m = matchExtratoRegraConta(hist, 'D', regras);
    expect(m?.id).toBe('1');
  });

  it('identifica regra COMPE após normalização', () => {
    const hist = normalizeSignificadoExtrato('DOC.: DEB.TIT.COMPE.EFETI DOC.:');
    const m = matchExtratoRegraConta(hist, 'D', regras);
    expect(m?.id).toBe('2');
  });

  it('filterExtratoRegrasPorBanco isola regras do banco ativo', () => {
    const filtradas = filterExtratoRegrasPorBanco(regras, BANCO);
    expect(filtradas).toHaveLength(2);
    expect(filterExtratoRegrasPorBanco(regras, '9999999999')).toHaveLength(0);
  });

  it('não confunde POLO SUL CLIMATIZACAO com POLO SUL REFRIGERACAO', () => {
    const regrasPolo: ExtratoRegraConta[] = [
      {
        id: 'refri',
        nome: 'Refrigeracao',
        descricao: 'POLO SUL REFRIGERACAO',
        nature: 'C',
        contaBanco: BANCO,
        contaContrapartida: '100',
      },
      {
        id: 'clima',
        nome: 'Climatizacao',
        descricao: 'POLO SUL CLIMATIZACAO',
        nature: 'C',
        contaBanco: BANCO,
        contaContrapartida: '200',
      },
    ];
    const hist = normalizeSignificadoExtrato('PIX RECEBIDO POLO S CLIMATIZACAO LTD');
    const m = matchExtratoRegraConta(hist, 'C', regrasPolo);
    expect(m?.id).toBe('clima');
    expect(m?.contaContrapartida).toBe('200');
  });

  it('casa TED RECEBIDA / PIX RECEBIDO mesmo com tokens de stop', () => {
    const regrasOp: ExtratoRegraConta[] = [
      {
        id: 'ted',
        nome: 'TED',
        descricao: 'TED RECEBIDA',
        nature: 'C',
        contaBanco: BANCO,
        contaContrapartida: '2110100001',
      },
      {
        id: 'pix',
        nome: 'PIX',
        descricao: 'PIX RECEBIDO',
        nature: 'C',
        contaBanco: BANCO,
        contaContrapartida: '2110100001',
      },
    ];
    expect(
      matchExtratoRegraConta(
        normalizeSignificadoExtrato('TED RECEBIDA CLIENTE ABC'),
        'C',
        regrasOp,
      )?.id,
    ).toBe('ted');
    expect(
      matchExtratoRegraConta(
        normalizeSignificadoExtrato('PIX RECEBIDO FORNECEDOR X'),
        'C',
        regrasOp,
      )?.id,
    ).toBe('pix');
  });
});
