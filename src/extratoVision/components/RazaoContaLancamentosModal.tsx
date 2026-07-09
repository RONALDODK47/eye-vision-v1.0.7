import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import type { VisionBalanceteRow, VisionPlanoRow } from '../types/accounting';
import { getClassificacao } from '../utils/demonstracoesContabeis';
import { type LinhaComparativoMensal } from '../utils/balanceteComparativoMensal';
import {
  buildPlanoLookup,
  filtrarRazaoPorPeriodo,
  sortRowsByDataRazao,
  type PlanoLookup,
} from '../utils/razaoContabil';

export type RazaoContaModo = 'codigo' | 'classificacao';

type ContaSelecionada = Pick<
  LinhaComparativoMensal,
  'chave' | 'codigo' | 'classificacao' | 'nome' | 'tipo'
>;

type Props = {
  open: boolean;
  onClose: () => void;
  razaoRows: VisionBalanceteRow[];
  planoRows?: VisionPlanoRow[];
  conta: ContaSelecionada | null;
  /** codigo = só lançamentos do código reduzido; classificacao = só da classificação do balancete. */
  modo: RazaoContaModo;
  periodoDe: string;
  periodoAte: string;
  surface?: 'vision' | 'contabilfacil';
};

function normDigits(s: string): string {
  const d = s.replace(/\D/g, '');
  if (!d) return '';
  return d.replace(/^0+/, '') || '0';
}

function normCls(s: string): string {
  return s.replace(/\./g, '').replace(/\s/g, '');
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 0.005) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Classificação hierárquica do plano (nunca o reduzido repetido). */
function classificacaoDoPlano(
  row: VisionBalanceteRow,
  conta: ContaSelecionada,
  lookup?: PlanoLookup,
): string {
  const clsConta = (conta.classificacao || '').trim();
  if (clsConta.includes('.')) {
    const rowCod = normDigits(row.codigo || '');
    const contaCod = normDigits(conta.codigo || '');
    const rowCls = normCls(getClassificacao(row));
    const alvoCls = normCls(clsConta);
    if (contaCod && rowCod === contaCod) return clsConta;
    if (alvoCls && (rowCls === alvoCls || rowCls.startsWith(alvoCls))) return clsConta;
  }

  if (lookup) {
    const red = normDigits(row.codigo || '');
    if (red) {
      const hit = lookup.byReduced.get(red);
      if (hit?.codigo?.includes('.')) return hit.codigo;
    }
    const cls = normCls(row.classificacao || row.codigo || '');
    if (cls) {
      const hit = lookup.byCls.get(cls);
      if (hit?.codigo?.includes('.')) return hit.codigo;
    }
  }

  const raw = (row.classificacao || '').trim();
  if (raw.includes('.')) return raw;
  const viaGet = getClassificacao(row);
  if (viaGet.includes('.')) return viaGet;
  return clsConta.includes('.') ? clsConta : viaGet || raw || '—';
}

function codigoExibicao(row: VisionBalanceteRow, conta: ContaSelecionada, lookup?: PlanoLookup): string {
  const red = (row.codigo || '').trim();
  if (red && !red.includes('.')) return red;
  if (lookup) {
    const cls = normCls(getClassificacao(row) || conta.classificacao || '');
    const hit = cls ? lookup.byCls.get(cls) : undefined;
    if (hit?.codigoReduzido) return hit.codigoReduzido;
  }
  return (conta.codigo || red || '—').trim();
}

/** Lançamentos do razão filtrados pelo modo (código ou classificação do balancete). */
export function filtrarLancamentosRazaoDaConta(
  razaoRows: VisionBalanceteRow[],
  conta: ContaSelecionada,
  periodoDe: string,
  periodoAte: string,
  modo: RazaoContaModo,
  planoRows: VisionPlanoRow[] = [],
): VisionBalanceteRow[] {
  const noPeriodo = filtrarRazaoPorPeriodo(razaoRows, periodoDe, periodoAte);
  const lookup = planoRows.length > 0 ? buildPlanoLookup(planoRows) : undefined;
  const clsAlvo = normCls(conta.classificacao || '');
  const codAlvo = normDigits(conta.codigo || '');
  const sintetica = conta.tipo === 'S';

  const filtrado = noPeriodo.filter((r) => {
    const rowCod = normDigits(r.codigo || '');
    const rowClsRaw = getClassificacao(r);
    const rowCls = normCls(rowClsRaw);
    const clsPlano = classificacaoDoPlano(r, conta, lookup);
    const rowClsPlano = normCls(clsPlano);

    if (modo === 'codigo') {
      if (!codAlvo) return false;
      if (rowCod === codAlvo) return true;
      // Linha só com classificação: casa via plano → reduzido
      if (lookup && rowCls) {
        const hit = lookup.byCls.get(rowCls);
        if (hit && normDigits(hit.codigoReduzido || '') === codAlvo) return true;
      }
      return false;
    }

    // modo classificacao
    if (!clsAlvo) return false;
    if (rowCls === clsAlvo || rowClsPlano === clsAlvo) return true;
    if (codAlvo && rowCod === codAlvo) return true;
    if (sintetica) {
      if (rowCls.startsWith(clsAlvo) && rowCls.length > clsAlvo.length) return true;
      if (rowClsPlano.startsWith(clsAlvo) && rowClsPlano.length > clsAlvo.length) return true;
    }
    return false;
  });

  return sortRowsByDataRazao(filtrado);
}

export function RazaoContaLancamentosModal({
  open,
  onClose,
  razaoRows,
  planoRows = [],
  conta,
  modo,
  periodoDe,
  periodoAte,
  surface = 'contabilfacil',
}: Props) {
  const contabil = surface === 'contabilfacil';

  const lookup = useMemo(
    () => (planoRows.length > 0 ? buildPlanoLookup(planoRows) : undefined),
    [planoRows],
  );

  const lancamentos = useMemo(() => {
    if (!open || !conta) return [];
    return filtrarLancamentosRazaoDaConta(
      razaoRows,
      conta,
      periodoDe,
      periodoAte,
      modo,
      planoRows,
    );
  }, [open, conta, razaoRows, periodoDe, periodoAte, modo, planoRows]);

  const totais = useMemo(() => {
    let deb = 0;
    let cred = 0;
    for (const r of lancamentos) {
      deb += r.debito ?? 0;
      cred += r.credito ?? 0;
    }
    return { deb, cred };
  }, [lancamentos]);

  if (!open || !conta) return null;

  const tituloModo = modo === 'codigo' ? 'por código' : 'por classificação';
  const mostrarCodigo = modo === 'codigo';
  const mostrarClassificacao = modo === 'classificacao';

  const overlay = contabil
    ? 'fixed inset-0 z-[220] flex items-center justify-center p-4 bg-brand-text/40'
    : 'fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/70';
  const panel = contabil
    ? 'technical-panel w-full max-w-4xl max-h-[85vh] flex flex-col shadow-[6px_6px_0_0_#141414] bg-brand-bg'
    : 'w-full max-w-4xl max-h-[85vh] flex flex-col rounded-xl border border-slate-700 bg-slate-950 shadow-2xl';
  const head = contabil
    ? 'flex items-start justify-between gap-3 p-4 border-b border-brand-border'
    : 'flex items-start justify-between gap-3 p-4 border-b border-slate-700';
  const th = contabil
    ? 'px-3 py-2 text-[9px] font-black uppercase tracking-wider border-r border-brand-border bg-brand-sidebar'
    : 'px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-700';
  const td = contabil
    ? 'px-3 py-2 border-r border-brand-border/20 text-[11px] font-mono'
    : 'px-3 py-2 text-[11px] font-mono border-b border-slate-800';

  const colSpanTotais = 2 + (mostrarCodigo ? 1 : 0) + (mostrarClassificacao ? 1 : 0);

  return (
    <div
      className={overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`Razão da conta ${conta.nome}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={panel}>
        <div className={head}>
          <div className="min-w-0 space-y-1">
            <p
              className={
                contabil
                  ? 'text-[10px] font-black uppercase tracking-widest opacity-50'
                  : 'text-[10px] font-black uppercase tracking-widest text-slate-500'
              }
            >
              Razão da conta · {tituloModo}
            </p>
            <h2
              className={
                contabil
                  ? 'text-sm font-black uppercase tracking-tight truncate'
                  : 'text-sm font-black uppercase tracking-tight text-cyan-200 truncate'
              }
              title={conta.nome}
            >
              {conta.nome}
            </h2>
            <p className="text-[10px] font-mono opacity-70">
              {modo === 'codigo'
                ? `Código ${conta.codigo || '—'}`
                : `Classificação ${conta.classificacao || '—'}`}
              {conta.tipo === 'S' && modo === 'classificacao' ? ' · Sintética (filhas)' : ''}
            </p>
            <p className="text-[9px] font-mono opacity-50">
              Período {periodoDe} a {periodoAte} · {lancamentos.length.toLocaleString('pt-BR')}{' '}
              lançamento(s)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={
              contabil
                ? 'technical-button-secondary p-2 shrink-0'
                : 'p-2 rounded border border-slate-600 text-slate-300 hover:bg-slate-800 shrink-0'
            }
            aria-label="Fechar razão da conta"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {lancamentos.length === 0 ? (
            <p
              className={
                contabil
                  ? 'p-10 text-center text-[10px] font-bold uppercase tracking-widest opacity-40'
                  : 'p-10 text-center text-sm text-slate-500'
              }
            >
              Nenhum lançamento desta conta no período.
            </p>
          ) : (
            <table className="w-full text-left border-collapse min-w-[560px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={th}>Data</th>
                  {mostrarCodigo ? <th className={th}>Código</th> : null}
                  {mostrarClassificacao ? <th className={th}>Classificação</th> : null}
                  <th className={th}>Histórico</th>
                  <th className={`${th} text-right`}>Débito</th>
                  <th className={`${th} text-right`}>Crédito</th>
                </tr>
              </thead>
              <tbody>
                {lancamentos.map((r, i) => (
                  <tr
                    key={`${r.ordem ?? i}-${r.data}-${r.codigo}-${r.debito}-${r.credito}`}
                    className={contabil ? 'technical-grid-row' : 'hover:bg-slate-900/60'}
                  >
                    <td className={`${td} whitespace-nowrap`}>{r.data || '—'}</td>
                    {mostrarCodigo ? (
                      <td className={td}>{codigoExibicao(r, conta, lookup)}</td>
                    ) : null}
                    {mostrarClassificacao ? (
                      <td className={td}>{classificacaoDoPlano(r, conta, lookup)}</td>
                    ) : null}
                    <td
                      className={`${td} ${contabil ? 'uppercase italic' : 'text-slate-300'} max-w-[280px] truncate`}
                      title={r.nome}
                    >
                      {r.nome || '—'}
                    </td>
                    <td className={`${td} text-right ${contabil ? 'text-red-700' : 'text-red-400'}`}>
                      {fmtMoney(r.debito ?? 0)}
                    </td>
                    <td className={`${td} text-right ${contabil ? 'text-green-700' : 'text-emerald-400'}`}>
                      {fmtMoney(r.credito ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  className={
                    contabil
                      ? 'bg-brand-sidebar/40 font-black'
                      : 'bg-slate-900 font-black text-slate-200'
                  }
                >
                  <td className={td} colSpan={colSpanTotais}>
                    Totais
                  </td>
                  <td className={`${td} text-right`}>{fmtMoney(totais.deb)}</td>
                  <td className={`${td} text-right`}>{fmtMoney(totais.cred)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default RazaoContaLancamentosModal;
