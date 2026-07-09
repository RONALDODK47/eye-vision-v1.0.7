import * as pdfjsLib from 'pdfjs-dist';
import type { VisionBalanceteRow } from '../../extratoVision/types/accounting';
import {
  getClassificacao,
  isGrupo3CustoDespesa,
  resolveTipoConta,
} from '../../extratoVision/utils/demonstracoesContabeis';
import {
  isDominioLancamentosTxt,
  parseDominioLancamentosTxt,
  readTextFileSmart,
} from '../../extratoVision/utils/dominioLancamentosTxt';
import { recalcularSaldoFinalRow } from '../../extratoVision/utils/mergeRazaoSaldoInicial';
import {
  isBalanceteModelo,
  isRazaoModelo,
  parseBalanceteSheet,
  parseRazaoSheet,
  parseValorDc,
} from '../../extratoVision/utils/planilhaModelo';
import {
  agregarRazaoPorConta,
  extrairPeriodoRazao,
  filtrarContasAnaliticas,
  isValidRazaoLinha,
  processarRazaoImportado,
} from '../../extratoVision/utils/razaoContabil';
import { readSpreadsheetGrid } from './dominioPlanoExcel';
import type { NotaEndividamentoTipo, NotaExplicativaEmpresaDados } from './notaExplicativaTypes';

export type BalanceteNotaCampo = {
  campo: string;
  valor: string;
  contas: string[];
};

export type BalanceteNotaImportResult = {
  patch: Partial<NotaExplicativaEmpresaDados>;
  logs: string[];
  campos: BalanceteNotaCampo[];
  exercicioDetectado?: string;
  dataEncerramentoDetectada?: string;
  contasImportadas: number;
};

function classRoot(classificacao: string): string {
  return classificacao.replace(/\./g, '')[0] ?? '';
}

function isRaizReceita(classificacao: string): boolean {
  if (classRoot(classificacao) !== '3') return false;
  return !isGrupo3CustoDespesa(classificacao);
}

function isPatrimonioLiquido(cls: string, nome: string): boolean {
  const c = cls.toLowerCase();
  const n = nome.toLowerCase();
  if (/^2\.(3|03)/.test(c)) return true;
  if (/^23/.test(c.replace(/\./g, ''))) return true;
  return (
    n.includes('patrimônio líquido') ||
    n.includes('patrimonio liquido') ||
    n.includes('capital social') ||
    /reservas? de (capital|lucros|reavaliação|avaliação)/i.test(n) ||
    /lucros? acumulado/i.test(n) ||
    /prejuízo[s]? acumulado|prejuizo[s]? acumulado/i.test(n) ||
    /resultado[s]? do exercício|resultado[s]? do exercicio/i.test(n)
  );
}

function isPassivoCirculante(cls: string): boolean {
  return /^2\.1/.test(cls) || /^21/.test(cls.replace(/\./g, ''));
}

function isPassivoNaoCirculante(cls: string): boolean {
  return /^2\.2/.test(cls) || /^22/.test(cls.replace(/\./g, ''));
}

function saldoPassivoPositivo(row: VisionBalanceteRow): number {
  const sf = row.saldoFinal ?? 0;
  if (sf > 0) {
    if (row.naturezaSaldoFinal === 'C') return sf;
    if (row.naturezaSaldoFinal === 'D') return 0;
    return sf;
  }
  const liq = row.credito - row.debito + (row.saldoInicial ?? 0);
  return liq > 0 ? liq : 0;
}

function saldoPlPositivo(row: VisionBalanceteRow): number {
  const sf = row.saldoFinal ?? 0;
  if (sf > 0) {
    if (row.naturezaSaldoFinal === 'C') return sf;
    if (row.naturezaSaldoFinal === 'D') return 0;
    return sf;
  }
  const liq = row.credito - row.debito;
  return liq > 0 ? liq : Math.abs(row.debito - row.credito);
}

function receitaContaValor(row: VisionBalanceteRow): number {
  const mov = row.credito - row.debito;
  if (Math.abs(mov) > 0.001) return mov;
  const sf = row.saldoFinal ?? 0;
  if (sf > 0 && row.naturezaSaldoFinal === 'C') return sf;
  if (sf > 0 && !row.naturezaSaldoFinal) return sf;
  return mov > 0 ? mov : 0;
}

function fmtMoeda(v: number): string {
  if (Math.abs(v) < 0.01) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function contaLabel(row: VisionBalanceteRow): string {
  const cls = getClassificacao(row);
  const nome = row.nome?.trim() || '—';
  return cls ? `${cls} — ${nome}` : nome;
}

function isEmprestimoNome(nome: string): boolean {
  return /emprest|emprést|mutuo|m[uú]tuo|adiantamento.*soci|conta\s+movimento.*emp/i.test(nome);
}

function isFinanciamentoNome(nome: string): boolean {
  return /financ|leasing|arrendamento|debenture|credito\s+(rural|banc)|crdito\s+(rural|banc)|acc|ace/i.test(
    nome,
  );
}

function inferTiposEndividamento(
  emprestCp: number,
  emprestLp: number,
  finCp: number,
  finLp: number,
): NotaEndividamentoTipo[] {
  const tipos: NotaEndividamentoTipo[] = [];
  if (emprestCp + emprestLp > 0.01) tipos.push('emprestimo_bancario');
  if (finCp + finLp > 0.01) tipos.push('financiamento_bens');
  return tipos;
}

/** Consolida razão (lançamentos) ou balancete (saldos por conta) em snapshot analítico. */
export function consolidarBalanceteParaNota(rows: VisionBalanceteRow[]): VisionBalanceteRow[] {
  if (!rows.length) return [];

  const temSaldoPorConta = rows.some(
    (r) => (r.saldoFinal ?? 0) > 0 || (r.saldoInicial ?? 0) > 0 || r.naturezaSaldoFinal,
  );
  const temLancamentos = rows.filter((r) => r.data && (r.debito > 0 || r.credito > 0)).length > rows.length * 0.3;

  if (temSaldoPorConta && !temLancamentos) {
    return rows
      .filter((r) => isValidRazaoLinha(r) || Boolean(getClassificacao(r)))
      .map((r) => (r.saldoFinal ? r : recalcularSaldoFinalRow(r)));
  }

  const { analiticas } = processarRazaoImportado(rows);
  const agregadas = agregarRazaoPorConta(filtrarContasAnaliticas(analiticas));
  return agregadas.map((r) => recalcularSaldoFinalRow(r));
}

/** Extrai campos da nota explicativa a partir do balancete consolidado. */
export function extractNotaDadosFromBalancete(rows: VisionBalanceteRow[]): BalanceteNotaImportResult {
  const balancete = consolidarBalanceteParaNota(rows);
  const logs: string[] = [`${balancete.length} conta(s) analisada(s) no balancete.`];
  const campos: BalanceteNotaCampo[] = [];

  const analiticas = balancete.filter((r) => resolveTipoConta(r, balancete) === 'A');
  const base = analiticas.length > 0 ? analiticas : balancete;

  let receitaBruta = 0;
  const contasReceita: string[] = [];
  for (const r of base) {
    const cls = getClassificacao(r);
    if (!isRaizReceita(cls)) continue;
    const v = receitaContaValor(r);
    if (v <= 0) continue;
    receitaBruta += v;
    contasReceita.push(contaLabel(r));
  }
  if (receitaBruta <= 0) {
    const sintReceita = balancete.find((r) => {
      const n = (r.nome ?? '').toLowerCase();
      return /receita\s+(bruta|operacional|l[ií]quida)/i.test(n) && classRoot(getClassificacao(r)) === '3';
    });
    if (sintReceita) {
      receitaBruta = receitaContaValor(sintReceita);
      contasReceita.push(contaLabel(sintReceita));
    }
  }

  let patrimonioLiquido = 0;
  const contasPl: string[] = [];
  const linhaPlTotal = balancete.find((r) =>
    /patrim[oô]nio\s+l[ií]quido/i.test(r.nome ?? ''),
  );
  if (linhaPlTotal) {
    patrimonioLiquido = saldoPlPositivo(linhaPlTotal);
    contasPl.push(contaLabel(linhaPlTotal));
  } else {
    for (const r of base) {
      const cls = getClassificacao(r);
      if (!isPatrimonioLiquido(cls, r.nome ?? '')) continue;
      const v = saldoPlPositivo(r);
      if (v <= 0) continue;
      patrimonioLiquido += v;
      contasPl.push(contaLabel(r));
    }
  }

  let capitalSocial = 0;
  const contasCap: string[] = [];
  for (const r of base) {
    const n = (r.nome ?? '').toLowerCase();
    if (!/capital\s+social/i.test(n)) continue;
    const v = saldoPlPositivo(r);
    if (v <= 0) continue;
    capitalSocial = Math.max(capitalSocial, v);
    contasCap.push(contaLabel(r));
  }

  let emprestCp = 0;
  let emprestLp = 0;
  let finCp = 0;
  let finLp = 0;
  const contasEmpCp: string[] = [];
  const contasEmpLp: string[] = [];
  const contasFinCp: string[] = [];
  const contasFinLp: string[] = [];

  for (const r of base) {
    const cls = getClassificacao(r);
    if (classRoot(cls) !== '2' || isPatrimonioLiquido(cls, r.nome ?? '')) continue;
    const nome = r.nome ?? '';
    const v = saldoPassivoPositivo(r);
    if (v <= 0) continue;

    const emprest = isEmprestimoNome(nome);
    const fin = isFinanciamentoNome(nome);
    if (!emprest && !fin) continue;

    if (isPassivoCirculante(cls)) {
      if (emprest) {
        emprestCp += v;
        contasEmpCp.push(contaLabel(r));
      } else {
        finCp += v;
        contasFinCp.push(contaLabel(r));
      }
    } else if (isPassivoNaoCirculante(cls)) {
      if (emprest) {
        emprestLp += v;
        contasEmpLp.push(contaLabel(r));
      } else {
        finLp += v;
        contasFinLp.push(contaLabel(r));
      }
    }
  }

  const periodo = extrairPeriodoRazao(rows);
  let exercicioDetectado: string | undefined;
  let dataEncerramentoDetectada: string | undefined;
  if (periodo.max) {
    const m = periodo.max.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) {
      exercicioDetectado = m[3];
      dataEncerramentoDetectada = periodo.max;
    }
  }

  const patch: Partial<NotaExplicativaEmpresaDados> = {};

  if (receitaBruta > 0) {
    patch.receitaBrutaExercicio = fmtMoeda(receitaBruta);
    campos.push({ campo: 'Receita bruta do exercício', valor: patch.receitaBrutaExercicio, contas: contasReceita });
    logs.push(`Receita bruta: R$ ${patch.receitaBrutaExercicio} (${contasReceita.length} conta(s)).`);
  }

  if (patrimonioLiquido > 0) {
    patch.patrimonioLiquido = fmtMoeda(patrimonioLiquido);
    campos.push({ campo: 'Patrimônio líquido', valor: patch.patrimonioLiquido, contas: contasPl });
    logs.push(`Patrimônio líquido: R$ ${patch.patrimonioLiquido}.`);
  }

  if (capitalSocial > 0) {
    patch.capitalSocial = fmtMoeda(capitalSocial);
    campos.push({ campo: 'Capital social', valor: patch.capitalSocial, contas: contasCap });
    logs.push(`Capital social: R$ ${patch.capitalSocial}.`);
  }

  if (emprestCp + emprestLp > 0.01) {
    patch.possuiEmprestimos = true;
    if (emprestCp > 0) patch.saldoEmprestimosCP = fmtMoeda(emprestCp);
    if (emprestLp > 0) patch.saldoEmprestimosLP = fmtMoeda(emprestLp);
    campos.push({
      campo: 'Empréstimos (CP / LP)',
      valor: [patch.saldoEmprestimosCP, patch.saldoEmprestimosLP].filter(Boolean).join(' / '),
      contas: [...contasEmpCp, ...contasEmpLp],
    });
    logs.push(`Empréstimos detectados: CP R$ ${patch.saldoEmprestimosCP || '0,00'} · LP R$ ${patch.saldoEmprestimosLP || '0,00'}.`);
  }

  if (finCp + finLp > 0.01) {
    patch.possuiFinanciamentos = true;
    if (finCp > 0) patch.saldoFinanciamentosCP = fmtMoeda(finCp);
    if (finLp > 0) patch.saldoFinanciamentosLP = fmtMoeda(finLp);
    campos.push({
      campo: 'Financiamentos (CP / LP)',
      valor: [patch.saldoFinanciamentosCP, patch.saldoFinanciamentosLP].filter(Boolean).join(' / '),
      contas: [...contasFinCp, ...contasFinLp],
    });
    logs.push(`Financiamentos detectados: CP R$ ${patch.saldoFinanciamentosCP || '0,00'} · LP R$ ${patch.saldoFinanciamentosLP || '0,00'}.`);
  }

  const tipos = inferTiposEndividamento(emprestCp, emprestLp, finCp, finLp);
  if (tipos.length) patch.tiposEndividamento = tipos;

  if (exercicioDetectado) {
    patch.exercicio = exercicioDetectado;
    logs.push(`Exercício detectado: ${exercicioDetectado}.`);
  }
  if (dataEncerramentoDetectada) {
    patch.dataEncerramento = dataEncerramentoDetectada;
  }

  if (campos.length === 0) {
    logs.push('Nenhum campo financeiro identificado automaticamente — confira classificações e saldos.');
  }

  return {
    patch,
    logs,
    campos,
    exercicioDetectado,
    dataEncerramentoDetectada,
    contasImportadas: balancete.length,
  };
}

const RE_CLASS = /\d(?:\.\d+){2,}/;
const RE_MOEDA = /[+-]?\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/g;

/** Interpreta linhas de relatório de balancete (PDF texto / exportação impressa). */
export function parseBalanceteTextLines(lines: string[]): VisionBalanceteRow[] {
  const out: VisionBalanceteRow[] = [];
  let ordem = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.length < 12) continue;
    if (/^p[aá]gina|^total\s+geral|^empresa|^cnpj|^per[ií]odo/i.test(line)) continue;

    const clsMatch = line.match(RE_CLASS);
    if (!clsMatch) continue;
    const classificacao = clsMatch[0];

    const valores = [...line.matchAll(RE_MOEDA)].map((m) => m[0]);
    if (valores.length < 2) continue;

    const clsIdx = line.indexOf(classificacao);
    const antes = line.slice(0, clsIdx).trim();
    const depois = line.slice(clsIdx + classificacao.length).trim();

    const codigoMatch = antes.match(/\b(\d{4,7})\b\s*$/);
    const codigo = codigoMatch?.[1] ?? '';

    const nome = depois
      .replace(RE_MOEDA, '')
      .replace(/\s+[DC]\s*$/i, '')
      .trim();

    let saldoInicial = 0;
    let debito = 0;
    let credito = 0;
    let saldoFinal = 0;
    let naturezaSaldoInicial: 'D' | 'C' | undefined;
    let naturezaSaldoFinal: 'D' | 'C' | undefined;

    if (valores.length >= 4) {
      const si = parseValorDc(valores[0]);
      const sf = parseValorDc(valores[valores.length - 1]);
      saldoInicial = si.valor;
      naturezaSaldoInicial = si.natureza;
      debito = parseValorDc(valores[valores.length - 3]).valor;
      credito = parseValorDc(valores[valores.length - 2]).valor;
      saldoFinal = sf.valor;
      naturezaSaldoFinal = sf.natureza;
    } else if (valores.length === 2) {
      debito = parseValorDc(valores[0]).valor;
      credito = parseValorDc(valores[1]).valor;
    } else {
      const sf = parseValorDc(valores[valores.length - 1]);
      saldoFinal = sf.valor;
      naturezaSaldoFinal = sf.natureza;
    }

    if (!nome && !codigo) continue;

    ordem += 1;
    out.push({
      codigo,
      classificacao,
      nome: nome || '—',
      ordem,
      saldoInicial,
      naturezaSaldoInicial,
      debito,
      credito,
      saldoFinal,
      naturezaSaldoFinal,
    });
  }

  return out;
}

async function extractPdfPlainText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const parts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ('str' in it ? String(it.str) : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line) parts.push(line);
  }
  return parts.join('\n');
}

/** Carrega linhas de balancete/razão a partir de Excel, TXT Domínio ou PDF. */
export async function parseNotaExplicativaBalanceteFile(
  file: File,
): Promise<{ rows: VisionBalanceteRow[]; logs: string[] }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const logs: string[] = [];

  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const rawRows = readSpreadsheetGrid(bytes);
    if (isBalanceteModelo(rawRows)) {
      const rows = parseBalanceteSheet(rawRows).filter(isValidRazaoLinha);
      if (!rows.length) throw new Error('Nenhuma conta válida no balancete Excel.');
      logs.push(`Balancete Excel: ${rows.length} conta(s).`);
      return { rows, logs };
    }
    if (isRazaoModelo(rawRows)) {
      const rows = parseRazaoSheet(rawRows).filter(isValidRazaoLinha);
      if (!rows.length) throw new Error('Nenhum lançamento válido na planilha de razão.');
      logs.push(`Razão Excel: ${rows.length} lançamento(s) — será consolidado por conta.`);
      return { rows, logs };
    }
    const bal = parseBalanceteSheet(rawRows).filter(isValidRazaoLinha);
    if (bal.length > 0) {
      logs.push(`Planilha interpretada como balancete: ${bal.length} conta(s).`);
      return { rows: bal, logs };
    }
    const raz = parseRazaoSheet(rawRows).filter(isValidRazaoLinha);
    if (!raz.length) throw new Error('Formato não reconhecido. Use balancete ou razão Domínio em Excel.');
    logs.push(`Planilha interpretada como razão: ${raz.length} lançamento(s).`);
    return { rows: raz, logs };
  }

  if (ext === 'txt' || ext === 'sped') {
    const text = await readTextFileSmart(file);
    if (isDominioLancamentosTxt(text)) {
      const rows = parseDominioLancamentosTxt(text).filter(isValidRazaoLinha);
      if (!rows.length) throw new Error('TXT Domínio sem lançamentos válidos.');
      logs.push(`TXT Domínio (lançamentos): ${rows.length} linha(s) — consolidando por conta.`);
      return { rows, logs };
    }
    const rows = parseBalanceteTextLines(text.split(/\r?\n/)).filter(isValidRazaoLinha);
    if (!rows.length) {
      throw new Error(
        'TXT não reconhecido. Use exportação Domínio (Utilitários > Lançamentos) ou relatório de balancete.',
      );
    }
    logs.push(`Relatório TXT: ${rows.length} conta(s).`);
    return { rows, logs };
  }

  if (ext === 'pdf') {
    const text = await extractPdfPlainText(file);
    const rows = parseBalanceteTextLines(text.split(/\r?\n/)).filter(isValidRazaoLinha);
    if (!rows.length) {
      throw new Error(
        'PDF sem texto tabular reconhecível. Exporte o balancete em Excel ou TXT pelo Domínio Contabilidade.',
      );
    }
    logs.push(`PDF (texto nativo): ${rows.length} conta(s) identificada(s).`);
    return { rows, logs };
  }

  throw new Error('Formato não suportado. Use Excel (.xlsx/.xls), TXT Domínio ou PDF com texto.');
}
