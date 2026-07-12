/**
 * Extração de extrato bancário via IA (visão + texto OCR).
 */
import { callGemini, callGeminiVision, isGeminiConfigured, parseGeminiJson, EXTRACT_MAX_OUTPUT_TOKENS, EXTRACT_REQUEST_TIMEOUT_MS } from './gemini-client.mjs';
import { getApiKeyForProvider, isProviderConfigured } from './ai-secrets-store.mjs';
import { findModelInCatalog, normalizeSelectedModel } from './ai-model-catalog.mjs';
import { loadAiConfig } from './ai-config-store.mjs';
import {
  buildExtratoAiExtractSystem,
  buildPlanoAiExtractSystem,
  detectBankHint,
  EXTRATO_AI_FILL_MISSING_SYSTEM,
  EXTRATO_AI_REPAIR_SYSTEM,
  EXTRATO_AI_REFINE_SYSTEM,
  PLANO_AI_REFINE_SYSTEM,
} from './ai-extract-prompts.mjs';
import {
  computeConciliacaoAi,
  escolherSaldoAnteriorAi,
  mergeAiExtratoRows,
  needsConciliacaoRepair,
  normalizeAiPlanoRows,
  normalizeAiRows,
  parseAiSaldoFields,
} from './ai-extract-utils.mjs';

async function callGeminiExtract({ model, systemInstruction, userParts, images, temperature = 0.05, responseSchema }) {
  const extractOpts = {
    model,
    systemInstruction,
    temperature,
    jsonMode: true,
    maxOutputTokens: EXTRACT_MAX_OUTPUT_TOKENS,
    timeoutMs: EXTRACT_REQUEST_TIMEOUT_MS,
    responseSchema,
  };
  if (images?.length > 0) {
    return callGeminiVision({
      ...extractOpts,
      userText: userParts,
      images: images.slice(0, 10),
    });
  }
  return callGemini({
    ...extractOpts,
    userContent: userParts,
  });
}

const PLANO_AI_JSON_REPAIR_SYSTEM = [
  'Você recebe uma resposta quase-JSON de extração de plano de contas brasileiro.',
  'Devolva SOMENTE JSON válido no formato:',
  '{"rows":[{"codigoReduzido":"","codigoClassificacao":"1.1.1.01","descricao":"CAIXA","tipo":"A","nivel":"4","_linhaOcr":"..."}]}',
  'Corrija aspas, vírgulas finais e feche arrays/objetos truncados. Preserve TODAS as contas reconhecíveis.',
].join('\n');

async function repairAiPlanoExtractJson({ model, brokenText, images }) {
  const out = await callGeminiExtract({
    model,
    systemInstruction: PLANO_AI_JSON_REPAIR_SYSTEM,
    userParts: String(brokenText ?? '').slice(0, 120_000),
    images: images?.length ? images.slice(0, 2) : [],
    temperature: 0,
  });
  return parseGeminiJson(out.text);
}

function buildPlanoExtractUserParts({ fileName, ocrText }) {
  return [
    fileName ? `Arquivo: ${fileName}` : '',
    ocrText?.trim()
      ? `\n--- Texto OCR (referência — confira cada código) ---\n${ocrText.trim().slice(0, 28_000)}`
      : '',
    '\nExtraia TODAS as contas do plano (sintéticas e analíticas).',
  ]
    .filter(Boolean)
    .join('\n');
}

async function extractPlanoWithGemini({ model, ocrText, images, fileName }) {
  if (!isGeminiConfigured()) {
    return { ok: false, reason: 'gemini_not_configured', detail: 'Configure a chave Gemini na aba IA ou no .env' };
  }

  const systemInstruction = buildPlanoAiExtractSystem();
  const userParts = buildPlanoExtractUserParts({ fileName, ocrText });

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      rows: {
        type: 'ARRAY',
        description: 'Lista completa de contas do plano de contas.',
        items: {
          type: 'OBJECT',
          properties: {
            codigoReduzido: { type: 'STRING', description: 'Código reduzido da conta' },
            codigoClassificacao: { type: 'STRING', description: 'Classificação estruturada (ex: 1.1.1.01.001)' },
            descricao: { type: 'STRING', description: 'Nome/descrição da conta contábil' },
            tipo: { type: 'STRING', description: 'Tipo da conta contábil', enum: ['S', 'A'] },
            nivel: { type: 'STRING', description: 'Nível da conta na hierarquia (ex: 1, 2, 3, 4, 5)' },
            _linhaOcr: { type: 'STRING', description: 'Texto bruto original correspondente' },
          },
          required: ['codigoClassificacao', 'descricao'],
        },
      },
    },
    required: ['rows'],
  };

  const out = await callGeminiExtract({
    model,
    systemInstruction,
    userParts,
    images,
    temperature: 0.05,
    responseSchema,
  });

  let parsed = parseGeminiJson(out.text);
  if (!parsed) {
    try {
      parsed = await repairAiPlanoExtractJson({ model: out.model, brokenText: out.text, images });
    } catch {
      /* segue para erro amigável */
    }
  }
  if (!parsed) {
    return {
      ok: false,
      reason: 'parse_error',
      detail: 'A IA respondeu em formato inválido — tente novamente ou use modo Híbrido.',
    };
  }

  const rows = normalizeAiPlanoRows(parsed?.rows ?? parsed?.contas ?? (Array.isArray(parsed) ? parsed : []));
  if (rows.length === 0) {
    return { ok: false, reason: 'empty_extraction', detail: 'A IA não retornou contas válidas.' };
  }

  return { ok: true, rows, provider: 'gemini', model: out.model };
}

async function extractPlanoWithGeminiPerPage({ model, ocrText, images, fileName }) {
  const pages = (images ?? []).slice(0, 12);
  if (pages.length === 0) {
    return extractPlanoWithGemini({ model, ocrText, images, fileName });
  }

  let mergedRows = [];
  let lastModel = model;

  for (let i = 0; i < pages.length; i++) {
    const pageLabel = `${fileName || 'plano'} — pág. ${i + 1}/${pages.length}`;
    const pageResult = await extractPlanoWithGemini({
      model,
      ocrText: '',
      images: [pages[i]],
      fileName: pageLabel,
    });
    if (!pageResult.ok) continue;
    lastModel = pageResult.model ?? model;
    if (pageResult.rows?.length) {
      mergedRows = mergedRows.concat(pageResult.rows);
    }
  }

  if (mergedRows.length === 0) {
    return { ok: false, reason: 'empty_extraction', detail: 'IA por página não retornou contas.' };
  }

  return { ok: true, rows: mergedRows, provider: 'gemini', model: lastModel };
}

async function extractPlanoWithOpenAI({ model, ocrText, images, fileName }) {
  const { key } = getApiKeyForProvider('openai');
  if (!key) {
    return { ok: false, reason: 'openai_not_configured', detail: 'Configure OPENAI_API_KEY na aba IA' };
  }

  const systemInstruction = buildPlanoAiExtractSystem();
  const content = [
    {
      type: 'text',
      text: [systemInstruction, buildPlanoExtractUserParts({ fileName, ocrText })].join('\n\n'),
    },
  ];

  for (const img of (images ?? []).slice(0, 3)) {
    if (img?.base64 && img?.mimeType) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: 'high' },
      });
    }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' },
      temperature: 0.05,
      max_tokens: 16_384,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, reason: 'openai_error', detail: err.slice(0, 300) };
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '{}';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'parse_error', detail: 'Resposta OpenAI não é JSON válido' };
  }

  const rows = normalizeAiPlanoRows(parsed?.rows ?? []);
  if (rows.length === 0) {
    return { ok: false, reason: 'empty_extraction', detail: 'A IA não retornou contas válidas.' };
  }

  return { ok: true, rows, provider: 'openai', model };
}

async function extractPlanoWithAnthropic({ model, ocrText, images, fileName }) {
  const { key } = getApiKeyForProvider('anthropic');
  if (!key) {
    return { ok: false, reason: 'anthropic_not_configured', detail: 'Configure ANTHROPIC_API_KEY na aba IA' };
  }

  const systemInstruction = buildPlanoAiExtractSystem();
  const content = [];
  for (const img of (images ?? []).slice(0, 3)) {
    if (img?.base64 && img?.mimeType?.startsWith('image/')) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
      });
    }
  }
  content.push({
    type: 'text',
    text: [systemInstruction, buildPlanoExtractUserParts({ fileName, ocrText })].join('\n\n'),
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 16_384,
      temperature: 0.05,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, reason: 'anthropic_error', detail: err.slice(0, 300) };
  }

  const data = await res.json();
  const text = data?.content?.find((c) => c.type === 'text')?.text ?? '{}';
  let parsed;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    return { ok: false, reason: 'parse_error', detail: 'Resposta Anthropic não é JSON válido' };
  }

  const rows = normalizeAiPlanoRows(parsed?.rows ?? []);
  if (rows.length === 0) {
    return { ok: false, reason: 'empty_extraction', detail: 'A IA não retornou contas válidas.' };
  }

  return { ok: true, rows, provider: 'anthropic', model };
}

/** @param {object} body */
export async function handleAiExtractPlano(body) {
  const config = loadAiConfig();
  const providerId = String(body?.providerId ?? config.providerId ?? 'gemini').trim();
  const model = normalizeSelectedModel(providerId, body?.model ?? config.model);
  const modelEntry = findModelInCatalog(model);

  if (!isProviderConfigured(providerId)) {
    return {
      status: 503,
      body: {
        ok: false,
        reason: `${providerId}_not_configured`,
        detail: `Configure a chave API de ${providerId} na aba IA do Contábil`,
      },
    };
  }

  if (modelEntry && !modelEntry.supportsExtract && (body?.images?.length ?? 0) > 0) {
    return {
      status: 400,
      body: {
        ok: false,
        reason: 'model_no_vision',
        detail: `${modelEntry.label} não suporta extração visual — escolha um modelo com visão`,
      },
    };
  }

  const payload = {
    model,
    ocrText: String(body?.ocrText ?? ''),
    images: Array.isArray(body?.images) ? body.images : [],
    fileName: String(body?.fileName ?? '').trim(),
    perPage: body?.perPage === true,
  };

  try {
    let result;
    switch (providerId) {
      case 'openai':
        result = await extractPlanoWithOpenAI(payload);
        break;
      case 'anthropic':
        result = await extractPlanoWithAnthropic(payload);
        break;
      case 'gemini':
      default:
        result =
          payload.perPage && payload.images.length > 4
            ? await extractPlanoWithGeminiPerPage(payload)
            : await extractPlanoWithGemini(payload);
        break;
    }

    if (!result.ok) {
      return { status: 503, body: result };
    }

    if (!result.rows?.length) {
      const hasInput =
        payload.images.length > 0 || String(payload.ocrText ?? '').trim().length > 20;
      return {
        status: 422,
        body: {
          ok: false,
          reason: 'empty_extraction',
          detail: hasInput
            ? `A IA processou o documento mas não retornou contas válidas (modelo ${result.model ?? model}). Tente modo Híbrido.`
            : 'Sem imagem nem texto OCR para enviar à IA — aguarde a página carregar e tente de novo.',
          provider: result.provider,
          model: result.model,
        },
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        rows: result.rows,
        model: result.model,
        provider: result.provider,
        rowCount: result.rows.length,
        detail: `${result.rows.length} conta(s) extraída(s).`,
      },
    };
  } catch (err) {
    return {
      status: 503,
      body: {
        ok: false,
        reason: 'extract_error',
        detail: err?.userHint ?? err?.message ?? String(err),
      },
    };
  }
}

const EXTRATO_AI_JSON_REPAIR_SYSTEM = [
  'Você recebe uma resposta quase-JSON de extração de extrato bancário brasileiro.',
  'Devolva SOMENTE JSON válido no formato:',
  '{"rows":[{"data":"DD/MM/AAAA","descricao":"...","valorCredito":"","valorDebito":"","valorMisto":"","_linhaOcr":"..."}],"saldoAnterior":0,"saldoFinal":0}',
  'Corrija aspas, vírgulas finais e feche arrays/objetos truncados. Preserve TODOS os lançamentos reconhecíveis.',
].join('\n');

async function repairAiExtractJson({ model, brokenText, images }) {
  const out = await callGeminiExtract({
    model,
    systemInstruction: EXTRATO_AI_JSON_REPAIR_SYSTEM,
    userParts: String(brokenText ?? '').slice(0, 120_000),
    images: images?.length ? images.slice(0, 2) : [],
    temperature: 0,
  });
  return parseGeminiJson(out.text);
}

function buildExtractUserParts({ statementYear, fileName, ocrText, bankHint }) {
  return [
    `Ano de referência: ${statementYear || new Date().getFullYear()}`,
    fileName ? `Arquivo: ${fileName}` : '',
    bankHint ? `Banco detectado: ${bankHint.toUpperCase()}` : '',
    ocrText?.trim() ? `\n--- Texto OCR Tesseract (referência — confira cada valor) ---\n${ocrText.trim().slice(0, 28_000)}` : '',
    '\nExtraia TODOS os lançamentos operacionais. Valide o saldo antes de responder.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function extractMissingRowsGemini({
  model,
  existingRows,
  saldoAnterior,
  saldoFinal,
  delta,
  ocrText,
  images,
  fileName,
  bankHint,
}) {
  const userParts = [
    `Arquivo: ${fileName || 'extrato'}`,
    bankHint ? `Banco: ${bankHint}` : '',
    `Saldo anterior: ${saldoAnterior ?? '?'}`,
    `Saldo final PDF: ${saldoFinal ?? '?'}`,
    `Divergência atual: R$ ${delta?.toFixed(2) ?? '?'}`,
    `Lançamentos já extraídos (${existingRows.length}):`,
    JSON.stringify(existingRows.slice(0, 80), null, 0).slice(0, 10000),
    ocrText?.trim() ? `\nOCR Tesseract:\n${ocrText.trim().slice(0, 12000)}` : '',
    '\nExtraia SOMENTE os lançamentos faltantes para fechar o saldo.',
  ].join('\n');

  const out = await callGeminiExtract({
    model,
    systemInstruction: EXTRATO_AI_FILL_MISSING_SYSTEM,
    userParts,
    images,
    temperature: 0.05,
  });

  const parsed = parseGeminiJson(out.text);
  return normalizeAiRows(parsed?.rows ?? [], {
    statementYear: new Date().getFullYear(),
    bankHint,
  });
}

async function repairExtractionGemini({
  model,
  rows,
  saldoAnterior,
  saldoFinal,
  conciliacao,
  ocrText,
  images,
  fileName,
  bankHint,
  statementYear,
}) {
  const userParts = [
    `Arquivo: ${fileName || 'extrato'}`,
    bankHint ? `Banco: ${bankHint}` : '',
    `Saldo anterior esperado: ${saldoAnterior ?? '?'}`,
    `Saldo final esperado: ${saldoFinal ?? '?'}`,
    `Saldo conciliado atual: ${conciliacao?.saldoConciliado ?? '?'}`,
    `Divergência: R$ ${conciliacao?.delta?.toFixed(2) ?? '?'}`,
    `Créditos extraídos: R$ ${conciliacao?.creditos?.toFixed(2) ?? '?'}`,
    `Débitos extraídos: R$ ${conciliacao?.debitos?.toFixed(2) ?? '?'}`,
    `\nLançamentos atuais (${rows.length}):`,
    JSON.stringify(rows.slice(0, 100), null, 0).slice(0, 12000),
    ocrText?.trim() ? `\nOCR Tesseract:\n${ocrText.trim().slice(0, 12000)}` : '',
    '\nDevolva a lista COMPLETA corrigida com saldo fechando (±R$ 0,10).',
  ].join('\n');

  const out = await callGeminiExtract({
    model,
    systemInstruction: EXTRATO_AI_REPAIR_SYSTEM,
    userParts,
    images,
    temperature: 0.05,
  });

  const parsed = parseGeminiJson(out.text);
  if (!parsed) return null;

  const repaired = normalizeAiRows(parsed?.rows ?? [], { statementYear, bankHint });
  if (repaired.length === 0) return null;

  const saldos = parseAiSaldoFields(parsed);
  return {
    rows: repaired,
    saldoAnterior: saldos.saldoAnterior ?? saldoAnterior,
    saldoFinal: saldos.saldoFinal ?? saldoFinal,
  };
}

async function finalizeAiExtratoResult({
  model,
  rows,
  saldoAnterior,
  saldoFinal,
  ocrText,
  images,
  fileName,
  bankHint,
  statementYear,
  provider,
}) {
  let outRows = rows;
  let sa = escolherSaldoAnteriorAi(rows, saldoAnterior, saldoFinal, ocrText);
  let sf = saldoFinal;
  let conciliacao = computeConciliacaoAi(outRows, sa, sf);

  const skipSlowRepair = outRows.length >= 5;

  if (!skipSlowRepair && needsConciliacaoRepair(conciliacao) && sf != null && isGeminiConfigured()) {
    try {
      const extra = await extractMissingRowsGemini({
        model,
        existingRows: outRows,
        saldoAnterior: sa,
        saldoFinal: sf,
        delta: conciliacao.delta,
        ocrText,
        images,
        fileName,
        bankHint,
      });
      if (extra.length > 0) {
        outRows = mergeAiExtratoRows(outRows, extra);
        conciliacao = computeConciliacaoAi(outRows, sa, sf);
      }
    } catch {
      /* mantém parcial */
    }
  }

  if (!skipSlowRepair && needsConciliacaoRepair(conciliacao) && sf != null && isGeminiConfigured()) {
    try {
      const repaired = await repairExtractionGemini({
        model,
        rows: outRows,
        saldoAnterior: sa,
        saldoFinal: sf,
        conciliacao,
        ocrText,
        images,
        fileName,
        bankHint,
        statementYear,
      });
      if (repaired?.rows?.length) {
        outRows = repaired.rows;
        if (repaired.saldoAnterior != null) sa = repaired.saldoAnterior;
        if (repaired.saldoFinal != null) sf = repaired.saldoFinal;
        conciliacao = computeConciliacaoAi(outRows, sa, sf);
      }
    } catch {
      /* mantém parcial */
    }
  }

  return {
    ok: true,
    rows: outRows,
    saldoAnterior: sa,
    saldoFinal: sf,
    conciliacao,
    provider,
    model,
  };
}

async function extractWithGeminiPerPage({ model, ocrText, images, statementYear, fileName, bankHint: bankHintIn }) {
  if (!isGeminiConfigured()) {
    return { ok: false, reason: 'gemini_not_configured', detail: 'Configure a chave Gemini na aba IA ou no .env' };
  }
  const bankHint = bankHintIn ?? detectBankHint(fileName, ocrText);
  const pages = (images ?? []).slice(0, 12);
  if (pages.length === 0) {
    return extractWithGemini({ model, ocrText, images, statementYear, fileName, bankHint });
  }

  let mergedRows = [];
  let saldoAnterior;
  let saldoFinal;
  let lastModel = model;
  const ocrChunks = String(ocrText ?? '')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (let i = 0; i < pages.length; i++) {
    const pageLabel = `${fileName || 'extrato'} — pág. ${i + 1}/${pages.length}`;
    const pageOcr = ocrChunks[i] ?? (pages.length === 1 ? ocrText : '');
    const pageResult = await extractWithGemini({
      model,
      ocrText: pageOcr,
      images: [pages[i]],
      statementYear,
      fileName: pageLabel,
      bankHint,
    });
    if (!pageResult.ok) continue;
    lastModel = pageResult.model ?? model;
    if (pageResult.rows?.length) {
      mergedRows = mergeAiExtratoRows(mergedRows, pageResult.rows);
    }
    if (pageResult.saldoAnterior != null && saldoAnterior == null) {
      saldoAnterior = pageResult.saldoAnterior;
    }
    if (pageResult.saldoFinal != null) {
      saldoFinal = pageResult.saldoFinal;
    }
  }

  if (mergedRows.length === 0) {
    return { ok: false, reason: 'empty_extraction', detail: 'IA por página não retornou lançamentos.' };
  }

  return finalizeAiExtratoResult({
    model: lastModel,
    rows: mergedRows,
    saldoAnterior,
    saldoFinal,
    ocrText,
    images: pages,
    fileName,
    bankHint,
    statementYear,
    provider: 'gemini',
  });
}

async function extractWithGemini({ model, ocrText, images, statementYear, fileName, bankHint: bankHintIn }) {
  if (!isGeminiConfigured()) {
    return { ok: false, reason: 'gemini_not_configured', detail: 'Configure a chave Gemini na aba IA ou no .env' };
  }

  const bankHint = bankHintIn ?? detectBankHint(fileName, ocrText);
  const systemInstruction = buildExtratoAiExtractSystem(bankHint);
  const userParts = buildExtractUserParts({ statementYear, fileName, ocrText, bankHint });

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      rows: {
        type: 'ARRAY',
        description: 'Lista completa de lançamentos operacionais de forma exaustiva.',
        items: {
          type: 'OBJECT',
          properties: {
            data: { type: 'STRING', description: 'Data (DD/MM/AAAA ou DD/MM)' },
            descricao: { type: 'STRING', description: 'Histórico/descrição limpa do lançamento' },
            valorCredito: { type: 'STRING', description: 'Valor de crédito/entrada (ex: 123,45 ou vazio)' },
            valorDebito: { type: 'STRING', description: 'Valor de débito/saída (ex: 123,45 ou vazio)' },
            valorMisto: { type: 'STRING', description: 'Valor em coluna única com sufixo C/D ou sinal' },
            _linhaOcr: { type: 'STRING', description: 'Texto bruto original correspondente' },
          },
          required: ['data', 'descricao'],
        },
      },
      saldoAnterior: { type: 'NUMBER', description: 'Saldo anterior do período' },
      saldoFinal: { type: 'NUMBER', description: 'Saldo final do período' },
    },
    required: ['rows'],
  };

  const out = await callGeminiExtract({
    model,
    systemInstruction,
    userParts,
    images,
    temperature: 0.05,
    responseSchema,
  });

  let parsed = parseGeminiJson(out.text);
  if (!parsed) {
    try {
      parsed = await repairAiExtractJson({ model: out.model, brokenText: out.text, images });
    } catch {
      /* segue para erro amigável */
    }
  }
  if (!parsed) {
    return {
      ok: false,
      reason: 'parse_error',
      detail: 'A IA respondeu em formato inválido mesmo após reparo automático — tente novamente, aumente a resolução do PDF ou use modo Híbrido.',
    };
  }

  const rows = normalizeAiRows(parsed?.rows ?? parsed?.lancamentos ?? (Array.isArray(parsed) ? parsed : []), {
    statementYear,
    bankHint,
  });
  const { saldoAnterior, saldoFinal } = parseAiSaldoFields(parsed);

  const finalized = await finalizeAiExtratoResult({
    model: out.model,
    rows,
    saldoAnterior,
    saldoFinal,
    ocrText,
    images,
    fileName,
    bankHint,
    statementYear,
    provider: 'gemini',
  });

  return { ...finalized, model: out.model };
}

async function extractWithOpenAI({ model, ocrText, images, statementYear, fileName }) {
  const { key } = getApiKeyForProvider('openai');
  if (!key) {
    return { ok: false, reason: 'openai_not_configured', detail: 'Configure OPENAI_API_KEY na aba IA' };
  }

  const bankHint = detectBankHint(fileName, ocrText);
  const systemInstruction = buildExtratoAiExtractSystem(bankHint);

  const content = [
    {
      type: 'text',
      text: [
        systemInstruction,
        buildExtractUserParts({ statementYear, fileName, ocrText, bankHint }),
      ].join('\n\n'),
    },
  ];

  for (const img of (images ?? []).slice(0, 3)) {
    if (img?.base64 && img?.mimeType) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: 'high' },
      });
    }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' },
      temperature: 0.05,
      max_tokens: 16_384,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, reason: 'openai_error', detail: err.slice(0, 300) };
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '{}';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'parse_error', detail: 'Resposta OpenAI não é JSON válido' };
  }

  const rows = normalizeAiRows(parsed?.rows ?? [], { statementYear, bankHint });
  const { saldoAnterior, saldoFinal } = parseAiSaldoFields(parsed);

  return finalizeAiExtratoResult({
    model,
    rows,
    saldoAnterior,
    saldoFinal,
    ocrText,
    images,
    fileName,
    bankHint,
    statementYear,
    provider: 'openai',
  });
}

async function extractWithAnthropic({ model, ocrText, images, statementYear, fileName }) {
  const { key } = getApiKeyForProvider('anthropic');
  if (!key) {
    return { ok: false, reason: 'anthropic_not_configured', detail: 'Configure ANTHROPIC_API_KEY na aba IA' };
  }

  const bankHint = detectBankHint(fileName, ocrText);
  const systemInstruction = buildExtratoAiExtractSystem(bankHint);

  const content = [];
  for (const img of (images ?? []).slice(0, 3)) {
    if (img?.base64 && img?.mimeType?.startsWith('image/')) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
      });
    }
  }
  content.push({
    type: 'text',
    text: [systemInstruction, buildExtractUserParts({ statementYear, fileName, ocrText, bankHint })].join('\n\n'),
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 16_384,
      temperature: 0.05,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, reason: 'anthropic_error', detail: err.slice(0, 300) };
  }

  const data = await res.json();
  const text = data?.content?.find((c) => c.type === 'text')?.text ?? '{}';
  let parsed;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    return { ok: false, reason: 'parse_error', detail: 'Resposta Anthropic não é JSON válido' };
  }

  const rows = normalizeAiRows(parsed?.rows ?? [], { statementYear, bankHint });
  const { saldoAnterior, saldoFinal } = parseAiSaldoFields(parsed);

  return finalizeAiExtratoResult({
    model,
    rows,
    saldoAnterior,
    saldoFinal,
    ocrText,
    images,
    fileName,
    bankHint,
    statementYear,
    provider: 'anthropic',
  });
}

/** @param {object} body */
export async function handleAiExtractExtrato(body) {
  const config = loadAiConfig();
  const providerId = String(body?.providerId ?? config.providerId ?? 'gemini').trim();
  const model = normalizeSelectedModel(providerId, body?.model ?? config.model);
  const modelEntry = findModelInCatalog(model);

  if (!isProviderConfigured(providerId)) {
    return {
      status: 503,
      body: {
        ok: false,
        reason: `${providerId}_not_configured`,
        detail: `Configure a chave API de ${providerId} na aba IA do Contábil`,
      },
    };
  }

  if (modelEntry && !modelEntry.supportsExtract && (body?.images?.length ?? 0) > 0) {
    return {
      status: 400,
      body: {
        ok: false,
        reason: 'model_no_vision',
        detail: `${modelEntry.label} não suporta extração visual — escolha um modelo com visão`,
      },
    };
  }

  const payload = {
    model,
    ocrText: String(body?.ocrText ?? ''),
    images: Array.isArray(body?.images) ? body.images : [],
    statementYear: String(body?.statementYear ?? new Date().getFullYear()),
    fileName: String(body?.fileName ?? '').trim(),
    perPage: body?.perPage === true,
    bankHint: body?.bankHint ? String(body.bankHint).trim() : undefined,
  };

  const resolvedBankHint = payload.bankHint || detectBankHint(payload.fileName, payload.ocrText);

  try {
    let result;
    switch (providerId) {
      case 'openai':
        result = await extractWithOpenAI(payload);
        break;
      case 'anthropic':
        result = await extractWithAnthropic(payload);
        break;
      case 'gemini':
      default:
        result =
          payload.perPage && payload.images.length >= 2
            ? await extractWithGeminiPerPage({ ...payload, bankHint: resolvedBankHint })
            : await extractWithGemini({ ...payload, bankHint: resolvedBankHint });
        break;
    }

    if (!result.ok) {
      return { status: 503, body: result };
    }

    if (!result.rows?.length) {
      const hasInput =
        payload.images.length > 0 || String(payload.ocrText ?? '').trim().length > 20;
      return {
        status: 422,
        body: {
          ok: false,
          reason: 'empty_extraction',
          detail: hasInput
            ? `A IA processou o documento mas não retornou lançamentos válidos (modelo ${result.model ?? model}). Tente modo Híbrido ou Tesseract.`
            : 'Sem imagem nem texto OCR para enviar à IA — aguarde a página carregar e tente de novo.',
          provider: result.provider,
          model: result.model,
        },
      };
    }

    const concMsg =
      result.conciliacao?.ok === false && result.conciliacao?.delta != null
        ? ` Atenção: saldo diverge R$ ${result.conciliacao.delta.toFixed(2)} do PDF.`
        : result.conciliacao?.ok
          ? ' Saldo conciliado com o PDF.'
          : '';

    return {
      status: 200,
      body: {
        ok: true,
        rows: result.rows,
        saldoAnterior: result.saldoAnterior,
        saldoFinal: result.saldoFinal ?? null,
        conciliacao: result.conciliacao ?? null,
        model: result.model,
        provider: result.provider,
        rowCount: result.rows.length,
        detail: `${result.rows.length} lançamento(s) extraído(s).${concMsg}`,
      },
    };
  } catch (err) {
    return {
      status: 503,
      body: {
        ok: false,
        reason: 'extract_error',
        detail: err?.userHint ?? err?.message ?? String(err),
      },
    };
  }
}

function buildRefineUserPayload({ bankHint, ocrText, lines }) {
  return JSON.stringify({
    banco: bankHint,
    ocrText: String(ocrText ?? '').slice(0, 14000),
    lines: (lines ?? []).slice(0, 120),
  });
}

async function refineOcrRowsWithGemini({ model, ocrText, lines, bankHint, refineSystem }) {
  const out = await callGemini({
    model,
    jsonMode: true,
    temperature: 0.05,
    systemInstruction: refineSystem,
    userContent: buildRefineUserPayload({ bankHint, ocrText, lines }),
  });
  const parsed = parseGeminiJson(out.text);
  return { parsed, model: out.model, provider: 'gemini' };
}

async function refineOcrRowsWithOpenAI({ model, ocrText, lines, bankHint, refineSystem }) {
  const { key } = getApiKeyForProvider('openai');
  if (!key) {
    return { ok: false, reason: 'openai_not_configured' };
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: refineSystem },
        { role: 'user', content: buildRefineUserPayload({ bankHint, ocrText, lines }) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.05,
      max_tokens: 16_384,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, reason: 'openai_error', detail: err.slice(0, 300) };
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '{}';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'parse_error', detail: 'Resposta OpenAI não é JSON válido' };
  }
  return { parsed, model, provider: 'openai' };
}

async function refineOcrRowsWithAnthropic({ model, ocrText, lines, bankHint, refineSystem }) {
  const { key } = getApiKeyForProvider('anthropic');
  if (!key) {
    return { ok: false, reason: 'anthropic_not_configured' };
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 16_384,
      temperature: 0.05,
      system: refineSystem,
      messages: [
        {
          role: 'user',
          content: buildRefineUserPayload({ bankHint, ocrText, lines }),
        },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, reason: 'anthropic_error', detail: err.slice(0, 300) };
  }
  const data = await res.json();
  const text = data?.content?.find((c) => c.type === 'text')?.text ?? '{}';
  let parsed;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    return { ok: false, reason: 'parse_error', detail: 'Resposta Anthropic não é JSON válido' };
  }
  return { parsed, model, provider: 'anthropic' };
}

/** Refino híbrido: corrige linhas Tesseract existentes. */
export async function handleAiRefineOcrRows(body) {
  const config = loadAiConfig();
  const providerId = String(body?.providerId ?? config.providerId ?? 'gemini').trim();
  const model = normalizeSelectedModel(providerId, body?.model ?? config.model);
  const lines = Array.isArray(body?.lines) ? body.lines : [];
  const ocrText = String(body?.ocrText ?? '');
  const documentType = String(body?.documentType ?? 'extrato');
  const isPlano = documentType === 'plano';
  const refineSystem = isPlano ? PLANO_AI_REFINE_SYSTEM : EXTRATO_AI_REFINE_SYSTEM;

  if (!isProviderConfigured(providerId)) {
    return {
      status: 503,
      body: { ok: false, skipped: true, reason: 'not_configured', lines },
    };
  }

  try {
    const bankHint = isPlano ? null : detectBankHint('', ocrText);
    let refineOut;
    switch (providerId) {
      case 'openai':
        refineOut = await refineOcrRowsWithOpenAI({ model, ocrText, lines, bankHint, refineSystem });
        break;
      case 'anthropic':
        refineOut = await refineOcrRowsWithAnthropic({ model, ocrText, lines, bankHint, refineSystem });
        break;
      case 'gemini':
      default:
        refineOut = await refineOcrRowsWithGemini({ model, ocrText, lines, bankHint, refineSystem });
        break;
    }

    if (refineOut?.ok === false) {
      return {
        status: 200,
        body: {
          ok: false,
          skipped: true,
          reason: refineOut.reason ?? 'refine_error',
          detail: refineOut.detail,
          lines,
        },
      };
    }

    const parsed = refineOut.parsed ?? {};
    const rows = isPlano
      ? normalizeAiPlanoRows(parsed?.rows ?? lines)
      : normalizeAiRows(parsed?.rows ?? lines, { bankHint });
    if (isPlano) {
      return {
        status: 200,
        body: {
          ok: true,
          rows: rows.length > 0 ? rows : lines,
          model: refineOut.model,
          provider: refineOut.provider,
        },
      };
    }
    const conciliacao = computeConciliacaoAi(
      rows,
      parseAiSaldoFields(parsed).saldoAnterior,
      parseAiSaldoFields(parsed).saldoFinal,
    );
    return {
      status: 200,
      body: {
        ok: true,
        rows: rows.length > 0 ? rows : lines,
        model: refineOut.model,
        provider: refineOut.provider,
        conciliacao,
      },
    };
  } catch (err) {
    return {
      status: 200,
      body: { ok: false, skipped: true, reason: 'refine_error', detail: err?.message, lines },
    };
  }
}

const COLIGADAS_AI_EXTRACT_SYSTEM = [
  'Você extrai nomes de empresas COLIGADAS / partes relacionadas de documentos contábeis brasileiros.',
  'Leia o texto e/ou imagem e devolva SOMENTE JSON válido:',
  '{"coligadas":[{"nome":"RAZAO SOCIAL LTDA","aliases":["SIGLA","NOME CURTO"]}]}',
  'Regras:',
  '- nome = razão social ou nome principal da empresa coligada.',
  '- aliases = siglas, nomes curtos e variações (A.J.T.F, AJTF, etc.).',
  '- NÃO devolva nome de arquivo, extensão (.png/.pdf), marcador de página (PDFPAG, PAG 2),',
  '  rótulos genéricos ("empresas coligadas", "imagem anexada") nem cabeçalhos de planilha.',
  '- Se não houver empresa identificável, devolva {"coligadas":[]}.',
  'Máximo 40 coligadas.',
].join('\n');

function normalizeColigadasExtractRows(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const nome = String(item?.nome ?? '').trim();
    if (!nome || nome.length < 3 || nome.length > 90) continue;
    const upper = nome.toUpperCase();
    if (/^(IMAGEM|ARQUIVO)\s+ANEXAD|PDFPAG\d+|^PAG(INA)?\s*\d+$/i.test(upper)) continue;
    if (/\.(PNG|JPE?G|PDF|WEBP|GIF|BMP)$/i.test(nome)) continue;
    const key = upper.replace(/[^A-Z0-9]/g, '');
    if (!key || key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    const aliases = Array.isArray(item?.aliases)
      ? item.aliases.map((a) => String(a ?? '').trim()).filter(Boolean).slice(0, 12)
      : [];
    out.push({ nome, aliases: aliases.length ? aliases : [nome] });
    if (out.length >= 40) break;
  }
  return out;
}

async function extractColigadasWithGemini({ model, ocrText, images, fileName }) {
  if (!isGeminiConfigured()) {
    return { ok: false, reason: 'gemini_not_configured' };
  }
  const userParts = [
    fileName ? `Arquivo: ${fileName}` : '',
    ocrText?.trim() ? `\n--- Texto do documento ---\n${ocrText.trim().slice(0, 24_000)}` : '',
    '\nExtraia todas as empresas coligadas / partes relacionadas visíveis.',
  ]
    .filter(Boolean)
    .join('\n');
  const out = await callGeminiExtract({
    model,
    systemInstruction: COLIGADAS_AI_EXTRACT_SYSTEM,
    userParts,
    images: images?.length ? images.slice(0, 6) : [],
    temperature: 0.05,
  });
  const parsed = parseGeminiJson(out.text);
  const coligadas = normalizeColigadasExtractRows(parsed?.coligadas ?? []);
  if (!coligadas.length) {
    return { ok: false, reason: 'empty_extraction', detail: 'Nenhuma coligada identificada no documento.' };
  }
  return { ok: true, coligadas, provider: 'gemini', model: out.model ?? model };
}

/** @param {object} body */
export async function handleAiExtractColigadas(body) {
  const config = loadAiConfig();
  const providerId = String(body?.providerId ?? config.providerId ?? 'gemini').trim();
  const model = normalizeSelectedModel(providerId, body?.model ?? config.model);
  const images = Array.isArray(body?.images) ? body.images : [];
  const ocrText = String(body?.ocrText ?? body?.text ?? '');
  const fileName = String(body?.fileName ?? '').trim();

  if (!isProviderConfigured(providerId)) {
    return {
      status: 503,
      body: {
        ok: false,
        reason: `${providerId}_not_configured`,
        detail: `Configure a chave API de ${providerId} na aba IA do Contábil`,
      },
    };
  }

  if (!images.length && ocrText.trim().length < 20) {
    return {
      status: 422,
      body: {
        ok: false,
        reason: 'no_input',
        detail: 'Envie imagem ou texto do documento de coligadas.',
      },
    };
  }

  try {
    let result;
    if (providerId === 'gemini' || providerId === '') {
      result = await extractColigadasWithGemini({ model, ocrText, images, fileName });
    } else {
      result = await extractColigadasWithGemini({ model, ocrText, images, fileName });
    }
    if (!result.ok) {
      return { status: result.reason === 'empty_extraction' ? 422 : 503, body: result };
    }
    return {
      status: 200,
      body: {
        ok: true,
        coligadas: result.coligadas,
        model: result.model,
        provider: result.provider,
        detail: `${result.coligadas.length} coligada(s) extraída(s).`,
      },
    };
  } catch (err) {
    return {
      status: 503,
      body: {
        ok: false,
        reason: 'extract_error',
        detail: err?.userHint ?? err?.message ?? String(err),
      },
    };
  }
}

const SOCIOS_AI_EXTRACT_SYSTEM = [
  'Você extrai nomes de SÓCIOS / administradores / quotistas de contratos sociais brasileiros.',
  'Leia o texto e/ou imagem e devolva SOMENTE JSON válido:',
  '{"coligadas":[{"nome":"NOME COMPLETO DO SOCIO","aliases":["APELIDO","VARIACAO"]}]}',
  'Regras:',
  '- nome = nome completo da pessoa física (sócio, administrador, quotista).',
  '- aliases = variações curtas do nome quando visíveis.',
  '- NÃO devolva nome de arquivo, extensão, marcador de página nem rótulos genéricos.',
  '- NÃO devolva razão social da empresa — apenas pessoas físicas.',
  '- Se não houver sócio identificável, devolva {"coligadas":[]}.',
  'Máximo 20 sócios.',
].join('\n');

async function extractSociosWithGemini({ model, ocrText, images, fileName }) {
  if (!isGeminiConfigured()) {
    return { ok: false, reason: 'gemini_not_configured' };
  }
  const userParts = [
    fileName ? `Arquivo: ${fileName}` : '',
    ocrText?.trim() ? `\n--- Texto do documento ---\n${ocrText.trim().slice(0, 24_000)}` : '',
    '\nExtraia todos os sócios / administradores / quotistas visíveis.',
  ]
    .filter(Boolean)
    .join('\n');
  const out = await callGeminiExtract({
    model,
    systemInstruction: SOCIOS_AI_EXTRACT_SYSTEM,
    userParts,
    images: images?.length ? images.slice(0, 6) : [],
    temperature: 0.05,
  });
  const parsed = parseGeminiJson(out.text);
  const socios = normalizeColigadasExtractRows(parsed?.coligadas ?? parsed?.socios ?? []);
  if (!socios.length) {
    return { ok: false, reason: 'empty_extraction', detail: 'Nenhum sócio identificado no documento.' };
  }
  return { ok: true, coligadas: socios, provider: 'gemini', model: out.model ?? model };
}

/** @param {object} body */
export async function handleAiExtractSocios(body) {
  const config = loadAiConfig();
  const providerId = String(body?.providerId ?? config.providerId ?? 'gemini').trim();
  const model = normalizeSelectedModel(providerId, body?.model ?? config.model);
  const images = Array.isArray(body?.images) ? body.images : [];
  const ocrText = String(body?.ocrText ?? body?.text ?? '');
  const fileName = String(body?.fileName ?? '').trim();

  if (!isProviderConfigured(providerId)) {
    return {
      status: 503,
      body: {
        ok: false,
        reason: `${providerId}_not_configured`,
        detail: `Configure a chave API de ${providerId} na aba IA do Contábil`,
      },
    };
  }

  if (!images.length && ocrText.trim().length < 20) {
    return {
      status: 422,
      body: {
        ok: false,
        reason: 'no_input',
        detail: 'Envie imagem ou texto do contrato social / sócios.',
      },
    };
  }

  try {
    const result = await extractSociosWithGemini({ model, ocrText, images, fileName });
    if (!result.ok) {
      return { status: result.reason === 'empty_extraction' ? 422 : 503, body: result };
    }
    return {
      status: 200,
      body: {
        ok: true,
        coligadas: result.coligadas,
        model: result.model,
        provider: result.provider,
        detail: `${result.coligadas.length} sócio(s) extraído(s).`,
      },
    };
  } catch (err) {
    return {
      status: 503,
      body: {
        ok: false,
        reason: 'extract_error',
        detail: err?.userHint ?? err?.message ?? String(err),
      },
    };
  }
}
