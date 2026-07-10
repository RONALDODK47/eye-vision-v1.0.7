/**
 * IA sugere contas (classificação hierárquica) para abas Contas dos módulos.
 */
import {
  callGemini,
  isGeminiConfigured,
  parseGeminiJson,
  sanitizeGeminiModel,
  EXTRACT_MAX_OUTPUT_TOKENS,
  EXTRACT_REQUEST_TIMEOUT_MS,
} from './gemini-client.mjs';
import { loadAiConfig } from './ai-config-store.mjs';

const SYSTEM = [
  'Você é contador brasileiro especialista em plano de contas Domínio e partidas dobradas.',
  'Sua tarefa: preencher as CONTAS (débito/crédito) de um módulo do Eye Vision / ContabilFacil.',
  '',
  'REGRA OBRIGATÓRIA — CLASSIFICAÇÃO:',
  '- O campo "conta" DEVE ser a CLASSIFICAÇÃO hierárquica do plano (ex.: "1.01.02.001", "2.1.03.01.001").',
  '- É PROIBIDO usar só código reduzido (ex.: "8", "147") quando o plano tem classificação com pontos.',
  '- Use SOMENTE códigos que existam no plano enviado (campo "code").',
  '- NÃO invente contas.',
  '',
  'Para cada campo da lista "campos", escolha a conta do plano cujo NOME melhor casa com o label/keywords.',
  'Respeite a natureza contábil: ativo (1), passivo (2), receita (4), despesa (5+).',
  'Preencha preferencialmente campos vazios; se o usuário pedir, pode substituir.',
  '',
  'Responda SOMENTE JSON válido:',
  '{"resumo":"texto curto PT-BR","contas":[{"key":"accEmprestimoDebit","conta":"1.01.02.001","motivo":"..."}]}',
  'Máximo 40 contas. Se não houver evidência, contas=[].',
].join('\n');

function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function resolveClassificacaoFromPlano(raw, plano) {
  const input = String(raw ?? '').trim();
  if (!input || !Array.isArray(plano) || !plano.length) return '';
  const exact = plano.find((p) => String(p.code ?? '').trim() === input);
  if (exact) return String(exact.code).trim();
  const digits = input.replace(/\D/g, '');
  if (digits) {
    const byDigits = plano.find((p) => String(p.code ?? '').replace(/\D/g, '') === digits);
    if (byDigits) return String(byDigits.code).trim();
  }
  const needle = norm(input);
  if (needle.length < 3) return '';
  let best = null;
  for (const p of plano) {
    const name = norm(p.name);
    const code = String(p.code ?? '').trim();
    if (!name || !code) continue;
    let score = 0;
    if (name === needle) score = 100;
    else if (name.includes(needle) || needle.includes(name)) score = 50;
    else {
      const tokens = needle.split(/\s+/).filter((t) => t.length > 2);
      score = tokens.filter((t) => name.includes(t)).length * 8;
    }
    if (score > 0 && (!best || score > best.score)) best = { code, score };
  }
  return best && best.score >= 16 ? best.code : '';
}

function sanitizeContas(rawList, plano, allowedKeys) {
  const list = Array.isArray(rawList) ? rawList : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const key = String(item?.key ?? '').trim();
    if (!key || (allowedKeys.size > 0 && !allowedKeys.has(key))) continue;
    if (seen.has(key)) continue;
    const conta = resolveClassificacaoFromPlano(item?.conta ?? item?.code ?? '', plano);
    if (!conta) continue;
    seen.add(key);
    out.push({
      key,
      conta,
      motivo: String(item?.motivo ?? '').trim().slice(0, 200),
    });
    if (out.length >= 40) break;
  }
  return out;
}

function buildUserPayload(body) {
  const plano = Array.isArray(body?.plano) ? body.plano : [];
  const campos = Array.isArray(body?.campos) ? body.campos : [];
  const contasAtuais = body?.contasAtuais && typeof body.contasAtuais === 'object' ? body.contasAtuais : {};
  const anexosTexto = Array.isArray(body?.anexosTexto) ? body.anexosTexto : [];
  const contexto = body?.contexto && typeof body.contexto === 'object' ? body.contexto : {};

  const planoParaIa = plano
    .map((p) => ({ code: String(p?.code ?? '').trim(), name: String(p?.name ?? '').trim() }))
    .filter((p) => p.code && p.name)
    .slice(0, 500);

  const lines = [
    `Empresa: ${body?.company ?? ''}`,
    `Módulo: ${body?.modulo ?? ''}`,
    '',
    '--- Mensagem do usuário ---',
    String(body?.message ?? '').trim() || 'Preencha as contas vazias com as melhores do plano.',
    '',
    '--- Contexto do módulo ---',
    JSON.stringify(contexto),
    '',
    '--- Campos a preencher (key / label / keywords) ---',
    JSON.stringify(
      campos.map((c) => ({
        key: c.key,
        label: c.label,
        keywords: c.keywords,
        preferGroup: c.preferGroup,
      })),
    ),
    '',
    '--- Contas já preenchidas ---',
    JSON.stringify(contasAtuais),
    '',
    '--- Plano de contas (classificação + nome) ---',
    JSON.stringify(planoParaIa),
  ];

  if (anexosTexto.length) {
    lines.push(
      '',
      `--- Documentos de inteligência ---\n${anexosTexto.join('\n---\n').slice(0, 30_000)}`,
    );
  }

  lines.push(
    '',
    'Devolva JSON com contas[].key e contas[].conta = classificação EXATA do plano.',
  );
  return lines.join('\n');
}

/**
 * @param {Record<string, unknown>} body
 */
export async function handleAiSuggestModuloContas(body) {
  if (!isGeminiConfigured()) {
    return {
      status: 503,
      body: {
        ok: false,
        resumo: '',
        contas: [],
        detail: 'IA não configurada (chave Gemini ausente).',
        reason: 'not_configured',
      },
    };
  }

  const plano = Array.isArray(body?.plano) ? body.plano : [];
  const campos = Array.isArray(body?.campos) ? body.campos : [];
  const allowedKeys = new Set(campos.map((c) => String(c?.key ?? '').trim()).filter(Boolean));

  if (!plano.length) {
    return {
      status: 400,
      body: {
        ok: false,
        resumo: '',
        contas: [],
        detail: 'Plano de contas vazio — importe o plano na aba Gerencial.',
        reason: 'empty_plano',
      },
    };
  }

  const cfg = loadAiConfig();
  const model = sanitizeGeminiModel(body?.model || cfg?.model);
  const userText = buildUserPayload(body);

  try {
    const raw = await callGemini({
      model,
      system: SYSTEM,
      user: userText,
      maxOutputTokens: EXTRACT_MAX_OUTPUT_TOKENS,
      timeoutMs: EXTRACT_REQUEST_TIMEOUT_MS,
    });
    const parsed = parseGeminiJson(raw) ?? {};
    const contas = sanitizeContas(parsed.contas ?? parsed.accounts, plano, allowedKeys);
    return {
      status: 200,
      body: {
        ok: contas.length > 0,
        resumo: String(parsed.resumo ?? '').trim() ||
          (contas.length ? `${contas.length} conta(s) sugerida(s).` : 'Nenhuma conta sugerida.'),
        contas,
        model,
      },
    };
  } catch (err) {
    return {
      status: 500,
      body: {
        ok: false,
        resumo: '',
        contas: [],
        detail: err instanceof Error ? err.message : String(err),
        reason: 'gemini_error',
      },
    };
  }
}
