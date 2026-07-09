import { describe, expect, it } from 'vitest';
import { parseOfxContentToExtratoItems } from './ofxExtratoImport';

const SAMPLE_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<LEDGERBAL>
<BALAMT>1000.00
<DTASOF>20260401000000
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260402120000
<TRNAMT>0.02
<MEMO>RENDIMENTOS REND PAGO APLIC AUT MAIS
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260402120000
<TRNAMT>-0.65
<MEMO>IOF
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260402120000
<TRNAMT>-169.00
<MEMO>TAR PLANO ADAPT
</STMTTRN>
`;

describe('ofxExtratoImport', () => {
  it('converte STMTTRN em lançamentos D/C do extrato', () => {
    const { items, saldoAnterior, conciliacao } = parseOfxContentToExtratoItems(SAMPLE_OFX, {
      contaBanco: '1.01.02.0002',
      bancoNome: 'Itaú',
    });
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.accountCode === '')).toBe(true);
    expect(items.some((i) => i.nature === 'C' && Math.abs(i.value - 0.02) < 0.001)).toBe(true);
    expect(items.some((i) => i.nature === 'D' && Math.abs(i.value - 0.65) < 0.001)).toBe(true);
    expect(items.some((i) => i.nature === 'D' && Math.abs(i.value - 169) < 0.01)).toBe(true);
    expect(saldoAnterior).toBe(1000);
    expect(conciliacao).toBeDefined();
    expect(conciliacao!.creditos).toBeCloseTo(0.02, 2);
    expect(conciliacao!.debitos).toBeCloseTo(169.65, 2);
    expect(conciliacao!.saldoConciliado).toBeCloseTo(830.37, 2);
    expect(conciliacao!.saldoFinalOcr).toBeCloseTo(830.37, 2);
    expect(conciliacao!.ok).toBe(true);
  });

  it('exige conta do banco', () => {
    const { items, logs } = parseOfxContentToExtratoItems(SAMPLE_OFX);
    expect(items).toHaveLength(0);
    expect(logs[0]).toContain('conta contábil');
  });
});
