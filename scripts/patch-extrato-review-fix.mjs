import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const posPath = path.join(root, 'src/lib/ocrExtratoPositional.ts');
const modalPath = path.join(root, 'src/contabilfacil/components/DocumentColunasModal.tsx');

let pos = fs.readFileSync(posPath, 'utf8');

if (pos.includes('return pool.sort((a, b) => b.y - a.y || b.x - a.x)')) {
  pos = pos.replace(
    'return pool.sort((a, b) => b.y - a.y || b.x - a.x)[0] ?? null;',
    'return pool.sort((a, b) => a.x - b.x || b.y - a.y)[0] ?? null;',
  );
}

const filterFn = `
/** Remove linhas só com valor quando outra linha do mesmo dia já tem histórico + mesmo valor. */
export function extratoFiltrarOrfaosValorJaResolvido(rows: OcrExtratoRow[]): OcrExtratoRow[] {
  return rows.filter((row, idx) => {
    const v = rowValorAbs(row);
    if (v <= 0.0001) return true;
    const semHist =
      extratoRowEhFantasmaValorSemHistorico(row) || extratoRowEhValorColunaSemHistorico(row);
    if (!semHist) return true;
    const data = extratoRowDataNormalizada(row);
    const dup = rows.some((other, j) => {
      if (j === idx) return false;
      if (Math.abs(rowValorAbs(other) - v) >= 0.06) return false;
      if (data && !extratoRowsMesmaDataExtrato(other, data)) return false;
      const hist = resolveExtratoDescricaoText(other).trim();
      return !!(hist && extratoHistoricoEhPlausivel(hist));
    });
    return !dup;
  });
}
`;

if (!pos.includes('export function extratoFiltrarOrfaosValorJaResolvido')) {
  pos = pos.replace(
    'export function parearValoresOrfaosComHistoricoSemValor(rows: OcrExtratoRow[]): OcrExtratoRow[] {',
    `${filterFn}\nexport function parearValoresOrfaosComHistoricoSemValor(rows: OcrExtratoRow[]): OcrExtratoRow[] {`,
  );
}

const postOld = `    cur = parearValoresOrfaosComHistoricoSemValor(cur);
    cur = cur
      .map((r) => {
        const corrected = extratoCorrigirRowNaturezaValorDesalinhado(r);`;

const postNew = `    cur = parearValoresOrfaosComHistoricoSemValor(cur);
    cur = extratoFiltrarOrfaosValorJaResolvido(cur);
    cur = cur
      .map((r) => {
        const corrected = extratoCorrigirRowNaturezaValorDesalinhado(r);`;

if (pos.includes(postOld) && !pos.includes('extratoFiltrarOrfaosValorJaResolvido(cur)')) {
  pos = pos.replace(postOld, postNew);
} else if (!pos.includes('extratoFiltrarOrfaosValorJaResolvido(cur)')) {
  const altOld = `    cur = parearValoresOrfaosComHistoricoSemValor(cur);
    cur = cur
      .map((r) => {
        const sanitized = sanitizeExtratoOcrRowColumns(r);`;
  const altNew = `    cur = parearValoresOrfaosComHistoricoSemValor(cur);
    cur = extratoFiltrarOrfaosValorJaResolvido(cur);
    cur = cur
      .map((r) => {
        const sanitized = sanitizeExtratoOcrRowColumns(r);`;
  if (pos.includes(altOld)) pos = pos.replace(altOld, altNew);
}

const divergeOld = `      const diverge =
        Math.abs(picked - lancHit.value) > 0.05 &&
        (picked > lancHit.value * 1.8 ||
          lancHit.value > picked * 1.8 ||
          extratoLinhaIndicaDebitoOperacionalItau(linha) ||
          extratoLinhaIndicaCreditoOperacionalItau(linha));`;

const divergeNew = `      const diverge =
        Math.abs(picked - lancHit.value) > 0.05 &&
        (picked > lancHit.value * 1.5 ||
          lancHit.value > picked * 1.5 ||
          ((extratoLinhaIndicaDebitoOperacionalItau(linha) ||
            extratoLinhaIndicaCreditoOperacionalItau(linha)) &&
            Math.abs(picked - lancHit.value) > 0.02));`;

if (pos.includes(divergeOld)) pos = pos.replace(divergeOld, divergeNew);

fs.writeFileSync(posPath, pos);

let modal = fs.readFileSync(modalPath, 'utf8');
const modalOld = `          if (
            posProcessados.length > 0 &&
            (posProcessados.length >= prepared.length || prepared.length <= 2)
          ) {
            prepared = posProcessados;
          } else if (posProcessados.length > 0) {
            prepared = preparedSanitized;
          } else {
            prepared = preparedSanitized;
          }`;

const modalNew = `          if (posProcessados.length > 0) {
            prepared = posProcessados;
          } else {
            prepared = preparedSanitized;
          }`;

if (modal.includes(modalOld)) {
  modal = modal.replace(modalOld, modalNew);
  fs.writeFileSync(modalPath, modal);
}

console.log('OK patch-extrato-review-fix');
