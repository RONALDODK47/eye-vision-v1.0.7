/**
 * Testa cada modelo Gemini até achar um que responda (free tier).
 */
import './load-env.mjs';
import { fetch as undiciFetch } from 'undici';
import {
  getGeminiApiKey,
  isGeminiConfigured,
  listFreeTierGeminiModels,
  callGemini,
  pingGeminiApi,
} from './gemini-client.mjs';

const key = getGeminiApiKey();

if (!isGeminiConfigured()) {
  console.error('GEMINI_API_KEY ausente ou inválida no .env');
  process.exit(1);
}

async function tryModelDirect(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const t0 = Date.now();
  try {
    const res = await undiciFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Responda exatamente: OK' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 16 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const ms = Date.now() - t0;
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 200);
      try {
        msg = JSON.parse(text)?.error?.message?.slice(0, 200) ?? msg;
      } catch {
        /* ok */
      }
      return { model, ok: false, status: res.status, ms, error: msg };
    }
    const data = JSON.parse(text);
    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('')?.trim() ?? '';
    return { model, ok: true, status: res.status, ms, reply: reply.slice(0, 80) };
  } catch (err) {
    return {
      model,
      ok: false,
      status: 0,
      ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function listApiModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
  try {
    const res = await undiciFetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.models ?? [])
      .map((m) => String(m.name ?? '').replace(/^models\//, ''))
      .filter((id) => /flash/i.test(id) && !/image|tts|embedding|live|audio|video|exp/i.test(id));
  } catch {
    return [];
  }
}

console.log('=== Teste Gemini — todos os modelos ===\n');
console.log('Chave configurada:', key.slice(0, 8) + '…' + key.slice(-4));
console.log('GEMINI_MODEL .env:', process.env.GEMINI_MODEL ?? '(padrão)');

const chain = listFreeTierGeminiModels();
const apiModels = await listApiModels();
const extraFromApi = apiModels.filter((m) => !chain.includes(m));
const allToTest = [...new Set([...chain, ...extraFromApi])];

console.log('\nModelos na cadeia:', chain.join(', '));
if (extraFromApi.length) {
  console.log('Extras da API:', extraFromApi.slice(0, 12).join(', '));
}

console.log('\n--- Teste individual por modelo ---\n');

/** @type {Array<{model: string, ok: boolean, status: number, ms: number, reply?: string, error?: string}>} */
const results = [];

for (const model of allToTest) {
  process.stdout.write(`  ${model} … `);
  const r = await tryModelDirect(model);
  results.push(r);
  if (r.ok) {
    console.log(`✓ ${r.status} (${r.ms}ms) → "${r.reply}"`);
  } else {
    console.log(`✗ ${r.status || 'ERR'} (${r.ms}ms) — ${(r.error ?? '').slice(0, 100)}`);
  }
}

const working = results.filter((r) => r.ok);
console.log('\n--- Resumo ---');
console.log(`Funcionando: ${working.length}/${results.length}`);

if (working.length === 0) {
  console.error('\nNENHUM modelo respondeu. Possíveis causas:');
  console.error('  • Chave API inválida ou revogada');
  console.error('  • Cota free tier esgotada em todos os modelos');
  console.error('  • Gere nova chave em https://aistudio.google.com/apikey');
  process.exit(1);
}

const best = working.sort((a, b) => a.ms - b.ms)[0];
console.log(`\nMelhor modelo: ${best.model} (${best.ms}ms)`);
console.log(`Sugestão .env: GEMINI_MODEL="${best.model}"`);

console.log('\n--- pingGeminiApi() ---');
const ping = await pingGeminiApi();
console.log(JSON.stringify(ping, null, 2));

console.log('\n--- callGemini() com fallback automático ---');
try {
  const out = await callGemini({
    userContent: 'Diga em uma frase: auditoria OCR extrato bancário OK',
    temperature: 0.1,
  });
  console.log(`✓ callGemini OK — modelo: ${out.model}`);
  console.log(`  Resposta: ${out.text.slice(0, 120)}`);
} catch (err) {
  console.error('✗ callGemini falhou:', err instanceof Error ? err.message : err);
  process.exit(1);
}

console.log('\n=== Tudo OK — use GEMINI_MODEL=' + best.model + ' ===');
