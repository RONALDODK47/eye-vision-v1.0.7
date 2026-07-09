/**
 * Teste pontual de extração OCR puro em PDF de extrato.
 * Uso: node scripts/test-extrato-pdf.mjs "caminho\extrato.pdf"
 */
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const PDF_PATH =
  process.argv[2] ||
  String.raw`p:\EMPRESAS\ATIVAS\IMUNE ISENTAS\SINDICATO NACIONAL DE SERV FEDERAIS DA EDUCAÇÃO BASICA E PROF E TECNOLOGIA\RECORRENTE\2026\CONTABIL\DOCUMENTOS PARA CONTABILIZAÇÃO\05-2026\extrato com informações (2).pdf`;

if (!fs.existsSync(PDF_PATH)) {
  console.error('Arquivo não encontrado:', PDF_PATH);
  process.exit(1);
}

const {
  pdfPageToPosicionadoItems,
  pdfNativeItemsLookLikeExtrato,
  suggestExtratoBancarioColumns,
} = await import('../src/lib/pdfNativeTextItems.ts');

const {
  extractGenericRowsFromMapping,
  mappingGenericoEmCoordsOcr,
} = await import('../src/lib/parcelamentoColunasExtract.ts');

const {
  segmentarExtratoEmLancamentos,
  auditarCoberturaValoresExtrato,
  validarMapeamentoExtratoOcr,
  resolveExtratoValorColBoundsFromColumns,
} = await import('../src/lib/ocrExtratoPositional.ts');

const { parseExtratoMoneyValue } = await import('../src/extratoVision/utils/extratoMoneyParse.ts');

function rowValor(row) {
  const deb = parseExtratoMoneyValue(row.valorDebito ?? '');
  const cred = parseExtratoMoneyValue(row.valorCredito ?? '');
  const mistoRaw = row.valorMisto ?? '';
  const misto = parseExtratoMoneyValue(mistoRaw);
  if (deb > 0) return { val: deb, nature: 'D' };
  if (cred > 0) return { val: cred, nature: 'C' };
  if (misto > 0) {
    const n = /C\b/i.test(mistoRaw) ? 'C' : /D\b/i.test(mistoRaw) ? 'D' : '';
    return { val: misto, nature: n };
  }
  return { val: 0, nature: '' };
}

const buf = fs.readFileSync(PDF_PATH);
const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
console.log('PDF:', PDF_PATH);
console.log('Páginas:', doc.numPages);
console.log('---');

const scale = 2;
let allRows = [];
let totalValoresAudit = 0;
let totalSegmentos = 0;
let auditOkPages = 0;

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const { items, imgWidth, imgHeight } = await pdfPageToPosicionadoItems(page, scale);
  const nativeOk = pdfNativeItemsLookLikeExtrato(items);
  console.log(`\n=== Página ${p}/${doc.numPages} ===`);
  console.log(`Tokens: ${items.length} | ${imgWidth}x${imgHeight} | texto nativo: ${nativeOk ? 'sim' : 'não'}`);

  if (!nativeOk || items.length < 10) {
    console.log('  ⚠ Pouco texto nativo — este PDF pode precisar de OCR Tesseract (escaneado).');
    continue;
  }

  const suggested = suggestExtratoBancarioColumns(items, imgWidth);
  if (!suggested) {
    console.log('  ✕ Não foi possível sugerir colunas automaticamente.');
    continue;
  }

  const mapping = mappingGenericoEmCoordsOcr(
    suggested.columns,
    { startY: suggested.faixaStart, endY: suggested.faixaEnd },
    imgWidth,
    imgHeight,
    imgWidth,
    imgHeight,
  );

  const valorColX = resolveExtratoValorColBoundsFromColumns(suggested.columns, imgWidth);
  const scoped = items.filter((it) => {
    const cy = it.y + it.h / 2;
    return cy >= suggested.faixaStart && cy <= suggested.faixaEnd;
  });

  const segmentos = segmentarExtratoEmLancamentos(scoped, imgWidth, {
    yTolFactor: 0.36,
    valorColX,
  });
  const audit = auditarCoberturaValoresExtrato(scoped, segmentos, imgWidth, valorColX);
  const validacao = validarMapeamentoExtratoOcr({
    columns: suggested.columns,
    imgWidth,
    imgHeight,
    items: scoped,
    faixa: { startY: suggested.faixaStart, endY: suggested.faixaEnd },
    faixaInicioMarcado: true,
    faixaFimMarcado: true,
  });

  const rows = extractGenericRowsFromMapping(items, mapping, imgHeight, imgWidth, {
    dataColIds: ['data', 'descricao', 'valorCredito', 'valorDebito', 'valorMisto'],
    headerKeywords: ['saldo anterior', 'data', 'lançamento', 'crédito', 'débito'],
    extratoPositional: true,
    statementYear: '2026',
    strictFaixaVertical: true,
  });

  const comValor = rows.filter((r) => rowValor(r).val > 0);
  totalSegmentos += segmentos.length;
  totalValoresAudit += audit.valoresDetectados;
  if (audit.ok) auditOkPages++;

  console.log(`  Colunas sugeridas: ${suggested.columns.filter((c) => c.start !== c.end).map((c) => c.id).join(', ')}`);
  console.log(`  Faixa Y: ${Math.round(suggested.faixaStart)} – ${Math.round(suggested.faixaEnd)}`);
  console.log(`  Segmentos: ${segmentos.length} | Valores na coluna: ${audit.valoresDetectados} | Auditoria: ${audit.ok ? 'OK' : 'FALHOU'}`);
  if (!audit.ok) console.log(`    → ${audit.mensagem}`);
  console.log(`  Validação mapeamento: ${validacao.ok ? 'OK' : 'FALHOU'}`);
  if (!validacao.ok) {
    for (const c of validacao.checks.filter((x) => !x.ok)) {
      console.log(`    [${c.nivel}] ${c.mensagem}`);
    }
  }
  console.log(`  Linhas extraídas: ${rows.length} (${comValor.length} com valor)`);

  allRows.push(...rows.map((r) => ({ ...r, _pagina: p })));
}

console.log('\n========== RESUMO ==========');
console.log(`Total linhas importáveis: ${allRows.length}`);
console.log(`Com valor: ${allRows.filter((r) => rowValor(r).val > 0).length}`);
console.log(`Segmentos (todas páginas): ${totalSegmentos}`);
console.log(`Valores auditados: ${totalValoresAudit}`);

console.log('\n--- Amostra (até 15 lançamentos) ---');
for (const r of allRows.filter((r) => rowValor(r).val > 0).slice(0, 15)) {
  const v = rowValor(r);
  const desc = (r.descricao ?? '').replace(/\s+/g, ' ').slice(0, 55);
  console.log(
    `  p${r._pagina} | ${r.data ?? '—'} | ${desc || '—'} | ${v.val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ${v.nature}`,
  );
}

if (allRows.length === 0) {
  console.log('\nNenhuma linha extraída. Possíveis causas: PDF escaneado (sem texto nativo) ou layout não reconhecido.');
  process.exit(2);
}
