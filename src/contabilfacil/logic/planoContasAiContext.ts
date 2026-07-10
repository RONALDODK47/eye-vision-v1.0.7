import { readManagerData } from './companyWorkspace';

export type PlanoAiRow = {
  code: string;
  name: string;
  codigoReduzido?: string;
  tipo?: string;
};

/** Contas analíticas do plano para contexto da IA / fallback local. */
export function loadPlanoAnaliticoForAi(companyName: string): PlanoAiRow[] {
  const rows = readManagerData<{
    code?: string;
    name?: string;
    codigoReduzido?: string;
    tipo?: string;
  }>(companyName, 'plano');
  return rows
    .filter((r) => r.tipo !== 'S' && String(r.code ?? '').trim() && String(r.name ?? '').trim())
    .map((r) => ({
      code: String(r.code).trim(),
      name: String(r.name).trim(),
      codigoReduzido: r.codigoReduzido,
      tipo: r.tipo,
    }));
}

export function buildPlanoPayloadForModuloAi(
  plano: PlanoAiRow[],
): Array<{ code: string; name: string }> {
  return plano.map((p) => ({ code: p.code, name: p.name }));
}

/** Resolve classificação sugerida contra o plano (code, digits ou nome). */
export function resolveClassificacaoDoPlano(
  raw: string,
  plano: Array<{ code: string; name?: string }>,
): string {
  const input = String(raw ?? '').trim();
  if (!input || !plano.length) return '';

  const exact = plano.find((p) => p.code.trim() === input);
  if (exact) return exact.code.trim();

  const digits = input.replace(/\D/g, '');
  if (digits) {
    const byDigits = plano.find((p) => p.code.replace(/\D/g, '') === digits);
    if (byDigits) return byDigits.code.trim();
  }

  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const needle = norm(input);
  if (needle.length < 3) return '';

  let best: { code: string; score: number } | null = null;
  for (const p of plano) {
    const name = norm(p.name ?? '');
    if (!name) continue;
    let score = 0;
    if (name === needle) score = 100;
    else if (name.includes(needle) || needle.includes(name)) score = 50;
    else {
      const tokens = needle.split(/\s+/).filter((t) => t.length > 2);
      score = tokens.filter((t) => name.includes(t)).length * 8;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { code: p.code.trim(), score };
    }
  }
  return best && best.score >= 16 ? best.code : '';
}
