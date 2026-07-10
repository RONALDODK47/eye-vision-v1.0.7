import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import MandarParaBalanceteButton from './MandarParaBalanceteButton';
import { readManagerData, writeManagerData } from '../logic/companyWorkspace';
import { flushPersistenceAfterCriticalWrite } from '../logic/eyeVisionPersistenceFlush';
import {
  formatSpedPeriodoLabel,
  loadSpedFiscalFromFiles,
  parseSpedFiscalText,
  sanitizeParsedSpedFiscal,
  inferSpedFiscalNatureza,
  spedFiscalItemLabel,
  spedFiscalNaturezaLabel,
  type ParsedSpedFiscal,
  type SpedFiscalTipo,
} from '../../extratoVision/utils/spedFiscalParser';
import { contasParaImpostoLancamento, FISCAL_IMPOSTOS, type FiscalContasImpostoConfig } from '../logic/fiscalContasImposto';
import { loadFiscalContasImposto } from '../logic/fiscalContasImpostoStorage';
import {
  contasParaAcumulador,
  loadFiscalAcumuladorContas,
  type FiscalAcumuladorContasMap,
} from '../logic/fiscalAcumuladorContasStorage';
import {
  fiscalContasProntasParaAutomacao,
  type FiscalSpedArquivoSalvo,
} from '../logic/fiscalSpedAutomation';
import {
  importPgdasFilesManual,
  postFiscalImportsNoRazao,
  type FiscalPgdasArquivoSalvo,
} from '../logic/fiscalPgdasAutomation';
import { formatPgdasPeriodoLabel } from '../logic/pgdasParser';
import { fiscalDataNoIntervalo } from '../logic/fiscalDateFilter';
import FiscalSpedFiltrosBar from './FiscalSpedFiltrosBar';

const REGISTRO_LABEL: Record<string, string> = {
  M200: 'PIS/Pasep (M200)',
  M205: 'PIS a recolher (M205)',
  M210: 'PIS detalhe (M210)',
  M600: 'COFINS (M600)',
  M605: 'COFINS a recolher (M605)',
  M610: 'COFINS detalhe (M610)',
  E110: 'Apuração ICMS (E110)',
  E111: 'Ajuste ICMS (E111)',
  E116: 'ICMS a recolher (E116)',
  E250: 'Apuração IPI (E250)',
  C190: 'CST/CFOP/ALIQ (C190)',
  PGDAS: 'PGDAS-D (DAS Simples Nacional)',
};

export type { FiscalSpedArquivoSalvo };

function tipoLabel(t: SpedFiscalTipo): string {
  if (t === 'CONTRIBUICOES') return 'EFD-Contribuições';
  if (t === 'ICMS_IPI') return 'EFD ICMS/IPI';
  return 'SPED (não identificado)';
}

function registroLabel(reg: string): string {
  return REGISTRO_LABEL[reg] ?? reg;
}

function normalizarArquivosSalvos(list: FiscalSpedArquivoSalvo[]): FiscalSpedArquivoSalvo[] {
  return list.map((arq) => ({ ...arq, parsed: sanitizeParsedSpedFiscal(arq.parsed) }));
}

function arquivosSpedMudaram(
  antes: FiscalSpedArquivoSalvo[],
  depois: FiscalSpedArquivoSalvo[],
): boolean {
  if (antes.length !== depois.length) return true;
  return antes.some((a, i) => {
    const b = depois[i];
    if (!b || a.id !== b.id) return true;
    return JSON.stringify(a.parsed.itens) !== JSON.stringify(b.parsed.itens);
  });
}

function carregarArquivosFiscal(empresa: string): FiscalSpedArquivoSalvo[] {
  return normalizarArquivosSalvos(readManagerData<FiscalSpedArquivoSalvo>(empresa, 'fiscalSped'));
}

function carregarArquivosPgdas(empresa: string): FiscalPgdasArquivoSalvo[] {
  return readManagerData<FiscalPgdasArquivoSalvo>(empresa, 'fiscalPgdas');
}

type Props = {
  selectedCompany: string;
  /** Contas por imposto (subaba Contas); se omitido, carrega do storage. */
  contasImposto?: FiscalContasImpostoConfig;
  automationEnabled?: boolean;
  /** import = só SPED; impostos = tabela + PGDAS; full = ambos (legado). */
  mode?: 'import' | 'impostos' | 'full';
};

export default function FiscalSpedImportPanel({
  selectedCompany,
  contasImposto: contasProp,
  automationEnabled = true,
  mode = 'full',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pgdasInputRef = useRef<HTMLInputElement>(null);
  const [arquivos, setArquivos] = useState<FiscalSpedArquivoSalvo[]>(() =>
    carregarArquivosFiscal(selectedCompany),
  );
  const [arquivosPgdas, setArquivosPgdas] = useState<FiscalPgdasArquivoSalvo[]>(() =>
    carregarArquivosPgdas(selectedCompany),
  );
  const [loading, setLoading] = useState(false);
  const [loadingPgdas, setLoadingPgdas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [contasLocal, setContasLocal] = useState<FiscalContasImpostoConfig>(() =>
    loadFiscalContasImposto(selectedCompany),
  );
  const [acumuladorContas, setAcumuladorContas] = useState<FiscalAcumuladorContasMap>(() =>
    loadFiscalAcumuladorContas(selectedCompany),
  );
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  React.useEffect(() => {
    if (!contasProp) setContasLocal(loadFiscalContasImposto(selectedCompany));
    setAcumuladorContas(loadFiscalAcumuladorContas(selectedCompany));
  }, [selectedCompany, contasProp]);

  const contasImposto = contasProp ?? contasLocal;

  const persist = useCallback(
    (next: FiscalSpedArquivoSalvo[]) => {
      setArquivos(next);
      writeManagerData(selectedCompany, 'fiscalSped', next);
    },
    [selectedCompany],
  );

  const persistPgdas = useCallback(
    (next: FiscalPgdasArquivoSalvo[]) => {
      setArquivosPgdas(next);
      writeManagerData(selectedCompany, 'fiscalPgdas', next);
    },
    [selectedCompany],
  );

  React.useEffect(() => {
    const raw = readManagerData<FiscalSpedArquivoSalvo>(selectedCompany, 'fiscalSped');
    const next = normalizarArquivosSalvos(raw);
    setArquivos(next);
    if (arquivosSpedMudaram(raw, next)) writeManagerData(selectedCompany, 'fiscalSped', next);
    setArquivosPgdas(carregarArquivosPgdas(selectedCompany));
  }, [selectedCompany]);

  React.useEffect(() => {
    const onPgdas = (ev: Event) => {
      const detail = (ev as CustomEvent<{ company?: string }>).detail;
      if (detail?.company && detail.company !== selectedCompany) return;
      setArquivosPgdas(carregarArquivosPgdas(selectedCompany));
    };
    window.addEventListener('contabilfacil-fiscal-pgdas-updated', onPgdas);
    return () => window.removeEventListener('contabilfacil-fiscal-pgdas-updated', onPgdas);
  }, [selectedCompany]);

  const periodoArquivo = (p: ParsedSpedFiscal) =>
    formatSpedPeriodoLabel(p.dtIni, p.dtFin, p.dtFinLabel);

  const dataLinha = (p: ParsedSpedFiscal, item: { data?: string }) =>
    item.data ?? periodoArquivo(p);

  const linhasTabela = useMemo(
    () => [
      ...arquivos.flatMap((arq) =>
        arq.parsed.itens.map((item) => ({
          arquivoId: arq.id,
          fileName: arq.parsed.fileName,
          tipo: tipoLabel(arq.parsed.tipo),
          empresa: arq.parsed.empresa,
          periodo: periodoArquivo(arq.parsed),
          data: dataLinha(arq.parsed, item),
          item,
        })),
      ),
      ...arquivosPgdas.flatMap((arq) =>
        arq.parsed.itens.map((item) => ({
          arquivoId: arq.id,
          fileName: arq.parsed.fileName,
          tipo: 'PGDAS-D',
          empresa: arq.parsed.empresa,
          periodo: formatPgdasPeriodoLabel(arq.parsed),
          data: item.data ?? formatPgdasPeriodoLabel(arq.parsed),
          item,
        })),
      ),
    ],
    [arquivos, arquivosPgdas],
  );

  const linhasFiltradas = useMemo(() => {
    return linhasTabela.filter((row) => {
      if (row.item.kind !== 'imposto') return false;
      const ref = row.data || row.periodo;
      return fiscalDataNoIntervalo(ref, dataInicio || undefined, dataFim || undefined);
    });
  }, [dataFim, dataInicio, linhasTabela]);

  const totais = linhasFiltradas.reduce(
    (acc, row) => {
      const v = Math.abs(row.item.valor);
      if (row.item.natureza === 'devedora') acc.debito += v;
      else acc.credito += v;
      return acc;
    },
    { debito: 0, credito: 0 },
  );

  const handleMandarSpedBalancete = useCallback(() => {
    if (arquivos.length === 0 && arquivosPgdas.length === 0) {
      setErro('Nenhum SPED/PGDAS importado para enviar ao balancete.');
      return;
    }
    const faltando = fiscalContasProntasParaAutomacao(contasImposto);
    if (faltando.length === FISCAL_IMPOSTOS.length) {
      setErro('Configure ao menos um par débito/crédito na subaba Contas para lançar no balancete.');
      return;
    }
    try {
      const posted = postFiscalImportsNoRazao(selectedCompany, arquivos, arquivosPgdas, contasImposto);
      void flushPersistenceAfterCriticalWrite();
      if (posted.gerados > 0) {
        setSucesso(`${posted.gerados} lançamento(s) enviados ao balancete.`);
        setErro(null);
      } else if (posted.pendencias.length > 0) {
        setErro(posted.pendencias.slice(0, 4).join(' · '));
      } else {
        setSucesso('Nada novo para enviar — já estavam no balancete (ou não geraram partidas).');
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('contabilfacil-fiscal-sped-updated', { detail: { company: selectedCompany } }),
        );
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar para o balancete.');
    }
  }, [arquivos, arquivosPgdas, contasImposto, selectedCompany]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setLoading(true);
    setErro(null);
    setSucesso(null);
    try {
      const list = Array.from(files).filter((f) => /\.txt$/i.test(f.name) || f.type === 'text/plain');
      if (!list.length) {
        setErro('Selecione arquivo(s) .txt do SPED Fiscal (EFD-Contribuições ou EFD ICMS/IPI).');
        return;
      }

      const novos: FiscalSpedArquivoSalvo[] = [];
      const avisos: string[] = [];

      if (list.length === 1) {
        const text = await list[0].text();
        const parsed = parseSpedFiscalText(text, list[0].name);
        if (parsed.issues.length) avisos.push(...parsed.issues);
        if (parsed.itens.length === 0 && parsed.tipo === 'DESCONHECIDO') {
          setErro(parsed.issues[0] ?? 'Arquivo SPED não reconhecido.');
          return;
        }
        novos.push({ id: crypto.randomUUID(), parsed });
      } else {
        const batch = await loadSpedFiscalFromFiles(list);
        if (batch.contrib) {
          novos.push({ id: crypto.randomUUID(), parsed: batch.contrib });
        }
        if (batch.icms) {
          novos.push({ id: crypto.randomUUID(), parsed: batch.icms });
        }
        avisos.push(...batch.messages);
        if (!novos.length) {
          setErro('Nenhum SPED válido encontrado nos arquivos selecionados.');
          return;
        }
      }

      const merged = [...arquivos, ...novos];
      persist(merged);
      setSucesso(`${novos.length} arquivo(s) SPED importado(s). Use «Mandar para o balancete» para publicar.`);
      if (avisos.length) {
        setErro((prev) => [prev, avisos.slice(0, 3).join(' · ')].filter(Boolean).join(' · '));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao ler o arquivo TXT.');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onPgdasFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setLoadingPgdas(true);
    setErro(null);
    setSucesso(null);
    try {
      const list = Array.from(files).filter((f) => /\.(txt|pdf|rec)$/i.test(f.name));
      if (!list.length) {
        setErro('Selecione arquivo(s) PGDAS-D (.pdf, .txt ou .rec).');
        return;
      }
      const { merged, messages } = await importPgdasFilesManual(selectedCompany, list, {
        postRazao: false,
      });
      persistPgdas(merged);
      setSucesso('PGDAS importado. Use «Mandar para o balancete» para publicar.');
      if (messages.length) {
        setErro((prev) => [prev, messages.slice(0, 3).join(' · ')].filter(Boolean).join(' · '));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao ler o arquivo PGDAS-D.');
    } finally {
      setLoadingPgdas(false);
      if (pgdasInputRef.current) pgdasInputRef.current.value = '';
    }
  };

  const limpar = () => {
    if (!arquivos.length) return;
    if (!window.confirm('Remover todos os arquivos SPED importados?')) return;
    persist([]);
    setErro(null);
    setSucesso(null);
  };

  const limparPgdas = () => {
    if (!arquivosPgdas.length) return;
    if (!window.confirm('Remover todos os PGDAS-D importados?')) return;
    persistPgdas([]);
    setErro(null);
    setSucesso(null);
  };

  const temImportados = arquivos.length > 0 || arquivosPgdas.length > 0;
  const showImport = mode === 'import' || mode === 'full';
  const showTabela = mode === 'impostos' || mode === 'full';
  const showPgdasImport = mode === 'import' || mode === 'impostos' || mode === 'full';
  const totalImpostos = useMemo(
    () => linhasTabela.filter((row) => row.item.kind === 'imposto').length,
    [linhasTabela],
  );

  return (
    <div className="space-y-4">
      <div className="technical-panel shadow-[4px_4px_0_0_#141414] overflow-hidden">
        {showImport && (
        <div className="px-4 py-3 border-b border-brand-border bg-brand-sidebar/30 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest">Importar SPED</h3>
            <p className="text-[9px] font-bold uppercase opacity-50 mt-1 max-w-2xl">
              Arquivos TXT do SPED Fiscal (EFD-Contribuições ou EFD ICMS/IPI). Use o botão para enviar ao
              balancete após importar.
              {temImportados ? (
                <span className="block mt-1 normal-case">
                  {totalImpostos} linha(s) de impostos — consulte a aba <strong>Impostos</strong>.
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MandarParaBalanceteButton
              onClick={handleMandarSpedBalancete}
              disabled={!temImportados}
              count={totalImpostos || undefined}
            />
            <input
              ref={inputRef}
              type="file"
              accept=".txt,text/plain"
              multiple
              className="hidden"
              aria-label="Selecionar arquivo TXT do SPED Fiscal"
              onChange={(e) => void onFiles(e.target.files)}
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => inputRef.current?.click()}
              className="technical-button-primary text-[10px] px-4 py-2 flex items-center gap-2 font-bold"
            >
              <Upload size={14} />
              {loading ? 'Lendo…' : 'Importar SPED'}
            </button>
            {arquivos.length > 0 && (
              <button
                type="button"
                onClick={limpar}
                className="technical-button border-red-800 text-red-800 text-[10px] px-3 py-2 flex items-center gap-1 font-bold"
              >
                <Trash2 size={12} />
                Limpar SPED
              </button>
            )}
          </div>
        </div>
        )}

        {showImport && showPgdasImport && (
          <div className="px-4 py-3 border-b border-brand-border bg-brand-sidebar/20 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest">Importar PGDAS-D</h3>
              <p className="text-[9px] font-bold uppercase opacity-50 mt-1 max-w-2xl">
                Arquivos PDF, TXT ou REC do PGDAS-D. Ou configure a pasta acima para sincronizar automaticamente.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={pgdasInputRef}
                type="file"
                accept=".pdf,.txt,.rec,application/pdf,text/plain"
                multiple
                className="hidden"
                aria-label="Selecionar arquivo PGDAS-D"
                onChange={(e) => void onPgdasFiles(e.target.files)}
              />
              <button
                type="button"
                disabled={loadingPgdas}
                onClick={() => pgdasInputRef.current?.click()}
                className="technical-button text-[10px] px-4 py-2 flex items-center gap-2 font-bold"
              >
                <Upload size={14} />
                {loadingPgdas ? 'Lendo…' : 'Importar PGDAS-D'}
              </button>
              {arquivosPgdas.length > 0 && (
                <button
                  type="button"
                  onClick={limparPgdas}
                  className="technical-button border-red-800 text-red-800 text-[10px] px-3 py-2 flex items-center gap-1 font-bold"
                >
                  <Trash2 size={12} />
                  Limpar PGDAS
                </button>
              )}
            </div>
          </div>
        )}

        {showTabela && !showImport && (
          <div className="px-4 py-3 border-b border-brand-border bg-brand-sidebar/30 flex flex-wrap items-center justify-between gap-3">
            <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest">Impostos importados</h3>
            <p className="text-[9px] font-bold uppercase opacity-50 mt-1 max-w-2xl">
              Apuração de PIS, COFINS, ICMS, IPI e PGDAS-D. Importe arquivos na aba{' '}
              <strong className="text-brand-text">Importações</strong>.
            </p>
            </div>
            {showPgdasImport && mode === 'full' && (
              <div className="flex flex-wrap gap-2">
                <input
                  ref={pgdasInputRef}
                  type="file"
                  accept=".pdf,.txt,.rec,application/pdf,text/plain"
                  multiple
                  className="hidden"
                  aria-label="Selecionar arquivo PGDAS-D"
                  onChange={(e) => void onPgdasFiles(e.target.files)}
                />
                <button
                  type="button"
                  disabled={loadingPgdas}
                  onClick={() => pgdasInputRef.current?.click()}
                  className="technical-button text-[10px] px-4 py-2 flex items-center gap-2 font-bold"
                >
                  <Upload size={14} />
                  {loadingPgdas ? 'Lendo…' : 'Importar PGDAS-D'}
                </button>
                {arquivosPgdas.length > 0 && (
                  <button
                    type="button"
                    onClick={limparPgdas}
                    className="technical-button border-red-800 text-red-800 text-[10px] px-3 py-2 flex items-center gap-1 font-bold"
                  >
                    <Trash2 size={12} />
                    Limpar PGDAS
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {(showImport || showPgdasImport) && sucesso && (
          <p className="px-4 py-2 text-[10px] font-bold uppercase text-emerald-900 bg-emerald-50 border-b border-emerald-200">
            {sucesso}
          </p>
        )}

        {(showImport || showPgdasImport) && erro && (
          <p className="px-4 py-2 text-[10px] font-bold uppercase text-amber-900 bg-amber-50 border-b border-amber-200">
            {erro}
          </p>
        )}

        {showTabela && temImportados && (
          <FiscalSpedFiltrosBar
            dataInicio={dataInicio}
            dataFim={dataFim}
            onDataInicioChange={setDataInicio}
            onDataFimChange={setDataFim}
            totalFiltrado={linhasFiltradas.length}
          />
        )}

        {showTabela && (
        <div className="module-table-viewport max-h-[min(65vh,720px)]">
          <table className="w-full min-w-[900px] text-left text-[10px] font-mono">
            <thead className="technical-grid-header sticky top-0 z-10">
              <tr>
                {[
                  'Arquivo',
                  'Tipo SPED',
                  'Data',
                  'Registro',
                  'Código',
                  'Nome',
                  'Detalhe',
                  'Imposto',
                  'Natureza',
                  'Conta débito',
                  'Conta crédito',
                  'Valor (R$)',
                  'Linha',
                ].map(
                  (h) => (
                    <th key={h} className="px-2 py-2 text-[9px] font-black uppercase border-r border-brand-border/30">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/10">
              {linhasTabela.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-16 text-center text-slate-400 uppercase text-[10px]">
                    Nenhum dado importado. Use a aba{' '}
                    <strong className="text-brand-text">Importações</strong> para carregar SPED
                    {mode === 'impostos' ? ' ou importe PGDAS-D acima' : ''}
                    {mode === 'full' ? ', ou configure uma pasta acima' : ''}.
                  </td>
                </tr>
              ) : linhasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-16 text-center text-slate-400 uppercase text-[10px]">
                    Nenhuma linha de{' '}
                    <strong className="text-brand-text">impostos</strong> no período selecionado.
                  </td>
                </tr>
              ) : (
                linhasFiltradas.map((row, idx) => {
                  const natureza = row.item.natureza ?? inferSpedFiscalNatureza(row.item);
                  const contasAcum = contasParaAcumulador(acumuladorContas, row.item);
                  const contas =
                    row.item.kind === 'acumulador' && contasAcum
                      ? { debito: contasAcum.debito, credito: contasAcum.credito }
                      : contasParaImpostoLancamento(contasImposto, row.item.imposto, natureza);
                  const nome = spedFiscalItemLabel(row.item);
                  return (
                  <tr key={`${row.arquivoId}-${row.item.linha}-${idx}`} className="technical-grid-row hover:bg-brand-sidebar/10">
                    <td className="px-2 py-1.5 max-w-[120px] truncate" title={row.fileName}>
                      {row.fileName}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{row.tipo}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap tabular-nums" title={row.periodo}>
                      {row.data}
                    </td>
                    <td className="px-2 py-1.5" title={registroLabel(row.item.registro)}>
                      <span className="font-bold">{row.item.registro}</span>
                      <span className="block text-[8px] opacity-50 normal-case">{registroLabel(row.item.registro)}</span>
                    </td>
                    <td className="px-2 py-1.5">{row.item.codigo || '—'}</td>
                    <td className="px-2 py-1.5 max-w-[220px] font-bold" title={nome}>
                      {nome}
                    </td>
                    <td className="px-2 py-1.5 max-w-[180px] opacity-70" title={row.item.descricao}>
                      {row.item.nome ? row.item.descricao : '—'}
                    </td>
                    <td className="px-2 py-1.5">{row.item.imposto || '—'}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={cn(
                          'px-1 py-0.5 text-[8px] font-black uppercase',
                          row.item.natureza === 'devedora'
                            ? 'bg-red-100 text-red-900'
                            : 'bg-emerald-100 text-emerald-900',
                        )}
                      >
                        {spedFiscalNaturezaLabel(row.item.natureza)}
                      </span>
                    </td>
                    <td
                      className={cn(
                        'px-2 py-1.5 max-w-[100px] truncate',
                        !contas.debito && 'text-amber-700 opacity-70',
                      )}
                      title={contas.debito || 'Configure acima'}
                    >
                      {contas.debito || '—'}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-1.5 max-w-[100px] truncate',
                        !contas.credito && 'text-amber-700 opacity-70',
                      )}
                      title={contas.credito || 'Configure acima'}
                    >
                      {contas.credito || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums">
                      {formatCurrency(row.item.valor)}
                    </td>
                    <td className="px-2 py-1.5 text-right opacity-60">{row.item.linha || '—'}</td>
                  </tr>
                  );
                })
              )}
            </tbody>
            {linhasFiltradas.length > 0 && (
              <tfoot>
                <tr className="bg-brand-sidebar/20 font-black border-t border-brand-border">
                  <td colSpan={12} className="px-2 py-2 text-right uppercase text-[9px]">
                    Totais (impostos{dataInicio || dataFim ? ' · filtrado' : ''})
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    D {formatCurrency(totais.debito)}
                    <br />
                    C {formatCurrency(totais.credito)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        )}
      </div>
    </div>
  );
}
