import {
  auditExtratoImportWithGemini,
  type ExtratoGeminiAuditPayload,
  type ExtratoGeminiAuditResult,
} from './geminiMonitorClient';
import {
  filterExtratoImportLogEntradasVisiveis,
  summarizeExtratoImportLog,
  type ImportSkippedEntry,
} from '../contabilfacil/logic/ocrImportMapper';

export interface ExtratoImportItemForAudit {
  date?: string;
  description?: string;
  value?: number;
  nature?: 'D' | 'C';
}

export function buildExtratoGeminiAuditPayload(params: {
  items: ExtratoImportItemForAudit[];
  skipped: ImportSkippedEntry[];
  saldoAnterior?: number;
  company?: string;
  fileName?: string;
}): ExtratoGeminiAuditPayload {
  const visibleSkipped = filterExtratoImportLogEntradasVisiveis(params.skipped);
  const logSummary = summarizeExtratoImportLog(visibleSkipped);

  let creditosTotal = 0;
  let debitosTotal = 0;
  for (const item of params.items) {
    const val = Math.abs(Number(item.value) || 0);
    if (item.nature === 'C') creditosTotal += val;
    else if (item.nature === 'D') debitosTotal += val;
  }

  const saldoAnterior = params.saldoAnterior ?? 0;
  const saldoFinal = saldoAnterior + creditosTotal - debitosTotal;

  const sampleLancamentos = params.items.slice(0, 12).map((item) => ({
    date: String(item.date ?? ''),
    description: String(item.description ?? '').slice(0, 120),
    value: Math.abs(Number(item.value) || 0),
    nature: (item.nature === 'C' ? 'C' : 'D') as 'D' | 'C',
  }));

  return {
    company: params.company,
    fileName: params.fileName,
    importSummary: {
      lancamentosCount: params.items.length,
      creditosTotal: Math.round(creditosTotal * 100) / 100,
      debitosTotal: Math.round(debitosTotal * 100) / 100,
      saldoAnterior: params.saldoAnterior,
      saldoFinal: Math.round(saldoFinal * 100) / 100,
      skippedCount: logSummary.total,
      warningsCount: logSummary.warnings,
      errorsCount: logSummary.errors,
    },
    skippedLog: visibleSkipped.slice(0, 40).map((e) => ({
      line: e.line,
      category: e.category,
      reason: e.reason,
      detail: e.detail,
      preview: e.preview,
      severity: e.severity,
    })),
    sampleLancamentos,
  };
}

export async function runExtratoGeminiAudit(params: {
  items: ExtratoImportItemForAudit[];
  skipped: ImportSkippedEntry[];
  saldoAnterior?: number;
  company?: string;
  fileName?: string;
  signal?: AbortSignal;
}): Promise<ExtratoGeminiAuditResult> {
  const payload = buildExtratoGeminiAuditPayload(params);
  return auditExtratoImportWithGemini(payload, params.signal);
}
