import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  PieChart,
  Plus,
  TrendingUp,
  Banknote,
  Landmark,
  Trash2,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Search,
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../lib/utils';
import { FreeNumericInput } from './FreeNumericInput';
import {
  CF_FIELD_COL,
  CF_FORM_FIELDS,
  CF_FORM_INPUT_DATE,
  CF_FORM_INPUT_MED,
  CF_FORM_INPUT_MONEY,
  CF_FORM_INPUT_NUM,
  CF_FORM_INPUT_PCT,
  CF_FORM_SELECT,
} from '../lib/formFieldClasses';
import { CompanyApp } from '../types';
import AppsContasTab from './AppsContasTab';
import DataIngestionBox from './DataIngestionBox';
import MandarParaBalanceteButton from './MandarParaBalanceteButton';
import { postAplicacaoNoRazao } from '../logic/aplicacaoBalanceteAutomation';
import { flushPersistenceAfterCriticalWrite } from '../logic/eyeVisionPersistenceFlush';
import {
  loadAplicacoesFromBrowserStorage,
  normalizeSavedAplicacao,
  type SavedAplicacao,
} from '../logic/aplicacaoStorage';
import { persistCanonicalList } from '../../lib/simuladorBrowserStorage';
import {
  belongsToSindicato,
  getAplicacaoFolderName,
  normalizeCompanyName,
} from '../logic/companyWorkspace';
import {
  buildAplicacaoLancamentosDisplay,
  enrichAplicacaoExportInput,
  summarizeAplicacaoLancamentos,
  type AplicacaoLancamentoTipo,
} from '../logic/aplicacaoLancamentosDisplay';
import {
  cronogramaAplicacao,
  downloadAplicacaoTxtPlus,
  generateAplicacaoTxtPlus,
} from '../../lib/aplicacoesDominioExport';
import { formatCurrencyInput, parseCurrency } from '../../lib/simTabFields';

function lancamentoTipoLabel(tipo: AplicacaoLancamentoTipo) {
  if (tipo === 'JUROS') return 'Juros';
  if (tipo === 'IRRF') return 'IRRF';
  if (tipo === 'IOF') return 'IOF';
  if (tipo === 'APLICACAO') return 'Aplicação';
  return 'Outro';
}

function lancamentoTipoClass(tipo: AplicacaoLancamentoTipo) {
  if (tipo === 'JUROS') return 'text-blue-700 bg-blue-50 border-blue-200';
  if (tipo === 'IRRF') return 'text-amber-700 bg-amber-50 border-amber-200';
  if (tipo === 'IOF') return 'text-orange-700 bg-orange-50 border-orange-200';
  if (tipo === 'APLICACAO') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  return 'text-slate-600 bg-brand-sidebar/30 border-brand-border/30';
}

export interface AppsModuleProps {
  selectedCompany: string;
  storageVersion?: number;
  /** Dentro da aba Gerencial — oculta cabeçalho duplicado. */
  embedded?: boolean;
}

type AppsMainTab = 'carteira' | 'extrato' | 'contas';

function resolveIndex(a: SavedAplicacao): string {
  const indexRaw = (a.variacaoValorParcelas ?? 'fixo').toString().toUpperCase();
  if (indexRaw.includes('SELIC')) return 'SELIC';
  if (indexRaw.includes('IPCA') || indexRaw.includes('FIXED')) return 'IPCA';
  if (indexRaw.includes('PRE')) return 'PRE';
  return 'CDI';
}

function resolveRate(a: SavedAplicacao): number {
  const fromReceita = parseCurrency(a.valorReceitaJurosMensalStr ?? '0');
  if (fromReceita > 0) return fromReceita;
  return 100;
}

function aplicacaoToCompanyApp(a: SavedAplicacao): CompanyApp {
  return {
    id: a.id,
    name: a.nomeAplicacao || a.nomeEmpresa || 'SEM NOME',
    folder: getAplicacaoFolderName(a),
    amount: parseCurrency(a.valorParcelaStr),
    rate: resolveRate(a),
    index: resolveIndex(a),
    startDate: a.dataInicioPrimeiraParcelaStr,
    numeroAplicacao: a.numeroAplicacao,
  };
}

function buildSavedAplicacao(
  app: CompanyApp,
  sindicatoName: string,
  previous?: SavedAplicacao,
): SavedAplicacao {
  return normalizeSavedAplicacao({
    ...(previous ?? {}),
    id: app.id,
    sindicatoName: normalizeCompanyName(sindicatoName),
    nomeEmpresa: app.folder.trim().toUpperCase() || getAplicacaoFolderName({ nomeAplicacao: app.name }),
    nomeAplicacao: app.name,
    numeroAplicacao: app.numeroAplicacao,
    valorParcelaStr: formatCurrencyInput(app.amount),
    numeroPrimeiraParcelaStr: previous?.numeroPrimeiraParcelaStr ?? '1',
    dataInicioPrimeiraParcelaStr: app.startDate,
    quantidadeParcelasStr: previous?.quantidadeParcelasStr ?? '12',
    variacaoValorParcelas: app.index === 'SELIC' ? 'selic_dias' : 'fixo',
    temReceitaJuros: previous?.temReceitaJuros ?? app.rate > 0,
    valorReceitaJurosMensalStr:
      previous?.valorReceitaJurosMensalStr ??
      (app.rate > 0 ? formatCurrencyInput(app.rate) : undefined),
    createdAt: previous?.createdAt ?? new Date().toISOString(),
  });
}

export default function AppsModule({
  selectedCompany,
  storageVersion = 0,
  embedded = false,
}: AppsModuleProps) {
  const [appsMainTab, setAppsMainTab] = useState<AppsMainTab>('carteira');
  const [savedApps, setSavedApps] = useState<SavedAplicacao[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [extratoSearch, setExtratoSearch] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const [expandedAppIds, setExpandedAppIds] = useState<Set<string>>(() => new Set());

  const [name, setName] = useState('');
  const [folder, setFolder] = useState('GERAL');
  const [amount, setAmount] = useState(0);
  const [rate, setRate] = useState(100);
  const [index, setIndex] = useState('CDI');
  const [start, setStart] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const all = loadAplicacoesFromBrowserStorage();
    const scoped = all.filter((item) => belongsToSindicato(item.sindicatoName, selectedCompany));
    setSavedApps(scoped);
  }, [storageVersion, selectedCompany]);
  const apps = useMemo(() => savedApps.map(aplicacaoToCompanyApp), [savedApps]);

  const lancamentosByAppId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildAplicacaoLancamentosDisplay>>();
    for (const item of savedApps) {
      map.set(item.id, buildAplicacaoLancamentosDisplay(item));
    }
    return map;
  }, [savedApps]);

  const toggleAppExpanded = (id: string) => {
    setExpandedAppIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportDominioTxt = (item: SavedAplicacao) => {
    const inp = enrichAplicacaoExportInput(item);
    const cron = cronogramaAplicacao(inp, parseCurrency);
    const content = generateAplicacaoTxtPlus(inp, parseCurrency, cron);
    if (!content.trim()) {
      alert('Nenhuma linha TXT+ Domínio gerada. Configure contas e valores da aplicação.');
      return;
    }
    const base = (item.nomeAplicacao || item.numeroAplicacao || 'aplicacao')
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '');
    downloadAplicacaoTxtPlus(`${base}_dominio_txtplus.txt`, content);
  };

  const handleMandarAplicacaoBalancete = (item: SavedAplicacao, count: number) => {
    if (count <= 0) {
      alert('Nenhum lançamento para enviar. Configure contas e valores na aba Contas.');
      return;
    }
    try {
      const { gerados, pendencias } = postAplicacaoNoRazao(selectedCompany, item.id);
      void flushPersistenceAfterCriticalWrite();
      if (pendencias.length && gerados <= 0) {
        alert(pendencias.join('\n'));
        return;
      }
      alert(
        gerados > 0
          ? `${gerados} lançamento(s) da aplicação enviados ao balancete.\n\nAbra a aba Balancete para conferir.`
          : 'Nada novo para enviar — já estavam no balancete (ou não geraram partidas).',
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao enviar para o balancete.');
    }
  };

  const renderLancamentosPanel = (item: SavedAplicacao) => {
    const lancamentos = lancamentosByAppId.get(item.id) ?? [];
    const summary = summarizeAplicacaoLancamentos(lancamentos);

    return (
      <div className="px-6 py-4 bg-brand-sidebar/10 border-t border-brand-border/20">
        <div className="flex flex-wrap gap-4 mb-4 text-[9px] font-black uppercase tracking-widest items-center">
          <span>Juros: {formatCurrency(summary.juros)}</span>
          <span>IRRF: {formatCurrency(summary.irrf)}</span>
          <span>IOF: {formatCurrency(summary.iof)}</span>
          <span className="opacity-50">{lancamentos.length} lançamento(s)</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <MandarParaBalanceteButton
              onClick={() => handleMandarAplicacaoBalancete(item, lancamentos.length)}
              disabled={lancamentos.length === 0}
              count={lancamentos.length}
            />
            <button
              type="button"
              onClick={() => handleExportDominioTxt(item)}
              className="technical-button-primary text-[9px] py-1 px-3"
            >
              EXPORTAR TXT+ DOMÍNIO
            </button>
          </div>
        </div>

        {lancamentos.length === 0 ? (
          <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">
            Nenhum lançamento configurado para esta aplicação.
          </p>
        ) : (
          <div className="module-table-viewport-nested border border-brand-border/30 bg-white">
            <table className="w-full min-w-[760px] text-left border-collapse">
              <thead className="bg-brand-sidebar/40 text-[9px] font-black uppercase tracking-widest">
                <tr>
                  <th className="px-3 py-2 border-b border-brand-border/30">Data</th>
                  <th className="px-3 py-2 border-b border-brand-border/30">Tipo</th>
                  <th className="px-3 py-2 border-b border-brand-border/30">Histórico</th>
                  <th className="px-3 py-2 border-b border-brand-border/30">Débito</th>
                  <th className="px-3 py-2 border-b border-brand-border/30">Crédito</th>
                  <th className="px-3 py-2 border-b border-brand-border/30 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[10px]">
                {lancamentos.map((lanc) => (
                  <tr key={lanc.id} className="border-b border-brand-border/10 last:border-b-0">
                    <td className="px-3 py-2">{formatDate(lanc.date)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'inline-block px-1.5 py-0.5 border text-[8px] font-black uppercase',
                          lancamentoTipoClass(lanc.tipo),
                        )}
                      >
                        {lancamentoTipoLabel(lanc.tipo)}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-bold">{lanc.historico}</td>
                    <td className="px-3 py-2 opacity-70">{lanc.debito || '—'}</td>
                    <td className="px-3 py-2 opacity-70">{lanc.credito || '—'}</td>
                    <td className="px-3 py-2 text-right font-black">{formatCurrency(lanc.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const persistForSindicato = (scopedList: SavedAplicacao[]) => {
    setSavedApps(scopedList);
    const all = loadAplicacoesFromBrowserStorage();
    const others = all.filter((item) => !belongsToSindicato(item.sindicatoName, selectedCompany));
    const normalized = scopedList.map((item) => ({
      ...item,
      sindicatoName: normalizeCompanyName(selectedCompany),
    }));
    persistCanonicalList('simulador_aplicacoes', [...others, ...normalized]);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || amount <= 0) return;

    const newApp: CompanyApp = {
      id: crypto.randomUUID(),
      name: name.toUpperCase(),
      folder: folder.trim().toUpperCase() || 'GERAL',
      amount,
      rate,
      index,
      startDate: start,
    };

    persistForSindicato([...savedApps, buildSavedAplicacao(newApp, selectedCompany)]);

    setName('');
    setFolder('GERAL');
    setAmount(0);
    setRate(100);
    setIndex('CDI');
    setStart(new Date().toISOString().split('T')[0]);
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    persistForSindicato(savedApps.filter((item) => item.id !== id));
  };

  const clearAll = () => {
    persistForSindicato([]);
  };

  const groupedExtrato = useMemo(() => {
    const needle = extratoSearch.trim().toLowerCase();
    const groups: Record<string, SavedAplicacao[]> = {};

    for (const item of savedApps) {
      const folderName = getAplicacaoFolderName(item);
      const haystack = `${folderName} ${item.nomeAplicacao} ${item.numeroAplicacao ?? ''}`.toLowerCase();
      if (needle && !haystack.includes(needle)) continue;
      if (!groups[folderName]) groups[folderName] = [];
      groups[folderName].push(item);
    }

    return Object.entries(groups).sort(([a], [b]) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }),
    );
  }, [savedApps, extratoSearch]);

  const toggleFolder = (folderName: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderName)) next.delete(folderName);
      else next.add(folderName);
      return next;
    });
  };

  const totalAllocated = apps.reduce((acc, a) => acc + a.amount, 0);

  const projectedMonthlyYield = apps.reduce((acc, a) => {
    let yearlyRateFactor = 0.105;
    if (a.index === 'SELIC') yearlyRateFactor = 0.1045;
    else if (a.index === 'IPCA') yearlyRateFactor = 0.045 + a.rate / 100;
    else if (a.index === 'CDI') yearlyRateFactor = 0.105 * (a.rate / 100);
    else yearlyRateFactor = a.rate / 100;
    return acc + a.amount * (yearlyRateFactor / 12);
  }, 0);

  const predominantIndex = useMemo(() => {
    if (apps.length === 0) return 'NENHUM';
    const indexCounts: Record<string, number> = {};
    apps.forEach((a) => {
      indexCounts[a.index] = (indexCounts[a.index] || 0) + a.amount;
    });
    return Object.entries(indexCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'CDI';
  }, [apps]);

  const mainTabs: { id: AppsMainTab; label: string }[] = [
    { id: 'carteira', label: 'Carteira' },
    { id: 'extrato', label: 'Extrato de Aplicações' },
    { id: 'contas', label: 'Contas' },
  ];

  const renderCarteiraTab = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="technical-panel p-6 shadow-[4px_4px_0_0_#141414] flex items-start justify-between">
          <div>
            <p className="text-[9px] font-black text-brand-text/40 uppercase tracking-widest mb-1 italic">
              Patrimônio Alocado
            </p>
            <h4 className="text-2xl font-mono font-black tracking-tighter">{formatCurrency(totalAllocated)}</h4>
          </div>
          <div className="p-2 border border-brand-border text-brand-border">
            <Landmark size={18} />
          </div>
        </div>
        <div className="technical-panel p-6 shadow-[4px_4px_0_0_#141414] flex items-start justify-between">
          <div>
            <p className="text-[9px] font-black text-brand-text/40 uppercase tracking-widest mb-1 italic">
              Rendimento Projetado (Mês)
            </p>
            <h4 className="text-2xl font-mono font-black tracking-tighter text-blue-600">
              ~{formatCurrency(projectedMonthlyYield)}
            </h4>
          </div>
          <div className="p-2 border border-brand-border text-blue-600">
            <TrendingUp size={18} />
          </div>
        </div>
        <div className="technical-panel p-6 shadow-[4px_4px_0_0_#141414] flex items-start justify-between">
          <div>
            <p className="text-[9px] font-black text-brand-text/40 uppercase tracking-widest mb-1 italic">
              Benchmark Ativo
            </p>
            <h4 className="text-2xl font-mono font-black tracking-tighter">{predominantIndex}</h4>
          </div>
          <div className="p-2 border border-brand-border text-brand-text/40">
            <Banknote size={18} />
          </div>
        </div>
      </div>

      {showAddForm ? (
        <form
          onSubmit={handleAdd}
          className="technical-panel p-6 shadow-[6px_6px_0_0_#141414] bg-brand-sidebar/10 max-w-3xl"
        >
          <h3 className="text-xs font-black uppercase tracking-widest border-b border-brand-border pb-2 mb-3 w-full">
            Registrar Novo Ativo Financeiro
          </h3>

          <div className={CF_FORM_FIELDS}>
            <div className={CF_FIELD_COL}>
              <label className="block text-[9px] font-black uppercase opacity-60 mb-1">Nome/Descrição do Ativo</label>
              <input aria-label="Nome/Descrição do Ativo"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="EX: SICREDINVEST EXCLUSIVO"
                className={CF_FORM_INPUT_MED}
              />
            </div>
            <div className={CF_FIELD_COL}>
              <label className="block text-[9px] font-black uppercase opacity-60 mb-1">Pasta no Extrato</label>
              <input aria-label="Pasta no Extrato"
                type="text"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="SICREDI"
                className={CF_FORM_INPUT_MED}
              />
            </div>
            <div className={CF_FIELD_COL}>
              <label className="block text-[9px] font-black uppercase opacity-60 mb-1">Montante (R$)</label>
              <FreeNumericInput aria-label="Montante (R$)"
                required
                value={amount}
                onChange={setAmount}
                className={CF_FORM_INPUT_MONEY}
              />
            </div>
            <div className={CF_FIELD_COL}>
              <label className="block text-[9px] font-black uppercase opacity-60 mb-1">Indexador</label>
              <select aria-label="Indexador"
                value={index}
                onChange={(e) => setIndex(e.target.value)}
                className={CF_FORM_SELECT}
              >
                <option value="CDI">CDI</option>
                <option value="SELIC">SELIC</option>
                <option value="IPCA">IPCA</option>
                <option value="PRE">PRÉ-FIXADO</option>
              </select>
            </div>
            <div className={CF_FIELD_COL}>
              <label className="block text-[9px] font-black uppercase opacity-60 mb-1">Taxa / Rend. %</label>
              <FreeNumericInput aria-label="Taxa / Rend. %"
                required
                value={rate}
                onChange={setRate}
                hideZeroWhenBlurred={false}
                className={CF_FORM_INPUT_PCT}
              />
            </div>
            <div className={CF_FIELD_COL}>
              <label className="block text-[9px] font-black uppercase opacity-60 mb-1">Data Aplicação</label>
              <input aria-label="Data Aplicação"
                type="date"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={CF_FORM_INPUT_DATE}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 w-full basis-full">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="technical-button text-[10px] font-black py-2 px-4 uppercase"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="technical-button-primary text-[10px] font-black py-2 px-6 uppercase shadow-[2px_2px_0_0_rgba(0,0,0,0.15)]"
            >
              Confirmar Registro
            </button>
          </div>
        </form>
      ) : null}

      <div className="technical-panel shadow-[4px_4px_0_0_#141414] overflow-hidden">
        <div className="module-table-viewport">
        <table className="w-full min-w-[1180px] text-left text-sm border-collapse">
          <thead className="technical-grid-header">
            <tr>
              <th className="px-4 py-4 border-r border-brand-border w-10"></th>
              <th className="px-6 py-4 border-r border-brand-border">Ativo / Origem</th>
              <th className="px-6 py-4 border-r border-brand-border">Pasta</th>
              <th className="px-6 py-4 border-r border-brand-border">Indexador</th>
              <th className="px-6 py-4 border-r border-brand-border">Yield %</th>
              <th className="px-6 py-4 border-r border-brand-border text-right">Montante</th>
              <th className="px-4 py-4 border-r border-brand-border text-right">Juros</th>
              <th className="px-4 py-4 border-r border-brand-border text-right">IRRF</th>
              <th className="px-4 py-4 border-r border-brand-border text-right">IOF</th>
              <th className="px-6 py-4 text-center">Status</th>
              <th className="px-6 py-4 text-right">Controles</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[11px] divide-y divide-brand-border/10">
            {apps.length > 0 ? (
              apps.map((a) => {
                const saved = savedApps.find((item) => item.id === a.id);
                const lancamentos = lancamentosByAppId.get(a.id) ?? [];
                const summary = summarizeAplicacaoLancamentos(lancamentos);
                const isExpanded = expandedAppIds.has(a.id);

                return (
                  <Fragment key={a.id}>
                    <tr className="technical-grid-row">
                      <td className="px-3 py-5 border-r border-brand-border/10 text-center">
                        <button
                          type="button"
                          onClick={() => toggleAppExpanded(a.id)}
                          className="p-1 hover:bg-brand-sidebar/40 border border-transparent hover:border-brand-border/40"
                          title="Ver lançamentos"
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="px-6 py-5 border-r border-brand-border/10">
                        <div className="font-black text-brand-text uppercase italic">{a.name}</div>
                        <div className="text-[9px] opacity-40 uppercase">Open Date: {formatDate(a.startDate)}</div>
                      </td>
                      <td className="px-6 py-5 border-r border-brand-border/10 text-[10px] font-bold uppercase">
                        {a.folder}
                      </td>
                      <td className="px-6 py-5 border-r border-brand-border/10">
                        <span className="bg-brand-sidebar border border-brand-border/30 px-1.5 py-0.5 text-[9px] font-bold tracking-tighter">
                          {a.index}
                        </span>
                      </td>
                      <td className="px-6 py-5 border-r border-brand-border/10 font-bold">
                        {a.rate}% {a.index === 'CDI' ? 'do CDI' : 'p.a.'}
                      </td>
                      <td className="px-6 py-5 border-r border-brand-border/10 text-right font-black tracking-tighter">
                        {formatCurrency(a.amount)}
                      </td>
                      <td className="px-4 py-5 border-r border-brand-border/10 text-right text-blue-700 font-bold">
                        {formatCurrency(summary.juros)}
                      </td>
                      <td className="px-4 py-5 border-r border-brand-border/10 text-right text-amber-700 font-bold">
                        {formatCurrency(summary.irrf)}
                      </td>
                      <td className="px-4 py-5 border-r border-brand-border/10 text-right text-orange-700 font-bold">
                        {formatCurrency(summary.iof)}
                      </td>
                      <td className="px-6 py-5 text-center">
                        <div className="flex items-center justify-center gap-1.5 text-blue-600 font-bold uppercase text-[9px]">
                          <div className="w-1.5 h-1.5 bg-blue-600 animate-pulse"></div>
                          Ativo
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right font-sans">
                        <button
                          type="button"
                          onClick={() => handleDelete(a.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                          title="Deletar Ativo"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && saved ? (
                      <tr>
                        <td colSpan={11} className="p-0">
                          {renderLancamentosPanel(saved)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={11} className="py-20 text-center font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                  Nenhum ativo de aplicação financeira cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );

  const renderExtratoTab = () => (
    <div className="technical-panel shadow-[4px_4px_0_0_#141414] overflow-hidden">
      <div className="px-4 py-3 border-b border-brand-border bg-brand-sidebar/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">Extrato de Aplicações</h3>
          <p className="text-[9px] font-mono opacity-50 mt-0.5">
            {savedApps.length} aplicação(ões) · {groupedExtrato.length} pasta(s)
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-border/50" size={14} />
          <input
            type="text"
            aria-label="Buscar pasta ou ativo no extrato"
            value={extratoSearch}
            onChange={(e) => setExtratoSearch(e.target.value)}
            placeholder="BUSCAR PASTA OU ATIVO..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-brand-border text-[10px] font-mono font-bold uppercase tracking-wide outline-none focus:bg-brand-sidebar/10"
          />
        </div>
      </div>

      <div className="module-table-viewport">
        {groupedExtrato.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {savedApps.length === 0
                ? 'Nenhuma aplicação neste sindicato.'
                : 'Nenhuma aplicação corresponde à busca.'}
            </p>
          </div>
        ) : (
          groupedExtrato.map(([folderName, items]) => {
            const isOpen = !collapsedFolders.has(folderName) || extratoSearch.length > 0;
            const folderTotal = items.reduce((acc, item) => acc + parseCurrency(item.valorParcelaStr), 0);

            return (
              <div key={folderName} className="border-b border-brand-border/20 last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleFolder(folderName)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-sidebar/30 transition-colors"
                >
                  <span className="text-brand-border/70">
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                  <span className="text-brand-border">
                    {isOpen ? <FolderOpen size={16} /> : <Folder size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black uppercase tracking-wide truncate">{folderName}</p>
                    <p className="text-[9px] font-mono opacity-50">
                      {items.length} ativo(s) · {formatCurrency(folderTotal)}
                    </p>
                  </div>
                </button>

                {isOpen ? (
                  <div className="pb-2 pl-4 pr-2 space-y-1">
                    {items.map((item) => {
                      const app = aplicacaoToCompanyApp(item);
                      const summary = summarizeAplicacaoLancamentos(lancamentosByAppId.get(item.id) ?? []);
                      const isItemOpen = expandedAppIds.has(item.id);

                      return (
                        <div key={item.id} className="space-y-1">
                          <div className="w-full flex flex-wrap items-center gap-3 px-3 py-2.5 border border-brand-border/15 bg-white hover:border-brand-border/50 hover:bg-brand-sidebar/20 transition-all">
                            <button
                              type="button"
                              onClick={() => toggleAppExpanded(item.id)}
                              className="p-1 hover:bg-brand-sidebar/40 shrink-0"
                              title="Ver lançamentos"
                            >
                              {isItemOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                            <span className="w-7 h-7 border border-brand-border/40 flex items-center justify-center text-[10px] font-black shrink-0">
                              %
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-mono font-bold truncate">{app.name}</p>
                              <p className="text-[9px] uppercase tracking-wide opacity-50 truncate">
                                {app.index} · {app.rate}% · Juros {formatCurrency(summary.juros)} · IRRF{' '}
                                {formatCurrency(summary.irrf)} · IOF {formatCurrency(summary.iof)}
                              </p>
                            </div>
                            <p className="text-[11px] font-mono font-black shrink-0">{formatCurrency(app.amount)}</p>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              className="p-1 text-red-600 hover:bg-red-50 transition-colors shrink-0"
                              title="Excluir"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          {isItemOpen ? renderLancamentosPanel(item) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className={cn(embedded ? 'space-y-6 min-w-0' : 'p-8 max-w-7xl mx-auto space-y-8')}>
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-brand-border pb-4 gap-4">
        {!embedded ? (
          <div>
            <h1 className="text-2xl font-black italic tracking-tighter uppercase">Aplicações Financeiras</h1>
            <p className="text-[10px] font-bold uppercase opacity-50 tracking-widest">
              Controle de Ativos e Yield — {selectedCompany}
            </p>
          </div>
        ) : (
          <div className="min-w-0" />
        )}
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="technical-button-primary flex items-center gap-2 shadow-[2px_2px_0_0_rgba(0,0,0,0.2)]"
          >
            <Plus size={14} />
            {showAddForm ? 'FECHAR FORMULÁRIO' : 'REGISTRAR ATIVO'}
          </button>
          {apps.length > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              className="technical-button flex items-center gap-1.5 border-red-800 text-red-800 hover:bg-red-800 hover:text-white"
            >
              <Trash2 size={14} />
              LIMPAR TUDO
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex border border-brand-border bg-brand-sidebar/30 p-1 w-fit">
        {mainTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setAppsMainTab(tab.id)}
            className={cn(
              'px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all',
              appsMainTab === tab.id
                ? 'bg-brand-border text-brand-bg shadow-[2px_2px_0_0_rgba(0,0,0,0.2)]'
                : 'text-brand-text/60 hover:bg-brand-border/10',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          {appsMainTab === 'carteira'
            ? renderCarteiraTab()
            : appsMainTab === 'extrato'
              ? renderExtratoTab()
              : (
                <AppsContasTab
                  selectedCompany={selectedCompany}
                  items={savedApps}
                  onSave={persistForSindicato}
                />
              )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="technical-panel p-5 shadow-[4px_4px_0_0_#141414] space-y-2">
            <div className="flex items-center gap-2 text-brand-border">
              <PieChart size={16} />
              <h4 className="text-[10px] font-black uppercase tracking-widest">Resumo do Sindicato</h4>
            </div>
            <p className="text-[10px] font-mono opacity-60">{savedApps.length} aplicações carregadas</p>
            <p className="text-lg font-mono font-black">{formatCurrency(totalAllocated)}</p>
          </div>

          <DataIngestionBox
            dataType="apps"
            title="Recortar PDF de Aplicações"
            selectedCompany={selectedCompany}
            ingestionMode="pdfOnly"
            onImport={(newItems) => {
              const importedApps = (newItems as CompanyApp[]).map((item) =>
                buildSavedAplicacao(
                  {
                    ...item,
                    id: item.id || crypto.randomUUID(),
                    folder: item.folder || 'GERAL',
                  },
                  selectedCompany,
                ),
              );
              persistForSindicato([...savedApps, ...importedApps]);
            }}
          />
        </div>
      </div>
    </div>
  );
}
