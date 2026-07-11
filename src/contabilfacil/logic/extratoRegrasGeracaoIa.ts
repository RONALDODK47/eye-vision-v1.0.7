/**
 * Gera regras de contas (IA + cobertura local 100%) para conciliar todos os lançamentos.
 */
import { suggestRegrasContasWithAi } from '../../lib/aiRegrasContasClient';
import {
  contaAceitavelParaColigada,
  enrichColigadasComContasDoPlano,
  isContaFornecedorNome,
  listAiColigadasParaIa,
  listAiSociosParaIa,
  matchColigadaNoHistorico,
  matchColigadaParaRegra,
  pickContaColigadaNoPlano,
  resolveContaColigadaParaNatureza,
  syncColigadasFromInteligenciaDocs,
  syncSociosFromInteligenciaDocs,
} from './aiInteligenciaStorage';
import { validateAiRegrasLote } from './extratoRegrasAiPrecision';
import {
  agrupaPadroesExtratoParaIa,
  buildFallbackRegrasParaCobertura,
  chunkUncoveredForAiBatches,
  corrigeRegrasContasOperacionaisInadequadas,
  extractPadraoOperacionalAgrupado,
  extractRegraEntityDescricao,
  findUncoveredExtratoRows,
  isContaNominalEmpresa,
  isContaGeralFornecedorOuCliente,
  isLancamentoFornecedorOuClienteGenerico,
  isMovimentoAplicacaoFinanceira,
  padroesParaPayloadIa,
  pickContaRendimentoOuAplicacao,
  pickFallbackContaPorNatureza,
  resolveDescricaoRegraColigada,
  type ExtratoLinhaParaRegra,
  type PadraoExtratoParaIa,
  type PlanoOptionLike,
} from './extratoRegrasCobertura';
import {
  extractRegraEntityDescricao as extractEntityFromHistorico,
  mergeSugestoesIntoRegras,
} from './extratoRegrasEntity';
import {
  filterExtratoRegrasPorBanco,
  normalizeExtratoMatchText,
  normContaBancoCode,
  type ExtratoRegraConta,
} from './extratoRegrasContasStorage';
import { corrigeRegrasForaGrupoPastaInteligencia } from './aiInteligenciaPastaGrupos';
import { buildContaCandidatosTextoParaIa, contaTemSentidoLogicoParaHistorico } from './planoContasMatch';
import {
  assertInteligenciaDocsParaRegras,
  buildRegrasLocaisFromInteligenciaDocs,
  filterExtratoEtapa1Inteligencia,
} from './extratoRegrasInteligenciaDocs';
import {
  buildAnexosTextoEtapa1ParaIa,
  buildInteligenciaContextoParaRegrasIaAsync,
  buildModulosContextoParaRegrasIa,
  type RegrasContasInteligenciaContext,
} from './regrasContasAiContext';
import {
  resolveCodigoReduzidoDoPlano,
  sanitizeCodigoReduzido,
} from './planoContasMapper';
import { runInChunks, yieldToMain } from '../lib/deferIdle';
import {
  appendRegrasIaProcessMemory,
  buildMemoriaContextoParaIa,
  clearRegrasIaProcessMemory,
  loadRegrasIaProcessMemory,
} from './extratoRegrasIaProcessMemory';

/** Um padrão por chamada à IA — máxima precisão (sem lote). */
const PADROES_POR_CHAMADA_IA = 1;

type SubEtapa1Id = 'coligadas' | 'socios' | 'honorarios' | 'financeiras';

const SUB_ETAPA1_LABELS: Record<SubEtapa1Id, string> = {
  coligadas: 'Coligadas / partes relacionadas',
  socios: 'Sócios / pró-labore / retiradas',
  honorarios: 'Honorários',
  financeiras: 'Despesas e receitas financeiras',
};

function splitPadroesEtapa1PorCategoria(
  padroes: PadraoExtratoParaIa[],
  coligadas: ReturnType<typeof listAiColigadasParaIa>,
): Record<SubEtapa1Id, PadraoExtratoParaIa[]> {
  const out: Record<SubEtapa1Id, PadraoExtratoParaIa[]> = {
    coligadas: [],
    socios: [],
    honorarios: [],
    financeiras: [],
  };
  for (const p of padroes) {
    const hist = normalizeExtratoMatchText(p.description);
    if (matchColigadaNoHistorico(hist, coligadas)) {
      out.coligadas.push(p);
    } else if (
      /PROLABORE|PRO\s*LABORE|RETIRADA\s+SOCIO|DIVIDENDO|DISTRIBUICAO\s+LUCRO|\bSOCIO\b/.test(hist)
    ) {
      out.socios.push(p);
    } else if (
      /TARIFA|CESTA|PACOTE|MANUTENCAO|IOF|JUROS|RENDIMENTO|APLICAC|FINANCEIR|DESPESA\s+BANC|RECEITA\s+FIN/.test(
        hist,
      )
    ) {
      out.financeiras.push(p);
    } else {
      out.honorarios.push(p);
    }
  }
  return out;
}

function buildAnexosSubEtapa1(
  sub: SubEtapa1Id,
  ctx: RegrasContasInteligenciaContext,
  anexosBase: string[],
): string[] {
  const planoBlock = anexosBase.find((b) => b.includes('HIERARQUIA DO PLANO'));
  const coligadasMapa = anexosBase.find((b) => b.includes('MAPA COLIGADAS'));
  const scoped: string[] = [];
  if (planoBlock) scoped.push(planoBlock);
  if (ctx.pastasGruposContas) scoped.push(ctx.pastasGruposContas);
  if (ctx.balanceteUsoContas) scoped.push(ctx.balanceteUsoContas);
  if (sub === 'coligadas') {
    if (coligadasMapa) scoped.push(coligadasMapa);
    scoped.push(...ctx.inteligenciaColigadas);
  } else if (sub === 'socios') {
    scoped.push(...ctx.inteligenciaContratos, ...ctx.inteligenciaFuncionarios);
  } else if (sub === 'honorarios') {
    scoped.push(...ctx.inteligenciaHonorarios);
  } else {
    scoped.push(...ctx.inteligenciaFinanceiras);
  }
  return scoped;
}

function classificarTipoPadraoEtapa2(desc: string, nature: string): string {
  const h = normalizeExtratoMatchText(desc);
  if (/TARIFA|CESTA|PACOTE|MANUTENCAO/.test(h)) return 'Tarifa bancária';
  if (/PIX|TED|DOC\b/.test(h) && nature === 'D') return 'Pagamento fornecedor';
  if (/PIX|TED|DOC\b/.test(h) && nature === 'C') return 'Recebimento cliente';
  if (/IMPOST|TRIBUTO|IRPJ|PIS|COFINS|FGTS|DARF/.test(h)) return 'Imposto/tributo';
  if (/RENDIMENTO|APLICACAO|JUROS\s+CAPITALIZ/.test(h)) return 'Rendimento/aplicação';
  if (/EMPREST|FINANCIAMENTO|MUTUO/.test(h)) return 'Empréstimo/financiamento';
  if (/FOLHA|SALARIO|FERIAS|PROLABORE/.test(h)) return 'Folha/sócio';
  return 'Demais contas';
}

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
  syncSociosFromInteligenciaDocs(company);
  const regrasHistoricas = filterExtratoRegrasPorBanco(current, bancoAtivo);
  const inteligenciaCtx = await buildInteligenciaContextoParaRegrasIaAsync(company, coligadas);
  await yieldToMain();
  const docs = inteligenciaCtx.anexosTexto;
  const docsStatus = await assertInteligenciaDocsParaRegras(company);
  const modulosBase = buildModulosContextoParaRegrasIa(company);

  const podeUsarIaRemota =
    useAi &&
    (docsStatus.ok ||
      Boolean(inteligenciaCtx.balanceteUsoContas?.trim()) ||
      coligadas.length > 0 ||
      inteligenciaCtx.pastasComGrupos > 0);

  if (useAi && !docsStatus.ok) {
    progress(
      `Contexto limitado — ${docsStatus.mensagem} Gerando regras locais + balancete do razão quando disponível.`,
    );
  }

  if (useAi && !podeUsarIaRemota) {
    progress('Sem contexto suficiente para IA — apenas regras locais e cobertura automática.');
  }

  clearRegrasIaProcessMemory(company, bancoAtivo);

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
    const descFinal = resolveDescricaoRegraColigada(hit, extratoSample, nature, regrasHistoricas);
    const coligConta = resolveContaColigadaParaNatureza(hit, nature, planoOptions);
    if (coligConta) return { ...sug, descricao: descFinal, contaContrapartida: coligConta };
    const red =
      resolveCodigoReduzidoDoPlano(sug.contaContrapartida, allPlano) ||
      sanitizeCodigoReduzido(sug.contaContrapartida) ||
      '';
    const planoHit = red ? planoByReduzido.get(red) : undefined;
    const nomeConta = planoHit?.name || '';
    const bad = !nomeConta || !contaAceitavelParaColigada(nomeConta, hit);
    if (!bad) return { ...sug, descricao: descFinal };
    const better =
      pickContaColigadaNoPlano(planoOptions, hit.nome) ||
      pickContaColigadaNoPlano(allPlano, hit.nome);
    if (better && better !== red) {
      return { ...sug, descricao: descFinal, contaContrapartida: better };
    }
    return { ...sug, descricao: descFinal, contaContrapartida: '' };
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
        descricao: resolveDescricaoRegraColigada(coligHit, extratoSample, nature, regrasHistoricas),
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
    if (generico) {
      const red =
        resolveCodigoReduzidoDoPlano(sug.contaContrapartida, allPlano) ||
        sanitizeCodigoReduzido(sug.contaContrapartida) ||
        '';
      const planoHit = red ? planoByReduzido.get(red) : undefined;
      const jaGeral = planoHit && isContaGeralFornecedorOuCliente(planoHit.name);
      const geral = pickFallbackContaPorNatureza(nature, planoOptions);
      return {
        ...sug,
        descricao: extractPadraoOperacionalAgrupado(sug.descricao, nature),
        contaContrapartida: jaGeral ? red : geral || sug.contaContrapartida,
      };
    }
    const red =
      resolveCodigoReduzidoDoPlano(sug.contaContrapartida, allPlano) ||
      sanitizeCodigoReduzido(sug.contaContrapartida) ||
      '';
    const planoHit = red ? planoByReduzido.get(red) : undefined;
    const contaNominal = planoHit ? isContaNominalEmpresa(planoHit.name) : false;
    const historicoRef = sug.descricao;
    const sentidoOk =
      planoHit &&
      contaTemSentidoLogicoParaHistorico(historicoRef, planoHit.name, nature, planoHit);
    if (sentidoOk && !contaNominal) {
      return { ...sug, descricao: extractEntityFromHistorico(historicoRef, nature, coligadas) };
    }
    if (!contaNominal) {
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
      regrasHistoricas,
      { company, socios: listAiSociosParaIa(company) },
    );
  };

  try {
    progress(`Analisando extrato no banco ${bancoAtivo}…`);

    if (docsStatus.ok) {
      progress(`Contexto: ${docsStatus.mensagem} — gerando regras (coligadas, honorários, balancete)…`);
    }

    // Regras locais a partir dos documentos (coligadas, honorários, sócios)
    {
      const localDocs = buildRegrasLocaisFromInteligenciaDocs({
        company,
        contaBanco: bancoAtivo,
        extratoSample,
        plano: planoOptions,
        regrasHistoricas,
      });
      if (localDocs.regras.length > 0) {
        applySugestoes(
          localDocs.regras.map((r) => ({
            descricao: r.descricao,
            nature: r.nature,
            contaContrapartida: r.contaContrapartida,
          })),
        );
        if (localDocs.resumo) progress(`Docs: ${localDocs.resumo}`);
      }
      appendRegrasIaProcessMemory(company, bancoAtivo, {
        fase: 'regras_locais_documentos',
        regrasCriadas: localDocs.regras.length,
        resumo: localDocs.resumo,
        regras: filterExtratoRegrasPorBanco(current, bancoAtivo).map((r) => ({
          descricao: r.descricao,
          nature: r.nature,
          contaContrapartida: r.contaContrapartida,
        })),
      });
    }
    await yieldToMain();

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
      await runInChunks(doBanco, 24, async (chunk) => {
        for (const r of chunk) {
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
      });
      if (localFixed > 0) {
        totalUpdated += localFixed;
        progress(`Pré-correção: ${localFixed} regra(s) de coligada…`);
      }
    }
    await yieldToMain();

    if (podeUsarIaRemota) {
      const sociosIa = listAiSociosParaIa(company).map((s) => ({
        nome: s.nome,
        aliases: s.aliases,
      }));
      const coligadasPayload = coligadas.map((c) => ({
        nome: c.nome,
        aliases: c.aliases,
        contaReduzida: c.contaReduzida,
      }));

      const regrasExistentesPayload = () =>
        filterExtratoRegrasPorBanco(current, bancoAtivo).map((r) => ({
          descricao: r.descricao,
          nature: r.nature,
          contaContrapartida: r.contaContrapartida,
        }));

      const iaBase = {
        company,
        contaBanco: bancoAtivo,
        bancoNome: bancoNome || bancoAtivo,
        plano: planoOptions,
        balanceteUsoContas: inteligenciaCtx.balanceteUsoContas,
        pastasGruposContas: inteligenciaCtx.pastasGruposContas,
        inteligenciaColigadas: inteligenciaCtx.inteligenciaColigadas,
        inteligenciaContratos: inteligenciaCtx.inteligenciaContratos,
        inteligenciaHonorarios: inteligenciaCtx.inteligenciaHonorarios,
        inteligenciaFinanceiras: inteligenciaCtx.inteligenciaFinanceiras,
        coligadas: coligadasPayload,
        socios: sociosIa,
        precisaoMaxima: true as const,
      };

      // ——— ETAPA 1: coligadas → sócios → honorários → financeiras ———
      const extratoEtapa1 = filterExtratoEtapa1Inteligencia(extratoSample, coligadas, inteligenciaCtx);
      const padroesEtapa1 = agrupaPadroesExtratoParaIa(extratoEtapa1, coligadas);
      const porCategoria = splitPadroesEtapa1PorCategoria(padroesEtapa1, coligadas);
      const anexosEtapa1Base = buildAnexosTextoEtapa1ParaIa(inteligenciaCtx);

      let etapa1Total = 0;
      const subEtapas1: SubEtapa1Id[] = ['coligadas', 'socios', 'honorarios', 'financeiras'];

      for (const sub of subEtapas1) {
        const padroesSub = porCategoria[sub];
        if (padroesSub.length === 0) continue;

        const lotes = chunkUncoveredForAiBatches(padroesSub, PADROES_POR_CHAMADA_IA);
        progress(
          `Etapa 1 — ${SUB_ETAPA1_LABELS[sub]}: ${padroesSub.length} padrão(ões), ` +
            `${lotes.length} análise(s) individual(is)…`,
        );

        const anexosSub = buildAnexosSubEtapa1(sub, inteligenciaCtx, anexosEtapa1Base);
        const modulosSub = [
          modulosBase,
          `=== ETAPA 1 — ${SUB_ETAPA1_LABELS[sub].toUpperCase()} (PRECISÃO MÁXIMA) ===`,
          'UM padrão por análise. Consulte balancete antes de decidir.',
          'NÃO envie regras para outros padrões.',
        ].join('\n\n');

        for (let i = 0; i < lotes.length; i++) {
          const lote = lotes[i]!;
          const padrao = lote[0]!;
          const label = padrao.entidade || padrao.description.slice(0, 48);
          progress(
            `Etapa 1 — ${SUB_ETAPA1_LABELS[sub]} (${i + 1}/${lotes.length}): ${label}…`,
          );

          const payload = padroesParaPayloadIa(lote);
          const candidatos = buildContaCandidatosTextoParaIa(
            [{ description: padrao.description, nature: padrao.nature }],
            planoOptions,
          );

          const docResult = await suggestRegrasContasWithAi({
            ...iaBase,
            mode: 'documentos_inteligencia',
            message: [
              `ETAPA 1 — ${SUB_ETAPA1_LABELS[sub]} — padrão ${i + 1} de ${lotes.length}:`,
              `Analise SOMENTE: "${padrao.description.slice(0, 120)}" (${padrao.nature}).`,
              '1) Consulte o BALANCETE. 2) Leia documentos da pasta. 3) Busque no histórico de regras.',
              '4) Crie NO MÁXIMO 1 regra para este padrão.',
              candidatos,
            ].join(' '),
            extratoSample: payload,
            uncoveredExtrato: payload,
            anexosTexto: anexosSub,
            modulosContexto: modulosSub,
            regrasExistentes: regrasExistentesPayload(),
          });

          if (docResult.resumo) lastResumo = docResult.resumo;
          if (docResult.regras.length > 0) {
            const historicoDoc = lote.map((u) => u.description);
            const sanitized = sanitizeEValidarLote(docResult.regras, historicoDoc);
            if (sanitized.length > 0) {
              applySugestoes(sanitized);
              etapa1Total += sanitized.length;
              appendRegrasIaProcessMemory(company, bancoAtivo, {
                fase: `ia_etapa1_${sub}`,
                regrasCriadas: sanitized.length,
                resumo: docResult.resumo,
                regras: sanitized,
              });
            }
          }
          await yieldToMain();
        }
      }

      if (etapa1Total > 0) {
        progress(`Etapa 1 concluída: ${etapa1Total} regra(s) de coligadas/sócios/outros.`);
      }
      await yieldToMain();

      // ——— ETAPA 2: demais contas (1 padrão por chamada) ———
      const uncoveredAll = findUncoveredExtratoRows(
        extratoSample,
        filterExtratoRegrasPorBanco(current, bancoAtivo),
      );
      const padroesSemRegra = agrupaPadroesExtratoParaIa(uncoveredAll, coligadas);
      const lotesEtapa2 = chunkUncoveredForAiBatches(padroesSemRegra, PADROES_POR_CHAMADA_IA);

      if (lotesEtapa2.length > 0) {
        progress(
          `Etapa 2 — demais contas: ${padroesSemRegra.length} padrão(ões), ` +
            `${lotesEtapa2.length} análise(s) individual(is)…`,
        );

        let etapa2Total = 0;
        for (let i = 0; i < lotesEtapa2.length; i++) {
          const lote = lotesEtapa2[i]!;
          const padrao = lote[0]!;
          const tipo = classificarTipoPadraoEtapa2(padrao.description, padrao.nature);
          const label = padrao.entidade || padrao.description.slice(0, 48);
          progress(`Etapa 2 (${i + 1}/${lotesEtapa2.length}) — ${tipo}: ${label}…`);

          const payload = padroesParaPayloadIa(lote);
          const candidatos = buildContaCandidatosTextoParaIa(
            [{ description: padrao.entidade || padrao.description, nature: padrao.nature }],
            planoOptions,
          );

          const modulosCtx = [
            modulosBase,
            '=== ETAPA 2 — DEMAIS CONTAS (PRECISÃO MÁXIMA, UM PADRÃO POR VEZ) ===',
            `Tipo deste padrão: ${tipo}.`,
            candidatos,
            buildMemoriaContextoParaIa(loadRegrasIaProcessMemory(company, bancoAtivo)),
          ]
            .filter(Boolean)
            .join('\n\n');

          const result = await suggestRegrasContasWithAi({
            ...iaBase,
            mode: 'corrigir_cobertura',
            message: [
              `ETAPA 2 — padrão ${i + 1} de ${lotesEtapa2.length} (${tipo}):`,
              `Analise SOMENTE: "${padrao.description.slice(0, 120)}" (${padrao.nature}).`,
              'Cruze com balancete e plano. Crie NO MÁXIMO 1 regra.',
              'Coligadas/sócios já foram tratados na etapa 1.',
            ].join(' '),
            extratoSample: payload,
            uncoveredExtrato: payload,
            anexosTexto: docs,
            modulosContexto: modulosCtx,
            regrasExistentes: regrasExistentesPayload(),
          });

          if (result.resumo) lastResumo = [lastResumo, result.resumo].filter(Boolean).join(' ');
          if (result.regras.length > 0) {
            const historicoIa = lote.map((u) => u.description);
            const sanitized = sanitizeEValidarLote(result.regras, historicoIa);
            if (sanitized.length > 0) {
              applySugestoes(sanitized);
              etapa2Total += sanitized.length;
              appendRegrasIaProcessMemory(company, bancoAtivo, {
                fase: 'ia_etapa2_demais_contas_plano',
                regrasCriadas: sanitized.length,
                resumo: result.resumo,
                regras: sanitized,
              });
            }
          } else if (!result.ok && result.detail && i === 0) {
            progress(`Etapa 2: ${result.detail}`);
          }
          await yieldToMain();
        }

        if (etapa2Total > 0) {
          progress(`Etapa 2 concluída: ${etapa2Total} regra(s) das demais contas.`);
        }
      }
      await yieldToMain();
    }

    // Cobertura local obrigatória (100%)
    {
      await yieldToMain();
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
      appendRegrasIaProcessMemory(company, bancoAtivo, {
        fase: 'cobertura_local_100',
        regrasCriadas: local.added,
        resumo: `Cobertura local +${local.added}`,
        regras: filterExtratoRegrasPorBanco(current, bancoAtivo).slice(-80).map((r) => ({
          descricao: r.descricao,
          nature: r.nature,
          contaContrapartida: r.contaContrapartida,
        })),
      });
    }
    await yieldToMain();

    {
      const doBanco = filterExtratoRegrasPorBanco(current, bancoAtivo);
      const corrigidasGrupo = corrigeRegrasForaGrupoPastaInteligencia({
        company,
        regras: doBanco,
        plano: planoOptions,
        coligadas,
        socios: listAiSociosParaIa(company),
      });
      if (
        corrigidasGrupo.length !== doBanco.length ||
        corrigidasGrupo.some(
          (r, i) =>
            r.contaContrapartida !== doBanco[i]?.contaContrapartida ||
            r.descricao !== doBanco[i]?.descricao,
        )
      ) {
        const outros = current.filter((r) => normContaBancoCode(r.contaBanco) !== normContaBancoCode(bancoAtivo));
        current = [...outros, ...corrigidasGrupo];
        totalUpdated += corrigidasGrupo.filter((r, i) => r.contaContrapartida !== doBanco[i]?.contaContrapartida).length;
        progress('Correção: regras ajustadas aos grupos sintéticos das pastas…');
      }
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
