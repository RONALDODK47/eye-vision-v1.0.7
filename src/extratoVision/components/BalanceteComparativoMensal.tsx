import React, {
  memo,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { VisionBalanceteRow, VisionPlanoRow } from '../types/accounting';
import {
  buildPeriodosMensaisEntreDatas,
  filtrarPeriodosComMovimentoNasLinhas,
  montarComparativoMensalAsync,
  type LinhaComparativoMensal,
  type PeriodoMensal,
  type SaldoMensalCelula,
} from '../utils/balanceteComparativoMensal';
import { aplicarLancamentosNoRazao } from '../utils/balanceteAutoCorrecao';
import {
  deveUsarWorkerComparativo,
  montarComparativoNoWorker,
} from '../utils/comparativoMensalWorkerClient';
import { deduplicarLinhasBanco, isContaBancoLinha } from '../utils/balanceteGarantidaBanco';
import {
  executarAutomatizacaoCompleta,
  isDetalheErroAutomatizacao,
  type ResultadoAutomatizacaoCompleta,
} from '../utils/balanceteAutomatizacaoCompleta';
import {
  executarAutomatizacaoNoWorker,
  workerAutomacaoDisponivel,
} from '../utils/automacaoBalanceteWorkerClient';
import { readFiscalContaMap } from '../utils/fiscalContaMapping';
import { exportAutomatizacaoBalancetePdf } from '../utils/balanceteAutomatizacaoPdf';
import { exportBalanceteComparativoPdf } from '../utils/balanceteComparativoPdf';
import { exportBalanceteInvertidasPdf } from '../utils/balanceteInvertidasPdf';
import ComparativoVirtualBody from '../../contabilfacil/components/ComparativoVirtualBody';
import { emitTabBotResult } from '../../contabilfacil/tabBot/tabBotBridge';
import { useVirtualWindow } from '../../contabilfacil/lib/useVirtualWindow';
import { AutomatizacaoContaConfigModal } from './AutomatizacaoContaConfigModal';
import { RazaoContaLancamentosModal, type RazaoContaModo } from './RazaoContaLancamentosModal';
import {
  type AutomacaoContaConfig,
  PAPEIS_AUTOMACAO_UI,
  papeisConfiguradosCount,
  readAutomatizacaoContaConfig,
} from '../utils/automatizacaoContaConfig';
import AchadosAuditoriaAgrupadosLista from './AchadosAuditoriaAgrupadosLista';
import { auditarBalanceteContinuo } from '../utils/auditoriaBalanceteContinua';
import { agruparAchadosAuditoriaPorTipo } from '../utils/auditoriaAchadosAgrupados';
import { readReceitaFederalRegras } from '../utils/receitaFederalRegras';
import { filtrarRazaoPorPeriodo, montarBalanceteComPeriodo } from '../utils/razaoContabil';

type Props = {
  razaoRows: VisionBalanceteRow[];
  planoRows: VisionPlanoRow[];
  onRazaoRowsChange: (rows: VisionBalanceteRow[]) => void;
  /** Período confirmado no filtro superior (só monta após OK no pai). */
  periodoDe: string;
  periodoAte: string;
  folhaRows?: VisionBalanceteRow[];
  fiscalRows?: VisionBalanceteRow[];
  empresaNome?: string;
  /** ContabilFacil: mesma lógica, visual técnico do módulo gerencial. */
  surface?: 'vision' | 'contabilfacil';
  /** ContabilFacil: injeta filtro e ações no card de período do pai. */
  setPeriodToolbar?: (node: React.ReactNode | null) => void;
};

const COLS_FIXAS = 9;

/** Só erros críticos na tela; contas OK e avisos informativos ficam no PDF. */
function coletarErrosRestantes(resultado: ResultadoAutomatizacaoCompleta): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (texto: string) => {
    const t = texto.trim();
    if (!t || seen.has(t)) return;
    if (/sem saldo credor|zerado|pr[oó]ximo m[eê]s/i.test(t)) return;
    if (!isDetalheErroAutomatizacao(t)) return;
    seen.add(t);
    out.push(t);
  };
  resultado.erros.forEach(add);
  (resultado.advertencias ?? []).forEach((a) => add(a.textoCompleto));
  return out;
}

function ResultadoAutomatizacaoCompacto({ resultado }: { resultado: ResultadoAutomatizacaoCompleta }) {
  const errosRestantes = useMemo(() => coletarErrosRestantes(resultado), [resultado]);

  if (!errosRestantes.length) {
    return (
      <p className="text-[10px] text-emerald-400/90 w-full">
        {resultado.mensagem}
        {resultado.contasCorrigidas.length > 0 && (
          <span className="text-emerald-500/70">
            {' '}
            · {resultado.contasCorrigidas.length} conta(s) — detalhes no PDF Relatório
          </span>
        )}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-2 w-full">
      <p className="text-[10px] text-slate-500 shrink-0 max-w-[220px] leading-snug">
        {resultado.lancamentosGerados.length > 0
          ? `${resultado.lancamentosGerados.length} lançamento(s) gravado(s).`
          : 'Automatização concluída com pendências.'}
      </p>
      <div
        className="w-[148px] h-[148px] shrink-0 overflow-hidden rounded-md border-2 border-red-500 bg-red-950/50 shadow-inner shadow-red-900/30 flex flex-col"
        title="Erros que ainda restam — lista completa no PDF Relatório"
      >
        <p className="text-[8px] font-black uppercase tracking-wider text-red-300 bg-red-900/60 px-1.5 py-1 border-b border-red-500/50 text-center">
          {errosRestantes.length} erro(s)
        </p>
        <ul className="flex-1 overflow-y-auto custom-scrollbar px-1.5 py-1 space-y-1 text-[8px] leading-tight text-red-200">
          {errosRestantes.map((linha, i) => (
            <li key={`err-c-${i}`} className="break-words">
              {linha}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[9px] text-slate-500 self-end">
        Relatório (PDF) traz contas corrigidas e todas as advertências.
      </p>
    </div>
  );
}

function CelulaSaldoMes({ cel, contabil }: { cel: SaldoMensalCelula | null | undefined; contabil?: boolean }) {
  if (!cel || cel.valor < 0.001) {
    return <span className={contabil ? 'text-slate-400' : 'text-slate-500'}>—</span>;
  }
  const valorFmt = cel.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const invertida = cel.invertido === true;
  const natClass = invertida
    ? contabil
      ? 'text-red-900 bg-red-200 px-0.5'
      : 'text-red-100 bg-red-800 px-1'
    : cel.natureza === 'D'
      ? contabil
        ? 'text-slate-800'
        : 'text-slate-200'
      : contabil
        ? 'text-emerald-800'
        : 'text-emerald-300';
  const valorClass = invertida
    ? contabil
      ? 'font-bold text-red-900'
      : 'text-red-50 font-bold'
    : contabil
      ? 'font-bold text-brand-text'
      : 'text-white font-bold';
  return (
    <span
      className={`inline-flex items-baseline justify-end gap-1 whitespace-nowrap ${contabil ? 'font-mono' : ''} ${
        invertida ? (contabil ? 'ring-1 ring-red-700 rounded-sm px-0.5' : '') : ''
      }`}
    >
      <span className={valorClass}>{valorFmt}</span>
      <span className={`text-[10px] font-black uppercase ${natClass}`}>{cel.natureza}</span>
    </span>
  );
}

const ComparativoLinha = memo(function ComparativoLinha({
  linha,
  periodos,
  mesRef,
  contabil = false,
  fixedHeight = false,
  onAbrirRazao,
}: {
  linha: LinhaComparativoMensal;
  periodos: PeriodoMensal[];
  mesRef: string;
  contabil?: boolean;
  fixedHeight?: boolean;
  onAbrirRazao?: (linha: LinhaComparativoMensal, modo: RazaoContaModo) => void;
}) {
  const natEsp = linha.naturezaCodigo ?? 'D';
  const natLabel = linha.naturezaLabel ?? 'Conta';

  const celulaInvertida = (cel: SaldoMensalCelula | null | undefined) =>
    !!(cel && cel.valor >= 0.01 && (cel.invertido === true || cel.natureza !== natEsp));

  const invertidoPeriodo = periodos.some((p) => celulaInvertida(linha.saldosPorMes[p.label]));

  const rowClass = invertidoPeriodo
    ? contabil
      ? 'technical-grid-row bg-red-200 border-l-4 border-l-red-800'
      : 'bg-red-950/70 hover:bg-red-900/80 border-l-4 border-l-red-600'
    : contabil
      ? 'technical-grid-row'
      : 'hover:bg-slate-700/30 bg-slate-950/40';

  const hlClass = (active: boolean) =>
    contabil ? (active ? 'bg-brand-sidebar/50' : '') : active ? 'bg-cyan-950/25' : '';

  const cellPad = fixedHeight ? 'px-2 py-1 leading-tight' : 'p-2';

  const linkContaClass = onAbrirRazao
    ? contabil
      ? 'font-mono font-bold cursor-pointer underline decoration-dotted underline-offset-2 hover:opacity-80 text-left w-full'
      : 'font-mono text-blue-300 cursor-pointer underline decoration-dotted underline-offset-2 hover:opacity-80 text-left w-full'
    : '';

  const linkClsClass = onAbrirRazao
    ? contabil
      ? 'font-mono cursor-pointer underline decoration-dotted underline-offset-2 hover:opacity-80 text-left w-full'
      : 'font-mono text-cyan-400 cursor-pointer underline decoration-dotted underline-offset-2 hover:opacity-80 text-left w-full'
    : '';

  const abrir = (modo: RazaoContaModo) => onAbrirRazao?.(linha, modo);

  return (
    <tr
      className={`${rowClass}${fixedHeight ? ' h-10 max-h-10 overflow-hidden' : ''}`}
      title={
        invertidoPeriodo
          ? `Saldo credor/devedor diverge da natureza ${natLabel} (CPC) — confira todos os meses em vermelho`
          : undefined
      }
    >
      <td className={`${cellPad} font-mono ${contabil ? 'font-bold' : 'text-blue-300'}`}>
        {onAbrirRazao ? (
          <button
            type="button"
            className={linkContaClass}
            title="Abrir razão pelo código"
            onClick={() => abrir('codigo')}
          >
            {linha.codigo}
          </button>
        ) : (
          linha.codigo
        )}
      </td>
      <td className={`${cellPad} font-mono ${contabil ? '' : 'text-cyan-400'}`}>
        {onAbrirRazao ? (
          <button
            type="button"
            className={linkClsClass}
            title="Abrir razão pela classificação"
            onClick={() => abrir('classificacao')}
          >
            {linha.classificacao || '—'}
          </button>
        ) : (
          linha.classificacao || '—'
        )}
      </td>
      <td className={`${cellPad} font-bold uppercase ${contabil ? 'italic' : 'text-slate-200'}`}>
        {linha.nome}
        {invertidoPeriodo && (
          <span
            translate="no"
            className={
              contabil
                ? 'ml-2 text-[8px] font-black text-red-900 bg-red-300 px-1 uppercase'
                : 'ml-2 inline-flex px-1.5 py-0.5 rounded text-[8px] font-black bg-red-700 text-white border border-red-500 uppercase'
            }
          >
            Invertida
          </span>
        )}
      </td>
      <td className={`${cellPad} text-center whitespace-nowrap`}>
        {linha.tipo === 'S' ? (contabil ? 'S' : (
          <span
            translate="no"
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
          >
            Sintética
          </span>
        )) : contabil ? 'A' : (
          <span
            translate="no"
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
          >
            Analítica
          </span>
        )}
      </td>
      {periodos.map((p, idx) => {
        const det = linha.detalhePorMes[p.label];
        const dataMes = det?.data || p.de;
        const hl = hlClass(p.label === mesRef);
        if (idx === 0) {
          return (
            <React.Fragment key={`${linha.chave}-m0-${p.label}`}>
              <td
                className={`${cellPad} font-mono whitespace-nowrap ${hl} ${contabil ? '' : 'text-violet-300'}`}
                title={`Data referência ${p.label}`}
              >
                {dataMes}
              </td>
              <td className={`${cellPad} text-right font-mono ${hl} ${contabil ? '' : 'text-slate-300'}`}>{det?.si ?? '—'}</td>
              <td className={`${cellPad} text-right font-mono ${hl} ${contabil ? '' : 'text-red-400'}`}>{det?.deb ?? '—'}</td>
              <td className={`${cellPad} text-right font-mono ${hl} ${contabil ? '' : 'text-emerald-400'}`}>{det?.cred ?? '—'}</td>
              <td
                className={`${cellPad} text-right font-mono whitespace-nowrap ${hl} ${
                  celulaInvertida(linha.saldosPorMes[p.label])
                    ? contabil
                      ? 'bg-red-200/90'
                      : 'bg-red-950/50'
                    : ''
                }`}
              >
                <CelulaSaldoMes cel={linha.saldosPorMes[p.label]} contabil={contabil} />
              </td>
            </React.Fragment>
          );
        }
        return (
          <React.Fragment key={`${linha.chave}-m-${p.label}`}>
            <td
              className={`${cellPad} font-mono whitespace-nowrap ${hl} ${contabil ? '' : 'text-violet-300'}`}
              title={`Data referência ${p.label}`}
            >
              {dataMes}
            </td>
            <td
              className={`${cellPad} text-right font-mono whitespace-nowrap ${hl} ${
                celulaInvertida(linha.saldosPorMes[p.label])
                  ? contabil
                    ? 'bg-red-200/90'
                    : 'bg-red-950/50'
                  : ''
              }`}
            >
              <CelulaSaldoMes cel={linha.saldosPorMes[p.label]} contabil={contabil} />
            </td>
          </React.Fragment>
        );
      })}
      <td className={`${cellPad} text-center whitespace-nowrap ${contabil ? '' : 'sticky right-0 bg-slate-950/95 z-[1]'}`}>
        <span
          translate="no"
          className={
            contabil
              ? 'inline-flex items-center gap-1 font-bold text-[10px]'
              : `inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                  natEsp === 'D'
                    ? 'bg-red-500/10 text-red-300 border-red-500/30'
                    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                }`
          }
          title={`Natureza da conta: ${natLabel} (CPC)`}
        >
          {natEsp}
          <span className="font-normal opacity-90">{natLabel}</span>
        </span>
      </td>
    </tr>
  );
});

function ComparativoMensalInner({
  razaoRows,
  planoRows,
  onRazaoRowsChange,
  periodoDe,
  periodoAte,
  folhaRows = [],
  fiscalRows = [],
  empresaNome = '',
  surface = 'vision',
  setPeriodToolbar,
}: Props) {
  const contabil = surface === 'contabilfacil';
  const [filtroNome, setFiltroNome] = useState('');
  const filtroDeferred = useDeferredValue(filtroNome);
  const somenteComMovimento = true;
  const incluirPlanoCompleto = false;
  const [linhas, setLinhas] = useState<LinhaComparativoMensal[]>([]);
  const [calculando, setCalculando] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [progressoAutomacao, setProgressoAutomacao] = useState('');
  const [processandoGarantida, setProcessandoGarantida] = useState(false);
  const automacaoAbortRef = useRef<AbortController | null>(null);
  const [resultadoCiclo, setResultadoCiclo] = useState<ResultadoAutomatizacaoCompleta | null>(null);
  const [automacaoConcluida, setAutomacaoConcluida] = useState(false);
  /** Força remontagem do comparativo após gravar lançamentos no razão. */
  const [comparativoRefreshSeq, setComparativoRefreshSeq] = useState(0);
  const [configContasOpen, setConfigContasOpen] = useState(false);
  const [infoCriticasOpen, setInfoCriticasOpen] = useState(false);
  const [razaoContaOpen, setRazaoContaOpen] = useState(false);
  const [contaRazaoSelecionada, setContaRazaoSelecionada] = useState<LinhaComparativoMensal | null>(
    null,
  );
  const [razaoContaModo, setRazaoContaModo] = useState<RazaoContaModo>('classificacao');
  const [contaConfig, setContaConfig] = useState<AutomacaoContaConfig>(() =>
    readAutomatizacaoContaConfig(empresaNome),
  );

  useEffect(() => {
    setContaConfig(readAutomatizacaoContaConfig(empresaNome));
  }, [empresaNome]);

  const qtdContasConfig = useMemo(() => papeisConfiguradosCount(contaConfig), [contaConfig]);

  const periodosBase = useMemo(
    () => buildPeriodosMensaisEntreDatas(periodoDe, periodoAte, razaoRows),
    [periodoDe, periodoAte, razaoRows],
  );

  /**
   * Só exibe colunas depois do cálculo filtrado por D/C real.
   * Nunca usa periodosBase na grade (evita mostrar 06/2001 fantasma enquanto calcula).
   */
  const [periodosVisiveis, setPeriodosVisiveis] = useState<PeriodoMensal[]>([]);
  const periodosSelecionados = periodosVisiveis;

  useEffect(() => {
    setPeriodosVisiveis([]);
    setResultadoCiclo(null);
    setAutomacaoConcluida(false);
  }, [periodoDe, periodoAte, periodosBase]);

  const mesRef = periodosSelecionados[periodosSelecionados.length - 1]?.label ?? '';

  const buildKey = useMemo(() => {
    const r0 = razaoRows[0];
    const rN = razaoRows[razaoRows.length - 1];
    const step = Math.max(1, Math.floor(razaoRows.length / 24));
    let movHash = 0;
    for (let i = 0; i < razaoRows.length; i += step) {
      const r = razaoRows[i];
      movHash += Math.round(((r.debito ?? 0) + (r.credito ?? 0)) * 100);
    }
    return [
      razaoRows.length,
      r0?.data,
      rN?.data,
      movHash,
      planoRows.length,
      periodoDe,
      periodoAte,
      somenteComMovimento,
      incluirPlanoCompleto,
      periodosBase.map((p) => p.label).join(','),
      comparativoRefreshSeq,
    ].join('|');
  }, [
    razaoRows,
    planoRows.length,
    periodoDe,
    periodoAte,
    somenteComMovimento,
    incluirPlanoCompleto,
    periodosBase,
    comparativoRefreshSeq,
  ]);

  useEffect(() => {
    if (!razaoRows.length || !periodosBase.length) {
      setLinhas([]);
      setPeriodosVisiveis([]);
      setCalculando(false);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    const totalMeses = periodosBase.length;
    setCalculando(true);
    setProgresso(`Mês 0/${totalMeses}…`);
    setLinhas([]);
    setPeriodosVisiveis([]);

    let ultimoProgresso = '';
    const onProgress = (mes: number, total: number) => {
      if (cancelled) return;
      const pct = total > 0 ? Math.round((mes / total) * 100) : 0;
      const msg = `Processando ${mes}/${total} (${pct}%)…`;
      if (msg !== ultimoProgresso) {
        ultimoProgresso = msg;
        setProgresso(msg);
      }
    };

    const aplicarResultado = (res: { periodos: PeriodoMensal[]; linhas: LinhaComparativoMensal[] }) => {
      if (cancelled) return;
      // De/Até amplo (ex. 2001–2029) NÃO gera colunas civis: só meses com D/C real.
      const doRazao = buildPeriodosMensaisEntreDatas(periodoDe, periodoAte, razaoRows);
      const permitidos = new Set(doRazao.map((p) => p.label));
      const candidatos = (res.periodos.length ? res.periodos : doRazao).filter((p) =>
        permitidos.has(p.label),
      );
      const periodosOk = filtrarPeriodosComMovimentoNasLinhas(
        candidatos.length ? candidatos : doRazao,
        res.linhas,
      );
      startTransition(() => {
        setPeriodosVisiveis(periodosOk);
        setLinhas(res.linhas);
        setProgresso('');
        setCalculando(false);
      });
    };

    const usarWorker = deveUsarWorkerComparativo(razaoRows.length, periodosBase.length);
    const promessa = usarWorker
      ? montarComparativoNoWorker({
          razaoRows,
          planoRows,
          periodos: periodosBase,
          dataDe: periodoDe,
          dataAte: periodoAte,
          somenteComMovimento,
          incluirPlanoCompleto,
          onProgress,
          signal: ac.signal,
        })
      : montarComparativoMensalAsync({
          razaoRows,
          planoRows,
          periodos: periodosBase,
          dataDe: periodoDe,
          dataAte: periodoAte,
          somenteComMovimento,
          incluirPlanoCompleto,
          onProgress,
          yieldEntreMeses: async () => {
            await new Promise<void>((r) => setTimeout(r, 0));
          },
        });

    promessa
      .then((res) => aplicarResultado(res))
      .catch((err: unknown) => {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        setProgresso('');
        setCalculando(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [
    buildKey,
    razaoRows,
    planoRows,
    periodosBase,
    periodoDe,
    periodoAte,
    somenteComMovimento,
    incluirPlanoCompleto,
  ]);

  /** Auditoria contínua (CPC + regras RF) no último mês do comparativo. */
  const auditoriaContinua = useMemo(() => {
    if (!razaoRows.length || !periodosSelecionados.length || calculando) return null;
    const ultimo = periodosSelecionados[periodosSelecionados.length - 1];
    const razaoPeriodo = filtrarRazaoPorPeriodo(razaoRows, ultimo.de, ultimo.ate);
    const bal = montarBalanceteComPeriodo(razaoRows, razaoPeriodo, planoRows, ultimo.de, ultimo.ate);
    return auditarBalanceteContinuo({ balanceteRows: bal, empresaNome, mesRef: ultimo.label });
  }, [razaoRows, planoRows, periodosSelecionados, empresaNome, buildKey, calculando]);

  const linhasFiltradas = useMemo(() => {
    const q = filtroDeferred.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter(
      (linha) =>
        linha.nome.toLowerCase().includes(q) ||
        linha.classificacao.toLowerCase().includes(q) ||
        linha.codigo.toLowerCase().includes(q),
    );
  }, [linhas, filtroDeferred]);

  const totalRows = linhasFiltradas.length;

  /** Todos os bancos do comparativo (ignora filtro de tela — automatiza todos). */
  const todasLinhasBanco = useMemo(() => deduplicarLinhasBanco(linhas), [linhas]);

  const temRelatorios = folhaRows.length > 0 || fiscalRows.length > 0;

  const baixarRelatorioPdf = useCallback(
    (resultado: ResultadoAutomatizacaoCompleta) => {
      exportAutomatizacaoBalancetePdf({
        resultado,
        empresa: empresaNome,
        periodoDe,
        periodoAte,
      });
    },
    [empresaNome, periodoDe, periodoAte],
  );

  const exportarPdfBalancete = useCallback(() => {
    if (calculando || linhas.length === 0) {
      window.alert('Aguarde o comparativo terminar de montar para exportar o PDF.');
      return;
    }
    const exportLinhas = filtroDeferred.trim() ? linhasFiltradas : linhas;
    exportBalanceteComparativoPdf({
      linhas: exportLinhas,
      periodos: periodosSelecionados,
      empresa: empresaNome,
      periodoDe,
      periodoAte,
      auditoria: auditoriaContinua,
    });
  }, [
    calculando,
    linhas,
    linhasFiltradas,
    filtroDeferred,
    periodosSelecionados,
    empresaNome,
    periodoDe,
    periodoAte,
    auditoriaContinua,
  ]);

  const exportarPdfInvertidas = useCallback(() => {
    if (!razaoRows.length) {
      window.alert('Importe o razão antes de exportar.');
      return;
    }
    exportBalanceteInvertidasPdf({
      razaoRows,
      planoRows,
      empresa: empresaNome,
    });
  }, [razaoRows, planoRows, empresaNome]);

  const handleAutomatizar = useCallback(() => {
    if (!todasLinhasBanco.length && !temRelatorios) {
      window.alert(
        'Importe o razão (conta banco) ou relatórios na aba Folha/Fiscal para automatizar.',
      );
      return;
    }
    automacaoAbortRef.current?.abort();
    const ac = new AbortController();
    automacaoAbortRef.current = ac;

    setProcessandoGarantida(true);
    setProgressoAutomacao('Iniciando…');
    setResultadoCiclo(null);
    setAutomacaoConcluida(false);

    const fiscalContaMap = readFiscalContaMap(empresaNome);
    const receitaFederalStore = readReceitaFederalRegras(empresaNome);
    const baseParams = {
      linhasComparativo: linhas,
      periodos: periodosSelecionados,
      razaoRows,
      planoRows,
      folhaRows,
      fiscalRows,
      fiscalContaMap,
      contaConfig,
      receitaFederalStore,
      empresaNome,
      signal: ac.signal,
      onProgress: (p: { fase: string; atual: number; total: number; mensagem: string }) => {
        const pct = p.total > 0 ? Math.round((p.atual / p.total) * 100) : 0;
        const label =
          p.fase === 'folha_fiscal'
            ? 'Folha/Fiscal'
            : p.fase === 'banco'
              ? 'Banco/garantida'
              : 'Gravando';
        startTransition(() => {
          setProgressoAutomacao(`${label} ${pct}% · ${p.mensagem}`);
        });
      },
    };

    const finalizar = (resultado: ResultadoAutomatizacaoCompleta) => {
      if (ac.signal.aborted) return;
      setResultadoCiclo(resultado);
      setAutomacaoConcluida(true);
      setProcessandoGarantida(false);
      setProgressoAutomacao('');
      if (resultado.lancamentosGerados.length) {
        setComparativoRefreshSeq((n) => n + 1);
      }
    };

    const run = workerAutomacaoDisponivel()
      ? executarAutomatizacaoNoWorker(baseParams).then(({ resultado, lancamentosNovos }) => {
          if (lancamentosNovos.length) {
            startTransition(() => {
              setProgressoAutomacao('Gravando lançamentos no razão…');
            });
            onRazaoRowsChange(aplicarLancamentosNoRazao(razaoRows, lancamentosNovos));
          }
          return resultado;
        })
      : Promise.resolve(
          executarAutomatizacaoCompleta({
            ...baseParams,
            empresaNome,
          }),
        ).then((resultado) => {
          if (resultado.lancamentosGerados.length) {
            onRazaoRowsChange(aplicarLancamentosNoRazao(razaoRows, resultado.lancamentosGerados));
          }
          return resultado;
        });

    run.then(finalizar)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error(err);
        window.alert(
          err instanceof Error ? err.message : 'Falha na automatização. Tente novamente.',
        );
        setProcessandoGarantida(false);
        setProgressoAutomacao('');
      });
  }, [
    linhas,
    todasLinhasBanco.length,
    temRelatorios,
    periodosSelecionados,
    razaoRows,
    planoRows,
    folhaRows,
    fiscalRows,
    empresaNome,
    contaConfig,
    onRazaoRowsChange,
  ]);

  const comparativoColSpan = useMemo(
    () => 4 + (periodosSelecionados.length > 0 ? 5 + Math.max(0, periodosSelecionados.length - 1) * 2 : 0) + 1,
    [periodosSelecionados.length],
  );

  const virtual = useVirtualWindow(linhasFiltradas.length, {
    rowHeightPx: 40,
    overscan: 8,
    threshold: 40,
    resetKey: `${linhasFiltradas.length}:${periodosSelecionados.length}:${filtroDeferred}`,
  });

  const abrirRazaoConta = useCallback((linha: LinhaComparativoMensal, modo: RazaoContaModo) => {
    setContaRazaoSelecionada(linha);
    setRazaoContaModo(modo);
    setRazaoContaOpen(true);
  }, []);

  const renderComparativoRow = useCallback(
    (props: {
      linha: LinhaComparativoMensal;
      periodos: PeriodoMensal[];
      mesRef: string;
      contabil: boolean;
      fixedHeight?: boolean;
    }) => <ComparativoLinha {...props} onAbrirRazao={abrirRazaoConta} />,
    [abrirRazaoConta],
  );

  const handleAutomatizarRef = useRef(handleAutomatizar);
  const baixarRelatorioPdfRef = useRef(baixarRelatorioPdf);
  const exportarPdfBalanceteRef = useRef(exportarPdfBalancete);
  const exportarPdfInvertidasRef = useRef(exportarPdfInvertidas);
  const resultadoCicloRef = useRef(resultadoCiclo);
  handleAutomatizarRef.current = handleAutomatizar;
  baixarRelatorioPdfRef.current = baixarRelatorioPdf;
  exportarPdfBalanceteRef.current = exportarPdfBalancete;
  exportarPdfInvertidasRef.current = exportarPdfInvertidas;

  const processandoGarantidaRef = useRef(processandoGarantida);
  processandoGarantidaRef.current = processandoGarantida;
  resultadoCicloRef.current = resultadoCiclo;

  useEffect(() => {
    const onBotRun = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string; id?: string }>).detail;
      if (detail?.tab !== 'manager' || !detail.id) return;
      const botRequestId = detail.id;

      if (!todasLinhasBanco.length && !temRelatorios) {
        emitTabBotResult(botRequestId, {
          ok: false,
          summary: 'Importe razão (banco) ou relatórios Folha/Fiscal antes do bot.',
          details: ['Abra Gerencial → Balancete comparativo com dados carregados.'],
        });
        return;
      }

      setResultadoCiclo(null);
      handleAutomatizarRef.current();

      void (async () => {
        const deadline = Date.now() + 180_000;
        let sawProcessing = false;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 400));
          if (processandoGarantidaRef.current) sawProcessing = true;
          const r = resultadoCicloRef.current;
          if (r) {
            const erros = coletarErrosRestantes(r);
            emitTabBotResult(botRequestId, {
              ok: erros.length === 0,
              summary:
                (r.lancamentosGerados?.length ?? 0) > 0
                  ? `${r.lancamentosGerados.length} lançamento(s) gerado(s) no razão.`
                  : 'Automatização concluída — confira o comparativo.',
              details: [...(r.detalhes?.slice(0, 12) ?? []), ...erros.slice(0, 6)],
              data: { lancamentos: r.lancamentosGerados?.length ?? 0 },
            });
            return;
          }
          if (sawProcessing && !processandoGarantidaRef.current) {
            emitTabBotResult(botRequestId, {
              ok: false,
              summary: 'Automatização encerrada sem resultado — veja alertas na tela.',
            });
            return;
          }
        }
        emitTabBotResult(botRequestId, {
          ok: false,
          summary: 'Timeout — automatização demorou demais.',
        });
      })();
    };

    window.addEventListener('contabilfacil-tab-bot-run', onBotRun);
    return () => window.removeEventListener('contabilfacil-tab-bot-run', onBotRun);
  }, [todasLinhasBanco.length, temRelatorios]);
  resultadoCicloRef.current = resultadoCiclo;

  const podeExportarPdf = linhas.length > 0 && !calculando && !processandoGarantida;

  const periodToolbarKey = useMemo(
    () =>
      [
        filtroNome,
        calculando ? 1 : 0,
        processandoGarantida ? 1 : 0,
        progressoAutomacao,
        qtdContasConfig,
        linhas.length,
        todasLinhasBanco.length,
        temRelatorios ? 1 : 0,
        automacaoConcluida ? 1 : 0,
        resultadoCiclo ? 1 : 0,
        podeExportarPdf ? 1 : 0,
      ].join('\0'),
    [
      filtroNome,
      calculando,
      processandoGarantida,
      progressoAutomacao,
      qtdContasConfig,
      linhas.length,
      todasLinhasBanco.length,
      temRelatorios,
      automacaoConcluida,
      resultadoCiclo,
      podeExportarPdf,
    ],
  );

  const periodToolbarNode = useMemo(
    () => (
      <div className="flex flex-wrap items-end gap-3 w-full pt-3 border-t border-brand-border/30">
        <div className="flex-1 min-w-[160px]">
          <label className="text-[9px] font-bold uppercase mb-1 block opacity-60">Filtrar</label>
          <input
            type="text"
            value={filtroNome}
            onChange={(e) => setFiltroNome(e.target.value)}
            placeholder="Nome ou classificação"
            className="w-full border border-brand-border bg-brand-bg px-3 py-2 text-xs font-mono"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={processandoGarantida || calculando}
            onClick={() => setConfigContasOpen(true)}
            className={`technical-button-secondary px-4 py-2 text-[10px] font-black uppercase ${
              qtdContasConfig > 0 ? 'border-violet-700 text-violet-800' : ''
            }`}
            title="Configuração de automação"
          >
            Configuração de automação
            {qtdContasConfig > 0 && (
              <span className="text-[9px] font-bold normal-case text-green-700 ml-1">
                ({qtdContasConfig}/{PAPEIS_AUTOMACAO_UI.length})
              </span>
            )}
          </button>
          <button
            type="button"
            disabled={!podeExportarPdf}
            onClick={() => exportarPdfBalanceteRef.current()}
            className="technical-button-primary px-5 py-2 text-[10px] font-black uppercase disabled:opacity-40"
            title="PDF do comparativo mensal, auditoria RF/CPC e contas invertidas (*)"
          >
            Exportar PDF
          </button>
          <button
            type="button"
            disabled={!razaoRows.length || calculando}
            onClick={() => exportarPdfInvertidasRef.current()}
            className="technical-button-secondary px-4 py-2 text-[10px] font-black uppercase disabled:opacity-40"
            title="PDF só com contas de natureza invertida, mês a mês"
          >
            PDF Invertidas
          </button>
          <button
            type="button"
            disabled={processandoGarantida || calculando || (!todasLinhasBanco.length && !temRelatorios)}
            onClick={() => handleAutomatizarRef.current()}
            className="technical-button-secondary px-5 py-2 text-[10px] font-black uppercase disabled:opacity-40"
            title="Conferência folha/fiscal e ciclo banco/garantida"
          >
            {processandoGarantida ? progressoAutomacao || 'Automatizando…' : 'Automatizar'}
          </button>
          <button
            type="button"
            disabled={!automacaoConcluida || !resultadoCicloRef.current}
            onClick={() => {
              const r = resultadoCicloRef.current;
              if (r) baixarRelatorioPdfRef.current(r);
            }}
            className={`technical-button-secondary px-4 py-2 text-[10px] font-black uppercase ${
              automacaoConcluida && resultadoCicloRef.current
                ? 'border-green-700 text-green-800'
                : 'opacity-40'
            }`}
            title="PDF após rodar Automatizar (lançamentos gerados)"
          >
            PDF Automação
          </button>
        </div>
      </div>
    ),
    [periodToolbarKey],
  );

  useEffect(() => {
    if (!contabil || !setPeriodToolbar) return;
    setPeriodToolbar(periodToolbarNode);
  }, [contabil, setPeriodToolbar, periodToolbarNode]);

  useEffect(() => {
    if (!contabil || !setPeriodToolbar) return;
    return () => setPeriodToolbar(null);
  }, [contabil, setPeriodToolbar]);

  if (!razaoRows.length) {
    return <p className="text-[11px] text-slate-400">Importe o razão com datas para o comparativo.</p>;
  }

  if (calculando && !periodosSelecionados.length) {
    return (
      <p className="text-[11px] text-slate-400">
        Montando comparativo… {progresso || 'filtrando meses com movimento…'}
      </p>
    );
  }

  if (!periodosSelecionados.length) {
    return (
      <p className="text-[11px] text-amber-300/90">
        Nenhum mês com débito/crédito entre {periodoDe} e {periodoAte}. Ajuste o período ou importe o razão.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {auditoriaContinua && auditoriaContinua.total > 0 && (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setInfoCriticasOpen(true)}
              className={
                contabil
                  ? 'technical-button-secondary text-[10px] px-3 py-1.5 flex items-center gap-2'
                  : 'px-3 py-1.5 rounded border border-red-700 bg-red-950/60 text-red-200 text-[11px] font-black uppercase flex items-center gap-2'
              }
              title="Abrir informações críticas"
            >
              <span className="h-5 w-5 border border-current flex items-center justify-center text-[10px] font-black">i</span>
              Informações críticas
            </button>
          </div>

          {infoCriticasOpen && (
            <div
              className={
                contabil
                  ? 'fixed inset-0 z-[220] flex items-center justify-center p-4 bg-brand-text/40'
                  : 'fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/70'
              }
              onClick={() => setInfoCriticasOpen(false)}
            >
              <div
                className={
                  contabil
                    ? 'w-full max-w-4xl max-h-[85vh] overflow-auto technical-panel shadow-[8px_8px_0_0_#141414] bg-brand-bg'
                    : 'w-full max-w-4xl max-h-[85vh] overflow-auto rounded-xl border border-red-700 bg-red-950/90'
                }
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className={
                    contabil
                      ? 'px-4 py-3 border-b border-brand-border flex items-center justify-between gap-2 bg-brand-sidebar/30'
                      : 'px-4 py-3 border-b border-red-700 flex items-center justify-between gap-2'
                  }
                >
                  <p className={contabil ? 'text-[10px] font-black uppercase tracking-wider text-red-900' : 'text-[11px] font-black uppercase tracking-wider text-red-200'}>
                    Auditoria contábil (RF + CPC) — {auditoriaContinua.criticos} crítico(s),{' '}
                    {auditoriaContinua.alertas} alerta(s) · score {auditoriaContinua.score} ·{' '}
                    {agruparAchadosAuditoriaPorTipo(auditoriaContinua.achados).length} tipo(s) de problema
                    {auditoriaContinua.bancosComProblema > 0 &&
                      ` · ${auditoriaContinua.bancosComProblema} banco(s) com divergência`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setInfoCriticasOpen(false)}
                    className={
                      contabil
                        ? 'h-6 w-6 border border-brand-border flex items-center justify-center hover:bg-brand-sidebar/30'
                        : 'h-6 w-6 border border-red-500 text-red-200 flex items-center justify-center'
                    }
                    aria-label="Fechar informações críticas"
                  >
                    ×
                  </button>
                </div>
                <div className={contabil ? 'px-4 py-3 text-xs space-y-2' : 'px-4 py-3 text-xs text-red-100 space-y-2'}>
                  <AchadosAuditoriaAgrupadosLista achados={auditoriaContinua.achados} contabil={contabil} />
                  <p className="text-[10px] opacity-70">
                    Sincronize regras em Configurações → Receita Federal. Contas invertidas em vermelho na grade. Use{' '}
                    <strong>Exportar PDF</strong> na barra de período para baixar este relatório.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {!contabil && (
      <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/15 p-3 space-y-2">
        <p className="text-[10px] text-slate-400">
          <strong className="text-cyan-300">Modo comparativo</strong> · {periodoDe} a {periodoAte} ·{' '}
          {periodosSelecionados.length} mês(es)
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[140px]">
            <label className="text-[10px] font-bold uppercase mb-1 block opacity-60">Filtrar conta</label>
            <input
              type="text"
              value={filtroNome}
              onChange={(e) => setFiltroNome(e.target.value)}
              placeholder="Nome ou classificação"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={processandoGarantida || calculando}
              onClick={() => setConfigContasOpen(true)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-[11px] font-black uppercase tracking-wide transition-all ${
                qtdContasConfig > 0
                  ? 'border-violet-400/60 bg-violet-950/40 text-violet-200 hover:bg-violet-900/50'
                  : 'border-slate-600 bg-slate-900/80 text-slate-300 hover:border-violet-500/40'
              }`}
            >
              Configuração de automação
            </button>
            <button
              type="button"
              disabled={processandoGarantida || calculando || (!todasLinhasBanco.length && !temRelatorios)}
              onClick={handleAutomatizar}
              className="px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-wide"
            >
              {processandoGarantida ? progressoAutomacao || 'Automatizando…' : 'Automatizar'}
            </button>
            <button
              type="button"
              disabled={!automacaoConcluida || !resultadoCiclo}
              onClick={() => resultadoCiclo && baixarRelatorioPdf(resultadoCiclo)}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-wide border transition-all ${
                automacaoConcluida && resultadoCiclo
                  ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400 text-white'
                  : 'bg-slate-800/80 border-slate-600 text-slate-500 cursor-not-allowed'
              }`}
            >
              Relatório
            </button>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 w-full">
          Use <strong className="text-violet-300">Configuração de automação</strong> para fixar contas da automatização.
        </p>
      </div>
      )}

      <AutomatizacaoContaConfigModal
        open={configContasOpen}
        onClose={() => setConfigContasOpen(false)}
        planoRows={planoRows}
        empresaNome={empresaNome}
        onSaved={setContaConfig}
        surface={contabil ? 'contabilfacil' : 'vision'}
      />
      <RazaoContaLancamentosModal
        open={razaoContaOpen}
        onClose={() => {
          setRazaoContaOpen(false);
          setContaRazaoSelecionada(null);
        }}
        razaoRows={razaoRows}
        planoRows={planoRows}
        conta={contaRazaoSelecionada}
        modo={razaoContaModo}
        periodoDe={periodoDe}
        periodoAte={periodoAte}
        surface={contabil ? 'contabilfacil' : 'vision'}
      />
      {resultadoCiclo && <ResultadoAutomatizacaoCompacto resultado={resultadoCiclo} />}

      {calculando && linhas.length === 0 ? (
        <div
          className={
            contabil
              ? 'technical-panel p-8 text-center text-[10px] font-mono uppercase opacity-60'
              : 'rounded-xl border border-slate-800 p-8 text-center text-slate-400 text-sm'
          }
        >
          Montando comparativo…
          {progresso ? (
            <p className="mt-2 text-[9px] font-mono normal-case tracking-normal">{progresso}</p>
          ) : null}
        </div>
      ) : (
        <div
          className={
            contabil
              ? 'module-table-viewport-stacked notranslate'
              : 'module-table-viewport-stacked rounded-xl border border-slate-800 notranslate'
          }
        >
          <div
            ref={virtual.useVirtual ? virtual.scrollRef : undefined}
            onScroll={virtual.useVirtual ? virtual.onScroll : undefined}
            className={`module-table-viewport-scroll ${contabil ? '' : 'custom-scrollbar'}`}
          >
          <table className="w-full text-left text-[11px] min-w-max border-collapse">
            <thead className={contabil ? 'technical-grid-header sticky top-0 z-10' : 'bg-slate-800 text-slate-400 sticky top-0 z-10'}>
              <tr>
                <th translate="no" className="p-2 font-bold">
                  Código
                </th>
                <th translate="no" className="p-2 font-bold">
                  Classificação
                </th>
                <th translate="no" className="p-2 font-bold">
                  Descrição
                </th>
                <th translate="no" className="p-2 font-bold text-center w-24">
                  Tipo
                </th>
                {periodosSelecionados.map((p, idx) => {
                  const hl = contabil
                    ? p.label === mesRef
                      ? 'bg-brand-sidebar/60'
                      : ''
                    : p.label === mesRef
                      ? 'text-cyan-300 bg-cyan-950/40'
                      : '';
                  if (idx === 0) {
                    return (
                      <React.Fragment key={`h-${p.label}`}>
                        <th translate="no" className={`p-2 font-bold whitespace-nowrap ${hl}`}>
                          Data {p.label}
                        </th>
                        <th translate="no" className={`p-2 font-bold text-right whitespace-nowrap ${hl}`}>
                          SI {p.label}
                        </th>
                        <th translate="no" className={`p-2 font-bold text-right whitespace-nowrap ${hl}`}>
                          D {p.label}
                        </th>
                        <th translate="no" className={`p-2 font-bold text-right whitespace-nowrap ${hl}`}>
                          C {p.label}
                        </th>
                        <th translate="no" className={`p-2 font-bold text-right whitespace-nowrap ${hl}`}>
                          SF {p.label}
                        </th>
                      </React.Fragment>
                    );
                  }
                  return (
                    <React.Fragment key={`h-${p.label}`}>
                      <th translate="no" className={`p-2 font-bold whitespace-nowrap ${hl}`}>
                        Data {p.label}
                      </th>
                      <th translate="no" className={`p-2 font-bold text-right whitespace-nowrap ${hl}`}>
                        SF {p.label}
                      </th>
                    </React.Fragment>
                  );
                })}
                <th
                  translate="no"
                  className={`p-2 font-bold text-center w-20 ${contabil ? '' : 'sticky right-0 bg-slate-800 z-[11]'}`}
                >
                  Natureza
                </th>
              </tr>
            </thead>
            <ComparativoVirtualBody
              linhas={linhasFiltradas}
              periodos={periodosSelecionados}
              mesRef={mesRef}
              contabil={contabil}
              virtual={virtual}
              colSpan={comparativoColSpan}
              renderRow={renderComparativoRow}
            />
          </table>
          </div>
          {totalRows > 0 && (
            <p
              className={`module-table-viewport-footer text-[9px] p-2 border-t ${
                contabil ? 'border-brand-border font-mono opacity-60 bg-white' : 'text-slate-500 border-slate-800 bg-slate-950/95'
              }`}
            >
              {totalRows.toLocaleString('pt-BR')} conta(s)
              {virtual.useVirtual ? ' · scroll virtual (só linhas visíveis na tela)' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export const BalanceteComparativoMensal = memo(ComparativoMensalInner);
