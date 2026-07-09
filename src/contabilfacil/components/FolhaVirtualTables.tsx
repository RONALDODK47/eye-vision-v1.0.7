import { memo, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../lib/utils';
import { useVirtualWindow, VirtualSpacerRow } from '../lib/useVirtualWindow';

const REL_COL_SPAN = 4;
const PAYROLL_COL_SPAN = 7;
const ROW_HEIGHT_PX = 40;

export interface FolhaRelatorioRow {
  id: string;
  date: string;
  description: string;
  debito: number;
  credito: number;
}

export interface FolhaPayrollRow {
  id: string;
  name: string;
  baseSalary: number;
  inss: number;
  fgts: number;
  irrf: number;
  net: number;
}

const RelatorioRow = memo(function RelatorioRow({
  row,
  fixedHeight,
}: {
  row: FolhaRelatorioRow;
  fixedHeight?: boolean;
}) {
  return (
    <tr className={cn('technical-grid-row', fixedHeight && 'h-10 max-h-10')}>
      <td className="px-4 py-3 border-r border-brand-border/10 whitespace-nowrap">{formatDate(row.date)}</td>
      <td className="px-4 py-3 border-r border-brand-border/10 uppercase italic font-bold truncate max-w-[280px]" title={row.description}>
        {row.description}
      </td>
      <td className="px-4 py-3 border-r border-brand-border/10 text-right text-red-600">{formatCurrency(row.debito)}</td>
      <td className="px-4 py-3 text-right text-emerald-700">{formatCurrency(row.credito)}</td>
    </tr>
  );
});

export const FolhaRelatorioVirtualTable = memo(function FolhaRelatorioVirtualTable({
  rows,
}: {
  rows: FolhaRelatorioRow[];
}) {
  const resetKey = useMemo(() => `${rows.length}:${rows[0]?.id ?? ''}`, [rows]);
  const virtual = useVirtualWindow(rows.length, { rowHeightPx: ROW_HEIGHT_PX, resetKey });

  if (rows.length === 0) {
    return (
      <div className="module-table-viewport">
        <table className="w-full min-w-[720px] text-left text-sm border-collapse">
          <thead className="technical-grid-header sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 border-r border-brand-border bg-brand-sidebar">Data</th>
              <th className="px-4 py-3 border-r border-brand-border bg-brand-sidebar">Descrição</th>
              <th className="px-4 py-3 border-r border-brand-border text-right bg-brand-sidebar">Débito</th>
              <th className="px-4 py-3 text-right bg-brand-sidebar">Crédito</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={REL_COL_SPAN} className="py-12 text-center font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                Sem lançamentos importados. Use OCR/PDF na coluna ao lado.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  const visibleRows = virtual.useVirtual ? rows.slice(virtual.startIndex, virtual.endIndex) : rows;

  const body = (
    <tbody className="font-mono text-[11px] divide-y divide-brand-border/10">
      {virtual.useVirtual && <VirtualSpacerRow colSpan={REL_COL_SPAN} height={virtual.paddingTop} />}
      {visibleRows.map((row, i) => {
        const index = virtual.useVirtual ? virtual.startIndex + i : i;
        return <RelatorioRow key={row.id || `rel-${index}`} row={row} fixedHeight={virtual.useVirtual} />;
      })}
      {virtual.useVirtual && <VirtualSpacerRow colSpan={REL_COL_SPAN} height={virtual.paddingBottom} />}
    </tbody>
  );

  const head = (
    <thead className="technical-grid-header sticky top-0 z-10">
      <tr>
        <th className="px-4 py-3 border-r border-brand-border bg-brand-sidebar">Data</th>
        <th className="px-4 py-3 border-r border-brand-border bg-brand-sidebar">Descrição</th>
        <th className="px-4 py-3 border-r border-brand-border text-right bg-brand-sidebar">Débito</th>
        <th className="px-4 py-3 text-right bg-brand-sidebar">Crédito</th>
      </tr>
    </thead>
  );

  if (!virtual.useVirtual) {
    return (
      <div className="module-table-viewport">
        <table className="w-full min-w-[720px] text-left text-sm border-collapse">
          {head}
          {body}
        </table>
      </div>
    );
  }

  return (
    <div ref={virtual.scrollRef} className="module-table-viewport" onScroll={virtual.onScroll}>
      <table className="w-full min-w-[720px] text-left text-sm border-collapse">
        {head}
        {body}
      </table>
    </div>
  );
});

const PayrollRow = memo(function PayrollRow({
  row,
  onDelete,
  fixedHeight,
}: {
  row: FolhaPayrollRow;
  onDelete: (id: string) => void;
  fixedHeight?: boolean;
}) {
  return (
    <tr className={cn('technical-grid-row', fixedHeight && 'h-10 max-h-10')}>
      <td className="px-6 py-3 border-r border-brand-border/10 font-bold uppercase italic truncate max-w-[200px]" title={row.name}>
        {row.name}
      </td>
      <td className="px-6 py-3 border-r border-brand-border/10 text-right">{formatCurrency(row.baseSalary)}</td>
      <td className="px-6 py-3 border-r border-brand-border/10 text-right text-red-655 italic">-{formatCurrency(row.inss)}</td>
      <td className="px-6 py-3 border-r border-brand-border/10 text-right text-red-655 italic">-{formatCurrency(row.irrf)}</td>
      <td className="px-6 py-3 border-r border-brand-border/10 text-right text-blue-600">{formatCurrency(row.fgts)}</td>
      <td className="px-6 py-3 border-r border-brand-border/10 text-right text-green-700 font-bold">{formatCurrency(row.net)}</td>
      <td className="px-6 py-3 text-center">
        <button type="button" onClick={() => onDelete(row.id)} className="text-red-600 hover:text-red-800">
          <Trash2 size={12} />
        </button>
      </td>
    </tr>
  );
});

function PayrollTotalsRow({ totals }: { totals: { base: number; inss: number; irrf: number; fgts: number; net: number } }) {
  return (
    <tr className="bg-brand-sidebar/20 font-bold">
      <td className="px-6 py-3 border-r border-brand-border/10 uppercase">Gasto Total Provisionado</td>
      <td className="px-6 py-3 border-r border-brand-border/10 text-right">{formatCurrency(totals.base)}</td>
      <td className="px-6 py-3 border-r border-brand-border/10 text-right text-red-600">-{formatCurrency(totals.inss)}</td>
      <td className="px-6 py-3 border-r border-brand-border/10 text-right text-red-600">-{formatCurrency(totals.irrf)}</td>
      <td className="px-6 py-3 border-r border-brand-border/10 text-right text-blue-600">{formatCurrency(totals.fgts)}</td>
      <td className="px-6 py-3 border-r border-brand-border/10 text-right text-green-755">{formatCurrency(totals.net)}</td>
      <td />
    </tr>
  );
}

export const FolhaPayrollVirtualTable = memo(function FolhaPayrollVirtualTable({
  rows,
  onDelete,
}: {
  rows: FolhaPayrollRow[];
  onDelete: (id: string) => void;
}) {
  const resetKey = useMemo(() => `${rows.length}:${rows[0]?.id ?? ''}`, [rows]);
  const virtual = useVirtualWindow(rows.length, { rowHeightPx: ROW_HEIGHT_PX, resetKey });

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          base: acc.base + r.baseSalary,
          inss: acc.inss + r.inss,
          irrf: acc.irrf + r.irrf,
          fgts: acc.fgts + r.fgts,
          net: acc.net + r.net,
        }),
        { base: 0, inss: 0, irrf: 0, fgts: 0, net: 0 },
      ),
    [rows],
  );

  const head = (
    <thead className="technical-grid-header sticky top-0 z-10">
      <tr>
        <th className="px-6 py-3 border-r border-brand-border bg-brand-sidebar">Colaborador</th>
        <th className="px-6 py-3 border-r border-brand-border text-right bg-brand-sidebar">Salário Nominal</th>
        <th className="px-6 py-3 border-r border-brand-border text-right bg-brand-sidebar">Dedução INSS</th>
        <th className="px-6 py-3 border-r border-brand-border text-right bg-brand-sidebar">Imposto de Renda RF</th>
        <th className="px-6 py-3 border-r border-brand-border text-right bg-brand-sidebar">Provisão FGTS (8%)</th>
        <th className="px-6 py-3 text-right bg-brand-sidebar">SALDO LÍQUIDO</th>
        <th className="px-6 py-3 text-center bg-brand-sidebar">Deletar</th>
      </tr>
    </thead>
  );

  if (rows.length === 0) {
    return (
      <div className="module-table-viewport">
        <table className="w-full min-w-[980px] text-left text-sm border-collapse">
          {head}
          <tbody>
            <tr>
              <td colSpan={PAYROLL_COL_SPAN} className="py-20 text-center font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                Sem funcionários na folha gerencial atualmente.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  const visibleRows = virtual.useVirtual ? rows.slice(virtual.startIndex, virtual.endIndex) : rows;

  const body = (
    <tbody className="font-mono text-[11px] divide-y divide-brand-border/10">
      {virtual.useVirtual && <VirtualSpacerRow colSpan={PAYROLL_COL_SPAN} height={virtual.paddingTop} />}
      {visibleRows.map((row, i) => {
        const index = virtual.useVirtual ? virtual.startIndex + i : i;
        return (
          <PayrollRow key={row.id || `pay-${index}`} row={row} onDelete={onDelete} fixedHeight={virtual.useVirtual} />
        );
      })}
      {virtual.useVirtual && <VirtualSpacerRow colSpan={PAYROLL_COL_SPAN} height={virtual.paddingBottom} />}
      {!virtual.useVirtual && <PayrollTotalsRow totals={totals} />}
    </tbody>
  );

  if (!virtual.useVirtual) {
    return (
      <div className="module-table-viewport">
        <table className="w-full min-w-[980px] text-left text-sm border-collapse">
          {head}
          {body}
        </table>
      </div>
    );
  }

  return (
    <div>
      <div ref={virtual.scrollRef} className="module-table-viewport" onScroll={virtual.onScroll}>
        <table className="w-full min-w-[980px] text-left text-sm border-collapse">
          {head}
          {body}
        </table>
      </div>
      <table className="w-full min-w-[980px] text-left text-sm border-collapse border-t border-brand-border/30">
        <tbody className="font-mono text-[11px]">
          <PayrollTotalsRow totals={totals} />
        </tbody>
      </table>
    </div>
  );
});
