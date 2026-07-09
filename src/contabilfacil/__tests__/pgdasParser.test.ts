import { describe, expect, it } from 'vitest';
import { isPgdasText, parsePgdasText, pgdasImportSlotKey } from '../logic/pgdasParser';

const PGDAS_SAMPLE = `
PROGRAMA GERADOR DO DOCUMENTO DE ARRECADACAO DO SIMPLES NACIONAL - PGDAS-D
Identificação do Contribuinte
CNPJ: 12.345.678/0001-90
Nome Empresarial: EMPRESA TESTE LTDA
Período de Apuração
03/2026
Valor Total do Documento de Arrecadação
R$ 1.234,56
`;

describe('pgdasParser', () => {
  it('reconhece texto PGDAS-D', () => {
    expect(isPgdasText(PGDAS_SAMPLE)).toBe(true);
  });

  it('extrai período, CNPJ e valor do DAS', () => {
    const parsed = parsePgdasText(PGDAS_SAMPLE, 'pgdas-mar-2026.pdf');
    expect(parsed.periodo).toBe('03/2026');
    expect(parsed.cnpj).toBe('12345678000190');
    expect(parsed.empresa).toContain('EMPRESA TESTE');
    expect(parsed.valorDas).toBeCloseTo(1234.56, 2);
    expect(parsed.itens.length).toBeGreaterThan(0);
    expect(parsed.itens[0]?.imposto).toBe('Simples Nacional');
    expect(parsed.itens[0]?.kind).toBe('imposto');
  });

  it('agrupa importação por mês', () => {
    const parsed = parsePgdasText(PGDAS_SAMPLE, 'a.pdf');
    expect(pgdasImportSlotKey(parsed)).toBe('PGDAS|2026-03');
  });

  it('extrai somente o Documento de Arrecadação, sem Componentes DAS', () => {
    const comComponentes = `
${PGDAS_SAMPLE}
ICMS: R$ 500,00
CSLL: R$ 100,00
PIS: R$ 50,00
COFINS: R$ 80,00
`;
    const parsed = parsePgdasText(comComponentes, 'pgdas-fev.pdf');
    expect(parsed.itens).toHaveLength(1);
    expect(parsed.itens[0]?.codigo).toBe('DAS-TOTAL');
    expect(parsed.itens[0]?.descricao).toContain('Documento de Arrecadação');
    expect(parsed.itens.some((i) => i.descricao.includes('Componente DAS'))).toBe(false);
  });
});
