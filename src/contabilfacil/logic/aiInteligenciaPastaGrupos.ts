/**
 * Grupos sintéticos (entrada/saída) por pasta da Inteligência IA → analíticas para a IA.
 */
import { readManagerData } from './companyWorkspace';
import {
  PASTA_LABELS,
  type AiInteligenciaPasta,
  type AiInteligenciaPastaConfig,
} from './aiInteligenciaStorage';
import { resolveCodigoReduzidoDoPlano, sanitizeCodigoReduzido } from './planoContasMapper';

type PlanoRowLike = {
  code?: string;
  name?: string;
  codigoReduzido?: string;
  tipo?: string;
  group?: string;
  grupo?: string;
};

function normalizeGrupoClassificacao(raw: string, plano: PlanoRowLike[]): string {
  const v = String(raw ?? '').trim();
  if (!v) return '';

  if (/^\d+(\.\d+)+$/.test(v)) return v;

  const red = sanitizeCodigoReduzido(v);
  if (red) {
    const hit = plano.find(
      (p) => sanitizeCodigoReduzido(p.codigoReduzido) === red || String(p.code ?? '').trim() === v,
    );
    if (hit?.code) {
      const code = String(hit.code).trim();
      if (hit.tipo === 'S') return code;
      const parts = code.split('.');
      for (let d = parts.length - 1; d >= 1; d--) {
        const prefix = parts.slice(0, d).join('.');
        const syn = plano.find((p) => String(p.code ?? '').trim() === prefix && p.tipo === 'S');
        if (syn?.code) return String(syn.code).trim();
      }
      return code;
    }
  }

  const digits = v.replace(/\D/g, '');
  if (digits.length >= 2) {
    const syn = plano.find(
      (p) =>
        p.tipo === 'S' &&
        String(p.code ?? '')
          .replace(/\D/g, '')
          .startsWith(digits),
    );
    if (syn?.code) return String(syn.code).trim();
  }

  return v;
}

function resolveGrupoNome(classificacao: string, plano: PlanoRowLike[]): string {
  const hit = plano.find((p) => String(p.code ?? '').trim() === classificacao);
  return hit?.name ? String(hit.name).trim() : '';
}

function listAnaliticasDoGrupo(classificacao: string, plano: PlanoRowLike[]): PlanoRowLike[] {
  const prefix = classificacao.trim();
  if (!prefix) return [];
  return plano.filter((p) => {
    if (p.tipo === 'S') return false;
    const red = sanitizeCodigoReduzido(p.codigoReduzido);
    if (!red) return false;
    const code = String(p.code ?? '').trim();
    return code === prefix || code.startsWith(`${prefix}.`);
  });
}

function formatGrupoBlock(
  pasta: AiInteligenciaPasta,
  sentido: 'entrada' | 'saida',
  classificacao: string,
  plano: PlanoRowLike[],
): string[] {
  const cls = normalizeGrupoClassificacao(classificacao, plano);
  if (!cls) return [];
  const nomeGrupo = resolveGrupoNome(cls, plano);
  const analiticas = listAnaliticasDoGrupo(cls, plano);
  const lines: string[] = [
    `· ${PASTA_LABELS[pasta]} · ${sentido.toUpperCase()} → sintética ${cls}${nomeGrupo ? ` (${nomeGrupo})` : ''}`,
  ];
  if (!analiticas.length) {
    lines.push('  (nenhuma analítica encontrada neste grupo — confira a classificação no plano)');
    return lines;
  }
  for (const a of analiticas.slice(0, 24)) {
    const red = sanitizeCodigoReduzido(a.codigoReduzido) || resolveCodigoReduzidoDoPlano(String(a.code ?? ''), plano) || '?';
    lines.push(`  · reduzido ${red} — ${String(a.name ?? '').trim()}`);
  }
  if (analiticas.length > 24) {
    lines.push(`  … +${analiticas.length - 24} analítica(s) neste grupo`);
  }
  return lines;
}

/** Mapa de grupos sintéticos por pasta — a IA escolhe analíticas por descrição dentro do grupo. */
export function buildPastasGruposContasParaIa(
  company: string,
  pastaConfigs: Partial<Record<AiInteligenciaPasta, AiInteligenciaPastaConfig>>,
): string {
  const plano = readManagerData<PlanoRowLike>(company, 'plano');
  if (!plano.length) return '';

  const lines: string[] = [
    `=== GRUPOS DE CONTAS POR PASTA — INTELIGÊNCIA IA — ${company} ===`,
    'Configure por pasta a conta SINTÉTICA de saída (D no banco) e entrada (C no banco).',
    'A IA deve escolher a ANALÍTICA (código reduzido) dentro do grupo conforme a descrição do extrato.',
    'Documentos são opcionais — os grupos já orientam a classificação.',
    '',
  ];

  let hasAny = false;
  const pastas: AiInteligenciaPasta[] = ['coligadas', 'contratos', 'honorarios', 'financeiras'];
  for (const pasta of pastas) {
    const cfg = pastaConfigs[pasta];
    if (!cfg?.contaGrupoEntrada?.trim() && !cfg?.contaGrupoSaida?.trim()) continue;
    hasAny = true;
    lines.push(`--- ${PASTA_LABELS[pasta].toUpperCase()} ---`);
    if (cfg.contaGrupoSaida?.trim()) {
      lines.push(...formatGrupoBlock(pasta, 'saida', cfg.contaGrupoSaida, plano));
    }
    if (cfg.contaGrupoEntrada?.trim()) {
      lines.push(...formatGrupoBlock(pasta, 'entrada', cfg.contaGrupoEntrada, plano));
    }
    lines.push('');
  }

  if (!hasAny) return '';
  return lines.join('\n').slice(0, 14_000);
}

export function pastaConfigTemGrupos(cfg?: AiInteligenciaPastaConfig | null): boolean {
  return Boolean(cfg?.contaGrupoEntrada?.trim() || cfg?.contaGrupoSaida?.trim());
}
