import { describe, expect, it } from 'vitest';
import type { AiColigada } from './aiInteligenciaStorage';
import {
  consolidateExtratoRegras,
  extractRegraEntityDescricao,
  mergeSugestoesIntoRegras,
} from './extratoRegrasEntity';
import { matchExtratoRegraConta } from './extratoRegrasContasMatcher';
import type { ExtratoRegraConta } from './extratoRegrasContasStorage';

const AJTF: AiColigada = {
  id: '1',
  nome: 'AJTF',
  aliases: ['A.J.T.F', 'A J T F', 'A. J. T. F. LTDA', 'A J T'],
  contaReduzida: '1094',
};

describe('extratoRegrasEntity — 1 regra por entidade', () => {
  it('AJTF: PIX RECEBIDO e PIX ENVIADO viram a mesma descrição canônica', () => {
    expect(extractRegraEntityDescricao('PIX RECEBIDO A J T', 'C', [AJTF])).toBe('AJTF');
    expect(extractRegraEntityDescricao('PIX ENVIADO A J T F LTDA', 'D', [AJTF])).toBe('AJTF');
    expect(extractRegraEntityDescricao('TED A.J.T.F', 'D', [AJTF])).toBe('AJTF');
  });

  it('consolida duplicatas literais em 1 regra D e 1 regra C', () => {
    const regras: ExtratoRegraConta[] = [
      {
        id: '1',
        nome: 'PIX RECEBIDO A J T',
        descricao: 'PIX RECEBIDO A J T',
        nature: 'C',
        contaBanco: '8',
        contaContrapartida: '1094',
      },
      {
        id: '2',
        nome: 'PIX ENVIADO A J T F LTDA',
        descricao: 'PIX ENVIADO A J T F LTDA',
        nature: 'D',
        contaBanco: '8',
        contaContrapartida: '1094',
      },
      {
        id: '3',
        nome: 'A J T F',
        descricao: 'A J T F',
        nature: 'D',
        contaBanco: '8',
        contaContrapartida: '1094',
      },
    ];
    const out = consolidateExtratoRegras(regras, [AJTF]);
    expect(out).toHaveLength(2);
    const d = out.find((r) => r.nature === 'D');
    const c = out.find((r) => r.nature === 'C');
    expect(d?.descricao).toBe('AJTF');
    expect(c?.descricao).toBe('AJTF');
  });

  it('merge não cria segunda regra AJTF D', () => {
    const current: ExtratoRegraConta[] = [
      {
        id: '1',
        nome: 'AJTF',
        descricao: 'AJTF',
        nature: 'D',
        contaBanco: '8',
        contaContrapartida: '1094',
      },
    ];
    const { next, added } = mergeSugestoesIntoRegras({
      current,
      sugestoes: [
        {
          descricao: 'PIX ENVIADO A J T F LTDA',
          nature: 'D',
          contaContrapartida: '1094',
        },
      ],
      contaBanco: '8',
      resolveContra: (r) => r,
      coligadas: [AJTF],
    });
    expect(added).toBe(0);
    expect(next.filter((r) => r.nature === 'D')).toHaveLength(1);
  });

  it('1 regra AJTF casa vários lançamentos no matcher', () => {
    const regras: ExtratoRegraConta[] = [
      {
        id: '1',
        nome: 'AJTF',
        descricao: 'AJTF',
        nature: 'C',
        contaBanco: '8',
        contaContrapartida: '1094',
      },
      {
        id: '2',
        nome: 'AJTF',
        descricao: 'AJTF',
        nature: 'D',
        contaBanco: '8',
        contaContrapartida: '1094',
      },
    ];
    expect(matchExtratoRegraConta('PIX RECEBIDO A J T', 'C', regras)?.descricao).toBe('AJTF');
    expect(matchExtratoRegraConta('PIX ENVIADO A J T F LTDA', 'D', regras)?.descricao).toBe(
      'AJTF',
    );
    expect(matchExtratoRegraConta('TED A.J.T.F ONIX', 'D', regras)?.descricao).toBe('AJTF');
  });
});
