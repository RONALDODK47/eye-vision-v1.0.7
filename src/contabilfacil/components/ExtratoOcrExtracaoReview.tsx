import { useMemo, useState } from 'react';
import { ArrowLeft, Check, FileText, Loader2, Sparkles, X } from 'lucide-react';
import type { GenericOcrRow } from '../../lib/parcelamentoColunasExtract';
import type { OcrConfirmMeta } from '../../lib/aiExtratoExtractClient';
import { formatExtratoValorAssinadoPt } from '../../extratoVision/utils/extratoMoneyParse';
import { resolveExtratoValorNatureza } from '../logic/ocrImportMapper';
import { resolveExtratoDescricaoText } from '../../lib/ocrExtratoPositional';
import { cn } from '../lib/utils';
import {
  buildExtratoReviewIssueRows,
  formatExtratoReviewIssueKind,
  type ExtratoReviewIssueKind,
  type ExtratoReviewIssueRow,
} from '../logic/extratoReviewIssues';
import { runExtratoGeminiAudit } from '../../lib/extratoGeminiAudit';
import type { ExtratoGeminiAuditResult } from '../../lib/geminiMonitorClient';
import { GeminiAuditReportPanel } from './GeminiAuditReportPanel';
import './ExtratoOcrExtracaoReview.css';

export type ExtratoOcrExtracaoReviewProps = {
  fileName: string;
  rows: GenericOcrRow[];
  meta?: OcrConfirmMeta;
  skippedPages?: number[];
  isExtracting?: boolean;
  extractProgress?: {
    message: string;
    page: number;
    total: number;
    rows: number;
    log?: string[];
  } | null;
  hideMotorSteps?: boolean;
  literalStageColumns?: string[];
  companyName?: string;
  onConfirm: () => void;
  onBack: () => void;
  onCancel: () => void;
};

const ISSUE_BADGE: Record<ExtratoReviewIssueKind, string> = {
  invertido: 'border-red-300 bg-red-50 text-red-900',
  sem_historico: 'border-amber-300 bg-amber-50 text-amber-900',
  sem_valor: 'border-orange-300 bg-orange-50 text-orange-900',
  pagina_sem_ocr: 'border-violet-300 bg-violet-50 text-violet-900',
  faltante: 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-950',
  conciliacao: 'border-amber-400 bg-amber-100 text-amber-950',
};

function extratoRowDebitoCredito(row: GenericOcrRow): { debito: string; credito: string } {
  const { value, nature } = resolveExtratoValorNatureza(row);
  if (value <= 0.0001) return { debito: '', credito: '' };
  const fmt = value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return nature === 'D' ? { debito: fmt, credito: '' } : { debito: '', credito: fmt };
}

export function ExtratoOcrExtracaoReview({
  fileName,
  rows,
  meta,
  skippedPages = [],
  isExtracting = false,
  extractProgress = null,
  hideMotorSteps = false,
  literalStageColumns = [],
  companyName = '',
  onConfirm,
  onBack,
  onCancel,
}: ExtratoOcrExtracaoReviewProps) {
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const [aiAuditing, setAiAuditing] = useState(false);
  const [aiAuditResult, setAiAuditResult] = useState<ExtratoGeminiAuditResult | null>(null);
  const [aiAuditError, setAiAuditError] = useState<string | null>(null);

  const motorSteps = useMemo(
    () => [
      { id: 1, label: 'Coluna de Data', pattern: /(motor\s*1|coluna\s+data|normalizando\s+datas?)/i },
      { id: 2, label: 'Coluna de Histórico', pattern: /(motor\s*2|coluna\s+hist[oó]rico|descri[cç][aã]o)/i },
      { id: 3, label: 'Coluna de Valor', pattern: /(motor\s*3|coluna\s+valor|valores?\s+monet[aá]rios?)/i },
      { id: 4, label: 'Sinal D\/C', pattern: /(motor\s*4|sinal|natureza|d[\/\\-]?c|d[eé]bito|cr[eé]dito)/i },
      { id: 5, label: 'Comparação final', pattern: /(motor\s*5|compara[cç][aã]o|linha\s+a\s+linha|conferindo)/i },
    ],
    [],
  );

  const literalSteps = useMemo(() => {
    const cols = Array.from(
      new Set(
        literalStageColumns
          .map((c) => String(c || '').trim())
          .filter(Boolean),
      ),
    );
    const base = [
      {
        id: 'crop',
        label: 'Recorte da tabela',
        pattern:
          /(recorte das colunas|tabela de recortes|recorte pronto na tabela|criando tabela de recortes)/i,
      },
      ...cols.map((col) => ({
        id: `ocr-${col}`,
        label: `OCR coluna ${col}`,
        pattern: new RegExp(`OCR\\s+coluna\\s+${escapeRegExp(col)}\\b`, 'i'),
      })),
      ...cols.map((col) => ({
        id: `check-${col}`,
        label: `Conferência coluna ${col}`,
        pattern: new RegExp(`confer[eê]ncia\\s+coluna\\s+${escapeRegExp(col)}\\b`, 'i'),
      })),
      {
        id: 'finish',
        label: 'Fechamento',
        pattern: /(finalizando|colado na tabela|colagem conclu[ií]da|revis[aã]o da colagem)/i,
      },
    ];
    return base.length > 0 ? base : motorSteps;
  }, [literalStageColumns, motorSteps]);

  const progressSteps = hideMotorSteps ? literalSteps : motorSteps;

  const motorStageIndex = useMemo(() => {
    const history = [extractProgress?.message ?? '', ...(extractProgress?.log ?? [])].join(' \n ');
    if (!history.trim()) return isExtracting ? 1 : progressSteps.length;
    for (let i = progressSteps.length - 1; i >= 0; i -= 1) {
      if (progressSteps[i]!.pattern.test(history)) return i + 1;
    }
    return isExtracting ? 1 : progressSteps.length;
  }, [extractProgress?.log, extractProgress?.message, isExtracting, progressSteps]);

  const quality = meta?.extractDiagnostic?.quality;
  const issueRows = useMemo(
    () =>
      buildExtratoReviewIssueRows({
        rows,
        skippedPages,
        quality,
        ocrTextBlob: meta?.ocrTextBlob,
        conciliacaoRawRows: meta?.conciliacaoRawRows,
      }),
    [rows, skippedPages, quality, meta?.ocrTextBlob, meta?.conciliacaoRawRows],
  );

  const issueByRowKey = useMemo(() => {
    const map = new Map<string, ExtratoReviewIssueRow>();
    for (const item of issueRows) {
      if (item.key.startsWith('row-')) map.set(item.key, item);
    }
    return map;
  }, [issueRows]);

  const flaggedLancamentos = issueRows.filter(
    (r) => r.key.startsWith('row-') && !r.kinds.every((k) => k === 'conciliacao'),
  ).length;
  const okCount = Math.max(0, rows.length - flaggedLancamentos);

  const progressPct =
    extractProgress && extractProgress.total > 0
      ? Math.min(
          100,
          Math.round(
            (Math.min(extractProgress.page, extractProgress.total) / extractProgress.total) * 100,
          ),
        )
      : isExtracting
        ? 8
        : 100;

  const progressPage =
    extractProgress && extractProgress.total > 0
      ? Math.min(extractProgress.page, extractProgress.total)
      : 0;

  const progressBarCss = useMemo(
    () => `.extrato-review-progress-fill { width: ${progressPct}%; }`,
    [progressPct],
  );

  const handleConciliarComIa = async () => {
    if (rows.length === 0 || aiAuditing) return;
    setAiAuditing(true);
    setAiAuditError(null);
    try {
      const items = rows.map((row) => {
        const { value, nature } = resolveExtratoValorNatureza(row);
        return {
          date: String(row.data ?? ''),
          description: resolveExtratoDescricaoText(row),
          value,
          nature,
        };
      });
      const result = await runExtratoGeminiAudit({
        items,
        skipped: [],
        saldoAnterior: meta?.saldoAnterior ?? undefined,
        company: companyName,
        fileName,
      });
      setAiAuditResult(result);
      if (!result.ok) {
        setAiAuditError(
          result.reason || result.detail || result.summary || 'A IA não conseguiu conciliar este extrato. Verifique a chave API.',
        );
      }
    } catch (err) {
      setAiAuditError(err instanceof Error ? err.message : 'Falha ao conciliar com IA.');
      setAiAuditResult(null);
    } finally {
      setAiAuditing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-brand-bg text-brand-text">
      <header className="flex items-center justify-between gap-4 px-4 py-3 border-b border-brand-border bg-white shrink-0">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-50">
            {isExtracting ? 'OCR · Colando na tabela' : 'OCR · Revisão da colagem'}
          </p>
          <h2 className="text-sm font-black uppercase tracking-tight truncate flex items-center gap-2">
            {isExtracting ? (
              <Loader2 className="w-4 h-4 shrink-0 animate-spin text-orange-700" />
            ) : (
              <FileText className="w-4 h-4 shrink-0" />
            )}
            {isExtracting
              ? `${rows.length} linha(s) colada(s)…`
              : flaggedLancamentos === 0
                ? `${rows.length} linha(s) — sem pendências`
                : `${flaggedLancamentos} pendência(s) · ${rows.length} linha(s)`}
          </h2>
          <p className="text-[10px] font-mono opacity-60 truncate max-w-xl" title={fileName}>
            {fileName}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="technical-button p-1.5 shrink-0"
          aria-label="Cancelar"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {isExtracting ? (
        <div className="shrink-0 px-4 py-2 border-b border-brand-border bg-orange-50/80 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
            <span className="truncate">{extractProgress?.message ?? 'Processando…'}</span>
            <span className="font-mono shrink-0 flex items-center gap-2">
              {extractProgress && extractProgress.rows > 0 ? (
                <span>{extractProgress.rows} lanç.</span>
              ) : null}
              {extractProgress && extractProgress.total > 0 ? (
                <span>
                  Pág. {progressPage}/{extractProgress.total}
                </span>
              ) : null}
            </span>
          </div>
          <div className="h-1.5 bg-white border border-brand-border/40 overflow-hidden">
            {progressBarCss ? <style>{progressBarCss}</style> : null}
            <div className="extrato-review-progress-fill" />
          </div>
          <div className="pt-0.5 overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              {progressSteps.map((motor, idx) => {
                const stepNumber = idx + 1;
                const done = stepNumber < motorStageIndex;
                const active = stepNumber === motorStageIndex;
                return (
                  <div
                    key={motor.id}
                    className={cn(
                      'border px-2 py-1 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap',
                      done
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                        : active
                          ? 'border-orange-400 bg-orange-100 text-orange-900 animate-pulse'
                          : 'border-brand-border/30 bg-white/70 text-brand-text/60',
                    )}
                  >
                    {hideMotorSteps ? `Etapa ${stepNumber}` : `Motor ${stepNumber}`}: {motor.label}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div className="shrink-0 px-4 py-2 border-b border-brand-border bg-brand-sidebar/20 flex flex-wrap gap-2 text-[9px] font-bold uppercase tracking-wide">
        <span className="px-2 py-0.5 border border-brand-border bg-white">
          OK: {Math.max(0, okCount)}
        </span>
        {!isExtracting ? (
          <span className="px-2 py-0.5 border border-amber-300 bg-amber-50 text-amber-900">
            Revisar: {flaggedLancamentos}
          </span>
        ) : (
          <span className="px-2 py-0.5 border border-orange-300 bg-orange-50 text-orange-900 animate-pulse">
            Ao vivo
          </span>
        )}
        {meta?.saldoAnterior != null ? (
          <span className="px-2 py-0.5 border border-brand-border bg-white font-mono normal-case">
            SA: {formatExtratoValorAssinadoPt(meta.saldoAnterior, 'C')}
          </span>
        ) : null}
        {meta?.saldoFinalEsperado != null ? (
          <span className="px-2 py-0.5 border border-brand-border bg-white font-mono normal-case">
            SF: {formatExtratoValorAssinadoPt(meta.saldoFinalEsperado, 'C')}
          </span>
        ) : null}
      </div>

      <main className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
        {rows.length === 0 && isExtracting ? (
          <p className="text-center text-[11px] font-bold uppercase tracking-wide text-orange-800 py-8 border border-orange-200 bg-orange-50/50">
            Aguardando primeiros lançamentos do OCR…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-center text-[11px] font-bold uppercase tracking-wide text-slate-500 py-12">
            Nenhum recorte do PDF apareceu na tabela.
          </p>
        ) : (
          <div className="border border-brand-border bg-white overflow-x-auto">
            <table className="w-full text-[10px] border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-brand-sidebar/50 border-b border-brand-border text-[8px] font-black uppercase tracking-widest text-brand-text/60">
                  <th className="px-2 py-1.5 text-left w-8">#</th>
                  <th className="px-2 py-1.5 text-left w-10">Pág</th>
                  <th className="px-2 py-1.5 text-left w-20">Data</th>
                  <th className="px-2 py-1.5 text-left min-w-[160px]">Histórico</th>
                  <th className="px-2 py-1.5 text-right w-24">Débito</th>
                  <th className="px-2 py-1.5 text-right w-24">Crédito</th>
                  <th className="px-2 py-1.5 text-left w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const issue = issueByRowKey.get(`row-${index}`);
                  const descricao = resolveExtratoDescricaoText(row).trim() || '—';
                  const data = row.data?.trim() || '—';
                  const pagina = parseInt(
                    String(row._pagina ?? row._extratoPagina ?? ''),
                    10,
                  );
                  const { debito, credito } = extratoRowDebitoCredito(row);
                  const hasIssue = issue && issue.kinds.length > 0;

                  return (
                    <tr
                      key={`${index}-${data}-${debito}-${credito}-${descricao.slice(0, 12)}`}
                      className={cn(
                        'border-b border-brand-border/40 align-top transition-colors',
                        hasIssue ? 'bg-amber-50/40' : 'hover:bg-brand-sidebar/15',
                        isExtracting && index === rows.length - 1 ? 'bg-orange-50/30' : '',
                      )}
                    >
                      <td className="px-2 py-1 font-mono text-brand-text/50">{index + 1}</td>
                      <td className="px-2 py-1 font-mono">
                        {Number.isFinite(pagina) && pagina > 0 ? pagina : '—'}
                      </td>
                      <td className="px-2 py-1 font-mono whitespace-nowrap">{data}</td>
                      <td className="px-2 py-1 font-bold whitespace-pre-wrap break-words max-w-[280px] leading-snug">
                        {descricao}
                      </td>
                      <td className="px-2 py-1 font-mono font-bold text-right text-red-800 whitespace-nowrap">
                        {debito || '—'}
                      </td>
                      <td className="px-2 py-1 font-mono font-bold text-right text-emerald-800 whitespace-nowrap">
                        {credito || '—'}
                      </td>
                      <td className="px-2 py-1">
                        {hasIssue ? (
                          <div className="flex flex-wrap gap-0.5">
                            {issue!.kinds.map((k) => (
                              <span
                                key={k}
                                className={cn(
                                  'inline-block px-1 py-0.5 border text-[7px] font-black uppercase',
                                  ISSUE_BADGE[k],
                                )}
                                title={issue!.detalhe}
                              >
                                {formatExtratoReviewIssueKind(k)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[8px] font-bold text-emerald-700 uppercase">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {(aiAuditing || aiAuditResult || aiAuditError) && (
          <div className="mt-4 space-y-2">
            {aiAuditError ? (
              <div className="border border-rose-300 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-900">
                {aiAuditError}
              </div>
            ) : null}
            <GeminiAuditReportPanel
              title="Conciliação com IA"
              loading={aiAuditing}
              loadingMessage="Conciliando lançamentos com a IA configurada…"
              result={aiAuditResult}
              emptyMessage="Clique em Conciliar com IA para auditar saldos e inconsistências."
              showSaldoStatus
              saldoCoerente={aiAuditResult?.saldoCoerente}
            />
          </div>
        )}
      </main>

      <footer className="shrink-0 border-t border-brand-border bg-brand-sidebar/30 px-4 py-2 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isExtracting || aiAuditing}
          className="technical-button-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] w-auto disabled:opacity-40"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar ao mapeamento
        </button>
        <button
          type="button"
          disabled={rows.length === 0 || isExtracting || aiAuditing}
          onClick={() => void handleConciliarComIa()}
          className="technical-button inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] w-auto disabled:opacity-40"
          title="Audita saldos, sinais e inconsistências com a IA configurada"
        >
          {aiAuditing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {aiAuditing ? 'Conciliando com IA…' : 'Conciliar com IA'}
        </button>
        <button
          type="button"
          disabled={rows.length === 0 || isExtracting}
          onClick={onConfirm}
          className="technical-button-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] w-auto disabled:opacity-40"
        >
          {isExtracting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          {isExtracting ? 'Extraindo…' : `Confirmar (${rows.length})`}
        </button>
      </footer>
    </div>
  );
}

/** Marca linhas OCR com número da página de origem. */
export function tagOcrRowsPagina(rows: GenericOcrRow[], pagina: number): GenericOcrRow[] {
  const p = String(Math.max(1, pagina));
  return rows.map((r) => ({ ...r, _pagina: r._pagina ?? p }));
}
