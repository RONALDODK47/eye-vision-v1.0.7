import React, { lazy, Suspense, useState, useEffect, useMemo, useCallback, useRef, startTransition } from 'react';
import { 
  Plus, 
  FileSpreadsheet, 
  Download, 
  Search, 
  Filter,
  BarChart,
  BookOpen,
  ClipboardList,
  Building,
  ArrowRightLeft,
  Trash2,
  Database,
  Lock,
  Building2,
  FileText,
  Layers,
  Percent,
  DollarSign,
  BookMarked,
  Scale,
  X,
  FileImage,
  RefreshCw,
  ListOrdered,
  Sparkles,
  FolderOpen,
  Save,
} from 'lucide-react';
import type { ExtratoConciliacaoResumo } from '../logic/ocrImportMapper';
import { cn, formatCurrency, formatDate } from '../lib/utils';
import { deferIdle } from '../lib/deferIdle';
import { beginHeavyUiWork, endHeavyUiWork } from '../lib/uiFluidity';
import { patchDebugContext } from '../agent/debugContext';
import { registerManagerTabBot } from '../tabBot/registerModuleBots';
import { FreeNumericInput } from './FreeNumericInput';
import {
  CF_FIELD_COL,
  CF_FIELD_COL_GROW,
  CF_FIELD_ROW,
  CF_FORM_FIELDS,
  CF_FORM_INPUT_DATE,
  CF_FORM_INPUT_LONG,
  CF_FORM_INPUT_MED,
  CF_FORM_INPUT_MONEY,
  CF_FORM_INPUT_NUM,
  CF_FORM_INPUT_SHORT,
  CF_FORM_SELECT,
  CF_INPUT_ACCOUNT,
  CF_SELECT_WIDE,
} from '../lib/formFieldClasses';
import DataIngestionBox from './DataIngestionBox';
import BalanceteTabPanel from './BalanceteTabPanel';
import {
  readManagerData,
  writeManagerData,
  writeManagerDataNow,
  flushManagerDataWrites,
  normalizeCompanyName,
  companyStorageSlug,
  isSameCompanyScope,
} from '../logic/companyWorkspace';
import { flushPersistenceAfterCriticalWrite } from '../logic/eyeVisionPersistenceFlush';
import PlanoContasVirtualTable from './PlanoContasVirtualTable';
import ExtratoLancamentosVirtualTable from './ExtratoLancamentosVirtualTable';
import ExtratoSemNotaModal from './ExtratoSemNotaModal';
import ExtratoRegrasContasModal from './ExtratoRegrasContasModal';
import AiInteligenciaPastasModal from './AiInteligenciaPastasModal';
import ExtratoPastasModal from './ExtratoPastasModal';
import {
  countExtratoPastas,
  saveExtratoNaPasta,
  type ExtratoPastaItem,
} from '../logic/extratoPastasStorage';
import {
  listAiColigadasParaIa,
  migrateAiInteligenciaOutOfLocalStorage,
  upsertAiColigada,
} from '../logic/aiInteligenciaStorage';
import { reclaimLocalStorageSpace } from '../../lib/safeLocalStorage';
import {
  buildPlanoNomeLookup,
  resolveContaNome,
} from './ExtratoContaPicker';
import { FolhaRelatorioVirtualTable } from './FolhaVirtualTables';
import FiscalModule from './FiscalModule';
import NotaExplicativaTab from './NotaExplicativaTab';
import {
  buildTxtPlusFromExtratoRows,
  buildTxtPlusFromFolhaRelatorio,
  buildTxtPlusFromRazaoVision,
  downloadTxtPlusDominio,
} from '../logic/dominioTxtIO';
import {
  cleanStoredCodigoReduzido,
  codeLengthToPlanoLevel,
  buildDominioPlanoTxtFromAccounts,
  derivePlanoGroupFromCode,
  derivePlanoNatureFromGroup,
  migrateExtratoContasParaCodigoReduzido,
  normalizeExtratoContaParaGravacao,
  sanitizeCodigoReduzido,
} from '../logic/planoContasMapper';
import { migrateLegacyBalanceteToRazao, normalizeRazaoImport } from '../logic/contabilPipeline';
import {
  applyExtratoContaResolver,
  applyExtratoContaResolverAsync,
  findContaBancoNoPlano,
  type ExtratoSemNotaPendingRow,
} from '../logic/extratoContaResolver';
import { buildExtratoFiscalContext } from '../logic/extratoFiscalContext';
import { tryAutoSyncFiscalSpedOnOpen } from '../logic/fiscalSpedAutomation';
import { tryAutoSyncFiscalPgdasOnOpen } from '../logic/fiscalPgdasAutomation';
import { postFolhaNoRazao } from '../logic/folhaAutomation';
import FolhaModule from './FolhaModule';
import MandarParaBalanceteButton from './MandarParaBalanceteButton';
import {
  FOLHA_PDF_VARIANTS,
  folhaVariantDescriptionPrefix,
} from '../logic/ocrColunasConfig';
import HonorariosModule from './HonorariosModule';
import {
  loadExtratoSemNotaDecisions,
  saveExtratoSemNotaDecisions,
  type ExtratoSemNotaDecisions,
  type ExtratoSemNotaPolicy,
} from '../logic/extratoSemNotaStorage';
import {
  loadExtratoRegrasContas,
  filterExtratoRegrasPorBanco,
  migrateExtratoRegrasParaCodigoReduzido,
  saveExtratoRegrasBancoSelecionado,
  saveExtratoRegrasContas,
  type ExtratoRegraConta,
} from '../logic/extratoRegrasContasStorage';
import {
  corrigeRegrasContasOperacionaisInadequadas,
} from '../logic/extratoRegrasCobertura';
import {
  loadExtratoContaMappingCache,
  saveExtratoContaMappingCache,
} from '../logic/extratoContaMappingStorage';
import { getExtratoBancoConta, getExtratoBancoNome, setExtratoContaBancoAtiva } from '../logic/extratoOcrLayoutStorage';
import {
  readPersistedLocalStorageJson,
  writePersistedLocalStorageJson,
} from '../../lib/persistentLocalStorage';
import {
  exportExtratoConciliacaoPdf,
  exportExtratoConciliacaoPng,
  buildExtratoConciliacaoPdfBase64,
} from '../logic/extratoConciliacaoExport';
import {
  filterExtratoByConciliacaoFiltro,
  summarizeExtratoConciliacao,
  syncExtratoConciliacaoStatus,
  type ExtratoConciliacaoFiltro,
} from '../logic/extratoConciliacaoBank';
import {
  calcSaldoConciliadoAteMomento,
  resolveSaldoFinalExtrato,
  sumExtratoPlacarTotais,
  sumExtratoPlacarTotaisConciliados,
} from '../logic/extratoPlacarTotals';
import { postExtratoConciliadosNoRazao } from '../logic/extratoBalanceteAutomation';
import { readReceitaFederalRegras } from '../../extratoVision/utils/receitaFederalRegras';
import { readFiscalContaMap } from '../../extratoVision/utils/fiscalContaMapping';
import { loadFiscalContasImposto } from '../logic/fiscalContasImpostoStorage';
import { warmupSharedOcrWorker } from '../../lib/imageOcrExtract';
import type { VisionBalanceteRow } from '../../extratoVision/types/accounting';
import TabLoadingFallback from './TabLoadingFallback';
import { ActiveCompanySelector } from './ActiveCompanySelector';
import type { CompanyWorkspaceControls } from '../types/companyWorkspaceControls';

const LoanModule = lazy(() => import('./LoanModule'));
const InstallmentModule = lazy(() => import('./InstallmentModule'));
const AppsModule = lazy(() => import('./AppsModule'));
const AiSettingsModule = lazy(() => import('./AiSettingsModule'));

export type ManagerSubTab =
  | 'extrato'
  | 'plano'
  | 'razao'
  | 'folha'
  | 'honorarios'
  | 'fiscal'
  | 'demonstracoes'
  | 'nota_explicativa'
  | 'emprestimos'
  | 'parcelamento'
  | 'aplicacoes'
  | 'ia';

const STANDALONE_MANAGER_TABS = new Set<ManagerSubTab>([
  'extrato',
  'plano',
  'nota_explicativa',
  'emprestimos',
  'parcelamento',
  'aplicacoes',
  'ia',
]);

function managerSubTabLabel(tab: ManagerSubTab): string {
  switch (tab) {
    case 'extrato':
      return 'Conciliador de Extratos';
    case 'plano':
      return 'Mapa de Plano de Contas';
    case 'razao':
      return 'Balancete';
    case 'fiscal':
      return 'Fiscal / Impostos';
    case 'folha':
      return 'Folha de Pagamento';
    case 'honorarios':
      return 'Honorários';
    case 'demonstracoes':
      return 'Demonstrações';
    case 'nota_explicativa':
      return 'Nota Explicativa';
    case 'emprestimos':
      return 'Empréstimos';
    case 'parcelamento':
      return 'Parcelamento';
    case 'aplicacoes':
      return 'Aplicações de empréstimo';
    case 'ia':
      return 'Configuração de IA';
    default:
      return tab;
  }
}

interface AccountPlan {
  code: string;
  name: string;
  codigoReduzido?: string;
  tipo?: 'S' | 'A';
  nivel?: number;
  group?: 'ATIVO' | 'PASSIVO' | 'PATRIMONIO_LIQUIDO' | 'RECEITA' | 'DESPESA';
  nature?: 'DEVEDORA' | 'CREDORA';
}

interface BalanceteRow {
  id: string;
  dataInicio: string;
  codigo: string;
  classificacao: string;
  descricao: string;
  tipo?: 'S' | 'A';
  saldoInicial: number;
  debito: number;
  credito: number;
  saldoFinal: number;
  natureza: 'D' | 'C';
}

interface BankStatement {
  id: string;
  date: string;
  description: string;
  value: number;
  nature: 'D' | 'C';
  accountCode: string;
  accountDebit?: string;
  accountCredit?: string;
  operationName?: string;
  status: 'CONCILIADO' | 'PENDENTE';
}

interface FolhaRelatorioRow {
  id: string;
  date: string;
  description: string;
  debito: number;
  credito: number;
}

interface PayrollRecord {
  id: string;
  name: string;
  baseSalary: number;
  inss: number;
  fgts: number;
  irrf: number;
  net: number;
}

export interface ManagerModuleProps extends CompanyWorkspaceControls {
  storageVersion?: number;
  initialSubTab?: ManagerSubTab;
}

export default function ManagerModule({
  selectedCompany,
  companyOptions,
  onCompanyChange,
  onCreateCompany,
  onRenameCompany,
  onDeleteCompany,
  storageVersion = 0,
  initialSubTab,
}: ManagerModuleProps) {
  const [activeSubTab, setActiveSubTab] = useState<ManagerSubTab>(initialSubTab ?? 'extrato');

  useEffect(() => {
    if (initialSubTab) setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    patchDebugContext({
      module: 'manager',
      moduleLabel: 'Gerencial',
      subTab: activeSubTab,
      subTabLabel: managerSubTabLabel(activeSubTab),
      company: selectedCompany || undefined,
    });
  }, [activeSubTab, selectedCompany]);
  
  // Local states
  const [planoContas, setPlanoContas] = useState<AccountPlan[]>([]);
  const [extratoLancamentos, setExtratoLancamentos] = useState<BankStatement[]>([]);
  const [folhaPayroll, setFolhaPayroll] = useState<PayrollRecord[]>([]);
  const [folhaRelatorio, setFolhaRelatorio] = useState<FolhaRelatorioRow[]>([]);
  const [razaoRows, setRazaoRows] = useState<VisionBalanceteRow[]>([]);
  
  // Interactive inputs for entries
  const [showAddPlano, setShowAddPlano] = useState(false);
  const [showAddExtrato, setShowAddExtrato] = useState(false);
  const [folhaPdfVariant, setFolhaPdfVariant] = useState(FOLHA_PDF_VARIANTS[0]!.id);
  const [extratoContaCache, setExtratoContaCache] = useState<
    ReturnType<typeof loadExtratoContaMappingCache>
  >({});
  const [extratoConciliacao, setExtratoConciliacao] = useState<ExtratoConciliacaoResumo | null>(null);
  const [semNotaDecisions, setSemNotaDecisions] = useState<ExtratoSemNotaDecisions>({});
  const [semNotaModalOpen, setSemNotaModalOpen] = useState(false);
  const [fiscalSpedVersion, setFiscalSpedVersion] = useState(0);
  const [pendingSemNotaRows, setPendingSemNotaRows] = useState<ExtratoSemNotaPendingRow[]>([]);
  const [extratoRegrasContas, setExtratoRegrasContas] = useState<ExtratoRegraConta[]>([]);
  const [regrasContasModalOpen, setRegrasContasModalOpen] = useState(false);
  const [inteligenciaModalOpen, setInteligenciaModalOpen] = useState(false);
  const [inteligenciaTick, setInteligenciaTick] = useState(0);
  const [extratoPastasModalOpen, setExtratoPastasModalOpen] = useState(false);
  const [extratoPastasTick, setExtratoPastasTick] = useState(0);
  const [contaBancoTick, setContaBancoTick] = useState(0);
  // New Account state
  const [accCode, setAccCode] = useState('');
  const [accReduzido, setAccReduzido] = useState('');
  const [accName, setAccName] = useState('');
  const [accTipo, setAccTipo] = useState<'S' | 'A' | ''>('');
  const [accNivel, setAccNivel] = useState('');

  // New Extrato state
  const [extDate, setExtDate] = useState(new Date().toISOString().split('T')[0]);
  const [extDesc, setExtDesc] = useState('');
  const [extVal, setExtVal] = useState(0);
  const [extNat, setExtNat] = useState<'D' | 'C'>('D');

  const [saldoAnteriorExtrato, setSaldoAnteriorExtrato] = useState(0);
  const [extratoConciliacaoFiltro, setExtratoConciliacaoFiltro] =
    useState<ExtratoConciliacaoFiltro>('todas');

  const extratoLancamentosRef = useRef(extratoLancamentos);
  extratoLancamentosRef.current = extratoLancamentos;
  const planoContasRef = useRef(planoContas);
  planoContasRef.current = planoContas;
  const folhaPayrollRef = useRef(folhaPayroll);
  folhaPayrollRef.current = folhaPayroll;
  const folhaRelatorioRef = useRef(folhaRelatorio);
  folhaRelatorioRef.current = folhaRelatorio;
  const razaoRowsRef = useRef(razaoRows);
  razaoRowsRef.current = razaoRows;
  const saldoAnteriorExtratoRef = useRef(saldoAnteriorExtrato);
  saldoAnteriorExtratoRef.current = saldoAnteriorExtrato;
  const extratoContaCacheRef = useRef(extratoContaCache);
  extratoContaCacheRef.current = extratoContaCache;

  useEffect(() => {
    const companyScope = selectedCompany;
    return () => {
      if (!companyScope) return;
      const extrato = syncExtratoConciliacaoStatus(extratoLancamentosRef.current);
      if (extrato.length > 0) writeManagerDataNow(companyScope, 'extrato', extrato);
      if (planoContasRef.current.length > 0) {
        writeManagerDataNow(companyScope, 'plano', planoContasRef.current);
      }
      if (folhaPayrollRef.current.length > 0) {
        writeManagerDataNow(companyScope, 'folha', folhaPayrollRef.current);
      }
      if (folhaRelatorioRef.current.length > 0) {
        writeManagerDataNow(companyScope, 'folhaRelatorio', folhaRelatorioRef.current);
      }
      if (razaoRowsRef.current.length > 0) {
        writeManagerDataNow(companyScope, 'razao', razaoRowsRef.current);
      }
      writeSaldoAnteriorExtrato(companyScope, saldoAnteriorExtratoRef.current);
      saveExtratoContaMappingCache(companyScope, extratoContaCacheRef.current);
      flushManagerDataWrites();
    };
  }, [selectedCompany]);

  const extratoFiscalContext = useMemo(
    () => buildExtratoFiscalContext(selectedCompany),
    [selectedCompany, storageVersion, fiscalSpedVersion],
  );

  useEffect(() => {
    void tryAutoSyncFiscalSpedOnOpen(selectedCompany);
    void tryAutoSyncFiscalPgdasOnOpen(selectedCompany);
  }, [selectedCompany]);

  useEffect(() => {
    const onFiscalSped = () => setFiscalSpedVersion((v) => v + 1);
    const onFiscalPgdas = () => setFiscalSpedVersion((v) => v + 1);
    window.addEventListener('contabilfacil-fiscal-sped-updated', onFiscalSped);
    window.addEventListener('contabilfacil-fiscal-pgdas-updated', onFiscalPgdas);
    return () => {
      window.removeEventListener('contabilfacil-fiscal-sped-updated', onFiscalSped);
      window.removeEventListener('contabilfacil-fiscal-pgdas-updated', onFiscalPgdas);
    };
  }, []);

  useEffect(() => {
    const onBanco = (ev: Event) => {
      const detail = (ev as CustomEvent<{ company?: string; contaBanco?: string }>).detail;
      if (detail?.company && detail.company !== selectedCompany) return;
      if (detail?.contaBanco?.trim()) {
        saveExtratoRegrasBancoSelecionado(selectedCompany, detail.contaBanco.trim());
      }
      setContaBancoTick((n) => n + 1);
    };
    window.addEventListener('contabilfacil-extrato-banco-updated', onBanco);
    return () => window.removeEventListener('contabilfacil-extrato-banco-updated', onBanco);
  }, [selectedCompany]);

  useEffect(() => registerManagerTabBot(selectedCompany), [selectedCompany, storageVersion]);

  const reloadFolhaFromStorage = useCallback(() => {
    setFolhaPayroll(readManagerData<PayrollRecord>(selectedCompany, 'folha'));
    setFolhaRelatorio(readManagerData<FolhaRelatorioRow>(selectedCompany, 'folhaRelatorio'));
    setRazaoRows(readManagerData<VisionBalanceteRow>(selectedCompany, 'razao'));
  }, [selectedCompany]);

  const handleMandarFolhaParaBalancete = useCallback(() => {
    const hasData = folhaRelatorio.length > 0 || folhaPayroll.length > 0;
    if (!hasData) {
      alert('Nenhum dado de folha importado para enviar ao balancete.');
      return;
    }
    try {
      const { gerados, pendencias } = postFolhaNoRazao(selectedCompany);
      setRazaoRows(readManagerData<VisionBalanceteRow>(selectedCompany, 'razao'));
      void flushPersistenceAfterCriticalWrite();
      if (pendencias.length && gerados <= 0) {
        alert(pendencias.slice(0, 5).join('\n'));
        return;
      }
      alert(
        gerados > 0
          ? `${gerados} lançamento(s) da folha enviados ao balancete.\n\nAbra a aba Balancete para conferir.`
          : 'Nada novo para enviar — já estavam no balancete (ou configure as contas).',
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao enviar para o balancete.');
    }
  }, [folhaPayroll.length, folhaRelatorio.length, selectedCompany]);

  useEffect(() => {
    const onFolha = (ev: Event) => {
      const detail = (ev as CustomEvent<{ company?: string }>).detail;
      if (
        detail?.company &&
        normalizeCompanyName(detail.company) !== normalizeCompanyName(selectedCompany)
      ) {
        return;
      }
      reloadFolhaFromStorage();
    };
    window.addEventListener('contabilfacil-folha-updated', onFolha);
    return () => window.removeEventListener('contabilfacil-folha-updated', onFolha);
  }, [selectedCompany, reloadFolhaFromStorage]);

  useEffect(() => {
    if (!selectedCompany) return;
    setSemNotaDecisions(loadExtratoSemNotaDecisions(selectedCompany));
    const planoLike = planoContas.map((a) => ({
      code: a.code,
      name: a.name,
      codigoReduzido: a.codigoReduzido,
    }));
    const loaded = loadExtratoRegrasContas(selectedCompany, getExtratoBancoConta(selectedCompany));
    let migrated =
      planoLike.length > 0 ? migrateExtratoRegrasParaCodigoReduzido(selectedCompany, planoLike) : loaded;
    if (planoLike.length > 0) {
      const corrigidas = corrigeRegrasContasOperacionaisInadequadas({
        regras: migrated,
        plano: planoLike,
        coligadas: listAiColigadasParaIa(selectedCompany),
      });
      if (corrigidas !== migrated) {
        migrated = saveExtratoRegrasContas(selectedCompany, corrigidas);
      }
    }
    setExtratoRegrasContas(migrated);
  }, [selectedCompany, storageVersion, planoContas.length]);

  const contaBancoExtratoAtivo = useMemo(
    () => getExtratoBancoConta(selectedCompany),
    [selectedCompany, storageVersion, contaBancoTick],
  );

  const regrasContasDoBancoAtivo = useMemo(
    () => filterExtratoRegrasPorBanco(extratoRegrasContas, contaBancoExtratoAtivo),
    [extratoRegrasContas, contaBancoExtratoAtivo],
  );

  const extratoPastasCount = useMemo(
    () => countExtratoPastas(selectedCompany),
    [selectedCompany, extratoPastasTick, storageVersion],
  );

  const extratoResolverOptions = useMemo(
    () => ({
      contaBancoPreferida: getExtratoBancoConta(selectedCompany),
      rfStore: readReceitaFederalRegras(selectedCompany),
      fiscalMap: readFiscalContaMap(selectedCompany),
      fiscalContas: loadFiscalContasImposto(selectedCompany),
      fiscalContext: extratoFiscalContext,
      semNotaDecisions,
      regrasContas: extratoRegrasContas,
      coligadas: listAiColigadasParaIa(selectedCompany),
    }),
    [
      selectedCompany,
      storageVersion,
      contaBancoTick,
      activeSubTab,
      extratoFiscalContext,
      semNotaDecisions,
      extratoRegrasContas,
      inteligenciaTick,
    ],
  );

  // Garante AJTF cadastrada como coligada (não cliente) se ainda não existir.
  // Também migra textos grandes da inteligência para IndexedDB (libera cota do localStorage).
  useEffect(() => {
    if (!selectedCompany) return;
    try {
      reclaimLocalStorageSpace();
      migrateAiInteligenciaOutOfLocalStorage(selectedCompany);
    } catch {
      /* ignore */
    }
    const cols = listAiColigadasParaIa(selectedCompany);
    const hasAjtf = cols.some(
      (c) =>
        /ajtf/i.test(c.nome) ||
        c.aliases.some((a) => /a[\s.]*j[\s.]*t[\s.]*f/i.test(a) || /^ajtf$/i.test(a)),
    );
    if (!hasAjtf) {
      upsertAiColigada(selectedCompany, {
        nome: 'AJTF',
        aliases: ['AJTF', 'A.J.T.F', 'A J T F', 'A. J. T. F', 'A.J.T.F.'],
        notas: 'Empresa coligada — NÃO é cliente',
      });
      setInteligenciaTick((n) => n + 1);
    }
  }, [selectedCompany]);

  /**
   * Persiste extrato localmente. NÃO manda ao balancete — só o botão explícito.
   * `immediate=false` (padrão em edição de linha): debounce no LS para não travar o browser.
   */
  const saveExtratoLocal = useCallback(
    (list: BankStatement[], immediate = false, companyScope = selectedCompany) => {
      const withStatus = syncExtratoConciliacaoStatus(list);
      if (!isSameCompanyScope(companyScope, selectedCompany)) {
        writeManagerDataNow(companyScope, 'extrato', withStatus);
        return;
      }
      if (immediate) {
        startTransition(() => setExtratoLancamentos(withStatus));
        const persist = () => {
          writeManagerDataNow(companyScope, 'extrato', withStatus);
          void flushPersistenceAfterCriticalWrite();
        };
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(persist, { timeout: 900 });
        } else {
          setTimeout(persist, 0);
        }
      } else {
        startTransition(() => setExtratoLancamentos(withStatus));
        writeManagerData(companyScope, 'extrato', withStatus);
      }
    },
    [selectedCompany],
  );

  const notifyPendingSemNota = useCallback((pendingSemNota: ExtratoSemNotaPendingRow[]) => {
    if (pendingSemNota.length > 0) {
      setPendingSemNotaRows(pendingSemNota);
      setSemNotaModalOpen(true);
    }
  }, []);

  const commitExtratoResolverResult = useCallback(
    (
      companyScope: string,
      rows: BankStatement[],
      cache: typeof extratoContaCache,
      pendingSemNota: ExtratoSemNotaPendingRow[],
      options?: { immediate?: boolean },
    ) => {
      writeManagerData(
        companyScope,
        'extrato',
        syncExtratoConciliacaoStatus(rows),
      );
      if (!isSameCompanyScope(companyScope, selectedCompany)) return;
      setExtratoContaCache(cache);
      saveExtratoContaMappingCache(companyScope, cache);
      saveExtratoLocal(rows, options?.immediate ?? false, companyScope);
      notifyPendingSemNota(pendingSemNota);
    },
    [notifyPendingSemNota, saveExtratoLocal, selectedCompany],
  );

  const handleSemNotaModalConfirm = async (decisions: Record<string, ExtratoSemNotaPolicy>) => {
    const companyScope = selectedCompany;
    const merged = { ...semNotaDecisions, ...decisions };
    saveExtratoSemNotaDecisions(companyScope, merged);
    setSemNotaDecisions(merged);
    setSemNotaModalOpen(false);
    setPendingSemNotaRows([]);
    const { rows, cache, pendingSemNota } = await applyExtratoContaResolverAsync(
      extratoLancamentos,
      planoParaResolver,
      extratoContaCache,
      { ...extratoResolverOptions, semNotaDecisions: merged },
    );
    if (!isSameCompanyScope(companyScope, selectedCompany)) return;
    commitExtratoResolverResult(companyScope, rows, cache, pendingSemNota);
  };

  function extratoSaldoAnteriorStorageKey(company: string): string {
    return `contabilfacil_${companyStorageSlug(company)}_extrato_saldo_anterior`;
  }

  function readSaldoAnteriorExtrato(company: string): number {
    try {
      const raw = readPersistedLocalStorageJson<string | number | null>(
        extratoSaldoAnteriorStorageKey(company),
        null,
      );
      if (raw == null) return 0;
      if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
      if (!String(raw).trim()) return 0;
      const n = parseFloat(String(raw));
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  function writeSaldoAnteriorExtrato(company: string, value: number): void {
    const n = Number.isFinite(value) ? value : 0;
    writePersistedLocalStorageJson(
      extratoSaldoAnteriorStorageKey(company),
      n === 0 ? null : n,
    );
  }

  const handleExtratoConciliacao = useCallback(
    (conc: ExtratoConciliacaoResumo) => {
      setExtratoConciliacao(conc);
      if (Number.isFinite(conc.saldoAnterior)) {
        setSaldoAnteriorExtrato(conc.saldoAnterior);
        writeSaldoAnteriorExtrato(selectedCompany, conc.saldoAnterior);
      }
    },
    [selectedCompany],
  );

  useEffect(() => {
    const onBeforeUnload = () => flushManagerDataWrites();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      flushManagerDataWrites();
    };
  }, []);

  // Plano primeiro (UI responsiva); extrato/razão/folha após pintura.
  useEffect(() => {
    const companyScope = selectedCompany;
    if (!companyScope) return;

    let cancelled = false;
    const canApply = () => !cancelled && isSameCompanyScope(companyScope, selectedCompany);

    const loadPlano = () => {
      if (!canApply()) return;
      const rawPlano = readManagerData<AccountPlan>(companyScope, 'plano');
      const storedPlano = rawPlano.map((acc) => ({
        ...acc,
        codigoReduzido: cleanStoredCodigoReduzido(acc.codigoReduzido, acc.code),
      }));
      if (!canApply()) return;
      setPlanoContas(storedPlano);
      if (
        rawPlano.some(
          (acc, i) => (acc.codigoReduzido ?? '') !== (storedPlano[i]?.codigoReduzido ?? ''),
        )
      ) {
        writeManagerData(companyScope, 'plano', storedPlano);
      }
    };

    const loadOperationalData = () => {
      if (!canApply()) return;
      try {
        const storedPlano = readManagerData<AccountPlan>(companyScope, 'plano').map((acc) => ({
          ...acc,
          codigoReduzido: cleanStoredCodigoReduzido(acc.codigoReduzido, acc.code),
        }));
        const storedExtrato = readManagerData<BankStatement>(companyScope, 'extrato');
        const loadedCache = loadExtratoContaMappingCache(companyScope);
        const extratoMigrado = migrateExtratoContasParaCodigoReduzido(storedExtrato, storedPlano);
        if (extratoMigrado !== storedExtrato) {
          writeManagerDataNow(companyScope, 'extrato', extratoMigrado);
        }
        if (!canApply()) return;
        const extratoComStatus = syncExtratoConciliacaoStatus(extratoMigrado);
        setExtratoLancamentos(extratoComStatus);
        setExtratoContaCache(loadedCache);
        setSaldoAnteriorExtrato(readSaldoAnteriorExtrato(companyScope));
        setFolhaPayroll(readManagerData<PayrollRecord>(companyScope, 'folha'));
        setFolhaRelatorio(readManagerData<FolhaRelatorioRow>(companyScope, 'folhaRelatorio'));
        const storedRazao = normalizeRazaoImport(readManagerData<VisionBalanceteRow>(companyScope, 'razao'));
        if (storedRazao.length > 0) {
          setRazaoRows(storedRazao);
          writeManagerData(companyScope, 'razao', storedRazao);
        } else {
          const legacyBalancete = readManagerData<BalanceteRow>(companyScope, 'balancete');
          if (legacyBalancete.length > 0) {
            const migrated = migrateLegacyBalanceteToRazao(legacyBalancete);
            setRazaoRows(migrated);
            writeManagerData(companyScope, 'razao', migrated);
          } else {
            setRazaoRows([]);
          }
        }
      } catch (e) {
        console.error('Erro ao carregar dados gerenciais:', e);
      }
    };

    try {
      loadPlano();
      deferIdle(loadOperationalData, 400);
    } catch (e) {
      console.error('Erro ao carregar plano de contas:', e);
    }

    return () => {
      cancelled = true;
    };
  }, [storageVersion, selectedCompany]);

  useEffect(() => {
    const onRazaoAtualizado = (ev: Event) => {
      const detail = (ev as CustomEvent<{ company?: string }>).detail;
      if (detail?.company && normalizeCompanyName(detail.company) !== normalizeCompanyName(selectedCompany)) {
        return;
      }
      setRazaoRows(readManagerData<VisionBalanceteRow>(selectedCompany, 'razao'));
    };
    window.addEventListener('contabilfacil-razao-updated', onRazaoAtualizado);
    return () => window.removeEventListener('contabilfacil-razao-updated', onRazaoAtualizado);
  }, [selectedCompany]);

  useEffect(() => {
    if (activeSubTab === 'extrato') warmupSharedOcrWorker();
  }, [activeSubTab]);

  const savePlano = (list: AccountPlan[]) => {
    setPlanoContas(list);
    writeManagerDataNow(selectedCompany, 'plano', list);
    void flushPersistenceAfterCriticalWrite();
  };

  const saveExtrato = (list: BankStatement[]) => {
    setExtratoLancamentos(list);
    writeManagerDataNow(selectedCompany, 'extrato', list);
    void flushPersistenceAfterCriticalWrite();
  };

  const saveFolha = (list: PayrollRecord[]) => {
    setFolhaPayroll(list);
    writeManagerDataNow(selectedCompany, 'folha', list);
    void flushPersistenceAfterCriticalWrite();
  };

  const saveFolhaRelatorio = (list: FolhaRelatorioRow[]) => {
    setFolhaRelatorio(list);
    writeManagerDataNow(selectedCompany, 'folhaRelatorio', list);
    void flushPersistenceAfterCriticalWrite();
  };

  const saveRazao = (list: VisionBalanceteRow[]) => {
    const normalized = normalizeRazaoImport(list);
    setRazaoRows(normalized);
    writeManagerDataNow(selectedCompany, 'razao', normalized);
    void flushPersistenceAfterCriticalWrite();
  };

  const codeLengthToLevel = (code: string): number => {
    const len = code.replace(/\D/g, '').length;
    if (len <= 1) return 1;
    if (len <= 2) return 2;
    if (len <= 3) return 3;
    if (len <= 5) return 4;
    if (len <= 10) return 5;
    return 6;
  };

  const handleAddPlanoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accCode || !accName) return;
    const group = derivePlanoGroupFromCode(accCode);
    const item: AccountPlan = {
      code: accCode,
      name: accName.toUpperCase(),
      codigoReduzido: sanitizeCodigoReduzido(accReduzido.trim()) || undefined,
      tipo: accTipo || undefined,
      nivel: accNivel ? parseInt(accNivel, 10) : codeLengthToPlanoLevel(accCode),
      group,
      nature: derivePlanoNatureFromGroup(group),
    };
    savePlano([...planoContas, item]);
    setAccCode('');
    setAccReduzido('');
    setAccName('');
    setAccTipo('');
    setAccNivel('');
    setShowAddPlano(false);
  };

  const extratoPlanoOptions = useMemo(
    () =>
      planoContas
        .filter((a) => a.tipo !== 'S')
        .map((a) => ({
          code: a.code,
          name: a.name,
          codigoReduzido: a.codigoReduzido,
          tipo: a.tipo,
          nivel: a.nivel,
          group: a.group,
        })),
    [planoContas],
  );

  /** Plano completo (inclui sintéticas) — nomes, grupos e hierarquia para regras/IA. */
  const extratoPlanoNomeOptions = useMemo(
    () =>
      planoContas.map((a) => ({
        code: a.code,
        name: a.name,
        codigoReduzido: a.codigoReduzido,
        tipo: a.tipo,
        nivel: a.nivel,
        group: a.group,
      })),
    [planoContas],
  );

  const extratoBancoPlanoOptions = useMemo(
    () =>
      extratoPlanoOptions.filter((a) =>
        /BANCO|CRESOL|SICOOB|BRADESCO|ITAU|CAIXA ECON|BB\b|CONTA\s+MOV/i.test(a.name),
      ),
    [extratoPlanoOptions],
  );

  const extratoContrapartidaPlanoOptions = useMemo(
    () => extratoPlanoOptions.filter((a) => !/^\s*BANCO\b|\bCAIXA\b/i.test(a.name)),
    [extratoPlanoOptions],
  );

  const planoParaResolver = useMemo(
    () =>
      planoContas.map((a) => ({
        code: a.code,
        name: a.name,
        codigoReduzido: a.codigoReduzido,
        tipo: a.tipo,
        group: a.group,
      })),
    [planoContas],
  );

  const deleteExtrato = useCallback(
    (id: string) => {
      setExtratoLancamentos((prev) => {
        const next = syncExtratoConciliacaoStatus(prev.filter((b) => b.id !== id));
        writeManagerDataNow(selectedCompany, 'extrato', next);
        return next;
      });
    },
    [selectedCompany],
  );

  const handleAddExtratoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!extDesc || extVal <= 0) return;
    const draft: BankStatement = {
      id: crypto.randomUUID(),
      date: extDate,
      description: extDesc.toUpperCase(),
      value: extVal,
      nature: extNat,
      accountCode: '',
      accountDebit: '',
      accountCredit: '',
      operationName: extDesc.toUpperCase(),
      status: 'PENDENTE',
    };
    const { rows, cache: nextCache, pendingSemNota } = applyExtratoContaResolver(
      [draft],
      planoParaResolver,
      extratoContaCache,
      extratoResolverOptions,
    );
    const item = rows[0] ?? draft;
    if (nextCache !== extratoContaCache) {
      setExtratoContaCache(nextCache);
      saveExtratoContaMappingCache(selectedCompany, nextCache);
    }
    saveExtratoLocal([...extratoLancamentos, item]);
    notifyPendingSemNota(pendingSemNota);
    setExtDesc('');
    setExtVal(0);
    setShowAddExtrato(false);
  };

  // Delete handlers
  const deleteAccount = (code: string) => {
    savePlano(planoContas.filter(a => a.code !== code));
  };

  const deleteFolhaRelatorio = (id: string) => {
    saveFolhaRelatorio(folhaRelatorio.filter((row) => row.id !== id));
  };

  const extratoConciliacaoStats = useMemo(
    () => summarizeExtratoConciliacao(extratoLancamentos),
    [extratoLancamentos],
  );

  const extratoLancamentosFiltrados = useMemo(
    () => filterExtratoByConciliacaoFiltro(extratoLancamentos, extratoConciliacaoFiltro),
    [extratoLancamentos, extratoConciliacaoFiltro],
  );

  const extratoSampleForRegras = useMemo(
    () =>
      extratoLancamentos.map((e) => ({
        description: e.description,
        nature: e.nature,
        value: e.value,
      })),
    [extratoLancamentos],
  );

  const placarTotais = useMemo(
    () => sumExtratoPlacarTotais(extratoLancamentos),
    [extratoLancamentos],
  );
  const currentTotalInflows = placarTotais.creditos;
  const currentTotalOutflows = placarTotais.debitos;

  const placarConciliados = useMemo(
    () => sumExtratoPlacarTotaisConciliados(extratoLancamentos),
    [extratoLancamentos],
  );

  const saldoFinalExtratoInfo = useMemo(
    () =>
      resolveSaldoFinalExtrato({
        saldoAnterior: saldoAnteriorExtrato,
        creditos: currentTotalInflows,
        debitos: currentTotalOutflows,
      }),
    [saldoAnteriorExtrato, currentTotalInflows, currentTotalOutflows],
  );

  /** Saldo do que já foi conciliado até o momento (só linhas com D+C). */
  const saldoConciliadoAteMomento = useMemo(
    () => calcSaldoConciliadoAteMomento(saldoAnteriorExtrato, extratoLancamentos),
    [saldoAnteriorExtrato, extratoLancamentos],
  );

  /** Mantido para DRE / outros placares que usam o saldo do extrato completo. */
  const currentTotalBalance = saldoFinalExtratoInfo.valor;

  const folhaPayrollTotals = useMemo(
    () =>
      folhaPayroll.reduce(
        (acc, r) => ({
          base: acc.base + r.baseSalary,
          inss: acc.inss + r.inss,
          irrf: acc.irrf + r.irrf,
          fgts: acc.fgts + r.fgts,
          net: acc.net + r.net,
        }),
        { base: 0, inss: 0, irrf: 0, fgts: 0, net: 0 },
      ),
    [folhaPayroll],
  );

  // Render subtabs
  const tabs: { id: ManagerSubTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: 'extrato', label: 'Extrato Vision', icon: ArrowRightLeft },
    { id: 'plano', label: 'Plano de Contas', icon: ClipboardList },
    { id: 'razao', label: 'Balancete', icon: BookOpen },
    { id: 'folha', label: 'Folha de Pagamento', icon: Building },
    { id: 'honorarios', label: 'Honorários', icon: Scale },
    { id: 'fiscal', label: 'Fiscal / Impostos', icon: BarChart },
    { id: 'demonstracoes', label: 'Demonstrações', icon: FileSpreadsheet },
    { id: 'nota_explicativa', label: 'Nota Explicativa', icon: BookMarked },
    { id: 'emprestimos', label: 'Empréstimos', icon: DollarSign },
    { id: 'parcelamento', label: 'Parcelamento', icon: Layers },
    { id: 'aplicacoes', label: 'Aplicações', icon: Percent },
    { id: 'ia', label: 'IA', icon: Sparkles },
  ];

  const hasPlano = planoContas.length > 0;
  const isEmbeddedSimulator =
    activeSubTab === 'emprestimos' || activeSubTab === 'parcelamento' || activeSubTab === 'aplicacoes';
  const tabRequiresPlano = !STANDALONE_MANAGER_TABS.has(activeSubTab);

  const planoTotalSinteticas = useMemo(
    () => planoContas.filter((r) => r.tipo === 'S').length,
    [planoContas],
  );
  const planoTotalAnaliticas = useMemo(
    () => planoContas.filter((r) => r.tipo === 'A').length,
    [planoContas],
  );

  const handleReaplicarExtratoContas = useCallback(async (options?: { immediate?: boolean }) => {
    if (extratoLancamentos.length === 0) {
      alert('Nenhum lancamento para reaplicar contas.');
      return;
    }
    if (planoParaResolver.length === 0) {
      alert('Importe o plano de contas antes de reaplicar a conciliacao.');
      return;
    }
    beginHeavyUiWork();
    try {
      const companyScope = selectedCompany;
      const banco = getExtratoBancoConta(companyScope) || contaBancoExtratoAtivo;
      const regrasFresh = loadExtratoRegrasContas(companyScope, banco);
      const { rows, cache: nextCache, pendingSemNota } = await applyExtratoContaResolverAsync(
        extratoLancamentos,
        planoParaResolver,
        extratoContaCache,
        {
          ...extratoResolverOptions,
          contaBancoPreferida: banco,
          regrasContas: regrasFresh.length > 0 ? regrasFresh : extratoRegrasContas,
        },
      );
      if (!isSameCompanyScope(companyScope, selectedCompany)) return;
      startTransition(() => {
        commitExtratoResolverResult(companyScope, rows, nextCache, pendingSemNota, {
          immediate: options?.immediate ?? false,
        });
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Falha ao reaplicar contas.';
      alert(msg);
    } finally {
      endHeavyUiWork();
    }
  }, [
    contaBancoExtratoAtivo,
    commitExtratoResolverResult,
    extratoContaCache,
    extratoLancamentos,
    extratoRegrasContas,
    extratoResolverOptions,
    planoParaResolver,
    selectedCompany,
  ]);

  const handleMandarConciliacaoParaBalancete = useCallback(() => {
    const conciliadas = extratoConciliacaoStats.conciliadas;
    if (conciliadas === 0) {
      alert(
        'Nenhum lançamento conciliado para enviar.\n\nPreencha débito e crédito, use Reaplicar contas ou gere regras em Regras de Contas.',
      );
      return;
    }
    try {
      const { gerados } = postExtratoConciliadosNoRazao(selectedCompany, extratoLancamentos);
      setRazaoRows(readManagerData<VisionBalanceteRow>(selectedCompany, 'razao'));
      void flushPersistenceAfterCriticalWrite();
      alert(
        gerados > 0
          ? `${gerados} lançamento(s) conciliado(s) enviados ao balancete.\n\nAbra a aba Balancete para conferir.`
          : 'Nada novo para enviar — os conciliados já estavam no balancete (ou não geraram partidas).',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar para o balancete.';
      alert(msg);
    }
  }, [
    extratoConciliacaoStats.conciliadas,
    extratoLancamentos,
    selectedCompany,
  ]);

  /** Reaplica regras automaticamente quando extrato/regras/banco/plano mudam (em background, sem travar). */
  const autoReapplyKey = useMemo(() => {
    // Assinatura leve: evita concatenar todas as descrições (congelava com muitas regras).
    let regrasHash = 0;
    for (const r of extratoRegrasContas) {
      const s = `${r.id}|${r.nature}|${r.contaContrapartida}|${r.descricao}`;
      for (let i = 0; i < s.length; i++) {
        regrasHash = (regrasHash * 31 + s.charCodeAt(i)) | 0;
      }
    }
    return [
      selectedCompany,
      contaBancoExtratoAtivo,
      String(planoParaResolver.length),
      String(extratoLancamentos.length),
      String(extratoRegrasContas.length),
      String(regrasHash),
    ].join('::');
  }, [
    selectedCompany,
    contaBancoExtratoAtivo,
    planoParaResolver.length,
    extratoLancamentos.length,
    extratoRegrasContas,
  ]);

  const lastAutoReapplyRef = useRef('');
  const autoReapplyAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (extratoLancamentos.length === 0 || planoParaResolver.length === 0) return;
    if (lastAutoReapplyRef.current === autoReapplyKey) return;
    lastAutoReapplyRef.current = autoReapplyKey;

    autoReapplyAbortRef.current?.abort();
    const ac = new AbortController();
    autoReapplyAbortRef.current = ac;

    const rowsSnapshot = extratoLancamentos;
    const cacheSnapshot = extratoContaCache;
    const companyScope = selectedCompany;
    const opts = {
      ...extratoResolverOptions,
      contaBancoPreferida: getExtratoBancoConta(companyScope) || contaBancoExtratoAtivo,
      regrasContas: extratoRegrasContas,
      signal: ac.signal,
    };

    void (async () => {
      beginHeavyUiWork();
      try {
        // Deixa a UI pintar antes do trabalho pesado.
        await new Promise<void>((r) => setTimeout(r, 0));
        if (ac.signal.aborted) return;
        const { rows, cache: nextCache, pendingSemNota } = await applyExtratoContaResolverAsync(
          rowsSnapshot,
          planoParaResolver,
          cacheSnapshot,
          opts,
        );
        if (ac.signal.aborted || !isSameCompanyScope(companyScope, selectedCompany)) return;
        const changed = rows.some((r, i) => {
          const prev = rowsSnapshot[i];
          return (
            (r.accountDebit || '') !== (prev?.accountDebit || '') ||
            (r.accountCredit || '') !== (prev?.accountCredit || '')
          );
        });
        if (changed) {
          startTransition(() => {
            commitExtratoResolverResult(companyScope, rows, nextCache, pendingSemNota);
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.warn('[extrato] auto-reaplicar regras falhou:', err);
      } finally {
        endHeavyUiWork();
      }
    })();

    return () => {
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispara só quando autoReapplyKey muda
  }, [autoReapplyKey]);

  const buildExtratoConciliacaoExportPayload = () => {
    const lookup = buildPlanoNomeLookup(extratoPlanoNomeOptions);
    const bancoConta = getExtratoBancoConta(selectedCompany);
    const bancoNome = resolveContaNome(lookup, bancoConta, extratoPlanoNomeOptions);
    const rows = extratoLancamentos.map((e) => {
      const deb =
        e.accountDebit?.trim() ||
        (!e.accountCredit?.trim() && e.accountCode?.trim() && e.nature === 'C' ? e.accountCode : '');
      const cred =
        e.accountCredit?.trim() ||
        (!e.accountDebit?.trim() && e.accountCode?.trim() && e.nature === 'D' ? e.accountCode : '');
      return {
        date: e.date,
        description: e.description,
        value: e.value,
        nature: e.nature,
        accountDebit: deb,
        accountCredit: cred,
        accountDebitName: resolveContaNome(lookup, deb, extratoPlanoNomeOptions),
        accountCreditName: resolveContaNome(lookup, cred, extratoPlanoNomeOptions),
        operationName: e.operationName || e.description,
      };
    });
    return {
      rows,
      empresa: selectedCompany,
      bancoConta,
      bancoNome,
      saldoAnterior: saldoAnteriorExtrato,
    };
  };

  const handleExportExtratoConciliacaoPdf = () => {
    try {
      exportExtratoConciliacaoPdf(buildExtratoConciliacaoExportPayload());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao gerar PDF.';
      alert(msg);
    }
  };

  const handleSalvarExtratoNaPasta = () => {
    try {
      const banco =
        getExtratoBancoConta(selectedCompany) || contaBancoExtratoAtivo;
      if (!banco.trim()) {
        alert('Defina a conta banco (em Regras de Contas) antes de salvar o extrato na pasta.');
        return;
      }
      if (extratoLancamentos.length === 0) {
        alert('Nenhum lançamento para salvar.');
        return;
      }
      const payload = buildExtratoConciliacaoExportPayload();
      let pdfBase64: string | undefined;
      let pdfFilename: string | undefined;
      try {
        const pdf = buildExtratoConciliacaoPdfBase64(payload);
        pdfBase64 = pdf.base64;
        pdfFilename = pdf.filename;
      } catch {
        /* salva sem PDF se falhar a geração */
      }
      const bancoNome =
        getExtratoBancoNome(selectedCompany) ||
        resolveContaNome(
          buildPlanoNomeLookup(extratoPlanoNomeOptions),
          banco,
          extratoPlanoNomeOptions,
        ) ||
        `Banco ${banco}`;
      const saved = saveExtratoNaPasta(selectedCompany, {
        contaBanco: banco,
        bancoNome,
        saldoAnterior: saldoAnteriorExtrato,
        rows: syncExtratoConciliacaoStatus(extratoLancamentos).map((r) => ({
          id: r.id,
          date: r.date,
          description: r.description,
          value: r.value,
          nature: r.nature,
          accountCode: r.accountCode,
          accountDebit: r.accountDebit,
          accountCredit: r.accountCredit,
          operationName: r.operationName,
          status: r.status,
        })),
        pdfBase64,
        pdfFilename,
      });
      setExtratoPastasTick((n) => n + 1);
      alert(
        `Extrato salvo na pasta.\n${saved.label}\nBanco ${saved.contaBanco} · ${saved.total} lançamento(s)${
          pdfBase64 ? ' · PDF incluído' : ''
        }`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar extrato na pasta.';
      alert(msg);
    }
  };

  const handleSelectExtratoPasta = (item: ExtratoPastaItem) => {
    try {
      const companyScope = selectedCompany;
      setExtratoContaBancoAtiva(companyScope, item.contaBanco, item.bancoNome);
      saveExtratoRegrasBancoSelecionado(companyScope, item.contaBanco);
      setContaBancoTick((n) => n + 1);
      setSaldoAnteriorExtrato(item.saldoAnterior || 0);
      writeSaldoAnteriorExtrato(companyScope, item.saldoAnterior || 0);
      const rows: BankStatement[] = item.rows.map((r) => ({
        id: r.id || crypto.randomUUID(),
        date: r.date,
        description: r.description,
        value: r.value,
        nature: r.nature === 'C' ? 'C' : 'D',
        accountCode: r.accountCode || '',
        accountDebit: r.accountDebit,
        accountCredit: r.accountCredit,
        operationName: r.operationName,
        status: r.status === 'CONCILIADO' ? 'CONCILIADO' : 'PENDENTE',
      }));

      // Aplica regras do banco deste extrato nas linhas restauradas (em background).
      const regrasFresh = loadExtratoRegrasContas(companyScope, item.contaBanco);
      if (planoParaResolver.length > 0) {
        void applyExtratoContaResolverAsync(rows, planoParaResolver, extratoContaCache, {
          ...extratoResolverOptions,
          contaBancoPreferida: item.contaBanco,
          regrasContas: regrasFresh.length > 0 ? regrasFresh : extratoRegrasContas,
        }).then(({ rows: resolved, cache: nextCache, pendingSemNota }) => {
          if (!isSameCompanyScope(companyScope, selectedCompany)) return;
          startTransition(() => {
            commitExtratoResolverResult(companyScope, resolved, nextCache, pendingSemNota);
          });
        });
        // Mostra linhas já; contas completam quando o resolver terminar.
        saveExtratoLocal(rows, true, companyScope);
      } else {
        saveExtratoLocal(rows, true, companyScope);
      }
      setExtratoPastasTick((n) => n + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao abrir extrato da pasta.';
      alert(msg);
    }
  };

  const handleExportExtratoConciliacaoPng = () => {
    try {
      exportExtratoConciliacaoPng(buildExtratoConciliacaoExportPayload());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao gerar imagem.';
      alert(msg);
    }
  };

  // Exportação TXT+ partida dobrada Domínio (mesmo formato da interface antiga)
  const handleExportTxt = () => {
    try {
      let content = '';
      let filename = 'dominio_txtplus.txt';

      if (activeSubTab === 'extrato') {
        const banco = getExtratoBancoConta(selectedCompany) || contaBancoExtratoAtivo;
        content = buildTxtPlusFromExtratoRows(
          extratoLancamentos.map((e) => ({
            date: e.date,
            description: e.description,
            value: e.value,
            nature: e.nature,
            accountDebit: e.accountDebit,
            accountCredit: e.accountCredit,
            accountCode: e.accountCode,
            operationName: e.operationName || e.description,
          })),
          banco,
        );
        filename = 'extrato_dominio_txtplus.txt';
        if (!content.trim()) {
          alert(
            'Nenhuma linha válida para o TXT Domínio. Conciliie débito e crédito (contas diferentes) e tente de novo.',
          );
          return;
        }
      } else if (activeSubTab === 'razao') {
        content = buildTxtPlusFromRazaoVision(razaoRows);
        filename = 'razao_dominio_txtplus.txt';
      } else if (activeSubTab === 'folha') {
        content = buildTxtPlusFromFolhaRelatorio(folhaRelatorio);
        filename = 'folha_dominio_txtplus.txt';
      } else if (activeSubTab === 'plano') {
        if (planoContas.length === 0) {
          alert('Nenhuma conta no plano para exportar. Importe ou cadastre contas primeiro.');
          return;
        }
        content = buildDominioPlanoTxtFromAccounts(planoContas);
        filename = 'PLANO DE CONTAS.txt';
      } else {
        alert('Exportação disponível nas abas Extrato, Plano de Contas, Razão/Balancete e Folha.');
        return;
      }

      downloadTxtPlusDominio(content, filename);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao gerar TXT+ Domínio.';
      alert(msg);
    }
  };

  return (
    <div className="h-full flex min-h-0">
      <aside className="w-[220px] shrink-0 border-r border-brand-border bg-brand-sidebar flex flex-col overflow-y-auto">
        <div className="px-4 py-3 border-b border-brand-border space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest opacity-50">Gerencial</p>
          <ActiveCompanySelector
            compact
            selectedCompany={selectedCompany}
            companyOptions={companyOptions}
            onCompanyChange={onCompanyChange}
            onCreateCompany={onCreateCompany}
            onRenameCompany={onRenameCompany}
            onDeleteCompany={onDeleteCompany}
            deleteConfirmMessage={(company) =>
              `Excluir «${company}»?\n\nRemove plano, razão, extrato, folha, empréstimos, parcelamentos e aplicações desta empresa. Não afeta sindicatos da Precificação.`
            }
          />
        </div>
        <nav className="flex-1 py-2" aria-label="Módulos gerenciais">
          {tabs.map((tab) => {
            const locked = !STANDALONE_MANAGER_TABS.has(tab.id) && !hasPlano;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                disabled={locked}
                onClick={() => {
                  if (locked) return;
                  setActiveSubTab(tab.id);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest transition-all border-l-2',
                  activeSubTab === tab.id
                    ? 'bg-brand-bg border-l-brand-border text-brand-text'
                    : 'border-l-transparent opacity-45 hover:opacity-100 hover:bg-brand-border/5',
                  locked && 'opacity-30 cursor-not-allowed hover:opacity-30',
                )}
              >
                {locked ? (
                  <Lock size={12} className="shrink-0 opacity-60 text-red-600" />
                ) : (
                  <Icon size={12} className="shrink-0" />
                )}
                <span className="leading-tight">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 min-h-0 overflow-y-auto relative">
        <div className={cn('mx-auto space-y-6 min-w-0', isEmbeddedSimulator ? 'p-4 md:p-6 max-w-[96rem]' : 'p-8 max-w-7xl')}>
          {!isEmbeddedSimulator ? (
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-xl font-black text-brand-text uppercase italic tracking-tighter">
                  {managerSubTabLabel(activeSubTab)}
                </h2>
                <p className="text-[9px] font-mono font-bold opacity-50 uppercase tracking-[0.2em] mt-1">
                  Status: Processamento Integrado
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExportTxt}
                  className="technical-button-primary flex items-center gap-2 text-xs font-bold shadow-[2px_2px_0_0_rgba(0,0,0,0.1)]"
                >
                  <Download size={14} />
                  {activeSubTab === 'plano' ? 'EXPORTAR PLANO DOMÍNIO' : 'EXPORTAR TXT+ DOMÍNIO'}
                </button>
              </div>
            </div>
          ) : null}

          {isEmbeddedSimulator ? (
            <Suspense fallback={<TabLoadingFallback />}>
              {activeSubTab === 'emprestimos' ? (
                <LoanModule
                  selectedCompany={selectedCompany}
                  storageVersion={storageVersion}
                  embedded
                />
              ) : activeSubTab === 'parcelamento' ? (
                <InstallmentModule
                  selectedCompany={selectedCompany}
                  storageVersion={storageVersion}
                  embedded
                />
              ) : (
                <AppsModule
                  selectedCompany={selectedCompany}
                  storageVersion={storageVersion}
                  embedded
                />
              )}
            </Suspense>
          ) : tabRequiresPlano && !hasPlano ? (
            <div className="technical-panel p-20 shadow-[8px_8px_0_0_#141414] text-center flex flex-col items-center justify-center space-y-8 bg-brand-sidebar/10">
               <div className="w-20 h-20 border-2 border-brand-border flex items-center justify-center font-black text-3xl italic text-red-600 animate-pulse">
                 <Lock size={32} />
               </div>
               <div className="space-y-2">
                 <h3 className="text-sm font-black uppercase tracking-[0.2em] text-red-700">Módulo Bloqueado</h3>
                 <p className="text-[10px] font-bold text-slate-500 uppercase max-w-sm tracking-widest leading-relaxed">
                   O Plano de Contas central não foi detectado no sistema. Importe os registros de contas para habilitar o motor gerencial, conciliações e visualização.
                 </p>
               </div>
               <div className="flex gap-4">
                 <button 
                   onClick={() => setActiveSubTab('plano')} 
                   className="technical-button-primary"
                 >
                    Ir para Plano de Contas
                 </button>

               </div>
            </div>
          ) : (
            <>
              {/* ======================= EXTRATO SUBTAB ======================= */}
              {activeSubTab === 'extrato' && (
                 <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-8 space-y-6">
                       {/* Stats */}
                       <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                      <div className="technical-panel p-6 shadow-[4px_4px_0_0_#141414]">
                        <p className="text-[9px] font-black text-brand-text/40 uppercase tracking-widest mb-2 italic">
                          Total Débitos
                        </p>
                        <p className="text-2xl font-mono font-black tracking-tighter text-red-500">
                          {formatCurrency(currentTotalOutflows)}
                        </p>
                      </div>
                      <div className="technical-panel p-6 shadow-[4px_4px_0_0_#141414]">
                        <p className="text-[9px] font-black text-brand-text/40 uppercase tracking-widest mb-2 italic">
                          Total Créditos
                        </p>
                        <p className="text-2xl font-mono font-black tracking-tighter text-blue-600">
                          {formatCurrency(currentTotalInflows)}
                        </p>
                      </div>
                      <div className="technical-panel p-6 shadow-[4px_4px_0_0_#141414]">
                        <p className="text-[9px] font-black text-brand-text/40 uppercase tracking-widest mb-2 italic">
                          Saldo Anterior
                        </p>
                        <FreeNumericInput
                          aria-label="Saldo anterior do extrato"
                          value={saldoAnteriorExtrato}
                          onChange={(v) => {
                            setSaldoAnteriorExtrato(v);
                            writeSaldoAnteriorExtrato(selectedCompany, v);
                          }}
                          displayDecimals={2}
                          hideZeroWhenBlurred
                          placeholder="0,00"
                          className={cn(CF_FORM_INPUT_MONEY, 'text-xl font-mono font-black w-full')}
                        />
                      </div>
                      <div className="technical-panel p-6 shadow-[4px_4px_0_0_#141414]">
                        <p className="text-[9px] font-black text-brand-text/40 uppercase tracking-widest mb-2 italic">
                          Saldo Final do Extrato
                        </p>
                        <p
                          className={cn(
                            'text-2xl font-mono font-black tracking-tighter',
                            saldoFinalExtratoInfo.valor >= 0 ? 'text-brand-text' : 'text-red-600',
                          )}
                        >
                          {formatCurrency(saldoFinalExtratoInfo.valor)}
                        </p>
                        <p className="text-[8px] font-mono text-brand-text/45 mt-2 uppercase tracking-wide">
                          Anterior + Créditos − Débitos
                        </p>
                        <p className="text-[8px] font-mono text-brand-text/40 mt-1 normal-case">
                          C {formatCurrency(currentTotalInflows)} · D{' '}
                          {formatCurrency(currentTotalOutflows)}
                          {placarTotais.lancamentosConsiderados > 0
                            ? ` · ${placarTotais.lancamentosConsiderados} lanç.`
                            : ''}
                        </p>
                      </div>
                      <div className="technical-panel p-6 shadow-[4px_4px_0_0_#141414] sm:col-span-2 xl:col-span-2">
                        <p className="text-[9px] font-black text-brand-text/40 uppercase tracking-widest mb-2 italic">
                          Saldo Conciliado
                        </p>
                        <p
                          className={cn(
                            'text-2xl font-mono font-black tracking-tighter',
                            saldoConciliadoAteMomento >= 0 ? 'text-brand-text' : 'text-red-600',
                          )}
                        >
                          {formatCurrency(saldoConciliadoAteMomento)}
                        </p>
                        <p className="text-[8px] font-mono text-brand-text/45 mt-2 uppercase tracking-wide">
                          {placarConciliados.lancamentosConsiderados === 0
                            ? 'Sem lançamentos com débito e crédito'
                            : 'Anterior + créditos conciliados − débitos conciliados'}
                        </p>
                        <p className="text-[9px] mt-2 text-brand-text/60 normal-case">
                          {extratoConciliacaoStats.conciliadas} de {extratoConciliacaoStats.total} lançamento(s)
                          conciliado(s)
                          {placarConciliados.lancamentosConsiderados > 0 ? (
                            <span className="block mt-0.5 font-mono text-[8px] uppercase opacity-70">
                              C {formatCurrency(placarConciliados.creditos)} · D{' '}
                              {formatCurrency(placarConciliados.debitos)}
                            </span>
                          ) : (
                            <span className="block mt-0.5 text-amber-800/90">
                              Preencha débito e crédito nas linhas para este saldo avançar.
                            </span>
                          )}
                        </p>
                        <p className="text-[8px] mt-2 leading-snug text-amber-800/80 normal-case border-t border-brand-border/40 pt-2">
                          Use <strong>Mandar para o balancete</strong> para publicar os conciliados no
                          balancete/razão. Este card só soma o que já tem as duas contas — não copia o
                          saldo final.
                        </p>
                      </div>
                    </div>

                    {/* Ribbon controller */}
                    <div className="flex gap-2 justify-between">
                      <div className="flex gap-2">
                        <button 
                          type="button"
                          onClick={() => setShowAddExtrato(!showAddExtrato)}
                          className="technical-button-primary text-xs font-bold"
                        >
                          + INSERIR REGISTRO EXTRATO
                        </button>
                      </div>
                      {extratoLancamentos.length > 0 && (
                        <button 
                          type="button"
                          onClick={() => saveExtrato([])}
                          className="technical-button border-red-800 text-red-800 hover:bg-red-800 hover:text-white text-xs"
                        >
                          LIMPAR EXTRATOS
                        </button>
                      )}
                    </div>

                    {/* Add register form */}
                    {showAddExtrato && (
                      <form onSubmit={handleAddExtratoSubmit} className="technical-panel p-6 bg-brand-sidebar/10 max-w-2xl">
                        <h4 className="text-[10px] font-black uppercase tracking-widest border-b border-brand-border pb-1 mb-3 w-full">Inserir Lançamento de Extrato</h4>
                        <div className={CF_FORM_FIELDS}>
                          <div className={CF_FIELD_COL}>
                            <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Data</label>
                            <input aria-label="Data" 
                              type="date" 
                              required 
                              value={extDate} 
                              onChange={e => setExtDate(e.target.value)}
                              className={CF_FORM_INPUT_DATE} 
                            />
                          </div>
                          <div className={CF_FIELD_COL_GROW}>
                            <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Descrição</label>
                            <input aria-label="Descrição" 
                              type="text" 
                              required 
                              placeholder="LIQ FATURA..." 
                              value={extDesc}
                              onChange={e => setExtDesc(e.target.value)}
                              className={CF_FORM_INPUT_LONG} 
                            />
                          </div>
                          <div className={CF_FIELD_COL}>
                            <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Valor (R$)</label>
                            <FreeNumericInput aria-label="Valor (R$)"
                              required
                              value={extVal}
                              onChange={setExtVal}
                              className={CF_FORM_INPUT_MONEY} 
                            />
                          </div>
                          <div className={CF_FIELD_COL}>
                            <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Natureza</label>
                            <div className="flex border border-brand-border h-[26px]">
                              <button 
                                type="button" 
                                onClick={() => setExtNat('D')}
                                className={cn("flex-1 text-[9px] font-bold", extNat === 'D' ? "bg-red-600 text-white" : "bg-transparent")}
                              >
                                DEBITO (D)
                              </button>
                              <button 
                                type="button" 
                                onClick={() => setExtNat('C')}
                                className={cn("flex-1 text-[9px] font-bold", extNat === 'C' ? "bg-blue-600 text-white" : "bg-transparent")}
                              >
                                CREDITO (C)
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 justify-end pt-2 w-full basis-full">
                          <button type="button" onClick={() => setShowAddExtrato(false)} className="technical-button text-[10px] py-1 px-3">CANCELAR</button>
                          <button type="submit" className="technical-button-primary text-[10px] py-1 px-4">ADICIONAR</button>
                        </div>
                      </form>
                    )}

                    {/* Table */}
                    <div className="technical-panel shadow-[4px_4px_0_0_#141414] overflow-hidden">
                      <div className="p-3 border-b border-brand-border flex flex-wrap items-center justify-between gap-2 bg-brand-sidebar/30">
                        <div className="flex flex-wrap items-center gap-3">
                           <h3 className="text-[10px] font-black uppercase tracking-widest">Registros de Conciliação Bancária</h3>
                           {extratoLancamentos.length > 0 && (
                             <div className="px-2 py-0.5 bg-brand-border text-brand-bg text-[8px] font-black uppercase tracking-tighter">
                                Sincronizado ({extratoConciliacaoStats.total} itens · {extratoConciliacaoStats.conciliadas} conciliadas)
                             </div>
                           )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                        {extratoLancamentos.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleReaplicarExtratoContas({ immediate: true })}
                              className="technical-button text-[9px] py-1 px-2 inline-flex items-center gap-1"
                              title="Aplica as contas das regras cadastradas na tabela de conciliação"
                            >
                              <RefreshCw size={11} aria-hidden="true" />
                              APLICAR REGRAS NA CONCILIAÇÃO
                            </button>
                            <button
                              type="button"
                              onClick={handleExportExtratoConciliacaoPdf}
                              className="technical-button text-[9px] py-1 px-2 inline-flex items-center gap-1"
                              title="Exportar conciliacao em PDF"
                            >
                              <FileText size={11} aria-hidden="true" />
                              PDF CONCILIADO
                            </button>
                            <button
                              type="button"
                              onClick={handleSalvarExtratoNaPasta}
                              className="technical-button-primary text-[9px] py-1 px-2 inline-flex items-center gap-1"
                              title="Salva o extrato conciliado + PDF na pasta, ligado à conta banco"
                            >
                              <Save size={11} aria-hidden="true" />
                              SALVAR EXTRATO
                            </button>
                            <button
                              type="button"
                              onClick={handleExportExtratoConciliacaoPng}
                              className="technical-button text-[9px] py-1 px-2 inline-flex items-center gap-1"
                              title="Exportar conciliacao como imagem PNG"
                            >
                              <FileImage size={11} aria-hidden="true" />
                              IMAGEM
                            </button>
                            <button
                              type="button"
                              onClick={handleMandarConciliacaoParaBalancete}
                              disabled={extratoConciliacaoStats.conciliadas === 0}
                              className="technical-button-primary text-[9px] py-1 px-2 inline-flex items-center gap-1 disabled:opacity-40"
                              title="Envia os lançamentos conciliados (débito+crédito) para o balancete/razão"
                            >
                              <BookMarked size={11} aria-hidden="true" />
                              MANDAR PARA O BALANCETE
                              {extratoConciliacaoStats.conciliadas > 0 ? (
                                <span className="text-[8px] opacity-80">
                                  ({extratoConciliacaoStats.conciliadas})
                                </span>
                              ) : null}
                            </button>
                          </>
                        )}
                          <button
                            type="button"
                            onClick={() => setExtratoPastasModalOpen(true)}
                            className="technical-button text-[9px] py-1 px-2 inline-flex items-center gap-1"
                            title="Pastas de extratos salvos por conta banco — selecionar puxa as regras"
                          >
                            <FolderOpen size={11} aria-hidden="true" />
                            PASTAS DE EXTRATOS
                            {extratoPastasCount > 0 ? (
                              <span className="text-[8px] opacity-70">({extratoPastasCount})</span>
                            ) : null}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRegrasContasModalOpen(true)}
                            className="technical-button text-[9px] py-1 px-2 inline-flex items-center gap-1"
                            title="Regras personalizadas: descricao do extrato e conta contrapartida"
                          >
                            <ListOrdered size={11} aria-hidden="true" />
                            REGRAS DE CONTAS
                            {regrasContasDoBancoAtivo.length > 0 ? (
                              <span className="text-[8px] opacity-70">
                                ({regrasContasDoBancoAtivo.length})
                              </span>
                            ) : null}
                          </button>
                        </div>
                      </div>
                      {extratoLancamentos.length > 0 && (
                        <div className="px-3 py-2 border-b border-brand-border/60 bg-brand-sidebar/10 flex flex-wrap items-center gap-2">
                          <span className="text-[8px] font-black uppercase tracking-widest text-brand-text/45 inline-flex items-center gap-1">
                            <Filter size={10} aria-hidden="true" />
                            Filtrar
                          </span>
                          {(
                            [
                              ['todas', `Todas (${extratoConciliacaoStats.total})`],
                              ['conciliadas', `Conciliadas (${extratoConciliacaoStats.conciliadas})`],
                              ['pendentes', `Não conciliadas (${extratoConciliacaoStats.pendentes})`],
                            ] as const
                          ).map(([id, label]) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setExtratoConciliacaoFiltro(id)}
                              className={cn(
                                'technical-button text-[8px] py-0.5 px-2 font-bold uppercase tracking-wide',
                                extratoConciliacaoFiltro === id && 'bg-brand-border text-brand-bg',
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                      <ExtratoLancamentosVirtualTable
                        rows={extratoLancamentosFiltrados}
                        onDelete={deleteExtrato}
                        planoNomeOptions={extratoPlanoNomeOptions}
                      />
                    </div>
                  </div>
                  <div className="lg:col-span-4 space-y-6">
                    <DataIngestionBox 
                      dataType="extrato" 
                      title="Processar Extrato Externo"
                      selectedCompany={selectedCompany}
                      extratoPlanoOptions={extratoBancoPlanoOptions.length > 0 ? extratoBancoPlanoOptions : extratoPlanoOptions}
                      onExtratoConciliacao={handleExtratoConciliacao}
                      onImport={(newItems, saldoAnterior) => {
                        const companyScope = selectedCompany;
                        const resolverOpts = {
                          ...extratoResolverOptions,
                          contaBancoPreferida: getExtratoBancoConta(companyScope),
                          regrasContas: loadExtratoRegrasContas(
                            companyScope,
                            getExtratoBancoConta(companyScope),
                          ),
                        };
                        // Mostra o extrato imediatamente; resolve contas em lotes sem travar.
                        const raw = syncExtratoConciliacaoStatus(newItems as BankStatement[]);
                        startTransition(() => setExtratoLancamentos(raw));
                        writeManagerData(companyScope, 'extrato', raw);
                        if (saldoAnterior != null && Number.isFinite(saldoAnterior)) {
                          setSaldoAnteriorExtrato(saldoAnterior);
                          writeSaldoAnteriorExtrato(companyScope, saldoAnterior);
                        }
                        void applyExtratoContaResolverAsync(
                          raw,
                          planoParaResolver,
                          extratoContaCache,
                          resolverOpts,
                        ).then(({ rows: resolved, cache: nextCache, pendingSemNota }) => {
                          if (!isSameCompanyScope(companyScope, selectedCompany)) {
                            writeManagerData(
                              companyScope,
                              'extrato',
                              syncExtratoConciliacaoStatus(resolved),
                            );
                            saveExtratoContaMappingCache(companyScope, nextCache);
                            return;
                          }
                          startTransition(() => {
                            setExtratoContaCache(nextCache);
                            saveExtratoContaMappingCache(companyScope, nextCache);
                            const next = syncExtratoConciliacaoStatus(resolved);
                            setExtratoLancamentos(next);
                            writeManagerData(companyScope, 'extrato', next);
                            notifyPendingSemNota(pendingSemNota);
                          });
                          void flushPersistenceAfterCriticalWrite();
                        });
                      }} 
                    />
                  </div>
                </div>
              )}

              {/* ======================= PLANO DE CONTAS SUBTAB ======================= */}
              {activeSubTab === 'plano' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-8 space-y-6">
                    <div className="flex gap-2 justify-between">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setShowAddPlano(!showAddPlano)}
                        className="technical-button-primary text-xs"
                      >
                         + CRIAR CONTA CONTÁBIL
                      </button>
                    </div>
                    {planoContas.length > 0 && (
                      <button 
                        onClick={() => savePlano([])}
                        className="technical-button border-red-800 text-red-00 hover:bg-red-800 hover:text-white text-xs"
                      >
                        LIMPAR PLANO
                      </button>
                    )}
                  </div>

                  {showAddPlano && (
                    <form onSubmit={handleAddPlanoSubmit} className="technical-panel p-6 bg-brand-sidebar/10 space-y-4 max-w-3xl">
                      <h4 className="text-[10px] font-black uppercase tracking-widest border-b border-brand-border pb-1">Configurar Conta</h4>
                      <div className={CF_FIELD_ROW}>
                        <div className={CF_FIELD_COL}>
                          <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Código Reduzido</label>
                          <input aria-label="Código Reduzido"
                            type="text"
                            placeholder="0000001"
                            value={accReduzido}
                            onChange={(e) => setAccReduzido(e.target.value)}
                            className={CF_FORM_INPUT_SHORT}
                          />
                        </div>
                        <div className={CF_FIELD_COL}>
                          <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Classificação</label>
                          <input aria-label="Classificação"
                            type="text"
                            required
                            placeholder="1.1.1.01.00001"
                            value={accCode}
                            onChange={(e) => setAccCode(e.target.value)}
                            className={CF_INPUT_ACCOUNT}
                          />
                        </div>
                        <div className={CF_FIELD_COL}>
                          <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Descrição</label>
                          <input aria-label="Descrição"
                            type="text"
                            required
                            placeholder="CAIXA GERAL"
                            value={accName}
                            onChange={(e) => setAccName(e.target.value)}
                            className={CF_FORM_INPUT_MED}
                          />
                        </div>
                        <div className={CF_FIELD_COL}>
                          <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Tipo</label>
                          <select aria-label="Tipo"
                            value={accTipo}
                            onChange={(e) => setAccTipo(e.target.value as 'S' | 'A' | '')}
                            className={CF_FORM_SELECT}
                          >
                            <option value="">AUTO</option>
                            <option value="S">S — Sintética</option>
                            <option value="A">A — Analítica</option>
                          </select>
                        </div>
                        <div className={CF_FIELD_COL}>
                          <label className="block text-[9px] font-bold uppercase opacity-50 mb-1">Nível</label>
                          <input aria-label="Nível"
                            type="text"
                            inputMode="numeric"
                            placeholder="Auto"
                            value={accNivel}
                            onChange={(e) => setAccNivel(e.target.value)}
                            className={CF_FORM_INPUT_NUM}
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end pt-2">
                        <button type="button" onClick={() => setShowAddPlano(false)} className="technical-button text-[10px] py-1 px-3">CANCELAR</button>
                        <button type="submit" className="technical-button-primary text-[10px] py-1 px-4">SALVAR CONTA</button>
                      </div>
                    </form>
                  )}

                  {planoContas.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-2 px-3 py-1.5 border border-brand-border bg-brand-sidebar/30">
                        <span className="text-sm font-black">{planoContas.length.toLocaleString('pt-BR')}</span>
                        <span className="text-[9px] font-bold uppercase opacity-50">contas totais</span>
                      </div>
                      {planoTotalSinteticas > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 border border-amber-700/40 bg-amber-50">
                          <span className="text-[9px] font-black text-amber-800 bg-amber-200 px-1.5 py-0.5">S</span>
                          <span className="text-[10px] font-bold text-amber-900">{planoTotalSinteticas} Sintéticas</span>
                        </div>
                      )}
                      {planoTotalAnaliticas > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 border border-emerald-700/40 bg-emerald-50">
                          <span className="text-[9px] font-black text-emerald-800 bg-emerald-200 px-1.5 py-0.5">A</span>
                          <span className="text-[10px] font-bold text-emerald-900">{planoTotalAnaliticas} Analíticas</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="technical-panel shadow-[4px_4px_0_0_#141414] overflow-hidden">
                    <div className="p-3 border-b border-brand-border flex items-center justify-between bg-brand-sidebar/30 gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <h3 className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                          Plano de Contas
                        </h3>
                        {planoContas.length > 0 && (
                          <div className="px-2 py-0.5 bg-brand-border text-brand-bg text-[8px] font-black uppercase tracking-tighter whitespace-nowrap">
                            {planoContas.length.toLocaleString('pt-BR')} conta(s)
                          </div>
                        )}
                      </div>
                      <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500 hidden sm:block truncate">
                        Reduzido · Classificação · Descrição · Tipo · Nível
                      </p>
                    </div>
                    <PlanoContasVirtualTable
                      rows={planoContas}
                      codeLengthToLevel={codeLengthToLevel}
                      onDelete={deleteAccount}
                    />
                  </div>
                  </div>
                  <div className="lg:col-span-4 space-y-6">
                    <DataIngestionBox 
                      dataType="plano" 
                      title="Processar Plano de Contas" 
                      selectedCompany={selectedCompany}
                      onImport={(newItems) => savePlano(newItems as AccountPlan[])}
                      onRazaoImport={(rows) => saveRazao(rows)}
                    />
                  </div>
                </div>
              )}

              {/* ======================= RAZÃO / BALANCETE SUBTAB ======================= */}
              {activeSubTab === 'razao' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 min-w-0">
                <div className="lg:col-span-8 min-w-0">
                  <BalanceteTabPanel
                    selectedCompany={selectedCompany}
                    planoContas={planoContas}
                    razaoRows={razaoRows}
                    onRazaoRowsChange={saveRazao}
                    folhaRelatorio={folhaRelatorio}
                  />
                </div>
                <div className="lg:col-span-4 space-y-6">
                  <DataIngestionBox
                    dataType="balancete"
                    title="Importar Lançamentos (TXT Domínio)"
                    selectedCompany={selectedCompany}
                    onImport={(newItems) => {
                      const first = newItems[0] as Record<string, unknown> | undefined;
                      if (first && ('code' in first || 'name' in first)) {
                        window.alert(
                          'Arquivo de plano de contas detectado. Importe na sub-aba Plano de Contas.',
                        );
                        return;
                      }
                      if (first && ('dataInicio' in first || 'descricao' in first)) {
                        saveRazao(migrateLegacyBalanceteToRazao(newItems as BalanceteRow[]));
                      }
                    }}
                    onRazaoImport={(rows) => saveRazao(rows)}
                  />
                </div>
                </div>
              )}

              {/* ======================= FOLHA DE PAGAMENTO SUBTAB ======================= */}
              {activeSubTab === 'folha' && (
                <div className="space-y-6">
                  <FolhaModule selectedCompany={selectedCompany} onSynced={reloadFolhaFromStorage} />
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-8 space-y-6">
                  <div className="technical-panel shadow-[4px_4px_0_0_#141414] overflow-hidden">
                    <div className="p-3 border-b border-brand-border bg-brand-sidebar/30 flex items-center justify-between gap-2">
                      <h3 className="text-[10px] font-black uppercase tracking-widest">Relatório folha importado (OCR)</h3>
                      <MandarParaBalanceteButton
                        onClick={handleMandarFolhaParaBalancete}
                        disabled={folhaRelatorio.length === 0 && folhaPayroll.length === 0}
                        count={folhaRelatorio.length + folhaPayroll.length}
                      />
                    </div>
                    <FolhaRelatorioVirtualTable rows={folhaRelatorio} />
                  </div>
                  </div>
                  <div className="lg:col-span-4 space-y-6">
                    <DataIngestionBox 
                      dataType="folha" 
                      title="Recortar PDF da Folha"
                      selectedCompany={selectedCompany}
                      ingestionMode="pdfOnly"
                      pdfVariants={FOLHA_PDF_VARIANTS}
                      onPdfVariantChange={setFolhaPdfVariant}
                      onImport={(newItems) => {
                        const prefix = folhaVariantDescriptionPrefix(folhaPdfVariant);
                        const relatorio = (newItems as FolhaRelatorioRow[])
                          .filter(
                            (i) => 'debito' in i && 'credito' in i && !('baseSalary' in i),
                          )
                          .map((row) => ({
                            ...row,
                            description: row.description?.startsWith('[')
                              ? row.description
                              : `${prefix} ${row.description || ''}`.trim(),
                          }));
                        if (relatorio.length > 0) {
                          saveFolhaRelatorio([...folhaRelatorio, ...relatorio]);
                        }
                      }} 
                    />
                  </div>
                </div>
                </div>
              )}

              {/* ======================= IA SUBTAB ======================= */}
              {activeSubTab === 'ia' && (
                <Suspense fallback={<TabLoadingFallback />}>
                  <AiSettingsModule selectedCompany={selectedCompany} />
                </Suspense>
              )}

              {/* ======================= FISCAL / IMPOSTOS SUBTAB ======================= */}
              {activeSubTab === 'fiscal' && <FiscalModule selectedCompany={selectedCompany} />}

              {activeSubTab === 'honorarios' && (
                <HonorariosModule
                  selectedCompany={selectedCompany}
                  onRazaoUpdated={() =>
                    setRazaoRows(readManagerData<VisionBalanceteRow>(selectedCompany, 'razao'))
                  }
                />
              )}

              {/* ======================= NOTA EXPLICATIVA SUBTAB ======================= */}
              {activeSubTab === 'nota_explicativa' && (
                <NotaExplicativaTab selectedCompany={selectedCompany} />
              )}

              {/* ======================= DEMONSTRAÇÕES FINANCEIRAS SUBTAB ======================= */}
              {activeSubTab === 'demonstracoes' && (
                <div className="space-y-6">
                  <div className="p-4 bg-brand-sidebar/20 border border-brand-border text-xs">
                     <span className="font-bold uppercase tracking-widest">DRE & Demonstrações Financeiras Automatizadas</span>
                     <p className="opacity-50 text-[9px] mt-1">Abaixo está o balancete analítico estruturado a nível gerencial.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     {/* Dynamic DRE */}
                     <div className="technical-panel p-6 shadow-[6px_6px_0_0_#141414] bg-white space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-widest border-b pb-2 flex justify-between">
                          <span>Demonstração do Resultado (DRE)</span>
                          <span className="text-[9px] font-mono opacity-50 underline">Período Fiscal</span>
                        </h4>
                        
                        <div className="space-y-2 text-[10px] font-mono uppercase">
                          <div className="flex justify-between border-b py-1">
                            <span>(+) Receita Operacional Bruta</span>
                            <span className="font-bold text-blue-600">{formatCurrency(currentTotalInflows)}</span>
                          </div>
                          <div className="flex justify-between border-b py-1">
                            <span>(-) Deduções e Impostos DAS (6.5%)</span>
                            <span className="text-red-500">-{formatCurrency(currentTotalInflows * 0.065)}</span>
                          </div>
                          <div className="flex justify-between border-b py-1 font-bold">
                            <span>(=) Receita Líquida</span>
                            <span>{formatCurrency(currentTotalInflows * 0.935)}</span>
                          </div>
                          <div className="flex justify-between border-b py-1">
                            <span>(-) Despesas Operacionais (Folha e Outros)</span>
                            <span className="text-red-500">
                              -{formatCurrency(folhaPayrollTotals.base + currentTotalOutflows)}
                            </span>
                          </div>
                          <div className="flex justify-between border-b-2 py-1 font-black text-xs text-green-700 bg-green-50 px-2 mt-4">
                            <span>(=) Resultado Líquido do Exercício</span>
                            <span>
                              {formatCurrency(
                                (currentTotalInflows * 0.935) - 
                                (folhaPayrollTotals.base + currentTotalOutflows)
                              )}
                            </span>
                          </div>
                        </div>
                     </div>

                     {/* Dynamic Balanço Patrimonial */}
                     <div className="technical-panel p-6 shadow-[6px_6px_0_0_#141414] bg-white space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-widest border-b pb-2 flex justify-between">
                          <span>Balanço Patrimonial Simplificado</span>
                          <span className="text-[9px] font-mono opacity-50">Equação Ativo x Passivo</span>
                        </h4>
                        
                        <div className="space-y-4 text-[10px] font-mono uppercase">
                           <div className="border border-brand-border/20 p-3">
                             <div className="font-bold border-b pb-1 text-blue-600 flex justify-between">
                               <span>Ativo Total</span>
                               <span>{formatCurrency(currentTotalBalance > 0 ? currentTotalBalance : 0)}</span>
                             </div>
                             <p className="text-[8px] opacity-50 mt-1 italic leading-normal">Caixa, Bancos e Aplicações Líquidas.</p>
                           </div>

                           <div className="border border-brand-border/20 p-3">
                             <div className="font-bold border-b pb-1 text-red-600 flex justify-between">
                               <span>Passivo + PL</span>
                               <span>{formatCurrency(folhaPayrollTotals.base)}</span>
                             </div>
                             <p className="text-[8px] opacity-50 mt-1 italic leading-normal">Salários a pagar e deduções estimadas.</p>
                           </div>
                        </div>
                     </div>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {regrasContasModalOpen ? (
        <ExtratoRegrasContasModal
          open={regrasContasModalOpen}
          company={selectedCompany}
          regras={extratoRegrasContas}
          planoOptions={extratoContrapartidaPlanoOptions}
          planoLookupOptions={extratoPlanoNomeOptions}
          bancoOptions={
            extratoBancoPlanoOptions.length > 0 ? extratoBancoPlanoOptions : extratoPlanoOptions
          }
          defaultContaBanco={contaBancoExtratoAtivo}
          extratoSample={extratoSampleForRegras}
          onClose={() => setRegrasContasModalOpen(false)}
          onChange={setExtratoRegrasContas}
          onContaBancoChange={() => setContaBancoTick((n) => n + 1)}
          onReaplicar={
            extratoLancamentos.length > 0 ? handleReaplicarExtratoContas : undefined
          }
        />
      ) : null}

      <AiInteligenciaPastasModal
        open={inteligenciaModalOpen}
        company={selectedCompany}
        planoOptions={extratoPlanoNomeOptions}
        onClose={() => setInteligenciaModalOpen(false)}
        onChanged={() => setInteligenciaTick((n) => n + 1)}
      />

      <ExtratoPastasModal
        open={extratoPastasModalOpen}
        company={selectedCompany}
        contaBancoAtiva={contaBancoExtratoAtivo}
        onClose={() => setExtratoPastasModalOpen(false)}
        onSelect={handleSelectExtratoPasta}
      />

      <ExtratoSemNotaModal
        open={semNotaModalOpen}
        rows={pendingSemNotaRows}
        onClose={() => setSemNotaModalOpen(false)}
        onConfirm={handleSemNotaModalConfirm}
      />
    </div>
  );
}

