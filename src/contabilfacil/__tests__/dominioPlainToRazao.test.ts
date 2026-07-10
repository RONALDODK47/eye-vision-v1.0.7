import { describe, expect, it } from 'vitest';
import {
  buildRazaoFromDominioPlain,
  isDominioPlainRazaoRow,
  mergeDominioPlainRazaoComExistente,
} from '../logic/dominioPlainToRazao';

describe('dominioPlainToRazao', () => {
  it('gera partida dobrada com marca no nome', () => {
    const { rows, gerados } = buildRazaoFromDominioPlain(
      [
        {
          date: new Date(2026, 5, 1),
          debContaStr: '8',
          credContaStr: '147',
          value: 100,
          historico: 'APLICACAO FINANCEIRA',
        },
      ],
      'APLICACAO-AUTO',
      'app-1',
    );
    expect(gerados).toBe(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.debito).toBe(100);
    expect(rows[1]!.credito).toBe(100);
    expect(isDominioPlainRazaoRow(rows[0]!, 'APLICACAO-AUTO')).toBe(true);
    expect(rows[0]!.data).toBe('01/06/2026');
  });

  it('substitui apenas a entidade no merge', () => {
    const a = buildRazaoFromDominioPlain(
      [
        {
          date: new Date(2026, 0, 1),
          debContaStr: '1',
          credContaStr: '2',
          value: 10,
          historico: 'A',
        },
      ],
      'APLICACAO-AUTO',
      'app-a',
    ).rows;
    const b = buildRazaoFromDominioPlain(
      [
        {
          date: new Date(2026, 0, 1),
          debContaStr: '3',
          credContaStr: '4',
          value: 20,
          historico: 'B',
        },
      ],
      'APLICACAO-AUTO',
      'app-b',
    ).rows;
    const merged = mergeDominioPlainRazaoComExistente([...a, ...b], a, 'APLICACAO-AUTO', 'app-a');
    expect(merged.filter((r) => (r.nome ?? '').includes('app-a'))).toHaveLength(2);
    expect(merged.filter((r) => (r.nome ?? '').includes('app-b'))).toHaveLength(2);
  });
});
