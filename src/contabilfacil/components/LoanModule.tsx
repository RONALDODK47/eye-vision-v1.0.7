import { lazy, Suspense, useMemo, useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Plus,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Search,
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { FreeNumericInput } from './FreeNumericInput';
import {
  CF_FIELD_COL,
  CF_FIELD_COL_GROW,
  CF_FIELD_FULL,
  CF_FORM_FIELDS,
  CF_LOAN_FIELD_FULL,
  CF_LABEL,
  CF_LOAN_INPUT_DATE,
  CF_LOAN_INPUT_MONEY,
  CF_LOAN_INPUT_NUM,
  CF_LOAN_INPUT_PCT,
  CF_LOAN_INPUT_MED,
  CF_LOAN_SELECT,
} from '../lib/formFieldClasses';
import { LoanContract } from '../types';
const DataIngestionBox = lazy(() => import('./DataIngestionBox'));
const LoanAmortizationChart = lazy(() => import('./LoanAmortizationChart'));
import LoanCalcParamsPanel from './LoanCalcParamsPanel';
import { LoanAmortizationInfoHint } from './LoanAmortizationInfoHint';
import LoanContasTab from './LoanContasTab';
import LoanScheduleVirtualTable from './LoanScheduleVirtualTable';
import MandarParaBalanceteButton from './MandarParaBalanceteButton';
import { useLoanModuleState } from '../logic/useLoanModuleState';
import { postEmprestimoNoRazao } from '../logic/loanBalanceteAutomation';
import { flushPersistenceAfterCriticalWrite } from '../logic/eyeVisionPersistenceFlush';
import { parseCurrency } from '../../lib/simTabFields';
import {
  SIM_VAR_MODE_OPTIONS,
  spreadIndexadorShortLabel,
  usesSpreadPlusIndexador,
  type SimTabFields,
  type SimVarMode,
} from '../../lib/simTabFields';

export interface LoanModuleProps {
  selectedCompany: string;
  storageVersion?: number;
  /** Dentro da aba Gerencial — oculta cabeçalho duplicado do módulo. */
  embedded?: boolean;
}

type LoanMainTab = 'contratos' | 'simulacao' | 'contas';

export default function LoanModule({
  selectedCompany,
  storageVersion,
  embedded = false,
}: LoanModuleProps) {
  const [loanMainTab, setLoanMainTab] = useState<LoanMainTab>('contratos');
  const [activeView, setActiveView] = useState<'form' | 'table' | 'chart'>('form');
  const [contractSearch, setContractSearch] = useState('');
  const [folderOpen, setFolderOpen] = useState(true);
  const [showImportBox, setShowImportBox] = useState(false);

  const {
    contracts,
    selectedId,
    setSelectedId,
    activeContract,
    schedule,
    rawSchedule,
    isCalculating,
    loanParams,
    loanAccountFields,
    activeTab,
    handleCreate,
    handleDuplicate,
    handleDelete,
    handleUpdate,
    handleUpdateInterestRate,
    handleUpdateGraceInterestRate,
    interestRateStr,
    graceInterestRateStr,
    patchActiveSimTab,
    clearAll,
    importLoanContracts,
    handleExportDominio,
    handleExportPDF,
    handleExportForDeploy,
    bcbReadiness,
  } = useLoanModuleState({ selectedCompany, storageVersion });

  const filteredContracts = useMemo(() => {
    const needle = contractSearch.trim().toLowerCase();
    if (!needle) return contracts;
    return contracts.filter((contract) =>
      `${contract.contractNumber} ${contract.bankName} ${contract.type}`.toLowerCase().includes(needle),
    );
  }, [contracts, contractSearch]);

  const openContract = (id: string) => {
    setSelectedId(id);
    setLoanMainTab('simulacao');
    setActiveView('form');
  };

  useEffect(() => {
    if (loanMainTab === 'contas' && !selectedId && contracts.length > 0) {
      setSelectedId(contracts[0].id);
    }
  }, [loanMainTab, selectedId, contracts, setSelectedId]);

  const onCreate = () => {
    handleCreate();
    setFolderOpen(true);
    setLoanMainTab('simulacao');
    setActiveView('form');
  };

  const curtoColumnLabel = 'Curto';

  const scheduleTableColumns = useMemo(
    () => [
      { key: 'month', label: 'Mês', align: 'center' as const },
      { key: 'date', label: 'Data', align: 'center' as const },
      {
        key: 'days',
        label: loanParams?.varIndexMode === 'selic_over_diaria' ? 'Dias (DU)' : 'Dias',
        align: 'right' as const,
      },
      { key: 'selic', label: 'Fator SELIC', align: 'right' as const },
      { key: 'rate', label: 'Taxa %', align: 'right' as const },
      { key: 'initial', label: 'SD Inicial', align: 'right' as const },
      { key: 'installment', label: 'Parcela', align: 'right' as const },
      { key: 'amortization', label: 'Parcela Líq.', align: 'right' as const },
      { key: 'interest', label: 'Juros', align: 'right' as const },
      { key: 'cost', label: 'Custo Op.', align: 'right' as const },
      { key: 'iof', label: 'IOF', align: 'right' as const },
      { key: 'final', label: 'SD Final', align: 'right' as const },
      { key: 'short', label: curtoColumnLabel, align: 'right' as const },
      { key: 'long', label: 'Longo', align: 'right' as const },
    ],
    [curtoColumnLabel, loanParams?.varIndexMode],
  );

  const canExport =
    !!activeContract &&
    activeContract.principal > 0 &&
    rawSchedule.length > 0 &&
    !isCalculating;

  const scheduleTotals = useMemo(() => {
    const paymentRows = rawSchedule.filter((r) => r.month > 0);
    const paymentAmount = (r: (typeof paymentRows)[0]) => {
      if (r.installment > 0) return r.installment;
      // Carência capitalizada: sem pagamento (juros capitalizam no saldo).
      if (r.isGrace) return 0;
      return r.amortization + r.interest + r.monthlyCost;
    };
    const withPayment = paymentRows.filter((r) => paymentAmount(r) > 0);
    return {
      paymentSum: paymentRows.reduce((acc, r) => acc + paymentAmount(r), 0),
      firstPayment: withPayment[0] ? paymentAmount(withPayment[0]) : 0,
      lastPayment: withPayment.at(-1) ? paymentAmount(withPayment.at(-1)!) : 0,
    };
  }, [rawSchedule]);

  const chartData = useMemo(() => {
    if (schedule.length === 0) return [];
    const maxPoints = 120;
    const step = schedule.length > maxPoints ? Math.ceil(schedule.length / maxPoints) : 1;
    const sampled = step === 1 ? schedule : schedule.filter((_, i) => i % step === 0 || i === schedule.length - 1);
    return sampled.map((s) => ({
      name: `Mês ${s.month}`,
      saldo: s.balance,
      parcela: s.payment,
      juros: s.interest,
      amortiza: s.amortization,
    }));
  }, [schedule]);

  const handleExportDomínio = () => {
    handleExportDominio();
  };

  const handleMandarEmprestimoBalancete = () => {
    if (!canExport || !selectedId || !activeTab) {
      alert('Calcule o empréstimo e configure as contas antes de enviar ao balancete.');
      return;
    }
    try {
      const exportConfig = {
        accJurosAproDebit: activeTab.accJurosAproDebit,
        accJurosAproCredit: activeTab.accJurosAproCredit,
        accApropriacaoDebit: activeTab.accApropriacaoDebit,
        accApropriacaoCredit: activeTab.accApropriacaoCredit,
        accTransferenciaDebit: activeTab.accTransferenciaDebit,
        accTransferenciaCredit: activeTab.accTransferenciaCredit,
        accEmprestimoDebit: activeTab.accEmprestimoDebit,
        accEmprestimoCredit: activeTab.accEmprestimoCredit,
        valorIof: parseCurrency(activeTab.valorIofStr),
        accIofDebit: activeTab.accIofDebit,
        accIofCredit: activeTab.accIofCredit,
        codigoHistoricoDominio: activeTab.dominioCodigoHistoricoStr,
        complementoHistoricoDominio: activeTab.dominioComplementoHistoricoStr,
        dataGerarLancamentosAPartirStr: activeTab.dataGerarLancamentosAPartirStr?.trim() || undefined,
        omitTransferenciaLongoParaCurto: false,
      };
      const { gerados, pendencias } = postEmprestimoNoRazao(
        selectedCompany,
        selectedId,
        rawSchedule,
        exportConfig,
      );
      void flushPersistenceAfterCriticalWrite();
      if (pendencias.length && gerados <= 0) {
        alert(pendencias.join('\n'));
        return;
      }
      alert(
        gerados > 0
          ? `${gerados} lançamento(s) do empréstimo enviados ao balancete.\n\nAbra a aba Balancete para conferir.`
          : 'Nada novo para enviar — já estavam no balancete (ou não geraram partidas).',
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao enviar para o balancete.');
    }
  };

  const loanMainTabs: { id: LoanMainTab; label: string }[] = [
    { id: 'contratos', label: 'Contratos' },
    { id: 'simulacao', label: 'Simulação' },
    { id: 'contas', label: 'Contas' },
  ];

  const renderContratosTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-8 space-y-4">
        <div className="technical-panel shadow-[4px_4px_0_0_#141414] overflow-hidden module-panel-scroll min-w-0">
          <div className="px-4 py-3 border-b border-brand-border bg-brand-sidebar/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">Contratos do Sindicato</h3>
              <p className="text-[9px] font-mono opacity-50 mt-0.5 truncate">{selectedCompany}</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-border/50" size={14} />
              <input
                type="text"
                aria-label="Buscar número do contrato"
                value={contractSearch}
                onChange={(e) => setContractSearch(e.target.value)}
                placeholder="BUSCAR Nº DO CONTRATO..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-brand-border text-[10px] font-mono font-bold uppercase tracking-wide outline-none focus:bg-brand-sidebar/10"
              />
            </div>
          </div>

          <div className="module-panel-scroll-body">
            <div className="border-b border-brand-border/20 min-w-[320px]">
              <button
                type="button"
                onClick={() => setFolderOpen((open) => !open)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-sidebar/30 transition-colors"
              >
                <span className="text-brand-border/70">
                  {folderOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <span className="text-brand-border">
                  {folderOpen ? <FolderOpen size={16} /> : <Folder size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-wide truncate">{selectedCompany}</p>
                  <p className="text-[9px] font-mono opacity-50">{contracts.length} contrato(s)</p>
                </div>
              </button>

              {folderOpen ? (
                <div className="pb-2 pl-4 pr-2 space-y-1">
                  {filteredContracts.length === 0 ? (
                    <p className="px-3 py-6 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">
                      {contracts.length === 0
                        ? 'Nenhum contrato neste sindicato.'
                        : 'Nenhum contrato corresponde à busca.'}
                    </p>
                  ) : (
                    filteredContracts.map((contract) => {
                      const isActive = contract.id === selectedId;
                      return (
                        <button
                          key={contract.id}
                          type="button"
                          onClick={() => openContract(contract.id)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 border transition-all text-left group',
                            isActive
                              ? 'border-brand-border bg-brand-border text-brand-bg shadow-[2px_2px_0_0_rgba(0,0,0,0.15)]'
                              : 'border-brand-border/15 bg-white hover:border-brand-border/50 hover:bg-brand-sidebar/20',
                          )}
                        >
                          <span
                            className={cn(
                              'w-7 h-7 border flex items-center justify-center text-[10px] font-black shrink-0',
                              isActive ? 'border-brand-bg/30 bg-brand-bg/10' : 'border-brand-border/40',
                            )}
                          >
                            $
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-mono font-bold truncate">{contract.contractNumber}</p>
                            <p
                              className={cn(
                                'text-[9px] uppercase tracking-wide truncate',
                                isActive ? 'opacity-80' : 'opacity-50',
                              )}
                            >
                              {contract.type} · {formatCurrency(contract.principal)}
                            </p>
                          </div>
                          <span
                            className={cn(
                              'text-[8px] font-black uppercase px-1.5 py-0.5 border shrink-0',
                              isActive
                                ? 'border-brand-bg/30 bg-brand-bg/10'
                                : 'border-brand-border/30 opacity-60',
                            )}
                          >
                            Abrir
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-4 space-y-6">
        <div className="technical-panel p-5 shadow-[4px_4px_0_0_#141414] space-y-3">
          <h4 className="text-[10px] font-black uppercase tracking-widest">Ações rápidas</h4>
          <button type="button" onClick={onCreate} className="technical-button-primary w-full flex items-center justify-center gap-2">
            <Plus size={14} />
            NOVO CONTRATO
          </button>
          {contracts.length > 0 ? (
            <>
              <button
                type="button"
                onClick={handleExportForDeploy}
                className="technical-button w-full flex items-center justify-center gap-2"
                title="Gera deploy-saved-contracts.json — copie para data/ antes do npm run deploy"
              >
                EXPORTAR PARA DEPLOY
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="technical-button w-full flex items-center justify-center gap-2 border-red-800 text-red-800 hover:bg-red-800 hover:text-white"
              >
                <Trash2 size={14} />
                LIMPAR SINDICATO
              </button>
            </>
          ) : null}
        </div>
        {showImportBox ? (
          <Suspense
            fallback={
              <div className="border border-brand-border p-3 text-[9px] font-mono opacity-50">
                Carregando importação…
              </div>
            }
          >
            <DataIngestionBox
              dataType="loans"
              title="Processar Contratos Externos"
              onImport={(newItems) => {
                importLoanContracts(newItems as LoanContract[]);
                if (newItems.length > 0) {
                  openContract((newItems[0] as LoanContract).id);
                }
              }}
            />
          </Suspense>
        ) : (
          <button
            type="button"
            className="technical-button w-full text-[10px] font-bold uppercase"
            onClick={() => setShowImportBox(true)}
          >
            Importar contratos externos
          </button>
        )}
      </div>
    </div>
  );

  const renderSimulacaoTab = () => {
    if (!activeContract) {
      return (
        <div className="technical-panel p-16 shadow-[4px_4px_0_0_#141414] text-center space-y-4 bg-brand-sidebar/5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            Selecione um contrato na aba Contratos
          </p>
          <button type="button" onClick={() => setLoanMainTab('contratos')} className="technical-button-primary">
            IR PARA CONTRATOS
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="technical-panel px-4 py-3 shadow-[2px_2px_0_0_#141414] flex flex-wrap items-center justify-between gap-3 bg-brand-sidebar/20">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[9px] font-black uppercase tracking-widest opacity-50">Contrato em edição</p>
              <LoanAmortizationInfoHint />
            </div>
            <p className="text-sm font-mono font-bold truncate">{activeContract.contractNumber}</p>
            <p className="text-[10px] uppercase opacity-60 truncate">{activeContract.companyName}</p>
          </div>
          <button type="button" onClick={() => setLoanMainTab('contratos')} className="technical-button text-[10px]">
            TROCAR CONTRATO
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left settings */}
            <div className="lg:col-span-4 space-y-6 min-w-0">
              {activeContract && (
                <div className="technical-panel p-6 shadow-[4px_4px_0_0_#141414] space-y-6 min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-brand-border/20 pb-2">
                    <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                      <div className="w-2 h-2 bg-brand-border animate-pulse"></div>
                      CONTRATO ATIVO
                    </h3>
                    <div className="flex gap-1.5">
                      <button 
                        onClick={handleDuplicate}
                        title="Duplicar"
                        className="p-1 hover:bg-brand-base border border-transparent hover:border-brand-border transition-all"
                      >
                        <Copy size={12} />
                      </button>
                      <button 
                        onClick={handleDelete}
                        title="Excluir"
                        className="p-1 text-red-600 hover:bg-red-50 border border-transparent transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className={CF_FORM_FIELDS}>
                    <div className={CF_FIELD_COL}>
                      <label className={CF_LABEL}>Empresa</label>
                      <div className="max-w-[14rem] px-2 py-1 bg-brand-sidebar/10 border border-brand-border/40 font-bold text-[11px] uppercase truncate">
                        {selectedCompany}
                      </div>
                    </div>

                    <div className={CF_FIELD_COL_GROW}>
                      <label className={CF_LABEL}>Número do Contrato</label>
                      <input
                        aria-label="Número do Contrato"
                        type="text"
                        value={activeContract.contractNumber}
                        onChange={(e) => handleUpdate({ contractNumber: e.target.value })}
                        className={CF_LOAN_INPUT_MED}
                        placeholder="Nº CONTRATO"
                      />
                      <label className={`${CF_LABEL} mt-2`}>Nome do Banco</label>
                      <input
                        aria-label="Nome do Banco"
                        type="text"
                        value={activeContract.bankName}
                        onChange={(e) => handleUpdate({ bankName: e.target.value })}
                        className={CF_LOAN_INPUT_MED}
                        placeholder="Ex.: Banco do Brasil"
                      />
                    </div>

                    <div className={CF_FIELD_COL}>
                      <label className={CF_LABEL}>Amortização</label>
                      <div className="inline-flex border border-brand-border overflow-hidden">
                        {['PRICE', 'SAC'].map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => handleUpdate({ type: t as LoanContract['type'] })}
                            className={`px-4 py-1.5 text-[9px] font-bold transition-all ${
                              activeContract.type === t ? 'bg-brand-border text-brand-bg' : 'bg-transparent text-brand-text/60 hover:bg-brand-border/5'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={CF_FIELD_COL}>
                      <label className={CF_LABEL}>Principal (R$)</label>
                      <FreeNumericInput
                        aria-label="Principal em reais"
                        value={activeContract.principal}
                        onChange={(principal) => handleUpdate({ principal })}
                        className={CF_LOAN_INPUT_MONEY}
                      />
                    </div>

                    <div className={CF_LOAN_FIELD_FULL}>
                      <label className={CF_LABEL}>Indexador</label>
                      <select
                        aria-label="Indexador do contrato"
                        value={activeTab?.varMode ?? 'none'}
                        disabled={!activeTab}
                        onChange={(e) => {
                          const varMode = e.target.value as SimVarMode;
                          const patch: Partial<SimTabFields> = { varMode };
                          if (varMode === 'pronampe') {
                            if (activeTab?.graceInterestRoundingMode === 'none') {
                              patch.graceInterestRoundingMode = 'halfAwayFromZero';
                            }
                            if (activeContract?.type === 'SAC') {
                              patch.sacAmortizationBase = 'contractPrincipal';
                            }
                          }
                          patchActiveSimTab(patch);
                        }}
                        className={CF_LOAN_SELECT}
                      >
                        {SIM_VAR_MODE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {activeTab?.varMode === 'custom' && (
                      <div className={CF_FIELD_COL}>
                        <label className={CF_LABEL}>Taxa do indexador fixo % a.m.</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label="Taxa mensal do indexador fixo"
                          value={activeTab.customVarRateStr}
                          onChange={(e) =>
                            patchActiveSimTab({ customVarRateStr: e.target.value })
                          }
                          placeholder="0,50"
                          className={CF_LOAN_INPUT_PCT}
                        />
                      </div>
                    )}

                    {activeContract.gracePeriod > 0 ? (
                      <>
                        <div className={CF_FIELD_COL}>
                          <label className={CF_LABEL}>
                            {activeTab && usesSpreadPlusIndexador(activeTab.varMode)
                              ? `Spread Mensal Carência % (+ ${spreadIndexadorShortLabel(activeTab.varMode)})`
                              : 'Taxa Mensal Carência %'}
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label="Spread ou taxa mensal na carência"
                            value={graceInterestRateStr}
                            onChange={(e) => handleUpdateGraceInterestRate(e.target.value)}
                            placeholder={
                              activeTab && usesSpreadPlusIndexador(activeTab.varMode)
                                ? '0,30'
                                : '1,02'
                            }
                            className={CF_LOAN_INPUT_PCT}
                          />
                        </div>
                        <div className={CF_FIELD_COL}>
                          <label className={CF_LABEL}>
                            {activeTab && usesSpreadPlusIndexador(activeTab.varMode)
                              ? `Spread Mensal s/ Carência % (+ ${spreadIndexadorShortLabel(activeTab.varMode)})`
                              : 'Taxa Mensal s/ Carência %'}
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label="Spread ou taxa mensal sem carência"
                            value={interestRateStr}
                            onChange={(e) => handleUpdateInterestRate(e.target.value)}
                            placeholder={
                              activeTab && usesSpreadPlusIndexador(activeTab.varMode)
                                ? '0,30'
                                : '1,02'
                            }
                            className={CF_LOAN_INPUT_PCT}
                          />
                        </div>
                      </>
                    ) : (
                      <div className={CF_FIELD_COL}>
                        <label className={CF_LABEL}>
                          {activeTab && usesSpreadPlusIndexador(activeTab.varMode)
                            ? `Spread Mensal % (+ ${spreadIndexadorShortLabel(activeTab.varMode)})`
                            : 'Taxa Mensal %'}
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label="Spread ou taxa mensal"
                          value={interestRateStr}
                          onChange={(e) => handleUpdateInterestRate(e.target.value)}
                          placeholder={
                            activeTab && usesSpreadPlusIndexador(activeTab.varMode)
                              ? '0,30'
                              : '1,02'
                          }
                          className={CF_LOAN_INPUT_PCT}
                        />
                      </div>
                    )}

                    <div className={CF_FIELD_COL}>
                        <label className={CF_LABEL}>Data do contrato</label>
                        <input
                          type="date"
                          aria-label="Data do contrato"
                          value={activeContract.startDate?.slice(0, 10) ?? ''}
                          onChange={(e) => handleUpdate({ startDate: e.target.value })}
                          className={CF_LOAN_INPUT_DATE}
                        />
                    </div>
                    <div className={CF_FIELD_COL}>
                        <label className={CF_LABEL}>Carência (Meses)</label>
                        <FreeNumericInput
                          inputMode="numeric"
                          aria-label="Carência em meses"
                          value={activeContract.gracePeriod}
                          onChange={(gracePeriod) =>
                            handleUpdate({ gracePeriod: Math.max(0, gracePeriod) })
                          }
                          className={CF_LOAN_INPUT_NUM}
                        />
                    </div>

                    <div className={CF_FIELD_COL}>
                      <label className={CF_LABEL}>Prazo (Meses)</label>
                      <FreeNumericInput
                        inputMode="numeric"
                        aria-label="Prazo em meses"
                        value={activeContract.installments}
                        onChange={(installments) => handleUpdate({ installments })}
                        className={CF_LOAN_INPUT_NUM}
                      />
                    </div>

                    <div className={CF_FIELD_COL}>
                        <label className={CF_LABEL}>IOF Financiado</label>
                        <FreeNumericInput
                          aria-label="IOF financiado"
                          value={activeContract.iof}
                          onChange={(iof) => handleUpdate({ iof })}
                          className={CF_LOAN_INPUT_MONEY}
                        />
                    </div>
                    <div className={CF_FIELD_COL}>
                        <label className={CF_LABEL}>Taxas Banco (Custo)</label>
                        <FreeNumericInput
                          aria-label="Taxas banco custo operacional"
                          value={activeContract.costs}
                          onChange={(costs) => handleUpdate({ costs })}
                          className={CF_LOAN_INPUT_MONEY}
                        />
                    </div>

                    {activeContract.gracePeriod > 0 && (
                      <div className={CF_LOAN_FIELD_FULL}>
                        <label className={CF_LABEL}>Amortização de Carência</label>
                        <select
                          aria-label="Amortização de carência"
                          value={activeContract.graceType}
                          onChange={(e) => handleUpdate({ graceType: e.target.value as LoanContract['graceType'] })}
                          className={CF_LOAN_SELECT}
                        >
                          <option value="paid">PAGAR APENAS JUROS MENSALMENTE</option>
                          <option value="capitalized">CAPITALIZAR E INCORPORAR AO PRINCIPAL</option>
                        </select>
                      </div>
                    )}

                    {activeTab && (
                      <div className={CF_LOAN_FIELD_FULL}>
                      <LoanCalcParamsPanel
                        system={activeContract.type}
                        varMode={activeTab.varMode}
                        selicSeriesReady={
                          bcbReadiness.ready && activeTab.varMode === 'pronampe'
                        }
                        tab={activeTab}
                        onPatch={patchActiveSimTab}
                      />
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Right Display area (Charts / Data grid) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Ribbon Navigation for Views */}
              <div className="flex border border-brand-border bg-brand-sidebar/30 p-1">
                {(['form', 'table', 'chart'] as const).map((view) => (
                  <button
                    key={view}
                    onClick={() => setActiveView(view)}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
                      activeView === view 
                        ? 'bg-brand-border text-brand-bg shadow-[2px_2px_0_0_rgba(0,0,0,0.2)]' 
                        : 'text-brand-text/50 hover:text-brand-text'
                    }`}
                  >
                    {view === 'form' ? 'Ações & Config' : view === 'table' ? 'Tabela Amortização' : 'Gráfico Evolução'}
                  </button>
                ))}
              </div>

              {activeView === 'chart' && (
                <div className="technical-panel p-6 shadow-[4px_4px_0_0_#141414] module-table-viewport min-w-0 flex flex-col">
                  <h3 className="text-xs font-black uppercase tracking-widest mb-4 shrink-0">
                    Gráfico de Amortização Visual
                  </h3>
                  {schedule.length > 0 && !isCalculating ? (
                    <div className="flex-1 min-h-0 w-full min-w-0">
                      <div className="w-full h-full min-h-[320px] min-w-0">
                        <Suspense
                          fallback={
                            <div className="flex h-full min-h-[320px] items-center justify-center text-[10px] font-mono opacity-50">
                              Carregando gráfico…
                            </div>
                          }
                        >
                          <LoanAmortizationChart data={chartData} />
                        </Suspense>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-[320px] flex items-center justify-center text-[10px] font-bold uppercase text-slate-400">
                      {isCalculating ? 'Recalculando…' : 'Preencha o valor principal para plotar.'}
                    </div>
                  )}
                </div>
              )}

              {activeView === 'table' && (
                <div className="space-y-4">
                <div className="technical-panel shadow-[4px_4px_0_0_#141414] overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-brand-border bg-brand-sidebar/30">
                    <div className="flex items-center gap-3">
                      <p className="text-[10px] font-black uppercase tracking-widest">
                        Cronograma completo ({rawSchedule.length} linha(s))
                      </p>
                      {isCalculating ? (
                        <span className="text-[8px] font-bold uppercase tracking-widest text-amber-700 animate-pulse">
                          Recalculando…
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={handleExportPDF}
                      disabled={!canExport || isCalculating}
                      className="technical-button-primary text-[10px] py-1.5 px-4 disabled:opacity-40"
                    >
                      EXPORTAR PDF
                    </button>
                  </div>
                  {!bcbReadiness.ready &&
                  activeTab &&
                  usesSpreadPlusIndexador(activeTab.varMode) ? (
                    <div className="px-4 py-8 text-center text-[10px] font-bold uppercase text-red-800 bg-red-500/10">
                      {bcbReadiness.message}
                    </div>
                  ) : (
                    <LoanScheduleVirtualTable
                      rows={rawSchedule}
                      columns={scheduleTableColumns}
                      emptyMessage={
                        activeTab && usesSpreadPlusIndexador(activeTab.varMode) && bcbReadiness.loading
                          ? 'Aguardando séries do Banco Central…'
                          : undefined
                      }
                    />
                  )}
                </div>
                  {activeContract && (
                    <div className="bg-brand-border p-6 text-brand-bg shadow-[4px_4px_0_0_#141414] space-y-4">
                      <div className="flex items-center justify-between border-b border-white/20 pb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-brand-bg">
                          Resumo Financeiro
                        </span>
                        <span className="text-[9px] font-mono opacity-60 bg-white/10 px-1 py-0.5">
                          {activeContract.type}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-2xl font-black italic tracking-tighter">
                          {isCalculating ? '…' : formatCurrency(scheduleTotals.paymentSum)}
                        </h4>
                        <p className="text-[8px] font-bold uppercase opacity-60 mt-1">
                          {isCalculating
                            ? 'Recalculando cronograma…'
                            : 'Montante Final Calculado (Principal + Custos)'}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="bg-white/10 p-2 border border-white/10">
                          <p className="text-[8px] font-bold opacity-60 mb-1 uppercase">Parcela Inicial</p>
                          <p className="text-xs font-mono font-bold tracking-tight">
                            {formatCurrency(scheduleTotals.firstPayment)}
                          </p>
                        </div>
                        <div className="bg-white/10 p-2 border border-white/10">
                          <p className="text-[8px] font-bold opacity-60 mb-1 uppercase">Parcela Final</p>
                          <p className="text-xs font-mono font-bold tracking-tight">
                            {formatCurrency(scheduleTotals.lastPayment)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeView === 'form' && (
                <div className="technical-panel p-12 shadow-[4px_4px_0_0_#141414] text-center flex flex-col items-center justify-center min-h-[400px] space-y-8 bg-brand-sidebar/5">
                  <div className="w-16 h-16 border-2 border-brand-border flex items-center justify-center font-black text-2xl">
                    $
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-black uppercase tracking-[0.2em]">Cálculo Ativo</h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase max-w-xs tracking-widest leading-relaxed">
                      Sua simulação está calculada e pronta. Verifique o grid de parcelas ou o gráfico de projeção, ou escolha exportar para integração contábil.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-4 justify-center">
                    <MandarParaBalanceteButton
                      onClick={handleMandarEmprestimoBalancete}
                      disabled={!canExport}
                      className="technical-button-primary disabled:opacity-40 text-[10px] py-2 px-3"
                    />
                    <button 
                      onClick={handleExportDomínio}
                      disabled={!canExport}
                      className="technical-button-primary disabled:opacity-40"
                    >
                      EXPORTAR CONTAS (DOMÍNIO)
                    </button>
                    <button 
                      onClick={handleExportPDF}
                      disabled={!canExport}
                      className="technical-button disabled:opacity-40"
                    >
                      EXPORTAR PDF
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
    );
  };

  return (
    <div className={cn(embedded ? 'space-y-6 min-w-0' : 'p-8 max-w-7xl mx-auto space-y-8')}>
      {!embedded ? (
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-brand-border pb-4 gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase italic">Simulador de Empréstimos</h1>
            <p className="text-[10px] font-bold uppercase opacity-50 tracking-widest">Motor de Cálculo SAC/PRICE — v4.1</p>
          </div>
        </div>
      ) : null}

      <div className="flex border border-brand-border bg-brand-sidebar/30 p-1 w-fit">
        {loanMainTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setLoanMainTab(tab.id)}
            className={cn(
              'px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all',
              loanMainTab === tab.id
                ? 'bg-brand-border text-brand-bg shadow-[2px_2px_0_0_rgba(0,0,0,0.2)]'
                : 'text-brand-text/60 hover:bg-brand-border/10',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loanMainTab === 'contratos'
        ? renderContratosTab()
        : loanMainTab === 'simulacao'
          ? renderSimulacaoTab()
          : (
            <LoanContasTab
              selectedCompany={selectedCompany}
              contracts={contracts}
              selectedId={selectedId}
              onSelectContract={(id) => {
                setSelectedId(id);
              }}
              accountFields={loanAccountFields}
              dominioCodigoHistorico={activeTab?.dominioCodigoHistoricoStr ?? ''}
              dominioComplementoHistorico={activeTab?.dominioComplementoHistoricoStr ?? ''}
              dataGerarLancamentosAPartir={activeTab?.dataGerarLancamentosAPartirStr ?? ''}
              onPatch={patchActiveSimTab}
            />
          )}
    </div>
  );
}

