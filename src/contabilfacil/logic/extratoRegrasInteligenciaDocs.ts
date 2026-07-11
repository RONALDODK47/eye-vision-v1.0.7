/**
 * Regras obrigatórias a partir dos documentos da Inteligência IA
 * (coligadas, contratos/sócios, balancetes, outros).
 */
import {
  isNomeColigadaInvalido,
  loadAiInteligencia,
  matchColigadaNoHistorico,
  matchSocioNoHistorico,
  resolveContaColigadaParaNatureza,
  syncColigadasFromInteligenciaDocs,
  syncSociosFromInteligenciaDocs,
  type AiColigada,
  type AiInteligenciaPasta,
} from './aiInteligenciaStorage';
import type { ExtratoLinhaParaRegra, PlanoOptionLike } from './extratoRegrasCobertura';
import {
  extractPadraoOperacionalAgrupado,
  resolveDescricaoRegraColigada,
  resolveDescricaoRegraSocio,
} from './extratoRegrasCobertura';
import type { ExtratoRegraConta } from './extratoRegrasContasStorage';
import { normalizeExtratoMatchText } from './extratoRegrasContasStorage';
import { extractRegraEntityDescricao } from './extratoRegrasEntity';
import { buildInteligenciaContextoParaRegrasIaAsync, type RegrasContasInteligenciaContext } from './regrasContasAiContext';
import { aplicarRestricaoGrupoPastaInteligencia, resolveContrapartidaNoGrupoPastaInteligencia } from './aiInteligenciaPastaGrupos';

export type RegrasLocaisInteligenciaResult = {
  regras: ExtratoRegraConta[];
  resumo: string;
};

const ETAPA1_HISTORICO_RE =
  /HONOR|CONTAD|ESCRITORIO|ASSESSORIA\s+CONT|PROLABORE|PRO\s*LABORE|RETIRADA\s+SOCIO|DIVIDENDO|DISTRIBUICAO\s+LUCRO|\bSOCIO\b|PARTES?\s+RELACIONAD|COLIGAD|MUTUO|M[UÚ]TUO/i;

const ETAPA1_FUNCIONARIOS_RE =
  /FOLHA|SALARIO|FERIAS|RESCISAO|ORDENADO|13\s*SALARIO|VALE\s+TRANSPORTE/i;

const ETAPA1_DESPESAS_RE =
  /TARIFA|IOF|JUROS|MATERIAL|HIGIENE|LIMPEZA|ESGOTO|ALUGUEL|ENERG|ELETRIC|DESPESA|COMPRA|SUPRIM|MANUTEN|TELEFON|INTERNET|PAPELARIA|SANEAGO|AGUA/i;

const ETAPA1_RECEITAS_RE =
  /RENDIMENTO|RECEITA|JUROS\s+CAP|LIQ\s+COBRAN|CREDITO\s+PIX|CRED\s+PIX/i;

/** Pastas da Inteligência IA que têm pelo menos um documento enviado. */
export function inteligenciaPastasComDocumentos(company: string): Set<AiInteligenciaPasta> {
  const out = new Set<AiInteligenciaPasta>();
  for (const d of loadAiInteligencia(company).docs) {
    out.add(d.pasta);
  }
  return out;
}

/** Nomes/aliases das pastas coligadas, contratos e outros — para cruzar com o extrato. */
export function extractNomesInteligenciaEtapa1(
  coligadas: AiColigada[],
  ctx?: Pick<
    RegrasContasInteligenciaContext,
    | 'inteligenciaColigadas'
    | 'inteligenciaContratos'
    | 'inteligenciaHonorarios'
    | 'inteligenciaFuncionarios'
    | 'inteligenciaDespesas'
    | 'inteligenciaReceitas'
    | 'inteligenciaFinanceiras'
  >,
): string[] {
  const nomes = new Set<string>();
  for (const c of coligadas) {
    const n = normalizeExtratoMatchText(c.nome);
    if (n.length >= 4 && !isNomeColigadaInvalido(n)) nomes.add(n);
    for (const a of c.aliases ?? []) {
      const na = normalizeExtratoMatchText(a);
      if (na.length >= 3 && !isNomeColigadaInvalido(na)) nomes.add(na);
    }
  }
  const blocos = [
    ...(ctx?.inteligenciaColigadas ?? []),
    ...(ctx?.inteligenciaContratos ?? []),
    ...(ctx?.inteligenciaHonorarios ?? []),
    ...(ctx?.inteligenciaFuncionarios ?? []),
    ...(ctx?.inteligenciaDespesas ?? []),
    ...(ctx?.inteligenciaReceitas ?? []),
    ...(ctx?.inteligenciaFinanceiras ?? []),
  ].join('\n');
  for (const raw of blocos.split(/\s+/)) {
    const t = normalizeExtratoMatchText(raw);
    if (t.length < 4 || t.length > 40) continue;
    if (isNomeColigadaInvalido(t)) continue;
    if (/^\d+$/.test(t)) continue;
    if (/LTDA|EIRELI|ME|EPP|SA|SOCIO|HONOR|COLIGAD|CONTAD/.test(t)) nomes.add(t);
  }
  return [...nomes];
}

/** Só lançamentos relacionados a pastas que têm documento enviado na Inteligência IA. */
export function filterExtratoEtapa1Inteligencia(
  rows: ExtratoLinhaParaRegra[],
  coligadas: AiColigada[],
  ctx?: Pick<
    RegrasContasInteligenciaContext,
    | 'inteligenciaColigadas'
    | 'inteligenciaContratos'
    | 'inteligenciaHonorarios'
    | 'inteligenciaFuncionarios'
    | 'inteligenciaDespesas'
    | 'inteligenciaReceitas'
    | 'inteligenciaFinanceiras'
  >,
  socios: ReturnType<typeof syncSociosFromInteligenciaDocs> = [],
  pastasComDocs?: Set<AiInteligenciaPasta>,
): ExtratoLinhaParaRegra[] {
  const nomesDocs = extractNomesInteligenciaEtapa1(coligadas, ctx);
  const pastas = pastasComDocs ?? new Set<AiInteligenciaPasta>();
  return rows.filter((row) => {
    const hist = normalizeExtratoMatchText(row.description);
    if (!hist) return false;
    const nature = row.nature === 'C' ? ('C' as const) : ('D' as const);

    if (pastas.has('coligadas') && matchColigadaNoHistorico(hist, coligadas)) return true;
    if (
      pastas.has('contratos') &&
      (matchSocioNoHistorico(hist, socios) ||
        /PROLABORE|PRO\s*LABORE|RETIRADA\s+SOCIO|DIVIDENDO|DISTRIBUICAO\s+LUCRO|\bSOCIO\b/.test(hist))
    ) {
      return true;
    }
    if (pastas.has('funcionarios') && ETAPA1_FUNCIONARIOS_RE.test(hist)) return true;
    if (pastas.has('honorarios') && /HONOR|CONTAD|ESCRITORIO|ASSESSORIA\s+CONT/.test(hist)) {
      return true;
    }
    if (pastas.has('despesas') && nature === 'D' && ETAPA1_DESPESAS_RE.test(hist)) return true;
    if (pastas.has('receitas') && nature === 'C' && ETAPA1_RECEITAS_RE.test(hist)) return true;

    if (ETAPA1_HISTORICO_RE.test(hist)) {
      if (/HONOR|CONTAD/.test(hist) && pastas.has('honorarios')) return true;
      if (/PROLABORE|RETIRADA\s+SOCIO|DIVIDENDO|\bSOCIO\b/.test(hist) && pastas.has('contratos')) {
        return true;
      }
      if (matchColigadaNoHistorico(hist, coligadas) && pastas.has('coligadas')) return true;
    }

    const histCompact = hist.replace(/\s+/g, '');
    for (const nome of nomesDocs) {
      if (nome.length >= 4 && hist.includes(nome)) return true;
      const nc = nome.replace(/\s+/g, '');
      if (nc.length >= 4 && histCompact.includes(nc)) return true;
    }
    return false;
  });
}

/** Gera regras locais cruzando documentos da Inteligência + padrões do extrato. */
export function buildRegrasLocaisFromInteligenciaDocs(input: {
  company: string;
  contaBanco: string;
  extratoSample: ExtratoLinhaParaRegra[];
  plano: PlanoOptionLike[];
  regrasHistoricas?: ExtratoRegraConta[];
}): RegrasLocaisInteligenciaResult {
  const { company, contaBanco, extratoSample, plano, regrasHistoricas = [] } = input;
  const banco = contaBanco.trim();
  if (!banco) return { regras: [], resumo: '' };

  const coligadas = syncColigadasFromInteligenciaDocs(company);
  const socios = syncSociosFromInteligenciaDocs(company);
  const pastasComDocs = inteligenciaPastasComDocumentos(company);
  const out: ExtratoRegraConta[] = [];
  const seen = new Set<string>();
  const parts: string[] = [];
  const coligadasNoExtrato = new Set<string>();

  if (pastasComDocs.has('coligadas')) {
    for (const row of extratoSample) {
      const nature = row.nature === 'C' ? ('C' as const) : ('D' as const);
      const coligHit = matchColigadaNoHistorico(row.description, coligadas);
      if (!coligHit) continue;
      coligadasNoExtrato.add(coligHit.id);
      const desc = resolveDescricaoRegraColigada(coligHit, extratoSample, nature, regrasHistoricas);
      const contra = resolveContaColigadaParaNatureza(coligHit, nature, plano);
      if (!desc || !contra) continue;
      const key = `${nature}|${normalizeExtratoMatchText(desc)}|${contra}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: crypto.randomUUID(),
        nome: desc.slice(0, 40),
        descricao: desc,
        nature,
        contaBanco: banco,
        contaContrapartida: contra,
      });
    }

    for (const colig of coligadas) {
      if (coligadasNoExtrato.has(colig.id)) continue;
      for (const nature of ['D', 'C'] as const) {
        const contra = resolveContaColigadaParaNatureza(colig, nature, plano);
        if (!contra) continue;
        const desc = resolveDescricaoRegraColigada(colig, extratoSample, nature, regrasHistoricas);
        if (isNomeColigadaInvalido(desc)) continue;
        const key = `${nature}|${normalizeExtratoMatchText(desc)}|${contra}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: crypto.randomUUID(),
          nome: desc.slice(0, 40),
          descricao: desc,
          nature,
          contaBanco: banco,
          contaContrapartida: contra,
        });
      }
    }
    if (out.length > 0) {
      parts.push(`${out.length} regra(s) de coligada(s) — documentos enviados`);
    }
  }

  if (pastasComDocs.has('honorarios')) {
    for (const row of extratoSample) {
      if (row.nature !== 'D') continue;
      const hist = normalizeExtratoMatchText(row.description);
      if (!/HONOR|CONTAD|ESCRITORIO|ASSESSORIA\s+CONT/.test(hist)) continue;
      const desc = extractPadraoOperacionalAgrupado(row.description, 'D');
      const contra = resolveContrapartidaNoGrupoPastaInteligencia({
        company,
        description: row.description,
        nature: 'D',
        plano,
        coligadas,
        socios,
      });
      if (!contra) continue;
      const key = `D|${normalizeExtratoMatchText(desc)}|${contra}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: crypto.randomUUID(),
        nome: desc.slice(0, 40),
        descricao: desc.includes('HONOR') ? 'HONORARIOS PAGAMENTO' : desc,
        nature: 'D',
        contaBanco: banco,
        contaContrapartida: contra,
      });
    }
    if (out.some((r) => /HONOR/.test(r.descricao))) {
      parts.push('honorários — documentos enviados');
    }
  }

  if (pastasComDocs.has('contratos')) {
    for (const row of extratoSample) {
      const nature = row.nature === 'C' ? ('C' as const) : ('D' as const);
      const hist = normalizeExtratoMatchText(row.description);
      if (!/PROLABORE|RETIRADA\s+SOCIO|DISTRIBUICAO\s+LUCRO|DIVIDENDO/.test(hist)) continue;

      const socioHit = matchSocioNoHistorico(row.description, socios);
      const desc = socioHit
        ? resolveDescricaoRegraSocio(socioHit, extratoSample, nature, regrasHistoricas)
        : extractRegraEntityDescricao(row.description, nature, coligadas);
      if (!desc) continue;
      const contra = resolveContrapartidaNoGrupoPastaInteligencia({
        company,
        description: row.description,
        nature,
        plano,
        coligadas,
        socios,
      });
      if (!contra) continue;
      const key = `${nature}|${normalizeExtratoMatchText(desc)}|${contra}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: crypto.randomUUID(),
        nome: desc.slice(0, 40),
        descricao: desc,
        nature,
        contaBanco: banco,
        contaContrapartida: contra,
      });
    }

    for (const socio of socios) {
      for (const nature of ['D', 'C'] as const) {
        const desc = resolveDescricaoRegraSocio(socio, extratoSample, nature, regrasHistoricas);
        const contra = resolveContrapartidaNoGrupoPastaInteligencia({
          company,
          description: desc,
          nature,
          plano,
          coligadas,
          socios,
        });
        if (!contra) continue;
        const key = `${nature}|${normalizeExtratoMatchText(desc)}|${contra}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: crypto.randomUUID(),
          nome: desc.slice(0, 40),
          descricao: desc,
          nature,
          contaBanco: banco,
          contaContrapartida: contra,
        });
      }
    }
    if (out.some((r) => /PROLABORE|RETIRADA\s+SOCIO|DIVIDENDO/.test(r.descricao))) {
      parts.push('sócios — documentos enviados');
    }
  }

  return {
    regras: out
      .map((r) => {
        const enforced = aplicarRestricaoGrupoPastaInteligencia({
          company,
          regra: r,
          historico: r.descricao,
          plano,
          coligadas,
          socios,
        });
        if (!enforced) return null;
        return {
          ...r,
          descricao: enforced.descricao,
          nature: enforced.nature,
          contaContrapartida: enforced.contaContrapartida,
          nome: enforced.descricao.slice(0, 40),
        };
      })
      .filter((r): r is ExtratoRegraConta => Boolean(r)),
    resumo: parts.length ? parts.join('; ') : '',
  };
}

export async function assertInteligenciaDocsParaRegras(
  company: string,
): Promise<{ ok: boolean; docsComTexto: number; mensagem: string; temRazao: boolean }> {
  const ctx = await buildInteligenciaContextoParaRegrasIaAsync(company);
  const temRazao = Boolean(ctx.balanceteUsoContas?.trim());
  const temDocs = ctx.docsComTexto > 0;
  const totalDocs = loadAiInteligencia(company).docs.length;

  if (temDocs) {
    return {
      ok: true,
      docsComTexto: ctx.docsComTexto,
      temRazao,
      mensagem: `${ctx.docsComTexto} documento(s) na Inteligência IA`,
    };
  }

  if (totalDocs > 0) {
    return {
      ok: false,
      docsComTexto: 0,
      temRazao,
      mensagem:
        `${totalDocs} arquivo(s) enviado(s), mas a IA ainda não extraiu o texto. Aguarde a extração ou reenvie o documento.`,
    };
  }

  return {
    ok: false,
    docsComTexto: 0,
    temRazao,
    mensagem:
      'Envie documentos na Inteligência IA (coligadas, contratos/sócios, funcionários, honorários, despesas ou receitas) antes de gerar regras.',
  };
}
