import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');

function patch(file, oldStr, newStr, label) {
  const p = path.join(root, file);
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes(oldStr)) {
    console.error(`MISS ${label}: pattern not found in ${file}`);
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(p, s.replace(oldStr, newStr));
  console.log(`OK ${label}`);
}

patch(
  'src/lib/ocrExtratoPositional.ts',
  `  if (blob) {
    cur = enrichExtratoRowsFromOcrFullTextItau(cur, blob);
    cur = extratoReconciliarHistoricoValorItauPosPareamento(cur);
  }`,
  `  if (blob) {
    cur = extratoReconciliarHistoricoValorItauPosPareamento(cur);
  }`,
  'prepararExtratoOcrRowsParaRevisao',
);

const parserPath = path.join(root, 'src/extratoVision/utils/parser.ts');
let parser = fs.readFileSync(parserPath, 'utf8');
const fnStart = parser.indexOf('export const extractLinesFromPDF');
const returnIdx = parser.lastIndexOf('return allLines;');
const fnEnd = parser.indexOf('};', returnIdx) + 2;
if (fnStart < 0 || returnIdx < 0 || fnEnd <= fnStart) {
  console.error('MISS extractLinesFromPDF bounds', fnStart, returnIdx, fnEnd);
  process.exitCode = 1;
} else {
  const replacement = `export const extractLinesFromPDF = async (
  file: File,
  inferredYear?: string,
  setProcessingMsg?: (msg: string) => void,
  ignoreList?: string[],
  config?: ExtractionConfig,
): Promise<ScannedLine[]> => {
  void file;
  void inferredYear;
  void setProcessingMsg;
  void ignoreList;
  void config;
  throw new Error(
    'Extração de extrato por parser de texto PDF foi desativada. Use o leitor-recortador de extrato (texto nativo do PDF).',
  );
};
`;
  parser = parser.slice(0, fnStart) + replacement + parser.slice(fnEnd);
  fs.writeFileSync(parserPath, parser);
  console.log('OK extractLinesFromPDF stub');
}
