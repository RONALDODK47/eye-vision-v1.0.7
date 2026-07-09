import { useCallback, useState } from 'react';
import { Sparkles, Copy, Check, MapPin, Wrench, FileCode, ListOrdered } from 'lucide-react';
import { cn } from '../lib/utils';
import type { GeminiAuditIssue, GeminiAuditResultBase } from '../../lib/geminiMonitorClient';
import {
  formatGeminiAuditReportText,
  SEVERITY_LABEL,
  TIPO_CORRECAO_LABEL,
} from '../../lib/geminiAuditReport';

interface GeminiAuditReportPanelProps {
  title?: string;
  loading?: boolean;
  loadingMessage?: string;
  result: GeminiAuditResultBase | null;
  emptyMessage?: string;
  showSaldoStatus?: boolean;
  saldoCoerente?: boolean | null;
  className?: string;
}

function IssueCard({ issue }: { issue: GeminiAuditIssue }) {
  return (
    <div
      className={cn(
        'border p-3 text-[9px] space-y-2',
        issue.severity === 'error'
          ? 'border-red-300 bg-red-50/50'
          : issue.severity === 'warning'
            ? 'border-amber-300 bg-amber-50/40'
            : 'border-slate-200 bg-white/60',
      )}
    >
      <div className="flex flex-wrap gap-2 items-center">
        <span
          className={cn(
            'text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 border',
            issue.severity === 'error'
              ? 'text-red-800 bg-red-50 border-red-200'
              : issue.severity === 'warning'
                ? 'text-amber-900 bg-amber-50 border-amber-200'
                : 'text-slate-700 bg-slate-50 border-slate-200',
          )}
        >
          {SEVERITY_LABEL[issue.severity] ?? issue.severity}
        </span>
        {issue.tipoCorrecao ? (
          <span className="text-[8px] font-bold uppercase tracking-wide text-violet-800">
            {TIPO_CORRECAO_LABEL[issue.tipoCorrecao] ?? issue.tipoCorrecao}
          </span>
        ) : null}
      </div>

      <p className="font-black uppercase tracking-wide text-[10px]">{issue.title}</p>
      {issue.detail ? <p className="text-brand-text/85 leading-relaxed">{issue.detail}</p> : null}

      {issue.onde ? (
        <div className="flex gap-1.5 items-start text-brand-text/75">
          <MapPin size={11} className="shrink-0 mt-0.5 text-violet-700" />
          <div>
            <span className="font-bold uppercase tracking-wide text-[8px] text-violet-900">Onde </span>
            <span>{issue.onde}</span>
          </div>
        </div>
      ) : null}

      {issue.moduloOuArquivo ? (
        <div className="flex gap-1.5 items-start text-brand-text/75 font-mono">
          <FileCode size={11} className="shrink-0 mt-0.5 text-slate-600" />
          <div>
            <span className="font-bold uppercase tracking-wide text-[8px] text-slate-600 not-italic font-sans">
              Módulo{' '}
            </span>
            <span>{issue.moduloOuArquivo}</span>
          </div>
        </div>
      ) : null}

      {issue.comoCorrigir ? (
        <div className="flex gap-1.5 items-start border-t border-black/5 pt-2 text-brand-text/90">
          <Wrench size={11} className="shrink-0 mt-0.5 text-emerald-700" />
          <div>
            <span className="font-bold uppercase tracking-wide text-[8px] text-emerald-900">Como corrigir </span>
            <span>{issue.comoCorrigir}</span>
          </div>
        </div>
      ) : null}

      {issue.passos && issue.passos.length > 0 ? (
        <div className="border-t border-black/5 pt-2">
          <div className="flex items-center gap-1 mb-1 text-[8px] font-bold uppercase tracking-wide text-slate-600">
            <ListOrdered size={11} />
            Passos
          </div>
          <ol className="list-decimal list-inside space-y-0.5 text-brand-text/80">
            {issue.passos.map((passo, i) => (
              <li key={`${issue.title}-passo-${i}`}>{passo}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export function GeminiAuditReportPanel({
  title = 'Relatório IA — inconsistências',
  loading = false,
  loadingMessage = 'Analisando…',
  result,
  emptyMessage = 'Aguardando análise da IA.',
  showSaldoStatus = false,
  saldoCoerente,
  className,
}: GeminiAuditReportPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(formatGeminiAuditReportText(result));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponível */
    }
  }, [result]);

  const hasContent = Boolean(result?.ok && (result.relatorio || result.summary || result.issues?.length));

  return (
    <div className={cn('border border-violet-300/60 bg-violet-50/30 p-4', className)}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-violet-700" />
          <span className="text-[10px] font-black uppercase tracking-widest text-violet-900">{title}</span>
        </div>
        {hasContent ? (
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="technical-button inline-flex items-center gap-1 px-2 py-1 text-[8px] font-bold uppercase tracking-widest"
            title="Copiar relatório completo"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            Copiar relatório
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-[10px] font-mono text-violet-800 animate-pulse">{loadingMessage}</p>
      ) : result?.ok ? (
        <div className="space-y-3">
          {result.relatorio ? (
            <div className="border border-violet-200/80 bg-white/70 p-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-violet-900 mb-1">
                Relatório geral
              </p>
              <p className="text-[10px] text-brand-text/90 leading-relaxed whitespace-pre-wrap">{result.relatorio}</p>
            </div>
          ) : result.summary ? (
            <p className="text-[10px] text-brand-text/90 leading-relaxed">{result.summary}</p>
          ) : null}

          {showSaldoStatus && saldoCoerente === false ? (
            <p className="text-[9px] font-bold uppercase tracking-wide text-red-800 border border-red-200 bg-red-50 px-2 py-1">
              Saldo final incoerente — confira totais C/D e saldo anterior
            </p>
          ) : null}

          {result.acoesRecomendadas && result.acoesRecomendadas.length > 0 ? (
            <div className="border border-emerald-200/80 bg-emerald-50/40 p-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-emerald-900 mb-2">
                Ações recomendadas
              </p>
              <ol className="list-decimal list-inside space-y-1 text-[9px] text-brand-text/85">
                {result.acoesRecomendadas.map((acao, i) => (
                  <li key={`acao-${i}`}>{acao}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {(result.issues ?? []).length > 0 ? (
            <div className="space-y-2">
              <p className="text-[8px] font-black uppercase tracking-widest text-brand-text/60">
                Problemas ({result.issues!.length})
              </p>
              {result.issues!.map((issue, idx) => (
                <IssueCard key={`issue-${idx}-${issue.title}`} issue={issue} />
              ))}
            </div>
          ) : (
            <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-800">
              Nenhum problema crítico detectado
            </p>
          )}

          {result.diagnosticoTecnico ? (
            <div className="border-t border-violet-200/60 pt-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-brand-text/50 mb-1">
                Diagnóstico técnico (pipeline OCR)
              </p>
              <p className="text-[9px] font-mono text-brand-text/65 whitespace-pre-wrap leading-relaxed">
                {result.diagnosticoTecnico}
              </p>
            </div>
          ) : null}
        </div>
      ) : result && !result.ok ? (
        <div className="text-[10px] text-amber-900 space-y-1">
          <p className="font-bold uppercase tracking-wide">IA indisponível</p>
          <p>{result.detail ?? result.reason ?? 'Reinicie npm run dev e confira GEMINI_API_KEY no .env'}</p>
          <p className="text-[9px] opacity-80">
            Modelos usados (free tier): gemini-2.5-flash, gemini-2.5-flash-lite, gemini-flash-latest…
          </p>
        </div>
      ) : (
        <p className="text-[10px] text-brand-text/60">{emptyMessage}</p>
      )}
    </div>
  );
}
