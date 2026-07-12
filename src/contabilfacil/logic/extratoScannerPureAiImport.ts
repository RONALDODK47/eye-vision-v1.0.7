/**
 * Importação de extrato scanner/imagem — IA pura, sem interface de colunas/OCR.
 */
import { extractStatementYear } from '../../extratoVision/utils/parser';
import {
  extractExtratoWithAi,
  marcarRowsExtracaoAi,
  previewUrlToBase64,
  type AiExtractExtratoResult,
  type OcrConfirmMeta,
} from '../../lib/aiExtratoExtractClient';
import {
  loadDocumentoParcelamentoPreview,
  renderPdfPagePreview,
  type GenericOcrRow,
} from '../../lib/parcelamentoColunasExtract';
import {
  parseOcrIgnoreLineWords,
  prepararExtratoOcrRowsParaRevisao,
  resolverSaldoAnteriorParaMetaExtrato,
} from '../../lib/ocrExtratoPositional';
import { getOcrUserSettings } from '../../lib/ocrUserSettings';
import { fetchAiConfig } from '../ai/aiSettingsClient';
import { EXTRATO_SCANNER_PURE_AI_BUILD_ID, logExtratoExtractBuild } from './extratoExtractBuild';

const MAX_PAGES_FOR_AI = 6;

function formatAiExtractError(result: AiExtractExtratoResult): string {
  if (result.detail?.trim()) return result.detail;
  if (result.reason === 'parse_error') {
    return 'A IA extraiu dados mas o JSON veio incompleto — tente de novo.';
  }
  if (result.reason?.includes('not_configured')) {
    return 'Configure provedor e chave API em Contábil → IA.';
  }
  if (result.reason === 'empty_extraction') {
    return 'A IA não encontrou lançamentos neste documento.';
  }
  if (result.reason === 'network_error') {
    return result.detail ?? 'Falha de rede ao chamar a IA — reinicie npm run dev e tente de novo.';
  }
  return 'A IA não extraiu lançamentos. Verifique o arquivo e a configuração de IA.';
}

export type ExtratoScannerPureAiImportResult = {
  rows: GenericOcrRow[];
  meta: OcrConfirmMeta;
};

export async function importExtratoScannerPureAi(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<ExtratoScannerPureAiImportResult> {
  logExtratoExtractBuild('scanner-ia-direto');
  onProgress?.(`IA pura (${EXTRATO_SCANNER_PURE_AI_BUILD_ID}) — preparando documento…`);

  const doc = await loadDocumentoParcelamentoPreview(
    file,
    onProgress,
    { deferOcr: true, adaptiveExtratoScale: true },
  );

  const pdfRenderScale = doc.pdfRenderScale ?? doc.pdfSuggestedScaleFhd ?? 2;
  const totalPages = doc.totalPages ?? 1;
  const maxPages = Math.min(totalPages, MAX_PAGES_FOR_AI);
  const images: NonNullable<Awaited<ReturnType<typeof previewUrlToBase64>>>[] = [];

  for (let p = 1; p <= maxPages; p++) {
    onProgress?.(`Preparando página ${p} de ${maxPages} para IA…`);
    let pageUrl = p === 1 ? doc.previewUrl : null;

    if (doc.pdfDoc) {
      const preview = await renderPdfPagePreview(doc.pdfDoc, p, onProgress, {
        pdfRenderScale,
        deferOcr: true,
        useCache: true,
      });
      pageUrl = preview.previewUrl ?? pageUrl;
    }

    if (pageUrl) {
      const img = await previewUrlToBase64(pageUrl, 2400);
      if (img) images.push(img);
    }
  }

  if (images.length === 0) {
    throw new Error('Não foi possível preparar a imagem para a IA. Tente outro arquivo.');
  }

  onProgress?.(
    images.length > 1
      ? `Extraindo com IA (${images.length} páginas)…`
      : 'Extraindo lançamentos com IA (visão)…',
  );

  const stmtYear =
    extractStatementYear(doc.ocrFullText || doc.items.map((i) => i.str).join(' ')) ||
    String(new Date().getFullYear());

  const ignoreLineWords = parseOcrIgnoreLineWords(getOcrUserSettings().ignoreLineWords);
  const aiCfg = await fetchAiConfig();
  const aiResult = await extractExtratoWithAi({
    images,
    statementYear: stmtYear,
    fileName: file.name,
    providerId: aiCfg?.config?.providerId,
    model: aiCfg?.config?.model,
    perPage: images.length > 4,
  });

  if (!aiResult.ok || !aiResult.rows?.length) {
    throw new Error(formatAiExtractError(aiResult));
  }

  const rowsPosProcessados = prepararExtratoOcrRowsParaRevisao(marcarRowsExtracaoAi(aiResult.rows), {
    statementYear: stmtYear,
    ignoreLineWords,
    preserveSegmentRows: true,
  });

  const saldoAnterior = resolverSaldoAnteriorParaMetaExtrato({ rows: rowsPosProcessados, ocrText: '' });

  onProgress?.(`${rowsPosProcessados.length} lançamento(s) extraído(s) — importando…`);

  return {
    rows: rowsPosProcessados,
    meta: { saldoAnterior },
  };
}
