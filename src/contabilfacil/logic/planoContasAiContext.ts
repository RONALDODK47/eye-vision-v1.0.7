import { readManagerData } from './companyWorkspace';
import {
  assertSomenteCodigoReduzido,
  sanitizeCodigoReduzido,
} from './planoContasMapper';

export type PlanoAiRow = {
  code: string;
  name: string;
  codigoReduzido?: string;
  tipo?: string;
  group?: string;
  nivel?: number;
};

/** Contas analíticas do plano para contexto da IA. */
export function loadPlanoAnaliticoForAi(companyName: string): PlanoAiRow[] {
  const rows = readManagerData<{
    code?: string;
    name?: string;
    codigoReduzido?: string;
    tipo?: string;
  }>(companyName, 'plano');
  return rows
    .filter(
      (r) =>
        r.tipo !== 'S' &&
        String(r.name ?? '').trim() &&
        Boolean(sanitizeCodigoReduzido(r.codigoReduzido)),
    )
    .map((r) => ({
      code: String(r.code ?? '').trim(),
      name: String(r.name).trim(),
      codigoReduzido: sanitizeCodigoReduzido(r.codigoReduzido),
      tipo: r.tipo,
    }));
}

export function buildPlanoPayloadForModuloAi(
  plano: PlanoAiRow[],
): Array<{ codigoReduzido: string; name: string; classificacao?: string }> {
  return plano
    .map((p) => ({
      codigoReduzido: sanitizeCodigoReduzido(p.codigoReduzido) || '',
      name: p.name,
      classificacao: p.code,
    }))
    .filter((p) => p.codigoReduzido && p.name);
}

/** Plano completo para resolver classificação → código reduzido (todas as analíticas). */
export function loadPlanoCompletoForContaResolve(companyName: string): Array<{
  code: string;
  name: string;
  codigoReduzido?: string;
  tipo?: string;
}> {
  return readManagerData<{
    code?: string;
    name?: string;
    codigoReduzido?: string;
    tipo?: string;
  }>(companyName, 'plano')
    .map((r) => ({
      code: String(r.code ?? '').trim(),
      name: String(r.name ?? '').trim(),
      codigoReduzido: sanitizeCodigoReduzido(r.codigoReduzido),
      tipo: r.tipo,
    }))
    .filter((r) => r.code || r.codigoReduzido);
}

/** Resolve sugestão da IA para código reduzido do plano. */
export function resolveCodigoReduzidoSugestaoPlano(
  raw: string,
  plano: Array<{ code: string; name?: string; codigoReduzido?: string }>,
): string {
  return assertSomenteCodigoReduzido(raw, plano);
}

/** @deprecated use resolveCodigoReduzidoSugestaoPlano */
export function resolveClassificacaoDoPlano(
  raw: string,
  plano: Array<{ code: string; name?: string; codigoReduzido?: string }>,
): string {
  return resolveCodigoReduzidoSugestaoPlano(raw, plano);
}

function classifDepth(code: string): number {
  return code.trim().split('.').filter(Boolean).length;
}

/**
 * Hierarquia sintética → analíticas para a IA escolher o grupo certo ao ler o balancete.
 */
export function buildPlanoHierarquiaSinteticasParaIa(companyName: string): string {
  const rows = readManagerData<{
    code?: string;
    name?: string;
    codigoReduzido?: string;
    tipo?: string;
    group?: string;
  }>(companyName, 'plano');
  if (!rows.length) return '';

  const sinteticas = rows
    .filter((r) => r.tipo === 'S' && String(r.code ?? '').trim() && String(r.name ?? '').trim())
    .sort((a, b) =>
      String(a.code).localeCompare(String(b.code), 'pt-BR', { numeric: true }),
    );

  const analiticas = rows.filter(
    (r) => r.tipo !== 'S' && sanitizeCodigoReduzido(r.codigoReduzido) && String(r.code ?? '').trim(),
  );

  if (!sinteticas.length) return '';

  const lines: string[] = [
    `=== HIERARQUIA DO PLANO — GRUPOS SINTÉTICOS — ${companyName} ===`,
    'Grupos sintéticos organizam o balancete. Escolha a ANALÍTICA (código reduzido) dentro do grupo correto.',
    'Ex.: despesa bancária → grupo DESPESAS FINANCEIRAS → analítica TARIFAS BANCÁRIAS.',
    '',
  ];

  for (const s of sinteticas) {
    const code = String(s.code).trim();
    const name = String(s.name).trim();
    const kids = analiticas.filter((a) => String(a.code ?? '').trim().startsWith(`${code}.`));
    if (!kids.length && classifDepth(code) > 5) continue;

    const grupo = String(s.group ?? '').trim();
    lines.push(`▸ SINTÉTICA ${code} — ${name}${grupo ? ` [${grupo}]` : ''}`);
    for (const k of kids.slice(0, 14)) {
      const red = sanitizeCodigoReduzido(k.codigoReduzido) || '';
      lines.push(`    · reduzido ${red} — ${String(k.name ?? '').trim()} (classif. ${String(k.code).trim()})`);
    }
    if (kids.length > 14) lines.push(`    … +${kids.length - 14} analítica(s) neste grupo`);
    lines.push('');
  }

  return lines.join('\n').slice(0, 18_000);
}
