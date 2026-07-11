/**
 * Validação rigorosa de regras sugeridas pela IA.
 * Só grava o que passa 100% — conta no plano, natureza coerente, sem ambiguidade.
 */
import {
  extractPadraoOperacionalAgrupado,
  isContaGeralFornecedorOuCliente,
  isContaNominalEmpresa,
  isContaOperacionalEspecial,
  isEmprestimoHistorico,
  impostoContaCompativelComHistorico,
  isContaImpostoOuTributo,
  isImpostoSemTipoIdentificavel,
  isLancamentoFornecedorOuClienteGenerico,
  isMovimentoAplicacaoFinanceira,
  isRendimentoOuAplicacaoHistorico,
  pickContaEmprestimoPorContrato,
  pickContaRendimentoOuAplicacao,
  pickFallbackContaPorNatureza,
  pickFundoFixoCaixaConta,
  extractNumeroContratoHistorico,
  shouldUsarFundoFixoPendencia,
  temEvidenciaContratoEmprestimo,
  historicoStringsParaLinhasExtrato,
  resolveDescricaoRegraColigada,
  sanitizarHistoricoExtratoParaRegra,
  type PlanoOptionLike,
} from './extratoRegrasCobertura';
import type { ExtratoRegraConta } from './extratoRegrasContasStorage';
import {
  normalizeExtratoMatchText,
  normalizeExtratoRegraTexto,
} from './extratoRegrasContasStorage';
import {
  resolveCodigoReduzidoDoPlano,
  sanitizeCodigoReduzido,
} from './planoContasMapper';
import {
  matchColigadaNoHistorico,
  matchColigadaParaRegra,
  pickContaColigadaNoPlano,
  resolveContaColigadaParaNatureza,
  isNomeColigadaInvalido,
  contaCombinaComColigada,
  type AiColigada,
} from './aiInteligenciaStorage';
import { matchColigadaParaRegra } from './aiInteligenciaStorage';
import { extractRegraEntityDescricao } from './extratoRegrasEntity';
import {
  contaTemSentidoLogicoParaHistorico,
  scorePlanoContaParaHistorico,
} from './planoContasMatch';

export type AiRegraSugestao = {
  descricao: string;
  nature: string;
  contaContrapartida: string;
  motivo?: string;
};

export type AiRegraValidada = {
  descricao: string;
  nature: 'D' | 'C';
  contaContrapartida: string;
  motivo?: string;
};

function planoByReduzido(plano: PlanoOptionLike[]): Map<string, PlanoOptionLike> {
  const map = new Map<string, PlanoOptionLike>();
  for (const p of plano) {
    const red = sanitizeCodigoReduzido(p.codigoReduzido) || sanitizeCodigoReduzido(p.code);
    if (red) map.set(red, p);
  }
  return map;
}

function resolveContra(
  raw: string,
  plano: PlanoOptionLike[],
): string {
  return (
    resolveCodigoReduzidoDoPlano(raw, plano) ||
    sanitizeCodigoReduzido(raw) ||
    ''
  );
}

function isBancoOuCaixaNome(name: string): boolean {
  return /^\s*BANCO\b|\bCAIXA\b/i.test(name);
}

function isEmprestimoConta(name: string): boolean {
  return /EMPREST|MUTUO|M[UÚ]TUO|FINANCIAMENTO|COLIGAD|PARTES?\s+RELACIONAD/i.test(name);
}

function grupoConta(p: PlanoOptionLike): string {
  const g = String((p as { group?: string }).group ?? '').toUpperCase();
  if (g) return g;
  const code = String(p.code ?? '').replace(/\D/g, '');
  if (code.startsWith('1')) return 'ATIVO';
  if (code.startsWith('2')) return 'PASSIVO';
  if (code.startsWith('3')) return 'DESPESA';
  if (code.startsWith('4')) return 'RECEITA';
  return '';
}

/**
 * Valida e corrige uma sugestão da IA.
 * Retorna null se a regra for ambígua/errada demais para gravar.
 */
export function validateAiRegraSugestao(
  sug: AiRegraSugestao,
  plano: PlanoOptionLike[],
  coligadas: AiColigada[] = [],
  anexosTexto: string[] = [],
  extratoHistoricos: string[] = [],
  regrasHistoricas: ExtratoRegraConta[] = [],
): AiRegraValidada | null {
  if (!sug || plano.length === 0) return null;

  let descricao = normalizeExtratoRegraTexto(sug.descricao);
  if (!descricao || descricao.length < 3) return null;

  const nature: 'D' | 'C' = sug.nature === 'C' ? 'C' : 'D';
  descricao = sanitizarHistoricoExtratoParaRegra(descricao, nature, coligadas);
  if (!descricao || descricao.length < 3) return null;

  const byRed = planoByReduzido(plano);
  let contra = resolveContra(sug.contaContrapartida, plano);
  if (!contra || !byRed.has(contra)) return null;

  let conta = byRed.get(contra)!;
  if (isBancoOuCaixaNome(conta.name)) return null;

  const extratoRows = historicoStringsParaLinhasExtrato(extratoHistoricos, nature);
  let coligadaHit = matchColigadaParaRegra(descricao, coligadas, extratoHistoricos);

  if (!coligadaHit) {
    coligadaHit = coligadas.find((c) => contaCombinaComColigada(conta.name, c)) ?? null;
  }

  if (isNomeColigadaInvalido(descricao)) {
    if (coligadaHit) {
      descricao = resolveDescricaoRegraColigada(coligadaHit, extratoRows, nature, regrasHistoricas);
    } else {
      return null;
    }
  }

  const historicoRef =
    (normalizeExtratoMatchText(descricao).length >= 4 ? descricao : null) ||
    extratoHistoricos.find((h) => normalizeExtratoMatchText(h).length >= 6) ||
    descricao;

  // ——— PENDÊNCIA: imposto sem tipo identificável ou empréstimo sem contrato ———
  if (
    shouldUsarFundoFixoPendencia({ description: historicoRef, plano, anexosTexto }) &&
    !coligadaHit
  ) {
    const fundo = pickFundoFixoCaixaConta(plano);
    if (!fundo) return null;
    const descPend = isImpostoSemTipoIdentificavel(historicoRef)
      ? extractPadraoOperacionalAgrupado(historicoRef, nature)
      : descricao;
    return {
      descricao: descPend,
      nature,
      contaContrapartida: fundo,
      motivo: sug.motivo || 'Pendência — fundo fixo de caixa (classificar depois)',
    };
  }

  // ——— COLIGADA: nunca fornecedor/cliente ———
  if (coligadaHit) {
    const coligConta = resolveContaColigadaParaNatureza(coligadaHit, nature, plano);
    if (!coligConta) return null;
    descricao = resolveDescricaoRegraColigada(coligadaHit, extratoRows, nature);
    if (isNomeColigadaInvalido(descricao)) return null;
    return {
      descricao,
      nature,
      contaContrapartida: coligConta,
      motivo: sug.motivo || 'Coligada — histórico do extrato ou nome cadastrado',
    };
  }

  // ——— EMPRÉSTIMO: natureza × grupo (só quando contrato identificável) ———
  if (isEmprestimoHistorico(descricao)) {
    const num = extractNumeroContratoHistorico(descricao);
    const porContrato = num ? pickContaEmprestimoPorContrato(num, plano) : '';
    const temDoc =
      temEvidenciaContratoEmprestimo(descricao, anexosTexto) || Boolean(porContrato);
    if (!temDoc) {
      const fundo = pickFundoFixoCaixaConta(plano);
      if (!fundo) return null;
      return {
        descricao,
        nature,
        contaContrapartida: fundo,
        motivo: sug.motivo || 'Empréstimo sem contrato — fundo fixo de caixa',
      };
    }
    if (porContrato) {
      return {
        descricao,
        nature,
        contaContrapartida: porContrato,
        motivo: sug.motivo || 'Empréstimo por contrato',
      };
    }

    const amort = /AMORT|PARCELA\s+EMPREST|PAGTO?\s+EMPREST|PAGAMENTO\s+EMPREST|LIQUIDAC/.test(
      normalizeExtratoMatchText(descricao),
    );
    const grupo = grupoConta(conta);
    if (nature === 'D' && !amort) {
      // Concessão → ATIVO
      if (grupo === 'PASSIVO' || (!isEmprestimoConta(conta.name) && grupo !== 'ATIVO')) {
        const ativo = plano.find(
          (p) =>
            grupoConta(p) === 'ATIVO' &&
            isEmprestimoConta(p.name) &&
            (sanitizeCodigoReduzido(p.codigoReduzido) || sanitizeCodigoReduzido(p.code)),
        );
        const red =
          (ativo &&
            (sanitizeCodigoReduzido(ativo.codigoReduzido) || sanitizeCodigoReduzido(ativo.code))) ||
          '';
        if (!red) return null;
        contra = red;
        conta = byRed.get(contra)!;
      }
    } else if (nature === 'C' || amort) {
      // Liberação / pagamento → PASSIVO
      if (grupo === 'ATIVO' && !amort) {
        /* liberação não pode ser ativo */
        const passivo = plano.find(
          (p) =>
            grupoConta(p) === 'PASSIVO' &&
            isEmprestimoConta(p.name) &&
            (sanitizeCodigoReduzido(p.codigoReduzido) || sanitizeCodigoReduzido(p.code)),
        );
        const red =
          (passivo &&
            (sanitizeCodigoReduzido(passivo.codigoReduzido) ||
              sanitizeCodigoReduzido(passivo.code))) ||
          '';
        if (!red) return null;
        contra = red;
        conta = byRed.get(contra)!;
      }
    }
    return {
      descricao,
      nature,
      contaContrapartida: contra,
      motivo: sug.motivo,
    };
  }

  // ——— RENDIMENTO / APLICAÇÃO: nunca fornecedor nem cliente ———
  const histNorm = normalizeExtratoMatchText(descricao);
  if (isMovimentoAplicacaoFinanceira(histNorm, nature)) {
    const padrao = extractPadraoOperacionalAgrupado(descricao, nature);
    const aplicConta = pickContaRendimentoOuAplicacao(nature, plano);
    if (
      isContaGeralFornecedorOuCliente(conta.name) ||
      (isContaNominalEmpresa(conta.name) && !isContaOperacionalEspecial(conta.name))
    ) {
      if (!aplicConta) return null;
      return {
        descricao: padrao,
        nature,
        contaContrapartida: aplicConta,
        motivo: sug.motivo || 'Rendimento/aplicação — não fornecedor/cliente',
      };
    }
    if (aplicConta && !isContaOperacionalEspecial(conta.name)) {
      return {
        descricao: padrao,
        nature,
        contaContrapartida: aplicConta,
        motivo: sug.motivo || 'Rendimento/aplicação',
      };
    }
    return {
      descricao: padrao,
      nature,
      contaContrapartida: contra,
      motivo: sug.motivo,
    };
  }

  // ——— FORNECEDOR / CLIENTE GENÉRICO: conta geral obrigatória ———
  const generico = isLancamentoFornecedorOuClienteGenerico(descricao, nature, coligadas);
  const genericoHist = isLancamentoFornecedorOuClienteGenerico(historicoRef, nature, coligadas);
  const genericoPixTed = generico || genericoHist;
  const nominal = isContaNominalEmpresa(conta.name);

  if (genericoPixTed) {
    const padrao = extractPadraoOperacionalAgrupado(historicoRef, nature);
    if (!isContaGeralFornecedorOuCliente(conta.name)) {
      const geral = pickFallbackContaPorNatureza(nature, plano);
      if (!geral) return null;
      return {
        descricao: padrao,
        nature,
        contaContrapartida: geral,
        motivo: sug.motivo || 'Fornecedor/cliente genérico — conta geral (não específica)',
      };
    }
    return {
      descricao: padrao,
      nature,
      contaContrapartida: contra,
      motivo: sug.motivo || 'Fornecedor/cliente — conta geral',
    };
  }

  const sentidoOk = contaTemSentidoLogicoParaHistorico(historicoRef, conta.name, nature, conta);

  if (sentidoOk && !coligadaHit && !nominal) {
    if (
      isImpostoSemTipoIdentificavel(historicoRef) &&
      isContaImpostoOuTributo(conta.name) &&
      !/FUNDO\s+FIXO/.test(normalizeExtratoMatchText(conta.name))
    ) {
      const fundo = pickFundoFixoCaixaConta(plano);
      if (!fundo) return null;
      return {
        descricao: extractPadraoOperacionalAgrupado(historicoRef, nature),
        nature,
        contaContrapartida: fundo,
        motivo: sug.motivo || 'Imposto sem tipo identificável — fundo fixo de caixa',
      };
    }
    return {
      descricao: extractRegraEntityDescricao(historicoRef, nature, coligadas) || descricao,
      nature,
      contaContrapartida: contra,
      motivo: sug.motivo || 'Conta com match nome/sentido no plano',
    };
  }

  if (nominal) {
    // Conta operacional especial (tarifa etc.) no histórico → ok manter
    if (
      isContaOperacionalEspecial(conta.name) &&
      !isContaGeralFornecedorOuCliente(conta.name)
    ) {
      return {
        descricao,
        nature,
        contaContrapartida: contra,
        motivo: sug.motivo,
      };
    }

    const geral = pickFallbackContaPorNatureza(nature, plano);
    if (!geral) return null;
    descricao = extractPadraoOperacionalAgrupado(historicoRef, nature);
    if (!descricao) return null;
    return {
      descricao,
      nature,
      contaContrapartida: geral,
      motivo: sug.motivo || 'Conta nominal — redirecionado para conta geral',
    };
  }

  // Conta operacional / especial: exige coerência mínima nome × descrição
  if (isContaOperacionalEspecial(conta.name)) {
    const hist = normalizeExtratoMatchText(historicoRef);
    const nome = normalizeExtratoMatchText(conta.name);
    const nomeTokens = nome.split(/\s+/).filter((t) => t.length >= 4);
    const overlap = nomeTokens.some((t) => hist.includes(t) || t.includes(hist.slice(0, 8)));
    const scoreNome = scorePlanoContaParaHistorico(historicoRef, nature, conta);
    // Tarifa/imposto/folha: se a conta é do tipo certo, aceita mesmo sem overlap literal
    const tipoOk =
      (/TARIFA/.test(nome) && /TARIFA|CESTA|PACOTE/.test(hist)) ||
      (isContaImpostoOuTributo(conta.name) &&
        impostoContaCompativelComHistorico(historicoRef, conta.name)) ||
      (/FOLHA|SALARIO/.test(nome) && /FOLHA|SALARIO|FERIAS/.test(hist)) ||
      (/RENDIMENTO|RECEITA\s+FINANCEIRA|JUROS/.test(nome) &&
        isRendimentoOuAplicacaoHistorico(hist)) ||
      (/APLIC|CDB|RDB|INVEST/.test(nome) && isMovimentoAplicacaoFinanceira(hist, nature)) ||
      (/FUNDO\s+FIXO|CAIXA/.test(nome) && /FUNDO|CAIXA|FIXO/.test(hist)) ||
      overlap ||
      scoreNome >= 36;
    if (!tipoOk && nomeTokens.length > 0) {
      // Sem evidência — não grava chute
      return null;
    }
  }

  return {
    descricao,
    nature,
    contaContrapartida: contra,
    motivo: sug.motivo,
  };
}

/** Valida lote; descarta inválidas; deduplica por entidade (não por texto literal). */
export function validateAiRegrasLote(
  sugestoes: AiRegraSugestao[],
  plano: PlanoOptionLike[],
  coligadas: AiColigada[] = [],
  anexosTexto: string[] = [],
  extratoHistoricos: string[] = [],
  regrasHistoricas: ExtratoRegraConta[] = [],
): AiRegraValidada[] {
  const historicosLimpos = extratoHistoricos.map((h) =>
    sanitizarHistoricoExtratoParaRegra(h, 'D'),
  );
  const out: AiRegraValidada[] = [];
  const seen = new Set<string>();
  for (const sug of sugestoes) {
    const v = validateAiRegraSugestao(
      sug,
      plano,
      coligadas,
      anexosTexto,
      historicosLimpos,
      regrasHistoricas,
    );
    if (!v) continue;
    const entity = extractRegraEntityDescricao(v.descricao, v.nature, coligadas);
    const key = `${v.nature}|${normalizeExtratoMatchText(entity)}|${v.contaContrapartida}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const coligHit = matchColigadaParaRegra(v.descricao, coligadas, extratoHistoricos);
    out.push({ ...v, descricao: coligHit ? v.descricao : entity || v.descricao });
  }
  return out;
}
