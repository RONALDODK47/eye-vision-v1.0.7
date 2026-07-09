import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, isValid } from 'date-fns';
import type { LoanRow } from '../../lib/loanCalculator';
import { VirtualSpacerRow } from '../lib/useVirtualWindow';
import { cn, formatCurrency } from '../lib/utils';

const ROW_HEIGHT_PX = 36;
const OVERSCAN = 12;
/** Abaixo deste limite renderiza todas as linhas (evita bugs de virtualização em contratos curtos). */
const VIRTUAL_THRESHOLD = 80;

export interface ScheduleColumn {
  key: string;
  label: string;
  align: 'center' | 'right';
}

interface LoanScheduleVirtualTableProps {
  rows: LoanRow[];
  columns: ScheduleColumn[];
  emptyMessage?: string;
}

function formatRowDate(date: Date): string {
  return isValid(date) ? format(date, 'dd/MM/yyyy') : '—';
}

function hasMoney(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) >= 0.005;
}

/** Parcela exibida: fluxo de caixa ou competência (carência capitalizada sem pagamento). */
function displayInstallment(row: LoanRow): number {
  if (hasMoney(row.installment)) return row.installment;
  if (row.isGrace) {
    const competencia = row.interest + row.monthlyCost;
    return hasMoney(competencia) ? competencia : 0;
  }
  const composite = row.amortization + row.interest + row.monthlyCost;
  return hasMoney(composite) ? composite : 0;
}

function displayAmortization(row: LoanRow): number {
  if (hasMoney(row.amortization)) return row.amortization;
  if (row.isGrace) return 0;
  const installment = displayInstallment(row);
  if (!hasMoney(installment)) return 0;
  const derived = installment - row.interest - row.monthlyCost;
  return hasMoney(derived) ? derived : 0;
}

function formatMoneyCell(value: number, options?: { showZero?: boolean }): string {
  if (hasMoney(value)) return formatCurrency(value);
  if (options?.showZero) return formatCurrency(0);
  return '—';
}

function formatScheduleCell(row: LoanRow, key: string): string {
  if (row.month === 0 && !['month', 'date', 'initial', 'final', 'short', 'long'].includes(key)) {
    if (key === 'iof' && hasMoney(row.iof)) return formatCurrency(row.iof);
    return '—';
  }
  switch (key) {
    case 'month':
      return row.month === 0 ? '—' : `${row.month}${row.isGrace ? ' (C)' : ''}`;
    case 'date':
      return formatRowDate(row.date);
    case 'days': {
      if (row.month === 0) return '—';
      const du =
        row.selicBusinessDays != null && row.selicBusinessDays > 0
          ? row.selicBusinessDays
          : row.accrualDays;
      return String(du);
    }
    case 'selic':
      return row.selicAccumulatedFactor != null && row.selicAccumulatedFactor !== 1
        ? row.selicAccumulatedFactor.toFixed(6)
        : '—';
    case 'rate': {
      if (row.effectivePctInPeriod == null) return '—';
      const dec =
        row.selicBusinessDays != null && row.selicBusinessDays > 0 ? 6 : 4;
      return `${row.effectivePctInPeriod.toFixed(dec)}%`;
    }
    case 'initial':
      return formatCurrency(row.initialBalance);
    case 'installment':
      return formatMoneyCell(displayInstallment(row));
    case 'amortization':
      return formatMoneyCell(displayAmortization(row), { showZero: row.isGrace || hasMoney(displayInstallment(row)) });
    case 'interest':
      return formatMoneyCell(row.interest);
    case 'cost':
      return formatMoneyCell(row.monthlyCost);
    case 'iof':
      return formatMoneyCell(row.iof);
    case 'final':
      return formatCurrency(row.finalBalance);
    case 'short':
      return formatMoneyCell(row.shortTermBalance);
    case 'long':
      return formatMoneyCell(row.longTermBalance);
    default:
      return '—';
  }
}

const ScheduleRow = memo(function ScheduleRow({
  row,
  columns,
  fixedHeight,
}: {
  row: LoanRow;
  columns: ScheduleColumn[];
  fixedHeight?: boolean;
}) {
  return (
    <tr
      className={cn(
        'technical-grid-row',
        fixedHeight && 'h-9 max-h-9 overflow-hidden',
        row.isGrace && 'bg-amber-50/40',
        row.month === 0 && 'bg-brand-sidebar/10',
      )}
    >
      {columns.map((col) => (
        <td
          key={col.key}
          className={cn(
            'px-3 py-2 border-r border-brand-border/10 whitespace-nowrap',
            fixedHeight && 'py-1.5 leading-tight',
            col.align === 'center' ? 'text-center font-bold' : 'text-right',
            col.key === 'interest' && 'text-red-700',
            col.key === 'amortization' && 'text-blue-700',
          )}
        >
          {formatScheduleCell(row, col.key)}
        </td>
      ))}
    </tr>
  );
});

function TableHead({ columns }: { columns: ScheduleColumn[] }) {
  return (
    <thead className="technical-grid-header sticky top-0 z-10">
      <tr>
        {columns.map((col) => (
          <th
            key={col.key}
            className={cn(
              'px-3 py-2.5 border-r border-brand-border whitespace-nowrap text-[9px] bg-brand-sidebar',
              col.align === 'center' ? 'text-center' : 'text-right',
            )}
          >
            {col.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export default memo(function LoanScheduleVirtualTable({
  rows,
  columns,
  emptyMessage = 'Nenhum registro a exibir. Insira um Valor Principal > 0.',
}: LoanScheduleVirtualTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      setScrollTop(el.scrollTop);
    });
  }, []);

  const { startIndex, endIndex, paddingTop, paddingBottom } = useMemo(() => {
    const total = rows.length;
    if (total === 0) {
      return { startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0 };
    }
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN);
    const visible = Math.ceil(viewportHeight / ROW_HEIGHT_PX) + OVERSCAN * 2;
    const end = Math.min(total, start + visible);
    return {
      startIndex: start,
      endIndex: end,
      paddingTop: start * ROW_HEIGHT_PX,
      paddingBottom: Math.max(0, (total - end) * ROW_HEIGHT_PX),
    };
  }, [rows.length, scrollTop, viewportHeight]);

  const visibleRows = useMemo(
    () => rows.slice(startIndex, endIndex),
    [rows, startIndex, endIndex],
  );

  if (rows.length === 0) {
    return (
      <div className="module-table-viewport flex items-center justify-center py-20">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center px-4">
          {emptyMessage}
        </p>
      </div>
    );
  }

  const useVirtual = rows.length > VIRTUAL_THRESHOLD;

  if (!useVirtual) {
    return (
      <div ref={scrollRef} className="module-table-viewport" onScroll={onScroll}>
        <table className="w-full min-w-[1100px] text-left text-sm border-collapse">
          <TableHead columns={columns} />
          <tbody className="font-mono text-[10px] divide-y divide-brand-border/10">
            {rows.map((row, idx) => (
              <ScheduleRow
                key={`${idx}-${row.month}-${formatRowDate(row.date)}`}
                row={row}
                columns={columns}
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="module-table-viewport" onScroll={onScroll}>
      <table className="w-full min-w-[1100px] text-left text-sm border-collapse">
        <TableHead columns={columns} />
        <tbody className="font-mono text-[10px] divide-y divide-brand-border/10">
          <VirtualSpacerRow colSpan={columns.length} height={paddingTop} />
          {visibleRows.map((row, i) => {
            const absoluteIndex = startIndex + i;
            return (
              <ScheduleRow
                key={`${absoluteIndex}-${row.month}-${row.date.getTime()}`}
                row={row}
                columns={columns}
                fixedHeight
              />
            );
          })}
          <VirtualSpacerRow colSpan={columns.length} height={paddingBottom} />
        </tbody>
      </table>
    </div>
  );
});
