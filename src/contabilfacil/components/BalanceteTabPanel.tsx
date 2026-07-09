import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Filter } from 'lucide-react';
import type { VisionBalanceteRow } from '../../extratoVision/types/accounting';
import ContabilBalanceteComparativo from './ContabilBalanceteComparativo';
import { parseBrDateToTime } from '../../extratoVision/utils/dateBounds';
import { extrairPeriodoRazao } from '../logic/balancetePeriodoView';
import { cn } from '../lib/utils';
import { accountPlansToVisionPlano } from '../logic/contabilPipeline';

type AccountPlan = {
  code: string;
  name: string;
  codigoReduzido?: string;
  tipo?: 'S' | 'A';
  nivel?: number;
};

type FolhaRelatorioRow = {
  id: string;
  date: string;
  description: string;
  debito: number;
  credito: number;
};

export interface BalanceteTabPanelProps {
  selectedCompany: string;
  planoContas: AccountPlan[];
  razaoRows: VisionBalanceteRow[];
  onRazaoRowsChange: (rows: VisionBalanceteRow[]) => void;
  folhaRelatorio?: FolhaRelatorioRow[];
}

function folhaRelatorioToVision(rows: FolhaRelatorioRow[]): VisionBalanceteRow[] {
  return rows.map((r, index) => ({
    codigo: '',
    nome: r.description.toUpperCase(),
    data: r.date,
    ordem: index + 1,
    debito: r.debito,
    credito: r.credito,
    saldoInicial: 0,
    saldoFinal: 0,
  }));
}

export default function BalanceteTabPanel({
  selectedCompany,
  planoContas,
  razaoRows,
  onRazaoRowsChange,
  folhaRelatorio = [],
}: BalanceteTabPanelProps) {
  const [periodoDe, setPeriodoDe] = useState('');
  const [periodoAte, setPeriodoAte] = useState('');
  const [periodoConfirmado, setPeriodoConfirmado] = useState<{ de: string; ate: string } | null>(null);
  const [periodToolbar, setPeriodToolbar] = useState<React.ReactNode>(null);
  const razaoLenAnterior = useRef(0);
  /** Usuário clicou OK/Limpar — não sobrescrever De/Até em imports seguintes. */
  const periodoManualRef = useRef(false);

  const planoVision = useMemo(() => accountPlansToVisionPlano(planoContas), [planoContas]);
  const folhaVision = useMemo(() => folhaRelatorioToVision(folhaRelatorio), [folhaRelatorio]);
  const periodoRazao = useMemo(() => extrairPeriodoRazao(razaoRows), [razaoRows]);

  useEffect(() => {
    razaoLenAnterior.current = 0;
    periodoManualRef.current = false;
    setPeriodoDe('');
    setPeriodoAte('');
    setPeriodoConfirmado(null);
    setPeriodToolbar(null);
  }, [selectedCompany]);

  /** Após importar TXT ou carregar razão salvo, aplica o intervalo min–max automaticamente. */
  useEffect(() => {
    if (razaoRows.length === 0) {
      razaoLenAnterior.current = 0;
      return;
    }
    const { min, max } = periodoRazao;
    if (!min || !max) return;

    const len = razaoRows.length;
    const primeiraCarga = razaoLenAnterior.current === 0 && len > 0;
    razaoLenAnterior.current = len;

    if (primeiraCarga && !periodoManualRef.current) {
      setPeriodoDe(min);
      setPeriodoAte(max);
      setPeriodoConfirmado({ de: min, ate: max });
    }
  }, [razaoRows, periodoRazao.min, periodoRazao.max]);

  const aplicarPeriodo = useCallback(() => {
    const de = periodoDe.trim();
    const ate = periodoAte.trim();
    if (!de || !ate) {
      window.alert('Informe a data De e a data Até para exibir o balancete.');
      return;
    }
    const tDe = parseBrDateToTime(de);
    const tAte = parseBrDateToTime(ate);
    if (tDe === null || tAte === null) {
      window.alert('Datas inválidas. Use o formato DD/MM/AAAA (ex.: 01/12/2024).');
      return;
    }
    if (tDe > tAte) {
      window.alert('A data De não pode ser posterior à data Até.');
      return;
    }
    periodoManualRef.current = true;
    setPeriodoConfirmado({ de, ate });
  }, [periodoDe, periodoAte]);

  const limparPeriodo = useCallback(() => {
    periodoManualRef.current = false;
    setPeriodoDe('');
    setPeriodoAte('');
    setPeriodoConfirmado(null);
  }, []);

  const temRazao = razaoRows.length > 0;
  const temPlano = planoContas.length > 0;

  return (
    <div className="space-y-6">
      <div className="p-4 bg-brand-sidebar/35 border border-brand-border text-xs flex justify-between items-center">
        <div>
          <span className="font-bold">Balancete</span>
          <p className="opacity-60 text-[9px]">
            De/Até é só a janela do filtro. As colunas do comparativo ignoram meses/anos sem
            lançamento (D/C) — ex.: De 26/06/2001 e Até 26/06/2029 com movimento só em 06/2026 →
            aparece só a coluna 06/2026.
          </p>
        </div>
        <div className="text-[10px] bg-red-800 text-white font-mono px-2 py-0.5 animate-pulse rounded-none border border-red-950">
          REGRA REVERSA: Naturezas invertidas em vermelho forte
        </div>
      </div>

      {(temRazao || temPlano) && (
        <div
          className={cn(
            'technical-panel p-4 space-y-3',
            !periodoConfirmado && 'border-amber-600/50 bg-amber-50/30',
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Filter size={14} className="opacity-50" />
            <span className="text-[10px] font-black uppercase tracking-widest">
              Período <span className="text-amber-700">*</span>
            </span>
            {temRazao && (
              <span className="text-[9px] font-mono bg-brand-border text-brand-bg px-2 py-0.5 font-bold">
                {razaoRows.length.toLocaleString('pt-BR')} lançamento(s) no razão
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider opacity-60 mb-1 block">De</label>
              <input aria-label="De"
                type="text"
                placeholder="DD/MM/AAAA"
                value={periodoDe}
                onChange={(e) => setPeriodoDe(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && aplicarPeriodo()}
                className="w-36 border border-brand-border bg-brand-bg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand-border"
                maxLength={10}
              />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider opacity-60 mb-1 block">Até</label>
              <input aria-label="Até"
                type="text"
                placeholder="DD/MM/AAAA"
                value={periodoAte}
                onChange={(e) => setPeriodoAte(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && aplicarPeriodo()}
                className="w-36 border border-brand-border bg-brand-bg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand-border"
                maxLength={10}
              />
            </div>
            <button
              type="button"
              onClick={aplicarPeriodo}
              disabled={!periodoDe.trim() || !periodoAte.trim()}
              className="technical-button-primary px-4 py-2 text-[10px] font-black uppercase disabled:opacity-40"
            >
              OK
            </button>
            {(periodoDe || periodoAte || periodoConfirmado) && (
              <button
                type="button"
                onClick={limparPeriodo}
                className="technical-button-secondary px-3 py-2 text-[10px] font-bold uppercase"
              >
                Limpar
              </button>
            )}
          </div>
          {periodoConfirmado && periodToolbar}
          {periodoRazao.min && periodoRazao.max ? (
            <p className="text-[9px] font-mono text-slate-600">
              Lançamentos no razão: <strong>{periodoRazao.min}</strong> a{' '}
              <strong>{periodoRazao.max}</strong>
              {!periodoConfirmado ? ' — confirme De/Até e clique OK' : ' · colunas só nesses meses com movimento'}
            </p>
          ) : null}
        </div>
      )}

      {!temRazao && !temPlano && (
        <div className="technical-panel p-12 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Importe o plano de contas e os lançamentos (TXT Domínio) para montar o balancete.
        </div>
      )}

      {temRazao && !periodoConfirmado && (
        <div className="technical-panel p-10 text-center space-y-3 border-amber-600/40 bg-amber-50/20">
          <Calendar size={32} className="mx-auto opacity-40" />
          <p className="text-sm font-black uppercase tracking-tight">Montando balancete…</p>
          <p className="text-[10px] opacity-70 max-w-md mx-auto leading-relaxed">
            {razaoRows.length.toLocaleString('pt-BR')} lançamento(s) importado(s).
            {periodoRazao.min && periodoRazao.max ? (
              <>
                {' '}
                Período detectado: <strong>{periodoRazao.min}</strong> a <strong>{periodoRazao.max}</strong>.
              </>
            ) : (
              <> Informe <strong>De</strong> e <strong>Até</strong> e clique em <strong>OK</strong>.</>
            )}
          </p>
        </div>
      )}

      {periodoConfirmado && temRazao && (
        <ContabilBalanceteComparativo
          razaoRows={razaoRows}
          planoRows={planoVision}
          onRazaoRowsChange={onRazaoRowsChange}
          periodoDe={periodoConfirmado.de}
          periodoAte={periodoConfirmado.ate}
          folhaRows={folhaVision}
          fiscalRows={[]}
          empresaNome={selectedCompany}
          setPeriodToolbar={setPeriodToolbar}
        />
      )}
    </div>
  );
}
