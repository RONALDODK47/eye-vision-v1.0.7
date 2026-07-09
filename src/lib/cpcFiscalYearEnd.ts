import type { LoanRow } from './loanCalculator';

/** Soma das parcelas líquidas que vencem no ano civil (até 12). */
export function somaParcelasLiquidasNoAnoCivil(
  schedule: LoanRow[],
  year: number,
  maxCount = 12,
): number {
  let sum = 0;
  let n = 0;
  for (const row of schedule) {
    if (row.month === 0 || !row.date) continue;
    if (row.date.getFullYear() !== year) continue;
    sum += Math.max(0, row.installment);
    n++;
    if (n >= maxCount) break;
  }
  return sum;
}

export function temParcelasNoAnoCivil(schedule: LoanRow[], year: number): boolean {
  return schedule.some((r) => r.month > 0 && r.date && r.date.getFullYear() === year);
}

function somaParcelasRestantesNoAnoCivilApos(
  schedule: LoanRow[],
  afterIndex: number,
  year: number,
): number {
  let sum = 0;
  for (let k = afterIndex + 1; k < schedule.length; k++) {
    const row = schedule[k];
    if (row.month === 0 || !row.date) continue;
    if (row.date.getFullYear() !== year) break;
    sum += Math.max(0, row.installment);
  }
  return sum;
}

/** Soma das próximas parcelas líquidas após a linha (até 12) — provisão na penúltima carência. */
export function somaProximasParcelasLiquidas(
  schedule: LoanRow[],
  afterIndex: number,
  maxCount = 12,
): number {
  let sum = 0;
  let n = 0;
  for (let k = afterIndex + 1; k < schedule.length && n < maxCount; k++) {
    const row = schedule[k];
    if (row.month === 0 || !row.date) continue;
    sum += Math.max(0, row.installment);
    n++;
  }
  return sum;
}

/**
 * Último mês da carência: curto = próximas parcelas líquidas (até 12).
 * Longo congelado na amortização até o próximo 31/12.
 */
export function calcCurtoProvisionadoUltimaCarencia(
  schedule: LoanRow[],
  graceRowIndex: number,
  finalBalanceAtProvision: number,
): { curto: number; longo: number } {
  const curto = Math.max(0, somaProximasParcelasLiquidas(schedule, graceRowIndex, 12));
  const longo = Math.max(0, finalBalanceAtProvision - curto);
  return { curto, longo };
}

/** @deprecated use calcCurtoProvisionadoUltimaCarencia */
export const calcCurtoProvisionadoPenultimaCarencia = calcCurtoProvisionadoUltimaCarencia;

/**
 * Provisão do fechamento 31/12/Y: curto = parcelas do ano Y+1 (até 12) ou restante se encerrar.
 * Longo = saldo devedor na data − curto (congelado durante todo o ano Y+1).
 */
export function calcCurtoProvisionadoDezembro(
  schedule: LoanRow[],
  year: number,
  finalBalanceAtClose: number,
): { curto: number; longo: number } {
  const decIdx = indiceLinhaDezembroNoAno(schedule, year);
  const refIdx = decIdx >= 0 ? decIdx : indiceUltimaLinhaOperacionalNoAno(schedule, year);

  let curto = somaParcelasLiquidasNoAnoCivil(schedule, year + 1, 12);
  if (curto <= 0 && refIdx >= 0) {
    curto = somaParcelasRestantesNoAnoCivilApos(schedule, refIdx, year);
  }

  curto = Math.max(0, curto);
  const longo = Math.max(0, finalBalanceAtClose - curto);
  return { curto, longo };
}

/** Longo prazo congelado no início de cada ano civil (definido no 31/12 do ano anterior). */
export function buildLongoInicioAnoCivil(schedule: LoanRow[]): Map<number, number> {
  const map = new Map<number, number>();
  const years = anosOperacionaisNoCronograma(schedule);

  for (const year of years) {
    const decIdx = indiceLinhaDezembroNoAno(schedule, year);
    const closeIdx = decIdx >= 0 ? decIdx : indiceUltimaLinhaOperacionalNoAno(schedule, year);
    if (closeIdx < 0) continue;

    const finalBal = Math.max(0, schedule[closeIdx]!.finalBalance);
    const { longo } = calcCurtoProvisionadoDezembro(schedule, year, finalBal);
    map.set(year + 1, longo);
  }

  return map;
}

export function indiceLinhaDezembroNoAno(schedule: LoanRow[], year: number): number {
  let bestIdx = -1;
  let bestDay = -1;
  schedule.forEach((row, idx) => {
    if (row.month <= 0 || !row.date) return;
    if (row.date.getFullYear() !== year || row.date.getMonth() !== 11) return;
    const day = row.date.getDate();
    if (day > bestDay) {
      bestDay = day;
      bestIdx = idx;
    }
  });
  return bestIdx;
}

export function indiceUltimaLinhaOperacionalNoAno(schedule: LoanRow[], year: number): number {
  let lastIdx = -1;
  schedule.forEach((row, idx) => {
    if (row.month > 0 && row.date && row.date.getFullYear() === year) lastIdx = idx;
  });
  return lastIdx;
}

export function linhaOperacionalAnterior(schedule: LoanRow[], index: number): LoanRow | null {
  for (let j = index - 1; j >= 0; j--) {
    const r = schedule[j];
    if (r.month > 0 && r.date) return r;
  }
  return null;
}

export function indiceLinhaOperacionalAnterior(schedule: LoanRow[], index: number): number {
  for (let j = index - 1; j >= 0; j--) {
    const r = schedule[j];
    if (r.month > 0 && r.date) return j;
  }
  return -1;
}

/** Curto prazo na última linha operacional antes do fechamento 31/12/Y (longo congelado). */
export function calcCurtoOperacionalAntesFechamento31Dez(
  schedule: LoanRow[],
  year: number,
): number {
  const longoMap = buildLongoInicioAnoCivil(schedule);
  const decIdx = indiceLinhaDezembroNoAno(schedule, year);
  let refIdx: number;

  if (decIdx >= 0) {
    refIdx = indiceLinhaOperacionalAnterior(schedule, decIdx);
  } else {
    refIdx = indiceUltimaLinhaOperacionalNoAno(schedule, year);
    if (refIdx >= 0 && schedule[refIdx]!.date!.getMonth() === 11) {
      const prevIdx = indiceLinhaOperacionalAnterior(schedule, refIdx);
      if (prevIdx >= 0) refIdx = prevIdx;
    }
  }

  if (refIdx < 0) return 0;

  const row = schedule[refIdx]!;
  const refYear = row.date!.getFullYear();
  const longoFixo = longoMap.get(refYear);
  if (longoFixo !== undefined) {
    return Math.max(0, row.finalBalance - longoFixo);
  }
  return 0;
}

function curtoProvisionadoAntesFechamentoAno(
  schedule: LoanRow[],
  year: number,
  curtoFromRow: (row: LoanRow) => number,
): number {
  const decIdx = indiceLinhaDezembroNoAno(schedule, year);
  if (decIdx >= 0) {
    const prev = linhaOperacionalAnterior(schedule, decIdx);
    if (prev) return curtoFromRow(prev);
  }

  const lastIdx = indiceUltimaLinhaOperacionalNoAno(schedule, year);
  if (lastIdx < 0) return 0;

  const lastRow = schedule[lastIdx]!;
  if (lastRow.date && lastRow.date.getMonth() !== 11) {
    const prev = linhaOperacionalAnterior(schedule, lastIdx);
    if (prev) return curtoFromRow(prev);
    return curtoFromRow(lastRow);
  }

  const prev = linhaOperacionalAnterior(schedule, lastIdx);
  return prev ? curtoFromRow(prev) : 0;
}

/**
 * Curto provisionado em 31/12/Y (coluna Curto do PDF):
 * parcelas líquidas do **ano civil seguinte** (Y+1), até 12.
 * Exceção: se o empréstimo encerra em Y (sem parcelas em Y+1), provisiona só o que resta no ano.
 */
export function calcCurtoAlvo31DezAno(
  schedule: LoanRow[],
  year: number,
  curtoFromRow: (row: LoanRow) => number,
): number {
  const decIdx = indiceLinhaDezembroNoAno(schedule, year);
  if (decIdx >= 0) {
    const daLinha = curtoFromRow(schedule[decIdx]!);
    if (daLinha > 0) return daLinha;
    const finalBal = Math.max(0, schedule[decIdx]!.finalBalance);
    return calcCurtoProvisionadoDezembro(schedule, year, finalBal).curto;
  }

  const lastIdx = indiceUltimaLinhaOperacionalNoAno(schedule, year);
  if (lastIdx < 0) return 0;
  const finalBal = Math.max(0, schedule[lastIdx]!.finalBalance);
  return calcCurtoProvisionadoDezembro(schedule, year, finalBal).curto;
}

/**
 * Transferência LP→CP — **uma vez por ano**, em 31/12/Y.
 * Valor = incremento do curto provisionado para o ano seguinte (cpNew − cpOld).
 */
export function calcTransferencia31DezAno(
  schedule: LoanRow[],
  year: number,
  curtoFromRow: (row: LoanRow) => number,
): number {
  const decIdx = indiceLinhaDezembroNoAno(schedule, year);
  const closeIdx = decIdx >= 0 ? decIdx : indiceUltimaLinhaOperacionalNoAno(schedule, year);
  if (closeIdx < 0) return 0;

  const finalBal = Math.max(0, schedule[closeIdx]!.finalBalance);
  const cpNew = calcCurtoProvisionadoDezembro(schedule, year, finalBal).curto;
  const cpOld = calcCurtoOperacionalAntesFechamento31Dez(schedule, year);

  let valor = Math.max(0, cpNew - cpOld);

  if (valor <= 0 && !temParcelasNoAnoCivil(schedule, year + 1) && cpOld > 0) {
    valor = cpOld;
  }

  // Mantém compatibilidade quando o cronograma já traz curto preenchido (ex.: testes manuais).
  if (valor <= 0) {
    const legado = Math.max(0, calcCurtoAlvo31DezAno(schedule, year, curtoFromRow) -
      curtoProvisionadoAntesFechamentoAno(schedule, year, curtoFromRow));
    if (legado > 0) valor = legado;
    else if (
      !temParcelasNoAnoCivil(schedule, year + 1) &&
      curtoProvisionadoAntesFechamentoAno(schedule, year, curtoFromRow) > 0
    ) {
      valor = curtoProvisionadoAntesFechamentoAno(schedule, year, curtoFromRow);
    }
  }

  return valor;
}

/** Anos civis com linhas operacionais no cronograma. */
export function anosOperacionaisNoCronograma(schedule: LoanRow[]): number[] {
  const years = new Set<number>();
  schedule.forEach((r) => {
    if (r.month > 0 && r.date) years.add(r.date.getFullYear());
  });
  return [...years].sort((a, b) => a - b);
}
