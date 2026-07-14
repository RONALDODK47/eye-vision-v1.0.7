import type { VisionPlanoRow } from '../../extratoVision/types/accounting';

export type PlanoGroup = 'ATIVO' | 'PASSIVO' | 'PATRIMONIO_LIQUIDO' | 'RECEITA' | 'DESPESA';

export function derivePlanoGroupFromCode(code: string): PlanoGroup {
  const d = code.replace(/\D/g, '')[0];
  if (d === '1') return 'ATIVO';
  if (d === '2') return 'PASSIVO';
  if (d === '3') return 'PATRIMONIO_LIQUIDO';
  if (d === '4') return 'RECEITA';
  if (d === '5' || d === '6' || d === '7' || d === '8') return 'DESPESA';
  return 'ATIVO';
}

export function derivePlanoNatureFromGroup(group: string): 'DEVEDORA' | 'CREDORA' {
  return group === 'PASSIVO' || group === 'RECEITA' || group === 'PATRIMONIO_LIQUIDO'
    ? 'CREDORA'
    : 'DEVEDORA';
}

/** Infere S (sintética) ou A (analítica) — Domínio: analítica costuma ter código reduzido. */
export function inferPlanoTipoSa(params: {
  code?: string;
  codigoReduzido?: string;
  nivel?: number;
  tipoHint?: string;
}): 'S' | 'A' {
  const hint = params.tipoHint?.trim().toUpperCase();
  if (hint === 'S' || hint === 'A') return hint;
  if (hint?.startsWith('SINT')) return 'S';
  if (hint?.startsWith('ANAL')) return 'A';

  const red = sanitizeCodigoReduzido(params.codigoReduzido);
  if (red) {
    const n = parseInt(red, 10);
    if (Number.isFinite(n) && n > 0) return 'A';
  }

  const norm = String(params.code ?? '')
    .trim()
    .replace(/\s/g, '');
  const dots = (norm.match(/\./g) || []).length;
  const nivel = params.nivel;

  if (nivel != null && nivel >= 5) return 'A';
  if (nivel != null && nivel <= 4) return 'S';
  if (/\.\d{5}$/.test(norm)) return 'A';
  if (dots >= 4) return 'A';
  if (dots <= 2) return 'S';
  return dots >= 3 ? 'A' : 'S';
}

function isClassificacaoContabil(val: string): boolean {
  return /^\d[\d.]{0,19}$/.test(val.trim());
}

/** Classificação hierárquica (ex.: 2.1.10.100.001) — PROIBIDA na conciliação. */
export function isClassificacaoHierarquica(val: string): boolean {
  const v = String(val ?? '').trim();
  if (!v) return false;
  if (v.includes('.')) return /^\d+(\.\d+)+$/.test(v);
  const digits = v.replace(/\D/g, '');
  // Reduzido Domínio tem no máx. 7 dígitos; classificação sem pontos costuma ser mais longa.
  return digits.length >= 8 && isClassificacaoContabil(v);
}

/** Código reduzido Domínio: numérico, 1–7 dígitos — nunca inferido da classificação hierárquica. */
export function sanitizeCodigoReduzido(raw: string | undefined | null): string | undefined {
  const v = raw?.trim();
  if (!v || !/^\d{1,7}$/.test(v)) return undefined;
  return v;
}

/** Compara reduzidos ignorando zeros à esquerda (0000008 ≡ 8). */
export function sameCodigoReduzido(a: string | undefined | null, b: string | undefined | null): boolean {
  const sa = sanitizeCodigoReduzido(a);
  const sb = sanitizeCodigoReduzido(b);
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  return String(parseInt(sa, 10)) === String(parseInt(sb, 10));
}

/**
 * Resolve qualquer código (reduzido ou classificação) para o CÓDIGO REDUZIDO do plano.
 * Retorna '' se for classificação sem reduzido correspondente (proibido na conciliação).
 */
export function resolveCodigoReduzidoDoPlano(
  raw: string,
  plano: Array<{ code: string; name?: string; codigoReduzido?: string }>,
): string {
  const input = String(raw ?? '').trim();
  if (!input) return '';

  const asReduzido = sanitizeCodigoReduzido(input);
  if (asReduzido) {
    const hit =
      plano.find((p) => sameCodigoReduzido(p.codigoReduzido, asReduzido)) ||
      plano.find((p) => sameCodigoReduzido(p.code, asReduzido));
    if (hit) {
      // Devolve o reduzido canônico do plano (como está cadastrado).
      return sanitizeCodigoReduzido(hit.codigoReduzido) ?? sanitizeCodigoReduzido(hit.code) ?? asReduzido;
    }
  }

  const norm = (s: string) => s.replace(/[^\d]/g, '');
  const inputNorm = norm(input);
  const byClassif = plano.find((p) => {
    const code = p.code.trim();
    return code === input || norm(code) === inputNorm;
  });
  if (byClassif) {
    return sanitizeCodigoReduzido(byClassif.codigoReduzido) ?? sanitizeCodigoReduzido(byClassif.code) ?? '';
  }

  const planoTemReduzido = plano.some((p) => Boolean(sanitizeCodigoReduzido(p.codigoReduzido)));
  if (asReduzido) {
    // Com plano Domínio (reduzido): só aceita código que exista no plano.
    if (planoTemReduzido) return '';
    return asReduzido;
  }

  // Classificação sem reduzido → proibido
  if (isClassificacaoHierarquica(input)) return '';
  return '';
}

/** Garante código reduzido para módulos Contas — nunca classificação hierárquica. */
export function assertSomenteCodigoReduzido(
  raw: string,
  plano: Array<{ code: string; name?: string; codigoReduzido?: string }>,
): string {
  const normalized = normalizeExtratoContaParaGravacao(raw, plano);
  if (!normalized || normalized.includes('.') || isClassificacaoHierarquica(normalized)) return '';
  return normalized;
}

/**
 * Normaliza conta do extrato para gravação/exibição.
 * - Se o plano tem código reduzido: SEMPRE devolve o reduzido (nunca classificação).
 * - Se o plano não tem reduzido (legado): mantém o código canônico do plano.
 */
export function normalizeExtratoContaParaGravacao(
  raw: string,
  plano: Array<{ code: string; name?: string; codigoReduzido?: string }>,
): string {
  const input = String(raw ?? '').trim();
  if (!input) return '';

  const red = resolveCodigoReduzidoDoPlano(input, plano);
  if (red) return red;

  // Plano sem reduzido: aceita classificação do próprio plano (modo legado).
  const planoTemReduzido = plano.some((p) => Boolean(sanitizeCodigoReduzido(p.codigoReduzido)));
  if (planoTemReduzido) {
    // Classificação ou lixo sem reduzido correspondente → não grava.
    return '';
  }

  const norm = (s: string) => s.replace(/[^\d]/g, '');
  const inputNorm = norm(input);
  const byClassif = plano.find((p) => {
    const code = p.code.trim();
    return code === input || norm(code) === inputNorm;
  });
  return byClassif?.code.trim() || '';
}

/**
 * Migra linhas do extrato que ainda têm classificação → código reduzido.
 * Retorna as mesmas linhas se nada mudou.
 */
export function migrateExtratoContasParaCodigoReduzido<
  T extends { accountDebit?: string; accountCredit?: string; accountCode?: string },
>(
  rows: T[],
  plano: Array<{ code: string; name?: string; codigoReduzido?: string }>,
): T[] {
  if (!rows.length || !plano.length) return rows;
  let changed = false;
  const next = rows.map((row) => {
    const debRaw = String(row.accountDebit ?? '').trim();
    const credRaw = String(row.accountCredit ?? '').trim();
    const finalDeb = debRaw ? normalizeExtratoContaParaGravacao(debRaw, plano) : '';
    const finalCred = credRaw ? normalizeExtratoContaParaGravacao(credRaw, plano) : '';
    if (finalDeb !== debRaw || finalCred !== credRaw || Boolean(row.accountCode)) {
      changed = true;
      return { ...row, accountDebit: finalDeb, accountCredit: finalCred, accountCode: '' };
    }
    return row;
  });
  return changed ? next : rows;
}

/** Reduzido em export TXT largura fixa Domínio: 7 dígitos com zero à esquerda (ex.: 0000147). */
export function isDominioReduzidoZeroPadded(raw: string | undefined | null): boolean {
  const v = raw?.trim();
  if (!v || !/^\d{7}$/.test(v) || !/^0/.test(v)) return false;
  const num = parseInt(v, 10);
  return Number.isFinite(num) && num > 0;
}

/** Aceita reduzido importado explicitamente do arquivo (sem inferir da classificação). */
export function acceptCodigoReduzidoFromFile(
  reduzido: string | undefined,
  classificacao: string,
  source: 'semicolon' | 'fixed_width' | 'ocr' | 'excel_column',
): string | undefined {
  const clean = sanitizeCodigoReduzido(reduzido);
  if (!clean) return undefined;

  if (source === 'fixed_width') {
    return isDominioReduzidoZeroPadded(clean) ? clean : undefined;
  }

  if (source === 'excel_column' || source === 'ocr') {
    if (/^\d{7}$/.test(clean) && !/^0/.test(clean)) return undefined;
    return clean;
  }

  // semicolon / tab explícito: reduzido na 1ª coluna
  if (isReduzidoPrimeiroPair(clean, classificacao)) return clean;
  if (isReduzidoSegundoPair(classificacao, clean)) return clean;
  return undefined;
}

/**
 * Primeira coluna é reduzido, segunda é classificação (padrão Domínio: reduzido;código;descrição;tipo).
 * Rejeita apenas pares hierárquicos sem coluna de reduzido (ex.: 1 + 11).
 */
export function isReduzidoPrimeiroPair(reduzido: string, classificacao: string): boolean {
  if (!sanitizeCodigoReduzido(reduzido)) return false;
  if (!isClassificacaoContabil(classificacao)) return false;

  const r = reduzido.trim();
  const c = classificacao.trim();

  // Reduzido Domínio zero-padded (7 dígitos) na 1ª coluna — válido se começa com 0
  if (/^\d{7}$/.test(r)) return /^0/.test(r);

  const rDigits = r.replace(/^0+/, '') || '0';
  const cDigits = c.replace(/\D/g, '');

  // Hierarquia sem reduzido: 1ª coluna = classificação pai, 2ª = filha (1 + 11)
  if (
    !r.startsWith('0') &&
    r.length <= 3 &&
    cDigits.startsWith(rDigits) &&
    cDigits.length > rDigits.length &&
    !c.includes('.')
  ) {
    return false;
  }

  if (rDigits === cDigits && r.length < 7) return false;

  return c.includes('.') || cDigits.length > 3;
}

/** Remove reduzidos inferidos incorretamente de dados já salvos. */
export function cleanStoredCodigoReduzido(
  reduzido: string | undefined,
  classificacao: string,
): string | undefined {
  const clean = sanitizeCodigoReduzido(reduzido);
  if (!clean) return undefined;
  if (/^\d{7}$/.test(clean) && !/^0/.test(clean)) return undefined;
  if (isReduzidoPrimeiroPair(clean, classificacao)) return clean;
  if (isReduzidoSegundoPair(classificacao, clean)) return clean;
  return undefined;
}

/** Formato legado: classificação;reduzido;descrição — reduzido na 2ª coluna. */
export function isReduzidoSegundoPair(classificacao: string, maybeReduzido: string): boolean {
  if (!isClassificacaoContabil(classificacao)) return false;
  const red = sanitizeCodigoReduzido(maybeReduzido);
  if (!red) return false;

  const cDigits = classificacao.replace(/\D/g, '');
  const rDigits = red.replace(/^0+/, '') || '0';

  if (cDigits.startsWith(rDigits) && maybeReduzido.length <= 3 && !maybeReduzido.startsWith('0')) {
    return false;
  }

  if (rDigits === cDigits && maybeReduzido.trim().length < 7) return false;

  return /^\d{7}$/.test(maybeReduzido.trim()) || classificacao.includes('.');
}

export function codeLengthToPlanoLevel(code: string): number {
  const len = code.replace(/\D/g, '').length;
  if (len <= 1) return 1;
  if (len <= 2) return 2;
  if (len <= 3) return 3;
  if (len <= 5) return 4;
  if (len <= 10) return 5;
  return 6;
}

export function visionPlanoToAccountPlan(row: VisionPlanoRow) {
  const group = derivePlanoGroupFromCode(row.codigo);
  return {
    code: row.codigo,
    name: (row.nome || 'CONTA').toUpperCase(),
    codigoReduzido: sanitizeCodigoReduzido(row.codigoReduzido),
    tipo: row.tipo,
    nivel: row.nivel ?? codeLengthToPlanoLevel(row.codigo),
    group,
    nature: derivePlanoNatureFromGroup(group),
  };
}

export function planoHasMetadataRows(
  rows: Array<{ tipo?: 'S' | 'A'; nivel?: number; codigoReduzido?: string }>,
): boolean {
  return rows.some((r) => !!r.tipo || !!r.nivel || !!r.codigoReduzido?.trim());
}

export function planoNivelIndentClass(nivel?: number): string {
  switch (nivel) {
    case 1:
      return 'pl-0';
    case 2:
      return 'pl-3';
    case 3:
      return 'pl-6';
    case 4:
      return 'pl-9';
    case 5:
      return 'pl-12';
    default:
      return 'pl-12';
  }
}

export function planoNivelCodeClass(nivel?: number, tipo?: 'S' | 'A'): string {
  if (tipo === 'S') {
    if (nivel === 1) return 'font-black';
    if (nivel === 2) return 'font-bold';
    return 'font-semibold';
  }
  switch (nivel) {
    case 1:
      return 'font-black';
    case 2:
      return 'font-bold';
    case 3:
      return 'font-semibold';
    default:
      return 'text-[10px] opacity-80';
  }
}

/** Linha TXT exportação Domínio (largura fixa): reduzido + classificação + descrição + tipo. */
export function formatDominioPlanoLinha(acc: {
  code: string;
  name: string;
  codigoReduzido?: string;
  tipo?: 'S' | 'A';
}): string {
  const reduzido = (acc.codigoReduzido?.replace(/\D/g, '') || '0000000').padStart(7, '0').slice(-7);
  const cField = acc.code.replace(/\D/g, '').padStart(12, '0').padEnd(19, ' ');
  const n = acc.name.padEnd(40, ' ').slice(0, 40);
  const tipo = acc.tipo === 'S' ? 'S' : 'A';
  return `${reduzido}${cField}${n}${tipo}`;
}

export function buildDominioPlanoTxtFromAccounts(
  accounts: Array<{ code: string; name: string; codigoReduzido?: string; tipo?: 'S' | 'A' }>,
): string {
  return accounts.map(formatDominioPlanoLinha).join('\r\n');
}

export function planoNivelDescClass(nivel?: number, tipo?: 'S' | 'A'): string {
  if (tipo === 'S') {
    if (nivel === 1) return 'font-black uppercase';
    if (nivel === 2) return 'font-bold uppercase';
    return 'font-semibold uppercase';
  }
  switch (nivel) {
    case 1:
      return 'font-black uppercase';
    case 2:
      return 'font-bold uppercase';
    case 3:
      return 'font-semibold uppercase';
    default:
      return 'uppercase text-[10px] opacity-90';
  }
}

/** Aceita TXT/CSV no formato Domínio (reduzido;classificação;descrição;tipo) ou legado (classificação;reduzido;…). */
export function parsePlanoTxtParts(parts: string[]): {
  code: string;
  codigoReduzido?: string;
  name: string;
  tipo?: 'S' | 'A';
  nivel?: number;
} {
  const p0 = parts[0]?.trim() ?? '';
  const p1 = parts[1]?.trim() ?? '';
  const p2 = parts[2]?.trim() ?? '';
  const p3 = parts[3]?.trim() ?? '';
  const p4 = parts[4]?.trim() ?? '';

  const reduzidoPrimeiro = isReduzidoPrimeiroPair(p0, p1);
  const reduzidoSegundo = !reduzidoPrimeiro && isReduzidoSegundoPair(p0, p1);
  const code = (reduzidoPrimeiro ? p1 : p0) || '1.01.01.0001';
  const codigoReduzido = reduzidoPrimeiro
    ? acceptCodigoReduzidoFromFile(p0, p1, 'semicolon')
    : reduzidoSegundo
      ? acceptCodigoReduzidoFromFile(p1, p0, 'semicolon')
      : undefined;
  const name = (reduzidoPrimeiro ? p2 : p2 || p1) || 'CONTA PADRAO';
  const tipoRaw = (reduzidoPrimeiro ? p3 : p3)?.toUpperCase();
  const tipo =
    tipoRaw === 'S' || tipoRaw === 'A'
      ? tipoRaw
      : tipoRaw?.startsWith('SINT')
        ? 'S'
        : tipoRaw?.startsWith('ANAL')
          ? 'A'
          : undefined;
  const nivelParsed = parseInt(reduzidoPrimeiro ? p4 : p4, 10);
  const nivel = Number.isFinite(nivelParsed) && nivelParsed > 0 ? nivelParsed : undefined;

  return { code, codigoReduzido, name, tipo, nivel };
}
