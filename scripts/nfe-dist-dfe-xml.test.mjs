import { describe, expect, it } from 'vitest';
import {
  buildDistDfeEnvelope,
  buildDistDfeInner,
  distDfeEnvelopeVariants,
  escapeXmlForSoapDataMsg,
  resolveCUfAutor,
} from './nfe-dist-dfe-xml.mjs';

describe('nfe-dist-dfe-xml', () => {
  it('resolveCUfAutor usa código IBGE da UF (GO = 52, não 91)', () => {
    expect(resolveCUfAutor('GO')).toBe('52');
    expect(resolveCUfAutor('sp')).toBe('35');
  });

  it('buildDistDfeInner inclui cUFAutor e NSU 15 dígitos', () => {
    const inner = buildDistDfeInner({
      cnpj: '58952846000190',
      tpAmb: '1',
      ultNSU: '0',
      cUFAutor: '52',
    });
    expect(inner).toContain('<cUFAutor>52</cUFAutor>');
    expect(inner).toContain('<CNPJ>58952846000190</CNPJ>');
    expect(inner).toContain('<ultNSU>000000000000000</ultNSU>');
  });

  it('buildDistDfeEnvelope padrão escapa distDFeInt dentro de nfeDadosMsg (xs:string)', () => {
    const xml = buildDistDfeEnvelope({
      cnpj: '58952846000190',
      tpAmb: '1',
      ultNSU: '0',
      cUFAutor: '52',
    });
    expect(xml).not.toContain('nfeCabecMsg');
    expect(xml).toContain('&lt;distDFeInt');
    expect(xml).toContain('&lt;cUFAutor&gt;52&lt;/cUFAutor&gt;');
    expect(xml).not.toContain('<cUFAutor>91</cUFAutor>');
  });

  it('escapeXmlForSoapDataMsg escapa tags', () => {
    expect(escapeXmlForSoapDataMsg('<a>&</a>')).toBe('&lt;a&gt;&amp;&lt;/a&gt;');
  });

  it('distDfeEnvelopeVariants inclui escaped SOAP 1.2 e fallback SOAP 1.1', () => {
    const variants = distDfeEnvelopeVariants({
      cnpj: '58952846000190',
      tpAmb: '1',
      ultNSU: '0',
      cUFAutor: '52',
    });
    expect(variants.length).toBeGreaterThanOrEqual(5);
    expect(variants[0].encoding).toBe('escaped');
    expect(variants.some((v) => v.soapVersion === '1.1')).toBe(true);
  });
});
