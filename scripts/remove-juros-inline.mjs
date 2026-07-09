import fs from 'fs';

const p = 'src/components/ParcelamentoTab.tsx';
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

const start = lines.findIndex(
  (l) => l.includes('sm:col-span-2 space-y-2') && lines[lines.indexOf(l) + 2]?.includes('juros')
);
const start2 = lines.findIndex((l) => l.trim() === 'Cálculo dos juros' || l.includes('culo dos juros'));
const start3 = lines.findIndex((l) => l.includes('Modo de c\u00e1lculo dos juros') || l.includes('Modo de c'));
console.log('start', start, start2, start3);

let blockStart = lines.findIndex((l) => l.includes('sm:col-span-2 space-y-2'));
// find the one before Provisão
const prov = lines.findIndex((l) => l.includes('Provis') && l.includes('Juros a Apropriar'));
for (let i = prov - 1; i >= 0; i--) {
  if (lines[i].includes('sm:col-span-2 space-y-2')) {
    blockStart = i;
    break;
  }
}
if (blockStart === -1 || prov === -1) throw new Error('markers ' + blockStart + ' ' + prov);

const out = [...lines.slice(0, blockStart), ...lines.slice(prov - 1)];
fs.writeFileSync(p, out.join('\n'));
console.log('removed lines', blockStart + 1, 'to', prov - 1);
