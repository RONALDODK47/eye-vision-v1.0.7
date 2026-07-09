import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/ocrExtratoPositional.ts');
let s = fs.readFileSync(p, 'utf8');

function mustReplace(from, to, label) {
  if (s.includes(to.split('\n')[0]?.trim() || '___')) return;
  if (!s.includes(from)) throw new Error(`block not found: ${label}`);
  s = s.replace(from, to);
}

if (!s.includes('function dataOcrDentroCodigoTedItau')) {
  mustReplace(
    'function parseDataBrDeTextoExtrato(text: string): string {',
    `function dataOcrDentroCodigoTedItau(linha: string, matchIndex: number): boolean {
  const before = linha.slice(Math.max(0, matchIndex - 2), matchIndex);
  if (/\\d\\.$/.test(before) && /^\\d{3}\\./.test(linha.slice(Math.max(0, matchIndex - 3)))) return true;
  const chunk = linha.slice(Math.max(0, matchIndex - 8), matchIndex + 14);
  const ted = chunk.match(/\\d{3}\\.\\d{4}/);
  if (!ted || ted.index == null) return false;
  const globalStart = Math.max(0, matchIndex - 8) + ted.index;
  const globalEnd = globalStart + ted[0].length;
  return matchIndex >= globalStart - 1 && matchIndex <= globalEnd + 2;
}

function parseDataBrDeTextoExtrato(text: string): string {`,
    'dataOcrDentroCodigoTedItau',
  );
}

// Reuse consolidated patch blocks from prior script (abbreviated - run key missing pieces)
if (!s.includes('export function parseExtratoDataOcrText')) {
  const oldSanitize = `/** Remove letras de data OCR — mantém só dígitos e separadores de data. */
export function sanitizeExtratoDataOcrToken(raw: string | undefined): string {
  const t = String(raw ?? '').trim();
  if (!t || isExtratoDatePlaceholder(t)) return '';
  const m = t.match(/(\\d{1,2})\\s*[/.-]\\s*(\\d{1,2})(?:\\s*[/.-]\\s*(\\d{2,4}))?/);
  if (!m) return '';
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const dVal = parseInt(dd, 10);
  const mVal = parseInt(mm, 10);
  if (dVal < 1 || dVal > 31 || mVal < 1 || mVal > 12) return '';
  const yy = m[3] ? (m[3].length === 2 ? \`20\${m[3]}\` : m[3]) : '';
  return yy ? \`\${dd}/\${mm}/\${yy}\` : \`\${dd}/\${mm}\`;
}`;
  const newSanitize = `/** Normaliza qualquer data OCR de extrato para DD/MM/YYYY (ou vazio se inválida). */
export function parseExtratoDataOcrText(
  raw: string | undefined,
  statementYear?: string,
): string {
  const t = String(raw ?? '').trim().replace(/\\s+/g, ' ');
  if (!t || isExtratoDatePlaceholder(t)) return '';
  const iso = extratoDateToIso(t, statementYear);
  if (iso) {
    const m = iso.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
    if (m) return \`\${m[3]}/\${m[2]}/\${m[1]}\`;
  }
  const m = t.match(/(\\d{1,2})\\s*[/.-]\\s*(\\d{1,2})(?:\\s*[/.-]\\s*(\\d{2,4}))?/);
  if (!m) return '';
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const dVal = parseInt(dd, 10);
  const mVal = parseInt(mm, 10);
  if (dVal < 1 || dVal > 31 || mVal < 1 || mVal > 12) return '';
  const yy = m[3] ? (m[3].length === 2 ? \`20\${m[3]}\` : m[3]) : '';
  return yy ? \`\${dd}/\${mm}/\${yy}\` : \`\${dd}/\${mm}\`;
}

export function sanitizeExtratoDataOcrToken(
  raw: string | undefined,
  statementYear?: string,
): string {
  return parseExtratoDataOcrText(raw, statementYear);
}`;
  if (s.includes(oldSanitize)) s = s.replace(oldSanitize, newSanitize);
}

const oldExtrair = `function extrairDataBruta(row: OcrExtratoRow): string {
  const raw = (row.data ?? '').trim();
  if (!isExtratoDatePlaceholder(raw) && !tokenEhCodigoTedItauOcr(raw)) {
    return raw.replace(/\\s+/g, ' ').trim();
  }
  return parseDataBrDeTextoExtrato(row._linhaOcr ?? '');
}`;
const newExtrair = `function extrairDataBruta(row: OcrExtratoRow, statementYear?: string): string {
  const raw = (row.data ?? '').trim();
  if (!isExtratoDatePlaceholder(raw) && !tokenEhCodigoTedItauOcr(raw)) {
    const parsed = parseExtratoDataOcrText(raw, statementYear);
    if (parsed) return parsed;
    return raw.replace(/\\s+/g, ' ').trim();
  }
  const fromLinha = parseExtratoDataOcrText(row._linhaOcr ?? '', statementYear);
  if (fromLinha) return fromLinha;
  return parseDataBrDeTextoExtrato(row._linhaOcr ?? '');
}

function extratoRowsJaSegmentadosPorColunas(rows: OcrExtratoRow[]): boolean {
  return rows.some((r) => {
    const ordem = String(r._extratoOrdem ?? '').trim();
    return ordem.length > 0 && Number(ordem) > 0;
  });
}`;
if (s.includes(oldExtrair)) s = s.replace(oldExtrair, newExtrair);
if (s.includes('const bruta = extrairDataBruta(row);')) {
  s = s.replace('const bruta = extrairDataBruta(row);', 'const bruta = extrairDataBruta(row, year);');
}

if (!s.includes('export function mesclarHistoricoContinuacaoExtratoAoVivo')) {
  const mesclarFn = `export function mesclarHistoricoContinuacaoExtratoAoVivo(rows: OcrExtratoRow[]): OcrExtratoRow[] {
  const out: OcrExtratoRow[] = [];
  for (const row of rows) {
    const valor =
      parseExtratoMoneyValue(row.valorDebito ?? '') ||
      parseExtratoMoneyValue(row.valorCredito ?? '') ||
      parseExtratoMoneyValue(row.valorMisto ?? '') ||
      0;
    const hist = resolveExtratoDescricaoText(row).trim();
    const prev = out[out.length - 1];
    const prevValor = prev
      ? parseExtratoMoneyValue(prev.valorDebito ?? '') ||
        parseExtratoMoneyValue(prev.valorCredito ?? '') ||
        parseExtratoMoneyValue(prev.valorMisto ?? '') ||
        0
      : 0;
    if (
      prev &&
      valor <= 0.0001 &&
      hist &&
      prevValor > 0.0001 &&
      !extratoTextoEhNovoLancamento(hist) &&
      extratoTextoEhContinuacaoHistorico(hist)
    ) {
      const base = resolveExtratoDescricaoText(prev).trim();
      out[out.length - 1] = {
        ...prev,
        descricao: base ? \`\${base}\\n\${hist}\` : hist,
        historicoOperacao: prev.historicoOperacao
          ? \`\${prev.historicoOperacao}\\n\${(row.historicoOperacao ?? hist).trim()}\`
          : row.historicoOperacao,
        _linhaOcr: [String(prev._linhaOcr ?? ''), String(row._linhaOcr ?? '')]
          .filter(Boolean)
          .join('\\n')
          .slice(0, 480),
        _extratoHistoricoMultilinha: '1',
      };
      continue;
    }
    out.push({ ...row });
  }
  return out;
}

`;
  s = s.replace('export function mergeExtratoDescricaoContinuacao(', mesclarFn + 'export function mergeExtratoDescricaoContinuacao(');
}

if (!s.includes('if (!extratoRowsJaSegmentadosPorColunas(cur))')) {
  s = s.replace(
    '    cur = mergeExtratoDescricaoContinuacao(cur, ignoreWords);\n    cur = splitExtratoOcrRowsPorLancamentosFundidos(cur);',
    `    cur = mergeExtratoDescricaoContinuacao(cur, ignoreWords);
    if (!extratoRowsJaSegmentadosPorColunas(cur)) {
      cur = splitExtratoOcrRowsPorLancamentosFundidos(cur);
    }`,
  );
}

if (!s.includes('export function repararExtratoRowsSemHistoricoDeTextoOcr')) {
  const repararFn = `
export function repararExtratoRowsSemHistoricoDeTextoOcr(
  rows: OcrExtratoRow[],
  ocrText: string,
): OcrExtratoRow[] {
  const blob = String(ocrText ?? '').replace(/\\s+/g, ' ').trim();
  if (!blob) return rows;
  return rows.map((row) => {
    const descAtual = resolveExtratoDescricaoText(row).trim();
    if (descAtual && extratoHistoricoEhPlausivel(descAtual)) return row;
    const linha = String(row._linhaOcr ?? '').replace(/\\s+/g, ' ').trim();
    if (linha) {
      const reinfer = inferDescricaoFromLinhaOcr(linha, row);
      if (reinfer && extratoHistoricoEhPlausivel(reinfer)) {
        return { ...row, _linhaOcr: linha, descricao: reinfer };
      }
    }
    const valor =
      parseExtratoMoneyValue(row.valorMisto ?? '') ||
      parseExtratoMoneyValue(row.valorCredito ?? '') ||
      parseExtratoMoneyValue(row.valorDebito ?? '') ||
      0;
    if (valor <= 0.0001) return row;
    const data = String(row.data ?? '').trim();
    const fromBlob =
      inferirHistoricoDeTextoPagina(blob, data, valor) ||
      inferirHistoricoDeTextoPagina(blob, '', valor);
    if (fromBlob && extratoHistoricoEhPlausivel(fromBlob)) {
      return { ...row, _linhaOcr: linha || fromBlob, descricao: fromBlob };
    }
    return row;
  });
}

`;
  s = s.replace(
    '\n\nexport function extratoLinhaEhSomenteDataEValor(text: string): boolean {',
    repararFn + '\nexport function extratoLinhaEhSomenteDataEValor(text: string): boolean {',
  );
}

if (!s.includes('if (valorLanc > 0.0001) return true;')) {
  s = s.replace(
    `      .filter((r) => {
        if (r._valorRecuperadoSaldo === '1' || parseExtratoMoneyValue(r.valorMisto ?? r.valorDebito ?? r.valorCredito ?? '') <= 0.0001) {
          return true;
        }`,
    `      .filter((r) => {
        const valorLanc =
          parseExtratoMoneyValue(r.valorMisto ?? '') ||
          parseExtratoMoneyValue(r.valorDebito ?? '') ||
          parseExtratoMoneyValue(r.valorCredito ?? '') ||
          0;
        if (valorLanc > 0.0001) return true;
        if (r._valorRecuperadoSaldo === '1') return true;
        if (valorLanc <= 0.0001) return true;`,
  );
}

if (!s.includes('(?:TED\\s+RECEB(?:IDA)?|RECEBIMENTOS?)')) {
  s = s.replace(
    `function inferirHistoricoDeTextoPagina(textoPagina: string, data: string, valor: number): string {
  const blob = String(textoPagina ?? '').replace(/\\s+/g, ' ').trim();
  if (!blob || valor <= 0.0001) return '';
  const dataKey = (data ?? '').replace(/\\s+/g, '').slice(0, 5);
  if (valor < 1) {`,
    `function inferirHistoricoDeTextoPagina(textoPagina: string, data: string, valor: number): string {
  const blob = String(textoPagina ?? '').replace(/\\s+/g, ' ').trim();
  if (!blob || valor <= 0.0001) return '';
  const dataKey = (data ?? '').replace(/\\s+/g, '').slice(0, 5);
  const valorFmt = valor
    .toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/\\./g, '\\\\.');
  const dataPrefix = dataKey ? \`\${dataKey}[\\\\s\\\\S]{0,240}?\` : '';
  const ted = new RegExp(
    \`\${dataPrefix}(?:TED\\\\s+RECEB(?:IDA)?|RECEBIMENTOS?)[\\\\s\\\\S]{0,200}?\${valorFmt}\`,
    'i',
  );
  const mt = blob.match(ted);
  if (mt?.[0]) {
    const hist = inferDescricaoFromLinhaOcr(mt[0], { data, _linhaOcr: mt[0] });
    if (hist && extratoHistoricoEhPlausivel(hist)) return hist;
    const semValor = mt[0].replace(/\\s+\\d{1,3}(?:\\.\\d{3})*,\\d{2}\\s*$/, '').trim();
    if (semValor && extratoHistoricoEhPlausivel(semValor)) return semValor;
  }
  if (valor < 1) {`,
  );
  s = s.replace(
    `    return /\\bCODE\\b/i.test(ms[0]) ? 'SISPAG FORNECEDORES CODE' : 'SISPAG FORNECEDORES';
  }
  return '';
}

function aplicarHistoricoEnriquecido`,
    `    return /\\bCODE\\b/i.test(ms[0]) ? 'SISPAG FORNECEDORES CODE' : 'SISPAG FORNECEDORES';
  }
  if (dataKey) return inferirHistoricoDeTextoPagina(textoPagina, '', valor);
  return '';
}

function aplicarHistoricoEnriquecido`,
  );
}

if (s.includes('prev.descricao = base ? `${base} ${desc}` : desc;')) {
  s = s.replace(
    'prev.descricao = base ? `${base} ${desc}` : desc;',
    'prev.descricao = base ? `${base}\\n${desc}` : desc;',
  );
  s = s.replace(
    'prev.historicoOperacao = baseH ? `${baseH} ${histOp}` : histOp;',
    'prev.historicoOperacao = baseH ? `${baseH}\\n${histOp}` : histOp;',
  );
}

fs.writeFileSync(p, s);
console.log('OK', {
  dataOcr: s.includes('function dataOcrDentroCodigoTedItau'),
  parse: s.includes('export function parseExtratoDataOcrText'),
  mesclar: s.includes('export function mesclarHistoricoContinuacaoExtratoAoVivo'),
  splitGuard: s.includes('if (!extratoRowsJaSegmentadosPorColunas(cur))'),
  reparar: s.includes('export function repararExtratoRowsSemHistoricoDeTextoOcr'),
});
