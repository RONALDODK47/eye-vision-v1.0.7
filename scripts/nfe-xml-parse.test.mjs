import { describe, expect, it } from 'vitest';
import { parseNfeXmlString } from './nfe-xml-parse.mjs';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe52202658952846000190550010000001231234567890">
      <ide><nNF>123</nNF><serie>1</serie><dhEmi>2026-01-15T10:00:00-03:00</dhEmi></ide>
      <emit><xNome>FORNECEDOR TESTE</xNome></emit>
      <dest><xNome>POLO SUL</xNome></dest>
      <det nItem="1">
        <prod><cProd>001</cProd><xProd>INSUMO A</xProd><qCom>2.0000</qCom><vUnCom>10.00</vUnCom><uCom>UN</uCom></prod>
        <imposto><ICMS><ICMS00><vICMS>3.60</vICMS></ICMS00></ICMS><PIS><PISAliq><vPIS>0.33</vPIS></PISAliq></PIS><COFINS><COFINSAliq><vCOFINS>1.52</vCOFINS></COFINSAliq></COFINS></imposto>
      </det>
      <total><ICMSTot><vNF>20.00</vNF><vICMS>3.60</vICMS><vPIS>0.33</vPIS><vCOFINS>1.52</vCOFINS></ICMSTot></total>
    </infNFe>
  </NFe>
  <protNFe><infProt><chNFe>52202658952846000190550010000001231234567890</chNFe></infProt></protNFe>
</nfeProc>`;

describe('nfe-xml-parse', () => {
  it('parseNfeXmlString extrai nota, itens e créditos', () => {
    const parsed = parseNfeXmlString(SAMPLE, { dataInicio: '2026-01-01', dataFim: '2026-01-31' });
    expect(parsed?.nota.numero).toBe('123');
    expect(parsed?.nota.emitente).toBe('FORNECEDOR TESTE');
    expect(parsed?.itens.length).toBe(1);
    expect(parsed?.creditos.length).toBeGreaterThan(0);
  });
});
