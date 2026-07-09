import { describe, expect, it } from 'vitest';
import {
  aliasMatchesHistorico,
  compactAliasKey,
  matchColigadaNoHistorico,
} from './aiInteligenciaStorage';

describe('compactAliasKey / coligadas', () => {
  it('unifica AJTF em todas as formas', () => {
    expect(compactAliasKey('AJTF')).toBe('AJTF');
    expect(compactAliasKey('A.J.T.F')).toBe('AJTF');
    expect(compactAliasKey('A J T F')).toBe('AJTF');
    expect(compactAliasKey('A. J. T. F')).toBe('AJTF');
  });

  it('reconhece coligada no histórico do extrato', () => {
    const coligadas = [
      {
        id: '1',
        nome: 'AJTF',
        aliases: ['AJTF', 'A.J.T.F', 'A J T F'],
      },
    ];
    expect(matchColigadaNoHistorico('PIX RECEB AJTF EMPRESA', coligadas)?.nome).toBe('AJTF');
    expect(matchColigadaNoHistorico('TED A.J.T.F LTDA', coligadas)?.nome).toBe('AJTF');
    expect(matchColigadaNoHistorico('CREDITO A J T F', coligadas)?.nome).toBe('AJTF');
    expect(matchColigadaNoHistorico('PIX CLIENTE JOAO', coligadas)).toBeNull();
  });

  it('extrai várias coligadas de um texto de inteligência', async () => {
    const { extractColigadasFromTexto } = await import('./aiInteligenciaStorage');
    const texto = `
Empresas coligadas:
A. J. T. F. LTDA
ONIX COMERCIO
IMPERIO COMERCIO LTDA
POLO SUL REFRIGERAÇÃO
ECONOMICA COMERCIO
`;
    const found = extractColigadasFromTexto(texto);
    const nomes = found.map((f) => f.nome.toUpperCase());
    expect(nomes.some((n) => n.includes('AJTF') || n.includes('A. J. T. F'))).toBe(true);
    expect(nomes.some((n) => n.includes('ONIX'))).toBe(true);
    expect(nomes.some((n) => n.includes('IMPERIO'))).toBe(true);
    expect(nomes.some((n) => n.includes('POLO SUL'))).toBe(true);
    expect(nomes.some((n) => n.includes('ECONOMICA'))).toBe(true);
  });
});
