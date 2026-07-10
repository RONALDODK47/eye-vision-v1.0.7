/**
 * Gera regras de contas (IA + cobertura local 100%) para conciliar todos os lançamentos.
 */
import { suggestRegrasContasWithAi } from '../../lib/aiRegrasContasClient';
import {
  contaAceitavelParaColigada,
  enrichColigadasComContasDoPlano,
  isContaFornecedorNome,
  listAiColigadasParaIa,
  matchColigadaNoHistorico,
  matchColigadaParaRegra,
  pickContaColigadaNoPlano,
  resolveContaColigadaParaNatureza,
  syncColigadasFromInteligenciaDocs,
} from './aiInteligenciaStorage';
import { validateAiRegrasLote } from './extratoRegrasAiPrecision';
import {
  agrupaPadroesExtratoParaIa,
  buildFallbackRegrasParaCobertura,
  corrigeRegrasContasOperacionaisInadequadas,
  extractPadraoOperacionalAgrupado,
  extractRegraEntityDescricao,
  findUncoveredExtratoRows,
  isContaNominalEmpresa,
  isLancamentoFornecedorOuClienteGenerico,
  isMovimentoAplicacaoFinanceira,
  padroesParaPayloadIa,
  pickContaRendimentoOuAplicacao,
  pickFallbackContaPorNatureza,
  type ExtratoLinhaParaRegra,
  type PlanoOptionLike,
} from './extratoRegrasCobertura';
import {
  canonicalColigadaDescricao,
  extractRegraEntityDescricao as extractEntityFromHistorico,
  mergeSugestoesIntoRegras,
} from './extratoRegrasEntity';
import {
  filterExtratoRegrasPorBanco,
  normalizeExtratoMatchText,
  type ExtratoRegraConta,
} from './extratoRegrasContasStorage';
import { contaTemSentidoLogicoParaHistorico } from './planoContasMatch';
import {
  buildInteligenciaContextoParaRegrasIaAsync,
  buildModulosContextoParaRegrasIa,
} from './regrasContasAiContext';
import {
  resolveCodigoReduzidoDoPlano,
  sanitizeCodigoReduzido,
} from './planoContasMapper';

export type GerarRegrasExtratoResult = {
  regras: ExtratoRegraConta[];
  totalAdded: number;
  totalUpdated: number;
  stillOpen: number;
  resumo: string;
  error?: string;
};

export type GerarRegrasExtratoParams = {
  company: string;
  regras: ExtratoRegraConta[];
  bancoAtivo: string;
  bancoNome?: string;
  planoOptions: PlanoOptionLike[];
  allPlano: PlanoOptionLike[];
  extratoSample: ExtratoLinhaParaRegra[];
  /** Se false, só cobertura local (rápido). Default: true. */
  useAi?: boolean;
  onProgress?: (msg: string) => void;
};

/** Cobertura local imediata — sem chamar IA. */
export function aplicarCoberturaLocalRegrasExtrato(params: {
  company: string;
  regras: ExtratoRegraConta[];
  bancoAtivo: string;
  planoOptions: PlanoOptionLike[];
  extratoSample: ExtratoLinhaParaRegra[];
  anexosTexto?: string[];
}): { regras: ExtratoRegraConta[]; added: number } {
  const coligadas = listAiColigadasParaIa(params.company);
  let current = [...params.regras];
  let added = 0;

  const applySugestoes = (
    sugestoes: Array<{ descricao: string; nature: string; contaContrapartida: string }>,
  ) => {
    const applied = mergeSugestoesIntoRegras({
      current,
      sugestoes,
      contaBanco: params.bancoAtivo,
      resolveContra: (raw) =>
        resolveCodigoReduzidoDoPlano(raw, params.planoOptions) ||
        sanitizeCodigoReduzido(raw) ||
        '',
      coligadas,
    });
    current = applied.next;
    added += applied.added + applied.updated;
  };

  const doBanco = filterExtratoRegrasPorBanco(current, params.bancoAtivo);
  let still = findUncoveredExtratoRows(params.extratoSample, doBanco);
  if (still.length === 0) return { regras: current, added: 0 };

  const fallbacks = buildFallbackRegrasParaCobertura({
    uncovered: still,
    contaBanco: params.bancoAtivo,
    plano: params.planoOptions,
    coligadas,
    anexosTexto: params.anexosTexto,
  });
  if (fallbacks.length > 0) {
    applySugestoes(
      fallbacks.map((f) => ({
        descricao: f.descricao,
        nature: f.nature,
        contaContrapartida: f.contaContrapartida,
      })),
    );
  }

  still = findUncoveredExtratoRows(
    params.extratoSample,
    filterExtratoRegrasPorBanco(current, params.bancoAtivo),
  );
  if (still.length > 0) {
    const forced = still
      .map((row) => {
        const nature = row.nature === 'C' ? ('C' as const) : ('D' as const);
        const desc = extractEntityFromHistorico(row.description, nature, coligadas);
        const contra =
          buildFallbackRegrasParaCobertura({
            uncovered: [row],
            contaBanco: params.bancoAtivo,
            plano: params.planoOptions,
            coligadas,
            anexosTexto: params.anexosTexto,
          })[0]?.contaContrapartida || '';
        if (!desc || !contra) return null;
        return { descricao: desc, nature, contaContrapartida: contra };
      })
      .filter(Boolean) as Array<{
      descricao: string;
      nature: 'D' | 'C';
      contaContrapartida: string;
    }>;
    if (forced.length > 0) applySugestoes(forced);
  }

  return { regras: current, added };
}

/** IA + fallbacks — objetivo: 100% dos lançamentos com regra (conciliação completa). */
export async function gerarRegrasExtratoConciliacaoCompleta(
  params: GerarRegrasExtratoParams,
): Promise<GerarRegrasExtratoResult> {
  const {
    company,
    bancoAtivo,
    bancoNome,
    planoOptions,
    allPlano,
    extratoSample,
    useAi = true,
    onProgress,
  } = params;

  const progress = (msg: string) => onProgress?.(msg);

  if (!bancoAtivo) {
    return {
      regras: params.regras,
      totalAdded: 0,
      totalUpdated: 0,
      stillOpen: extratoSample.length,
      resumo: '',
      error: 'Conta banco não configurada.',
    };
  }
  if (planoOptions.length === 0) {
    return {
      regras: params.regras,
      totalAdded: 0,
      totalUpdated: 0,
      stillOpen: extratoSample.length,
      resumo: '',
      error: 'Importe o plano de contas com código reduzido.',
    };
  }
  if (extratoSample.length === 0) {
    return {
      regras: params.regras,
      totalAdded: 0,
      totalUpdated: 0,
      stillOpen: 0,
      resumo: '',
      error: 'Nenhum lançamento no extrato.',
    };
  }

  let current = [...params.regras];
  let totalAdded = 0;
  let totalUpdated = 0;
  let lastResumo = '';
  let fallbackAdded = 0;

  const coligadas = enrichColigadasComContasDoPlano(
    syncColigadasFromInteligenciaDocs(company),
    allPlano,
  );
  const inteligenciaCtx = await buildInteligenciaContextoParaRegrasIaAsync(company, coligadas);
  const docs = inteligenciaCtx.anexosTexto;

  const planoByReduzido = new Map(
    allPlano.map((p) => {
      const red = sanitizeCodigoReduzido(p.codigoReduzido) || sanitizeCodigoReduzido(p.code) || '';
      return [red, p] as const;
    }),
  );

  let historicoLoteAtual: string[] = [];

  const applySugestoes = (
    sugestoes: Array<{ descricao: string; nature: string; contaContrapartida: string }>,
  ) => {
    const applied = mergeSugestoesIntoRegras({
      current,
      sugestoes,
      contaBanco: bancoAtivo,
      resolveContra: (raw) =>
        resolveCodigoReduzidoDoPlano(raw, allPlano) || sanitizeCodigoReduzido(raw) || '',
      coligadas: listAiColigadasParaIa(company),
    });
    current = applied.next;
    totalAdded += applied.added;
    totalUpdated += applied.updated;
  };

  const sanitizeSugestaoColigada = (sug: {
    descricao: string;
    nature: string;
    contaContrapartida: string;
  }) => {
    const nature = sug.nature === 'C' ? ('C' as const) : ('D' as const);
    const hit = matchColigadaParaRegra(sug.descricao, coligadas, historicoLoteAtual);
    if (!hit) return sug;
    const descCanon = canonicalColigadaDescricao(hit);
    const coligConta = resolveContaColigadaParaNatureza(hit, nature, planoOptions);
    if (coligConta) return { ...sug, descricao: descCanon, contaContrapartida: coligConta };
    const red =
      resolveCodigoReduzidoDoPlano(sug.contaContrapartida, allPlano) ||
      sanitizeCodigoReduzido(sug.contaContrapartida) ||
      '';
    const planoHit = red ? planoByReduzido.get(red) : undefined;
    const nomeConta = planoHit?.name || '';
    const bad = !nomeConta || !contaAceitavelParaColigada(nomeConta, hit);
    if (!bad) return { ...sug, descricao: descCanon };
    const better =
      pickContaColigadaNoPlano(planoOptions, hit.nome) ||
      pickContaColigadaNoPlano(allPlano, hit.nome);
    if (better && better !== red) {
      return { ...sug, descricao: descCanon, contaContrapartida: better };
    }
    return { ...sug, descricao: descCanon, contaContrapartida: '' };
  };

  const sanitizeSugestaoAgrupada = (sug: {
    descricao: string;
    nature: string;
    contaContrapartida: string;
  }) => {
    const nature = sug.nature === 'C' ? ('C' as const) : ('D' as const);
    const coligHit = matchColigadaParaRegra(sug.descricao, coligadas, historicoLoteAtual);
    if (coligHit) {
      const coligConta = resolveContaColigadaParaNatureza(coligHit, nature, planoOptions);
      return {
        ...sug,
        descricao: canonicalColigadaDescricao(coligHit),
        contaContrapartida: coligConta || sug.contaContrapartida,
      };
    }
    if (isMovimentoAplicacaoFinanceira(sug.descricao, nature)) {
      const aplic = pickContaRendimentoOuAplicacao(nature, planoOptions);
      if (aplic) {
        return {
          ...sug,
          descricao: extractPadraoOperacionalAgrupado(sug.descricao, nature),
          contaContrapartida: aplic,
        };
      }
    }
    const generico = isLancamentoFornecedorOuClienteGenerico(sug.descricao, nature, coligadas);
    const red =
      resolveCodigoReduzidoDoPlano(sug.contaContrapartida, allPlano) ||
      sanitizeCodigoReduzido(sug.contaContrapartida) ||
      '';
    const planoHit = red ? planoByReduzido.get(red) : undefined;
    const contaNominal = planoHit ? isContaNominalEmpresa(planoHit.name) : false;
    const historicoRef =
      historicoLoteAtual.find((h) => normalizeExtratoMatchText(h).length >= 6) || sug.descricao;
    const sentidoOk =
      planoHit &&
      contaTemSentidoLogicoParaHistorico(historicoRef, planoHit.name, nature, planoHit);
    const genericoPix = isLancamentoFornecedorOuClienteGenerico(sug.descricao, nature, coligadas);
    if (sentidoOk && !(genericoPix && contaNominal)) {
      return { ...sug, descricao: extractEntityFromHistorico(historicoRef, nature, coligadas) };
    }
    if (!generico && !contaNominal) {
      return { ...sug, descricao: extractEntityFromHistorico(sug.descricao, nature, coligadas) };
    }
    const geral = pickFallbackContaPorNatureza(nature, planoOptions);
    if (!geral) return sug;
    return {
      ...sug,
      descricao: extractPadraoOperacionalAgrupado(sug.descricao, nature),
      contaContrapartida: geral,
    };
  };

  const sanitizeEValidarLote = (
    sugestoes: Array<{
      descricao: string;
      nature: string;
      contaContrapartida: string;
      motivo?: string;
    }>,
    extratoHistoricos: string[] = [],
  ) => {
    historicoLoteAtual = extratoHistoricos;
    return validateAiRegrasLote(
      sugestoes.map((s) => sanitizeSugestaoAgrupada(sanitizeSugestaoColigada(s))),
      planoOptions,
      coligadas,
      docs,
      extratoHistoricos,
    );
  };

  try {
    progress(`Analisando extrato no banco ${bancoAtivo}…`);

    // Corrige regras salvas com conta inadequada (PIX REC → imposto etc.)
    {
      const corrigidas = corrigeRegrasContasOperacionaisInadequadas({
        regras: current,
        plano: planoOptions,
        coligadas,
      });
      if (corrigidas !== current) {
        const fixed = corrigidas.filter((r, i) => r.contaContrapartida !== current[i]?.contaContrapartida).length;
        current = corrigidas;
        totalUpdated += fixed;
        if (fixed > 0) progress(`Correção: ${fixed} regra(s) com conta inadequada…`);
      }
    }

    // Pré-correção coligadas
    {
      let localFixed = 0;
      const doBanco = filterExtratoRegrasPorBanco(current, bancoAtivo);
      for (const r of doBanco) {
        const hit = matchColigadaNoHistorico(r.descricao, coligadas);
        if (!hit) continue;
        const red =
          resolveCodigoReduzidoDoPlano(r.contaContrapartida, allPlano) ||
          sanitizeCodigoReduzido(r.contaContrapartida) ||
          '';
        const planoHit = red ? planoByReduzido.get(red) : undefined;
        if (!planoHit || (!isContaFornecedorNome(planoHit.name) && !/\bCLIENTE/i.test(planoHit.name))) {
          continue;
        }
        const better = resolveContaColigadaParaNatureza(
          hit,
          r.nature === 'C' ? 'C' : 'D',
          planoOptions,
        );
        if (!better || better === red) continue;
        current = current.map((x) =>
          x.id === r.id ? { ...x, contaContrapartida: better } : x,
        );
        localFixed += 1;
      }
      if (localFixed > 0) {
        totalUpdated += localFixed;
        progress(`Pré-correção: ${localFixed} regra(s) de coligada…`);
      }
    }

    if (useAi) {
      const doBanco = filterExtratoRegrasPorBanco(current, bancoAtivo);
      const uncoveredAll = findUncoveredExtratoRows(extratoSample, doBanco);
      const padroesSemRegra = agrupaPadroesExtratoParaIa(uncoveredAll, coligadas);
      const padroesExtrato = agrupaPadroesExtratoParaIa(extratoSample, coligadas);
      const historicoIa = uncoveredAll.map((u) => u.description);

      progress(
        `IA: ${padroesSemRegra.length} padrão(ões) sem regra, ${docs.length} doc(s) Inteligência…`,
      );

      const modulosCtx = buildModulosContextoParaRegrasIa(company);
      const result = await suggestRegrasContasWithAi({
        company,
        contaBanco: bancoAtivo,
        bancoNome: bancoNome || bancoAtivo,
        mode: 'corrigir_cobertura',
        message: [
          'ANALISTA CONTÁBIL SÊNIOR — CONCILIAÇÃO 100%:',
          'CRIAR regras para TODOS os padrões sem regra.',
          'Cobrir fornecedor, cliente, coligadas, honorários, tarifas, impostos, rendimentos.',
          `Banco: ${bancoAtivo}. Padrões sem regra: ${padroesSemRegra.length}.`,
        ].join(' '),
        plano: planoOptions,
        extratoSample: padroesParaPayloadIa(padroesExtrato),
        uncoveredExtrato: padroesParaPayloadIa(padroesSemRegra),
        anexosTexto: docs,
        balanceteUsoContas: inteligenciaCtx.balanceteUsoContas,
        inteligenciaBalancetes: inteligenciaCtx.inteligenciaBalancetes,
        modulosContexto: modulosCtx,
        coligadas: coligadas.map((c) => ({
          nome: c.nome,
          aliases: c.aliases,
          contaReduzida: c.contaReduzida,
        })),
        regrasExistentes: doBanco.map((r) => ({
          descricao: r.descricao,
          nature: r.nature,
          contaContrapartida: r.contaContrapartida,
        })),
      });

      if (result.resumo) lastResumo = result.resumo;
      if (result.regras.length > 0) {
        const sanitized = sanitizeEValidarLote(result.regras, historicoIa);
        applySugestoes(sanitized);
      } else if (!result.ok && result.detail) {
        progress(`${result.detail} — aplicando cobertura local…`);
      }
    }

    // Cobertura local obrigatória (100%)
    {
      const local = aplicarCoberturaLocalRegrasExtrato({
        company,
        regras: current,
        bancoAtivo,
        planoOptions,
        extratoSample,
        anexosTexto: docs,
      });
      current = local.regras;
      fallbackAdded = local.added;
      totalAdded += local.added;
    }

    const after = filterExtratoRegrasPorBanco(current, bancoAtivo);
    const stillOpen = findUncoveredExtratoRows(extratoSample, after).length;
    const parts = [
      lastResumo,
      totalAdded || totalUpdated
        ? `Regras: ${totalUpdated} corrigida(s), ${totalAdded} nova(s)${
            fallbackAdded ? ` (${fallbackAdded} automáticas)` : ''
          }.`
        : 'Regras já cobrem o extrato ou plano incompleto.',
      stillOpen === 0
        ? 'Cobertura 100% — todos os lançamentos têm regra para conciliação.'
        : `Ainda faltam ${stillOpen} padrão(ões) — confira código reduzido no plano.`,
    ].filter(Boolean);

    return {
      regras: current,
      totalAdded,
      totalUpdated,
      stillOpen,
      resumo: parts.join(' '),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao gerar regras.';
    return {
      regras: current,
      totalAdded,
      totalUpdated,
      stillOpen: findUncoveredExtratoRows(
        extratoSample,
        filterExtratoRegrasPorBanco(current, bancoAtivo),
      ).length,
      resumo: '',
      error: msg,
    };
  }
}
