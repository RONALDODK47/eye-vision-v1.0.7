import { CalendarDays } from 'lucide-react';
import type { LoanContract, LoanAccountFields } from '../types';
import { CF_FIELD_COL, CF_FIELD_ROW, CF_FORM_INPUT_LONG, CF_FORM_INPUT_MED, CF_FORM_INPUT_SHORT, CF_SELECT_WIDE } from '../lib/formFieldClasses';
import { LoanAccountsSection } from './LoanAccountsSection';

export interface LoanContasTabProps {
  selectedCompany: string;
  contracts: LoanContract[];
  selectedId: string;
  onSelectContract: (id: string) => void;
  accountFields: LoanAccountFields | null;
  dominioCodigoHistorico?: string;
  dominioComplementoHistorico?: string;
  dataGerarLancamentosAPartir?: string;
  onPatch: (patch: Partial<LoanAccountFields & {
    dominioCodigoHistoricoStr: string;
    dominioComplementoHistoricoStr: string;
    dataGerarLancamentosAPartirStr: string;
  }>) => void;
}

export default function LoanContasTab({
  selectedCompany,
  contracts,
  selectedId,
  onSelectContract,
  accountFields,
  dominioCodigoHistorico = '',
  dominioComplementoHistorico = '',
  dataGerarLancamentosAPartir = '',
  onPatch,
}: LoanContasTabProps) {
  const selected = contracts.find((c) => c.id === selectedId) ?? null;

  if (contracts.length === 0) {
    return (
      <div className="technical-panel p-12 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Cadastre um contrato para configurar as contas do TXT+ Domínio.
      </div>
    );
  }

  if (!selected || !accountFields) {
    return (
      <div className="technical-panel p-12 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Selecione um contrato para configurar as contas.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="technical-panel p-4 shadow-[4px_4px_0_0_#141414] flex flex-col sm:flex-row sm:items-end gap-3">
        {contracts.length > 1 ? (
          <div className="sm:w-56 shrink-0">
            <label className="text-[9px] font-bold uppercase opacity-60 mb-1 block">Contrato</label>
            <select
              aria-label="Selecionar contrato"
              value={selectedId}
              onChange={(e) => onSelectContract(e.target.value)}
              className="w-full border border-brand-border bg-brand-bg px-3 py-2 text-xs font-mono font-bold"
            >
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contractNumber || 'SEM Nº'}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="text-[9px] font-bold uppercase opacity-60 mb-1 block">Contrato</label>
            <p className="text-xs font-mono font-bold uppercase">{selected.contractNumber || '—'}</p>
          </div>
        )}
        <div className="sm:ml-auto flex flex-col items-end gap-1">
          <p className="text-[9px] font-mono opacity-50">
            Contas salvas automaticamente ao editar
          </p>
        </div>
      </div>

      <div className={`${CF_FIELD_ROW} border border-brand-border bg-brand-sidebar/5 p-4 technical-panel shadow-[2px_2px_0_0_#141414]`}>
        <div className={CF_FIELD_COL}>
          <label className="text-[9px] font-bold uppercase opacity-60 mb-1 block">Cód. histórico Domínio</label>
          <input aria-label="Cód. histórico Domínio"
            type="text"
            value={dominioCodigoHistorico}
            onChange={(e) => onPatch({ dominioCodigoHistoricoStr: e.target.value })}
            className={CF_FORM_INPUT_SHORT}
            placeholder="Opcional"
          />
        </div>
        <div className={CF_FIELD_COL}>
          <label className="text-[9px] font-bold uppercase opacity-60 mb-1 block">Complemento histórico</label>
          <input aria-label="Complemento histórico"
            type="text"
            value={dominioComplementoHistorico}
            onChange={(e) => onPatch({ dominioComplementoHistoricoStr: e.target.value.toUpperCase() })}
            className={CF_FORM_INPUT_LONG}
            placeholder={selected.contractNumber.slice(0, 40)}
          />
        </div>
      </div>

      <div className="technical-panel p-4 shadow-[2px_2px_0_0_#141414] space-y-2 border border-brand-border">
        <label className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 shrink-0" />
          Gerar lançamentos Domínio a partir de
        </label>
        <p className="text-[9px] opacity-50 leading-snug">
          Opcional. Só entram no TXT+ provisão e apropriação de juros e transferência LP→CP (31/12) com{' '}
          <strong>data do lançamento</strong> neste dia ou depois. Contrato, IOF e classificação CPC: se a data do
          contrato for anterior, usam esta data como mínima.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="Data inicial para gerar lançamentos Domínio"
            title="Lançamentos TXT+ a partir desta data (inclusive)"
            className="border border-brand-border bg-brand-bg px-3 py-2 text-xs font-mono font-bold w-auto min-w-[10.5rem]"
            value={dataGerarLancamentosAPartir.slice(0, 10)}
            onChange={(e) => onPatch({ dataGerarLancamentosAPartirStr: e.target.value.slice(0, 10) })}
          />
          {dataGerarLancamentosAPartir.trim() ? (
            <button
              type="button"
              className="text-[9px] font-bold uppercase px-2 py-1.5 border border-brand-border opacity-70 hover:opacity-100"
              onClick={() => onPatch({ dataGerarLancamentosAPartirStr: '' })}
            >
              Limpar data
            </button>
          ) : null}
        </div>
      </div>

      <LoanAccountsSection values={accountFields} onChange={onPatch} />
    </div>
  );
}
