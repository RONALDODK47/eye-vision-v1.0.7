import { describe, expect, it } from 'vitest';
import { buildCienciaEventoXml, buildInfEventoId } from './nfe-manifesto-sefaz.mjs';

describe('nfe-manifesto-sefaz', () => {
  const chave = '35250612345678000190550010000000011234567890';

  it('buildInfEventoId segue padrão ID + tpEvento + chave + seq', () => {
    const id = buildInfEventoId('210210', chave, 1);
    expect(id).toBe(`ID210210${chave}01`);
    expect(id.length).toBe(54);
  });

  it('buildCienciaEventoXml inclui campos obrigatórios', () => {
    const xml = buildCienciaEventoXml({
      cnpj: '12345678000190',
      chNFe: chave,
      tpAmb: '1',
    });
    expect(xml).toContain('<tpEvento>210210</tpEvento>');
    expect(xml).toContain(`<chNFe>${chave}</chNFe>`);
    expect(xml).toContain('<descEvento>Ciencia da Operacao</descEvento>');
    expect(xml).toContain('<cOrgao>91</cOrgao>');
  });
});
