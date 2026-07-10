import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../lib/utils';
import { CF_FIELD_COL, CF_FIELD_ROW, CF_FORM_INPUT_MED } from '../lib/formFieldClasses';
import { FreeNumericInput } from './FreeNumericInput';
import AutomationToggle from './AutomationToggle';
import MandarParaBalanceteButton from './MandarParaBalanceteButton';
import HonorariosContasAutomacaoPanel from './HonorariosContasAutomacaoConfig';
import HonorariosEditarValoresModal from './HonorariosEditarValoresModal';
import type { HonorariosContasAutomacaoConfig } from '../logic/honorariosContasAutomacao';
import {
  loadHonorariosAutomacaoSettings,
  type HonorariosAutomacaoSettings,
} from '../logic/honorariosAutomacaoStorage';
import {
  atualizarValoresHonorariosMeses,
  loadHonorariosLancamentos,
  postHonorariosNoRazao,
  registrarHonorario,
  removerHonorario,
  salvarConfigHonorariosAutomacao,
  sincronizarHonorariosAutomacao,
  tryAutoSyncHonorariosOnOpen,
} from '../logic/honorariosAutomation';
import { flushPersistenceAfterCriticalWrite } from '../logic/eyeVisionPersistenceFlush';
import { mesesRepeticaoAno } from '../logic/honorariosScheduler';
import type { HonorariosLancamento } from '../logic/honorariosToRazao';

type HonorariosInnerTab = 'lancamento' | 'contas';

const INNER_TABS: { id: HonorariosInnerTab; label: string }[] = [
  { id: 'lancamento', label: 'Lançamento' },
  { id: 'contas', label: 'Contas' },
];

const MESES_LABEL = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type Props = {
  selectedCompany: string;
  onRazaoUpdated?: () => void;
};

export default function HonorariosModule({ selectedCompany, onRazaoUpdated }: Props) {
  const [innerTab, setInnerTab] = useState<HonorariosInnerTab>('lancamento');
  const [lancamentos, setLancamentos] = useState<HonorariosLancamento[]>([]);
  const [autoSettings, setAutoSettings] = useState<HonorariosAutomacaoSettings>(() =>
    loadHonorariosAutomacaoSettings(selectedCompany),
  );
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [valor, setValor] = useState(0);
  const [historico, setHistorico] = useState('HONORÁRIOS CONTÁBEIS');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editarOpen, setEditarOpen] = useState(false);

  const reload = useCallback(() => {
    setLancamentos(loadHonorariosLancamentos(selectedCompany));
    setAutoSettings(loadHonorariosAutomacaoSettings(selectedCompany));
  }, [selectedCompany]);

  useEffect(() => {
    reload();
    tryAutoSyncHonorariosOnOpen(selectedCompany);
    reload();
  }, [reload, selectedCompany]);

  useEffect(() => {
    const onUpdate = (ev: Event) => {
      const detail = (ev as CustomEvent<{ company?: string }>).detail;
      if (detail?.company && detail.company !== selectedCompany) return;
      reload();
    };
    window.addEventListener('contabilfacil-honorarios-updated', onUpdate);
    return () => window.removeEventListener('contabilfacil-honorarios-updated', onUpdate);
  }, [selectedCompany, reload]);

  const notifyRazao = useCallback(() => {
    onRazaoUpdated?.();
  }, [onRazaoUpdated]);

  const handleContasChange = (_config: HonorariosContasAutomacaoConfig) => {
    // Contas só salvam — postagem ao balancete é explícita pelo botão.
    setFeedback('Contas salvas. Use «Mandar para o balancete» para publicar.');
  };

  const handleMandarHonorariosBalancete = () => {
    if (lancamentos.length === 0) {
      alert('Nenhum lançamento de honorários para enviar ao balancete.');
      return;
    }
    try {
      const { gerados, pendencias } = postHonorariosNoRazao(selectedCompany);
      void flushPersistenceAfterCriticalWrite();
      notifyRazao();
      if (pendencias.length && gerados <= 0) {
        setFeedback(pendencias[0] ?? 'Configure as contas na subaba Contas.');
        setInnerTab('contas');
        return;
      }
      setFeedback(
        gerados > 0
          ? `${gerados} lançamento(s) de honorários enviados ao balancete.`
          : 'Nada novo para enviar — já estavam no balancete.',
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao enviar para o balancete.');
    }
  };

  const handleAutomationChange = (enabled: boolean) => {
    setFeedback(null);
    const result = salvarConfigHonorariosAutomacao(selectedCompany, { automationEnabled: enabled });
    reload();
    notifyRazao();
    if (result.pendencias.length) {
      setFeedback(result.pendencias[0] ?? 'Configure as contas na subaba Contas.');
      if (enabled) setInnerTab('contas');
    } else if (enabled) {
      setFeedback('Automação ligada — use «Mandar para o balancete» para publicar.');
    }
  };

  const handleSalvarAutomacao = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const result = salvarConfigHonorariosAutomacao(selectedCompany, {
      repeticoesPorAno: autoSettings.repeticoesPorAno,
      mesInicial: autoSettings.mesInicial,
      diaLancamento: autoSettings.diaLancamento,
      valorPadrao: autoSettings.valorPadrao,
      historicoPadrao: autoSettings.historicoPadrao,
      anoInicio: autoSettings.anoInicio,
      automationEnabled: true,
    });
    reload();
    if (result.pendencias.length) {
      setFeedback(result.pendencias.join(' · '));
      setInnerTab('contas');
    } else {
      setFeedback('Configuração salva. Use «Mandar para o balancete» para publicar.');
    }
  };

  const handleRegistrar = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const result = registrarHonorario(selectedCompany, { date, valor, historico });
    if (!result.ok) {
      setFeedback(result.pendencias[0] ?? 'Não foi possível lançar.');
      if (result.pendencias.some((p) => /configure/i.test(p))) setInnerTab('contas');
      return;
    }
    setValor(0);
    reload();
    setFeedback(
      `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} salvo. Use «Mandar para o balancete» para publicar.`,
    );
  };

  const handleRemove = (id: string) => {
    if (!window.confirm('Remover este lançamento de honorários?')) return;
    removerHonorario(selectedCompany, id);
    reload();
    notifyRazao();
    setFeedback('Lançamento removido e balancete atualizado.');
  };

  const handleEditarValores = (params: {
    ano: number;
    meses: number[];
    valor: number;
    historico: string;
  }) => {
    const result = atualizarValoresHonorariosMeses(selectedCompany, params);
    setEditarOpen(false);
    reload();
    notifyRazao();
    if (!result.ok) {
      setFeedback(result.pendencias[0] ?? 'Não foi possível atualizar.');
      return;
    }
    setFeedback('Valores atualizados no balancete.');
  };

  const mesesPrevistos = mesesRepeticaoAno(autoSettings);
  const mesesLabel = mesesPrevistos.map((m) => MESES_LABEL[m]).join(', ');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="flex border border-brand-border bg-brand-sidebar/20 shadow-[2px_2px_0_0_#141414] flex-1 min-w-[200px]">
          {INNER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setInnerTab(tab.id)}
              className={cn(
                'px-4 py-2 text-[10px] font-black uppercase tracking-widest border-r border-brand-border last:border-r-0 transition-all',
                innerTab === tab.id
                  ? 'bg-brand-bg text-brand-text'
                  : 'opacity-50 hover:opacity-100',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <AutomationToggle
          enabled={autoSettings.automationEnabled}
          onChange={handleAutomationChange}
          description="Repete honorários no balancete conforme meses/ano configurados."
          className="shrink-0"
        />
      </div>

      {innerTab === 'lancamento' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MandarParaBalanceteButton
              onClick={handleMandarHonorariosBalancete}
              disabled={lancamentos.length === 0}
              count={lancamentos.length}
            />
          </div>
          {autoSettings.automationEnabled ? (
            <form
              onSubmit={handleSalvarAutomacao}
              className="technical-panel p-6 shadow-[4px_4px_0_0_#141414] space-y-4 max-w-2xl"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest">Automação de honorários</h3>
                <button
                  type="button"
                  onClick={() => setEditarOpen(true)}
                  className="technical-button text-[9px] px-3 py-1.5 flex items-center gap-1.5 font-bold"
                >
                  <Pencil size={12} />
                  Editar valores
                </button>
              </div>
              <p className="text-[9px] font-bold uppercase opacity-50 leading-snug">
                Informe quantas vezes por ano repetir (ex.: 12 = todos os meses de jan a dez). A cada ano o
                sistema lança no balancete só essa quantidade de meses.
              </p>
              <div className={CF_FIELD_ROW}>
                <div className={CF_FIELD_COL}>
                  <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">
                    Repetições por ano
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    aria-label="Repetições por ano"
                    value={autoSettings.repeticoesPorAno}
                    onChange={(e) =>
                      setAutoSettings((s) => ({
                        ...s,
                        repeticoesPorAno: Math.min(12, Math.max(1, Number(e.target.value) || 1)),
                      }))
                    }
                    className={CF_FORM_INPUT_MED}
                  />
                </div>
                <div className={CF_FIELD_COL}>
                  <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Mês inicial</label>
                  <select
                    aria-label="Mês inicial"
                    value={autoSettings.mesInicial}
                    onChange={(e) =>
                      setAutoSettings((s) => ({ ...s, mesInicial: Number(e.target.value) }))
                    }
                    className={CF_FORM_INPUT_MED}
                  >
                    {MESES_LABEL.slice(1).map((label, i) => (
                      <option key={label} value={i + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={CF_FIELD_COL}>
                  <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Dia do mês</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    aria-label="Dia do lançamento"
                    value={autoSettings.diaLancamento}
                    onChange={(e) =>
                      setAutoSettings((s) => ({
                        ...s,
                        diaLancamento: Math.min(28, Math.max(1, Number(e.target.value) || 10)),
                      }))
                    }
                    className={CF_FORM_INPUT_MED}
                  />
                </div>
              </div>
              <div className={CF_FIELD_ROW}>
                <div className={CF_FIELD_COL}>
                  <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Valor padrão (R$)</label>
                  <FreeNumericInput
                    aria-label="Valor padrão"
                    required
                    placeholder="0,00"
                    value={autoSettings.valorPadrao}
                    onChange={(v) => setAutoSettings((s) => ({ ...s, valorPadrao: v }))}
                    className={CF_FORM_INPUT_MED}
                  />
                </div>
                <div className={CF_FIELD_COL}>
                  <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Ano início</label>
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    aria-label="Ano início"
                    value={autoSettings.anoInicio}
                    onChange={(e) =>
                      setAutoSettings((s) => ({ ...s, anoInicio: Number(e.target.value) || s.anoInicio }))
                    }
                    className={CF_FORM_INPUT_MED}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Histórico padrão</label>
                <input
                  type="text"
                  aria-label="Histórico padrão"
                  value={autoSettings.historicoPadrao}
                  onChange={(e) =>
                    setAutoSettings((s) => ({ ...s, historicoPadrao: e.target.value.toUpperCase() }))
                  }
                  className={CF_FORM_INPUT_MED}
                />
              </div>
              {mesesLabel ? (
                <p className="text-[9px] font-mono uppercase opacity-60">
                  Meses gerados: {mesesLabel} ({autoSettings.repeticoesPorAno}×/ano)
                </p>
              ) : null}
              <div className="flex justify-end pt-2">
                <button type="submit" className="technical-button-primary text-[10px] py-2 px-4 font-bold">
                  Aplicar e atualizar balancete
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={handleRegistrar}
              className="technical-panel p-6 shadow-[4px_4px_0_0_#141414] space-y-4 max-w-xl"
            >
              <h3 className="text-[10px] font-black uppercase tracking-widest border-b border-brand-border pb-2">
                Informar honorários (manual)
              </h3>
              <p className="text-[9px] font-bold uppercase opacity-50 leading-snug">
                Ligue a automação para repetir honorários todo ano, ou informe lançamentos avulsos aqui.
              </p>
              <div className={CF_FIELD_ROW}>
                <div className={CF_FIELD_COL}>
                  <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Data</label>
                  <input
                    type="date"
                    aria-label="Data do honorário"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={CF_FORM_INPUT_MED}
                  />
                </div>
                <div className={CF_FIELD_COL}>
                  <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Valor (R$)</label>
                  <FreeNumericInput
                    aria-label="Valor dos honorários"
                    required
                    placeholder="0,00"
                    value={valor}
                    onChange={setValor}
                    className={CF_FORM_INPUT_MED}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Histórico</label>
                <input
                  type="text"
                  aria-label="Histórico"
                  value={historico}
                  onChange={(e) => setHistorico(e.target.value.toUpperCase())}
                  className={CF_FORM_INPUT_MED}
                />
              </div>
              <div className="flex justify-end pt-2">
                <button type="submit" className="technical-button-primary text-[10px] py-2 px-4 font-bold">
                  Lançar no balancete
                </button>
              </div>
            </form>
          )}

          {feedback && (
            <p className="text-[10px] font-bold uppercase text-emerald-900 bg-emerald-50 border border-emerald-200 px-4 py-2">
              {feedback}
            </p>
          )}

          <div className="technical-panel shadow-[4px_4px_0_0_#141414] overflow-hidden">
            <div className="p-3 border-b border-brand-border bg-brand-sidebar/30 flex justify-between items-center gap-2">
              <h3 className="text-[10px] font-black uppercase tracking-widest">
                Honorários no balancete ({lancamentos.length})
              </h3>
              {autoSettings.automationEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    sincronizarHonorariosAutomacao(selectedCompany);
                    reload();
                    notifyRazao();
                    setFeedback('Balancete sincronizado com a automação.');
                  }}
                  className="text-[8px] font-bold uppercase underline opacity-60"
                >
                  Sincronizar agora
                </button>
              )}
            </div>
            {lancamentos.length === 0 ? (
              <p className="p-6 text-center text-[10px] font-bold uppercase opacity-40 tracking-widest">
                Nenhum honorário lançado ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[11px] font-mono">
                  <thead className="technical-grid-header">
                    <tr>
                      <th className="px-4 py-3 border-r border-brand-border">Data</th>
                      <th className="px-4 py-3 border-r border-brand-border">Histórico</th>
                      <th className="px-4 py-3 border-r border-brand-border text-right">Valor</th>
                      <th className="px-4 py-3 w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border/10">
                    {lancamentos.map((row) => (
                      <tr key={row.id} className="technical-grid-row">
                        <td className="px-4 py-3 border-r border-brand-border/10 whitespace-nowrap">
                          {formatDate(row.date)}
                          {row.automatico ? (
                            <span className="ml-1 text-[8px] uppercase opacity-40">auto</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 border-r border-brand-border/10 uppercase font-bold truncate max-w-[280px]">
                          {row.historico}
                        </td>
                        <td className="px-4 py-3 border-r border-brand-border/10 text-right text-red-700">
                          {formatCurrency(row.valor)}
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemove(row.id)}
                            className="text-red-800 opacity-60 hover:opacity-100"
                            aria-label="Remover"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {innerTab === 'contas' && (
        <HonorariosContasAutomacaoPanel selectedCompany={selectedCompany} onChange={handleContasChange} />
      )}

      <HonorariosEditarValoresModal
        open={editarOpen}
        onClose={() => setEditarOpen(false)}
        onSave={handleEditarValores}
        historicoPadrao={autoSettings.historicoPadrao}
      />
    </div>
  );
}
