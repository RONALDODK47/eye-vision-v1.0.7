import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src/lib/ocrExtratoPositional.ts');
let s = fs.readFileSync(p, 'utf8');

const oldBlock = `  const ctx = [linha, resolveExtratoDescricaoText(out)].filter(Boolean).join(' ').trim();
  const picked =
    parseExtratoMoneyValue(out.valorMisto ?? '') ||
    parseExtratoMoneyValue(out.valorDebito ?? '') ||
    parseExtratoMoneyValue(out.valorCredito ?? '');
  if (ctx && picked > 0.0001 && out.valorMisto?.trim()) {
    const natAtual = extratoNaturezaPorValorAssinadoNoToken(out.valorMisto, picked);
    const indDeb = extratoLinhaIndicaDebitoOperacionalItau(ctx);
    const indCred = extratoLinhaIndicaCreditoOperacionalItau(ctx);
    let natCorreta: 'D' | 'C' | null = null;
    if (indDeb && !indCred) natCorreta = 'D';
    else if (indCred && !indDeb) natCorreta = 'C';
    if (natCorreta && natAtual !== natCorreta) {
      out.valorMisto = formatExtratoValorAssinadoPt(picked, natCorreta);
      out.valorDebito = '';
      out.valorCredito = '';
    }
  }
  return out;
}`;

const newBlock = `  const origemSaldo = String(out._linhaOcrSaldoOrigem ?? '').replace(/\\s+/g, ' ').trim();
  const ctx = [linha, origemSaldo, resolveExtratoDescricaoText(out)].filter(Boolean).join(' ').trim();
  let picked =
    parseExtratoMoneyValue(out.valorMisto ?? '') ||
    parseExtratoMoneyValue(out.valorDebito ?? '') ||
    parseExtratoMoneyValue(out.valorCredito ?? '');
  const recuperado = extratoRecuperarValorDigitoPerdidoOcr(\`\${linha} \${origemSaldo}\`, picked, ctx);
  if (recuperado && Math.abs(recuperado - picked) > 0.05) {
    const natRec =
      extratoLinhaIndicaDebitoOperacionalItau(ctx) && !extratoLinhaIndicaCreditoOperacionalItau(ctx)
        ? 'D'
        : extratoLinhaIndicaCreditoOperacionalItau(ctx) && !extratoLinhaIndicaDebitoOperacionalItau(ctx)
          ? 'C'
          : extratoNaturezaPorValorAssinadoNoToken(String(out.valorMisto ?? ''), picked);
    out.valorMisto = formatExtratoValorAssinadoPt(recuperado, natRec);
    out.valorDebito = '';
    out.valorCredito = '';
    picked = recuperado;
  }
  if (ctx && picked > 0.0001 && out.valorMisto?.trim()) {
    const natAtual = extratoNaturezaPorValorAssinadoNoToken(out.valorMisto, picked);
    const indDeb = extratoLinhaIndicaDebitoOperacionalItau(ctx);
    const indCred = extratoLinhaIndicaCreditoOperacionalItau(ctx);
    let natCorreta: 'D' | 'C' | null = null;
    if (indDeb && !indCred) natCorreta = 'D';
    else if (indCred && !indDeb) natCorreta = 'C';
    if (natCorreta && natAtual !== natCorreta) {
      out.valorMisto = formatExtratoValorAssinadoPt(picked, natCorreta);
      out.valorDebito = '';
      out.valorCredito = '';
    }
  }
  return out;
}`;

if (s.includes(oldBlock)) {
  s = s.replace(oldBlock, newBlock);
  fs.writeFileSync(p, s);
  console.log('OK applied corrigir recovery block');
} else if (s.includes('extratoRecuperarValorDigitoPerdidoOcr(`${linha} ${origemSaldo}`')) {
  console.log('already applied');
} else {
  console.log('FAIL block not found');
  const idx = s.indexOf('export function extratoCorrigirRowNaturezaValorDesalinhado');
  console.log('corrigir at', idx);
}
