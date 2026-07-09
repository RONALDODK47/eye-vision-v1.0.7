import { describe, expect, it } from 'vitest';
import {
  parseDistDfeSoapResponse,
  resolveCnpjForDistDfe,
} from './nfe-dist-dfe-sefaz.mjs';

describe('resolveCnpjForDistDfe', () => {
  it('mantém CNPJ informado quando base coincide com certificado', () => {
    const r = resolveCnpjForDistDfe({
      pfx: Buffer.alloc(0),
      passphrase: 'x',
      cnpjInformado: '58952846000190',
    });
    expect(r.cnpj).toBe('58952846000190');
  });
});

describe('parseDistDfeSoapResponse', () => {
  it('extrai cStat e docZip da resposta SOAP', () => {
    const xml = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDistDFeInteresseResult><retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe"><cStat>138</cStat><xMotivo>Documento(s) localizado(s)</xMotivo><ultNSU>000000000000001</ultNSU><maxNSU>000000000000010</maxNSU><loteDistDFeInt><docZip NSU="1" schema="procNFe_v4.00.xsd">YWFh</docZip></loteDistDFeInt></retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`;
    const parsed = parseDistDfeSoapResponse(xml);
    expect(parsed.cStat).toBe('138');
    expect(parsed.ultNSU).toBe('000000000000001');
    expect(parsed.docZip).toHaveLength(1);
    expect(parsed.docZip[0].base64).toBe('YWFh');
  });
});
