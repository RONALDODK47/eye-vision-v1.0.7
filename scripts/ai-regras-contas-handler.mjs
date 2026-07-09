/**
 * IA sugere regras de contas (D/C + contrapartida) a partir de
 * plano + amostra do extrato + anexos (contrato, balancete, coligadas…).
 */
import {
  callGemini,
  callGeminiVision,
  isGeminiConfigured,
  parseGeminiJson,
  sanitizeGeminiModel,
  EXTRACT_MAX_OUTPUT_TOKENS,
  EXTRACT_REQUEST_TIMEOUT_MS,
} from './gemini-client.mjs';
import { loadAiConfig } from './ai-config-store.mjs';

const NOME_COMPLETO_CONTA = [
  'NOME COMPLETO DA CONTA (CRÍTICO — NÃO CONFUNDIR EMPRESAS PARECIDAS):',
  '- Leia o nome INTEIRO no histórico do extrato e no plano — não pare no prefixo comum.',
  '- Exemplo: "PIX RECEBIDO POLO S CLIMATIZACAO LTD" → conta de POLO SUL CLIMATIZAÇÃO.',
  '- NÃO use a conta de "POLO SUL REFRIGERAÇÃO" só porque ambas começam com "POLO SUL".',
  '- CLIMATIZAÇÃO ≠ REFRIGERAÇÃO ≠ outras razões sociais com o mesmo início.',
  '- Na descricao da regra, inclua o discriminador completo (ex.: "POLO SUL CLIMATIZACAO", não só "POLO SUL").',
  '- contaContrapartida = codigoReduzido da conta cujo NOME no plano melhor casa com o texto completo do extrato.',
  '- Se houver dúvida entre duas contas parecidas, prefira a que tem mais palavras em comum com o histórico.',
].join('\n');

const SYSTEM = [
  'Você é contador brasileiro especialista em conciliação bancária e plano de contas Domínio.',
  'Sua tarefa: sugerir REGRAS DE CONTAS para o extrato do banco indicado.',
  'Cada regra mapeia um trecho típico da DESCRIÇÃO do extrato → natureza D ou C → conta CONTRAPARTIDA.',
  '',
  'REGRA OBRIGATÓRIA — CÓDIGO REDUZIDO:',
  '- contaContrapartida DEVE ser o CÓDIGO REDUZIDO Domínio (1 a 7 dígitos, ex.: "85", "147", "0000147").',
  '- É PROIBIDO usar classificação hierárquica (ex.: "2.1.10.100.001", "1.1.10.200.001").',
  '- No plano enviado, o campo "codigoReduzido" é o único válido para contaContrapartida.',
  '- Se a conta não tiver codigoReduzido, NÃO sugira essa conta.',
  '',
  NOME_COMPLETO_CONTA,
  '',
  'EMPRESAS COLIGADAS (CRÍTICO — NÃO CONFUNDIR COM CLIENTE NEM FORNECEDOR):',
  '- Coligadas / controladas / do mesmo grupo NÃO são clientes nem fornecedores de terceiros.',
  '- Recebimento ou pagamento envolvendo coligada → conta de COLIGADA / PARTES RELACIONADAS / EMPRÉSTIMO ENTRE EMPRESAS / MÚTUO do plano.',
  '- É PROIBIDO usar conta cujo nome contenha FORNECEDOR / FORN / DUPLICATA para coligada.',
  '- É PROIBIDO usar conta de CLIENTE para coligada.',
  '- Aliases da mesma coligada devem ser tratados como UMA entidade. Exemplos equivalentes:',
  '  AJTF = A.J.T.F = A J T F = A. J. T. F = A.J.T.F. (ignore pontos e espaços entre letras).',
  '- Se o histórico citar qualquer forma da coligada (ex.: PIX AJTF, TED A.J.T.F, ONIX COMERCIO, IMPERIO, POLO SUL REFRIGERACAO quando for coligada),',
  '  a regra NÃO pode usar conta de cliente nem de fornecedor.',
  '- No motivo, diga explicitamente "coligada (não cliente/fornecedor)".',
  '',
  'Use:',
  '- Plano de contas (só códigos reduzidos reais — NUNCA invente).',
  '- Amostra de lançamentos do extrato (padrões de histórico).',
  '- Lista estruturada de coligadas + aliases (prioridade máxima).',
  '- Anexos / documentos de inteligência: contrato social, sócios, coligadas, empréstimos, balancete.',
  '- Mensagem do usuário com particularidades.',
  '',
  'Regras boas:',
  '- descricao = trecho estável do histórico COM o nome completo discriminador (ex.: POLO SUL CLIMATIZACAO).',
  '- Nunca use só o prefixo compartilhado se existirem contas parecidas no plano.',
  '- Inclua aliases da coligada como regras separadas se o extrato variar (AJTF e A J T F).',
  '- nature = D (saída/débito no banco) ou C (entrada/crédito no banco).',
  '- contaContrapartida = codigoReduzido EXATO do plano cujo nome casa com o texto completo.',
  '- motivo = 1 frase curta citando o nome completo usado.',
  '',
  'Responda SOMENTE JSON válido:',
  '{"resumo":"texto curto em PT-BR","regras":[{"descricao":"...","nature":"D"|"C","contaContrapartida":"85","motivo":"..."}]}',
  'Máximo 80 regras por lote. Se não houver evidência, regras=[].',
  'Se a mensagem do usuário pedir conta específica (ex.: fundo fixo), OBEDEÇA — use essa conta do plano.',
].join('\n');

const SYSTEM_CHAT = [
  'Você é contador brasileiro especialista em conciliação bancária e plano de contas Domínio.',
  'MODO CHAT — PEDIDO DO USUÁRIO TEM PRIORIDADE MÁXIMA.',
  'Atenda EXATAMENTE o que o usuário pediu (ex.: "Polo Sul Climatização no fundo fixo de caixa").',
  '',
  'REGRA OBRIGATÓRIA — CÓDIGO REDUZIDO:',
  '- contaContrapartida DEVE ser o CÓDIGO REDUZIDO Domínio (1 a 7 dígitos).',
  '- É PROIBIDO usar classificação hierárquica.',
  '',
  NOME_COMPLETO_CONTA,
  '',
  'INSTRUÇÕES DO CHAT:',
  '- Se o usuário citar um nome no extrato + uma conta destino, crie regras para TODOS os lançamentos do lote que casam com esse nome.',
  '- descricao = trecho estável COM nome completo (ex.: POLO SUL CLIMATIZACAO).',
  '- nature = D ou C conforme o lançamento do extrato.',
  '- contaContrapartida = codigoReduzido da conta pedida (fundo fixo, caixa, etc.) — busque no plano pelo NOME.',
  '- É PROIBIDO devolver regras=[] se houver lançamentos no lote que casam com o pedido e a conta existir no plano.',
  '- Trabalhe só no LOTE enviado (rápido). Não invente regras fora do pedido.',
  '',
  'Responda SOMENTE JSON:',
  '{"resumo":"...","regras":[{"descricao":"...","nature":"D"|"C","contaContrapartida":"85","motivo":"..."}]}',
  'Máximo 80 regras por lote.',
].join('\n');

const SYSTEM_CORRIGIR = [
  'Você é contador brasileiro especialista em conciliação bancária e plano de contas Domínio.',
  'MODO CORRIGIR REGRAS — DUAS TAREFAS OBRIGATÓRIAS:',
  '1) AUDITAR/CORRIGIR regras já cadastradas que NÃO batem com os DOCUMENTOS DE INTELIGÊNCIA.',
  '2) CRIAR regras para TODOS os lançamentos SEM regra (não conciliados).',
  '',
  'REGRA OBRIGATÓRIA — CÓDIGO REDUZIDO:',
  '- contaContrapartida DEVE ser o CÓDIGO REDUZIDO Domínio (1 a 7 dígitos).',
  '- É PROIBIDO usar classificação hierárquica (ex.: "2.1.10.100.001").',
  '',
  NOME_COMPLETO_CONTA,
  '',
  'TAREFA 1 — CORRIGIR REGRAS ERRADAS (conforme Inteligência IA):',
  '- Compare cada regra existente com contratos, balancetes, coligadas e outros docs.',
  '- Se a contaContrapartida estiver errada (ex.: cliente em vez de coligada; REFRIGERAÇÃO em vez de CLIMATIZAÇÃO),',
  '  devolva a MESMA descricao+nature com a contaContrapartida CORRETA do plano.',
  '- Se a descrição da regra for genérica demais e os docs/extrato pedem nome completo, devolva a versão corrigida.',
  '- Coligadas (AJTF / A.J.T.F / A J T F) NUNCA usam conta de CLIENTE.',
  '',
  'TAREFA 2 — COBERTURA DOS NÃO CONCILIADOS:',
  '- A lista "Lançamentos SEM regra" deve ser 100% coberta.',
  '- É PROIBIDO devolver regras=[] se houver descobertos OU se houver regra existente claramente errada.',
  '- Prefira padrões com nome completo — nunca só "POLO SUL" se houver várias.',
  '- Se vários lançamentos compartilham o mesmo padrão, uma regra basta.',
  '- Se não souber a conta exata, escolha no plano a conta cujo NOME mais casa com o texto completo.',
  '',
  'EMPRESAS COLIGADAS (CRÍTICO):',
  '- Coligadas NÃO são clientes NEM fornecedores. AJTF = A.J.T.F = A J T F = A. J. T. F.',
  '- Recebimento/pagamento de coligada → conta de coligada/partes relacionadas/mútuo (NUNCA CLIENTE, NUNCA FORNECEDOR).',
  '- Se a lista estruturada de coligadas citar ONIX, IMPERIO, POLO SUL REFRIGERACAO, ECONOMICA, A.J.T.F etc.,',
  '  trate TODAS como coligadas — não só AJTF.',
  '- Ao corrigir regra existente que aponta FORNECEDOR para uma coligada, TROQUE a conta imediatamente.',
  '',
  'Use documentos de inteligência, coligadas, plano e regras existentes.',
  'Responda SOMENTE JSON:',
  '{"resumo":"...","regras":[{"descricao":"...","nature":"D"|"C","contaContrapartida":"85","motivo":"..."}]}',
  'Máximo 80 regras por lote. Inclua CORREÇÕES de regras erradas + regras novas para descobertos.',
  'Processe só o lote enviado — respostas rápidas em lotes.',
].join('\n');

function normalizeNature(v) {
  const s = String(v ?? '')
    .trim()
    .toUpperCase();
  return s === 'C' || s === 'CREDITO' || s === 'CRÉDITO' ? 'C' : 'D';
}

function isClassificacao(val) {
  const v = String(val ?? '').trim();
  if (!v) return false;
  if (v.includes('.')) return /^\d+(\.\d+)+$/.test(v);
  const digits = v.replace(/\D/g, '');
  return digits.length >= 8;
}

function sanitizeReduzido(val) {
  const v = String(val ?? '').trim();
  if (!/^\d{1,7}$/.test(v)) return '';
  return v;
}

function resolveReduzidoFromPlano(raw, plano) {
  const input = String(raw ?? '').trim();
  if (!input) return '';
  const asRed = sanitizeReduzido(input);
  if (asRed) {
    const hit = plano.find((p) => sanitizeReduzido(p.codigoReduzido) === asRed);
    if (hit) return asRed;
    // Aceita reduzido mesmo se lista veio só com code=reduzido
    const hitCode = plano.find((p) => sanitizeReduzido(p.code) === asRed || sanitizeReduzido(p.codigoReduzido || p.code) === asRed);
    if (hitCode) return asRed;
  }
  const norm = (s) => s.replace(/[^\d]/g, '');
  const inputNorm = norm(input);
  const byClassif = plano.find((p) => {
    const code = String(p.code ?? '').trim();
    return code === input || norm(code) === inputNorm;
  });
  if (byClassif) return sanitizeReduzido(byClassif.codigoReduzido);
  if (isClassificacao(input)) return '';
  return asRed;
}

function sanitizeSuggestedRules(raw, plano) {
  const list = Array.isArray(raw) ? raw : [];
  const reduzidoSet = new Set(
    (plano ?? [])
      .map((p) => sanitizeReduzido(p.codigoReduzido) || sanitizeReduzido(p.code))
      .filter(Boolean),
  );
  const out = [];
  const seen = new Set();

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const descricao = String(item.descricao ?? item.description ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const rawConta = String(
      item.contaContrapartida ?? item.codigoReduzido ?? item.conta ?? item.code ?? '',
    ).trim();
    const contaContrapartida = resolveReduzidoFromPlano(rawConta, plano);
    if (!descricao || !contaContrapartida) continue;
    if (reduzidoSet.size > 0 && !reduzidoSet.has(contaContrapartida)) continue;
    const key = `${descricao}|${normalizeNature(item.nature)}|${contaContrapartida}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      descricao,
      nature: normalizeNature(item.nature),
      contaContrapartida,
      motivo: String(item.motivo ?? item.reason ?? '').trim().slice(0, 200),
    });
    if (out.length >= 80) break;
  }
  return out;
}

function buildUserPayload(body) {
  const plano = Array.isArray(body?.plano) ? body.plano : [];
  const extrato = Array.isArray(body?.extratoSample) ? body.extratoSample : [];
  const regrasExistentes = Array.isArray(body?.regrasExistentes) ? body.regrasExistentes : [];
  const anexosTexto = Array.isArray(body?.anexosTexto) ? body.anexosTexto : [];
  const coligadas = Array.isArray(body?.coligadas) ? body.coligadas : [];
  const uncovered = Array.isArray(body?.uncoveredExtrato) ? body.uncoveredExtrato : [];
  const mode = String(body?.mode ?? 'sugerir');

  // Envia só reduzido + nome (sem classificação) para a IA não confundir.
  const planoParaIa = plano
    .map((p) => ({
      codigoReduzido: sanitizeReduzido(p.codigoReduzido) || sanitizeReduzido(p.code) || '',
      name: p.name,
    }))
    .filter((p) => p.codigoReduzido);

  const coligadasParaIa = coligadas
    .map((c) => ({
      nome: String(c?.nome ?? '').trim(),
      aliases: Array.isArray(c?.aliases) ? c.aliases.map((a) => String(a).trim()).filter(Boolean) : [],
      contaReduzida: sanitizeReduzido(c?.contaReduzida) || undefined,
      tipo: 'COLIGADA_NAO_E_CLIENTE',
    }))
    .filter((c) => c.nome);

  const lines = [
    `Empresa: ${body?.company ?? ''}`,
    `Banco das regras (código reduzido): ${body?.contaBanco ?? ''} — ${body?.bancoNome ?? ''}`,
    `Modo: ${mode}`,
    '',
    '--- Mensagem do usuário ---',
    String(body?.message ?? '').trim() || '(sem texto — use só os anexos e o contexto)',
    '',
    '--- Empresas COLIGADAS (NÃO são clientes NEM fornecedores; aliases equivalentes) ---',
    coligadasParaIa.length
      ? JSON.stringify(coligadasParaIa.slice(0, 80))
      : '(nenhuma cadastrada — ainda assim, se o anexo citar coligada/AJTF/grupo, NÃO use conta de cliente nem fornecedor)',
    '',
    '--- Plano (SOMENTE código reduzido — NÃO use classificação) ---',
    JSON.stringify(planoParaIa.slice(0, 400)),
    '',
    '--- Amostra do extrato (descrição / natureza / valor) ---',
    JSON.stringify(extrato.slice(0, 120)),
    '',
    '--- Regras já cadastradas ---',
    JSON.stringify(regrasExistentes.slice(0, 80)),
  ];

  if (
    (mode === 'corrigir_cobertura' || regrasExistentes.length > 0) &&
    mode !== 'chat_pedido' &&
    mode !== 'implantar'
  ) {
    lines.push(
      '',
      '--- TAREFA 1: AUDITAR regras existentes vs documentos de inteligência ---',
      'Devolva correções (mesma descricao+nature, contaContrapartida certa) para regras que conflitem com os docs.',
      'Exemplos de erro: coligada classificada como cliente; nome parecido trocado; conta do plano errada.',
    );
  }

  if (mode === 'corrigir_cobertura' || mode === 'implantar' || mode === 'chat_pedido' || uncovered.length > 0) {
    lines.push(
      '',
      `--- LOTE: Lançamentos SEM regra (${uncovered.length}) — processar este lote ---`,
      JSON.stringify(uncovered.slice(0, 80)),
      '',
      mode === 'chat_pedido'
        ? 'OBRIGATÓRIO: atenda o PEDIDO DO USUÁRIO neste lote. Crie regras para os históricos que casam com o pedido.'
        : 'OBRIGATÓRIO: cada lançamento do lote precisa de regra nova. Uma regra por padrão distinto.',
      'Se faltar evidência de conta, use a conta do plano cujo NOME mais se aproxima do histórico completo (ou a conta citada no pedido).',
    );
  }

  if (anexosTexto.length) {
    lines.push(
      '',
      `--- Documentos de inteligência / anexos ---\n${anexosTexto.join('\n---\n').slice(0, 40_000)}`,
    );
  }

  lines.push(
    '',
    'Sugira/corrija regras. contaContrapartida = codigoReduzido (nunca classificação com pontos).',
    'Se houver coligada no histórico (AJTF / A.J.T.F / nomes da lista de coligadas), NÃO classifique como cliente NEM fornecedor.',
    'NOME COMPLETO: "POLO SUL CLIMATIZACAO" ≠ "POLO SUL REFRIGERACAO" — use a conta cujo nome casa com o texto inteiro do extrato.',
    'PROIBIDO: contaContrapartida de FORNECEDOR para qualquer empresa da lista de coligadas.',
  );

  return lines.filter(Boolean).join('\n');
}

/**
 * @param {Record<string, unknown>} body
 */
export async function handleAiSuggestRegrasContas(body) {
  if (!isGeminiConfigured()) {
    return {
      status: 503,
      body: {
        ok: false,
        reason: 'gemini_not_configured',
        detail: 'Configure a chave Gemini em Contábil → IA ou no .env',
        resumo: '',
        regras: [],
      },
    };
  }

  const config = loadAiConfig();
  const model = sanitizeGeminiModel(body?.model || config?.model || undefined);
  const images = Array.isArray(body?.images)
    ? body.images.filter((img) => img?.base64 && img?.mimeType).slice(0, 16)
    : [];
  const plano = Array.isArray(body?.plano) ? body.plano : [];
  const userContent = buildUserPayload(body);
  const mode = String(body?.mode ?? 'sugerir');
  const systemInstruction =
    mode === 'corrigir_cobertura' || mode === 'implantar'
      ? SYSTEM_CORRIGIR
      : mode === 'chat_pedido'
        ? SYSTEM_CHAT
        : SYSTEM;

  try {
    const out =
      images.length > 0
        ? await callGeminiVision({
            model,
            systemInstruction,
            userText: userContent,
            images,
            temperature: 0.1,
            jsonMode: true,
            maxOutputTokens: Math.min(EXTRACT_MAX_OUTPUT_TOKENS, 16_384),
            timeoutMs: EXTRACT_REQUEST_TIMEOUT_MS,
          })
        : await callGemini({
            model,
            systemInstruction,
            userContent,
            temperature: 0.1,
            jsonMode: true,
            maxOutputTokens: Math.min(EXTRACT_MAX_OUTPUT_TOKENS, 16_384),
            timeoutMs: EXTRACT_REQUEST_TIMEOUT_MS,
          });

    const parsed = parseGeminiJson(out.text) ?? {};
    const regras = sanitizeSuggestedRules(parsed.regras ?? parsed.rules, plano);
    const resumo =
      String(parsed.resumo ?? parsed.summary ?? '').trim() ||
      (regras.length
        ? `Sugeri ${regras.length} regra(s) com base no plano, extrato e anexos.`
        : 'Não encontrei regras novas com segurança. Envie mais particularidades ou um balancete/contrato.');

    return {
      status: 200,
      body: {
        ok: true,
        model: out.model,
        resumo,
        regras,
      },
    };
  } catch (err) {
    return {
      status: 200,
      body: {
        ok: false,
        reason: 'gemini_error',
        detail: err?.userHint ?? (err instanceof Error ? err.message : 'Falha na IA'),
        resumo: '',
        regras: [],
      },
    };
  }
}
