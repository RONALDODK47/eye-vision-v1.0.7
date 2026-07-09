import { execSync } from 'child_process';
import { suggestPlanoContasColumns } from '../src/lib/pdfNativeTextItems.ts';
import { mappingGenericoEmCoordsOcr, extractGenericRowsFromMapping } from '../src/lib/parcelamentoColunasExtract.ts';
import { mapOcrRowsToImportItemsWithPlanoInfer } from '../src/contabilfacil/logic/ocrImportMapper.ts';

const PDF = 'P:\\Plano de Contas A Economica.pdf';
const out = execSync(`python scripts/dump-pdf-page-items.py "${PDF}" 0`, { encoding: 'utf8', maxBuffer: 20e6 });
const data = JSON.parse(out);
const { items, w: refW, h: refH } = data;
const suggested = suggestPlanoContasColumns(items, refW)!;
console.log('columns', suggested.columns.map((c) => ({ id: c.id, start: c.start.toFixed(1), end: c.end.toFixed(1) })));
const mapping = mappingGenericoEmCoordsOcr(
  suggested.columns,
  { startY: suggested.faixaStart, endY: suggested.faixaEnd },
  refW,
  refH,
  refW,
  refH,
);
const rows = extractGenericRowsFromMapping(items, mapping, refH, refW, {
  dataColIds: ['codigoReduzido', 'codigoClassificacao', 'descricao', 'tipo', 'nivel'],
  headerKeywords: ['classifica', 'codigo', 'nome', 'grau'],
  planoPositional: true,
  strictFaixaVertical: true,
});
const { items: imported } = mapOcrRowsToImportItemsWithPlanoInfer('plano', rows);
console.log('rows', rows.length, 'imported', imported.length);
console.log('no tipo', imported.filter((i) => !i.tipo).length);
console.log('samples no tipo', imported.filter((i) => !i.tipo).slice(0, 8));
console.log('bad names', imported.filter((i) => /licenciado|folha|cnpj/i.test(i.name)).slice(0, 5));
