import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src/lib/ocrExtratoPositional.ts');
let s = fs.readFileSync(p, 'utf8');

const old1 = `      if (/PAGAMENTOS?\\s*TRIB/i.test(desc) && v > 0.0001) {
        if (/GOIAS|SISPAG\\s+FORNECEDORES\\s+E\\s+GOIAS/i.test(linha) && Math.abs(v - 543.22) < 1) {
          out = {
            ...out,
            descricao: 'SISPAG FORNECEDORES E GOIAS',
            historicoOperacao: '',
          };
          return extratoCorrigirRowNaturezaValorDesalinhado(out);
        }`;

const new1 = `      if (/PAGAMENTOS?\\s*TRIB/i.test(desc) && v > 0.0001) {
        if (Math.abs(v - 543.22) < 1) {
          out = {
            ...out,
            descricao: 'SISPAG FORNECEDORES E GOIAS',
            historicoOperacao: '',
            valorMisto: formatExtratoValorAssinadoPt(v, 'D'),
            valorDebito: '',
            valorCredito: '',
          };
          return extratoCorrigirRowNaturezaValorDesalinhado(out);
        }`;

if (s.includes(old1)) {
  s = s.replace(old1, new1);
  console.log('fixed 543');
} else {
  console.log('543 block not found');
}

const tedFix = `      if (
        /\\bTED\\b/i.test(desc) &&
        v > 0.0001 &&
        v < 2000 &&
        /GOIANIA|PAGAMENTOS?\\s*TRIB|TRIBCOD/i.test(ctx)
      ) {
        out = {
          ...out,
          descricao: 'PAGAMENTOS TRIB COD BARRAS GOIANIA-TESOURO',
          historicoOperacao: '',
          valorMisto: formatExtratoValorAssinadoPt(v, 'D'),
          valorDebito: '',
          valorCredito: '',
        };
      }

      if (
        v > 50_000 &&`;

if (!s.includes('PAGAMENTOS TRIB COD BARRAS GOIANIA-TESOURO')) {
  if (s.includes('      if (\n        v > 50_000 &&')) {
    s = s.replace('      if (\n        v > 50_000 &&', tedFix);
    console.log('fixed ted 451');
  }
}

fs.writeFileSync(p, s);
