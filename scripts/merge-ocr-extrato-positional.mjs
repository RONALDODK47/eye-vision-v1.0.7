import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const current = fs.readFileSync(path.join(root, 'src/lib/ocrExtratoPositional.ts'), 'utf8').split(/\r?\n/);
const zip = fs
  .readFileSync(path.join(root, 'src/lib/ocrExtratoPositional.ts.zipbak'), 'utf8')
  .split(/\r?\n/);

const headEnd = current.findIndex((l, i) => i >= 3290 && l.startsWith('export function tokenEhValorExtrato'));
let i = headEnd;
while (i < current.length && !/^}/.test(current[i].trim())) i++;
const head = current.slice(0, i + 1);

const tailStart = zip.findIndex((l) => l.startsWith('export function extratoHistoricoEhPlausivel'));
const zipTail = zip.slice(tailStart);

const helpers = fs.readFileSync(path.join(__dirname, 'ocrExtratoPositional-helpers.ts'), 'utf8').split(/\r?\n/);
const overrides = fs.readFileSync(path.join(__dirname, 'ocrExtratoPositional-overrides.ts'), 'utf8').split(/\r?\n/);

const skipExports = new Set([
  'extratoHistoricoEhPlausivel',
  'extratoRowEhSaldoInformativo',
  'postProcessExtratoOcrRows',
  'cleanExtratoOcrRowForImport',
  'mergeExtratoValorOrfao',
  'mergeExtratoDescricaoContinuacao',
  'extratoTextoContemPalavraIgnorada',
  'extratoRowContemPalavraIgnorada',
  'removerLinhasComPalavrasIgnoradas',
  'inferDescricaoFromLinhaOcr',
]);

function stripFunctions(srcLines, names) {
  const out = [];
  let skipping = false;
  let depth = 0;
  for (const line of srcLines) {
    const m = line.match(/^export function ([A-Za-z0-9_]+)/);
    if (m && names.has(m[1])) {
      skipping = true;
      depth = 0;
    }
    if (!skipping) {
      out.push(line);
      continue;
    }
    for (const ch of line) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    if (skipping && depth <= 0 && line.includes('}')) skipping = false;
  }
  return out;
}

const mergedTail = stripFunctions(zipTail, skipExports);
const out = [...head, '', ...helpers, '', ...mergedTail, '', ...overrides].join('\n');
fs.writeFileSync(path.join(root, 'src/lib/ocrExtratoPositional.ts'), out);
console.log('merged lines', out.split(/\r?\n/).length);
