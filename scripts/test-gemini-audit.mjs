import './load-env.mjs';
import { readFileSync } from 'node:fs';
import { fetch } from 'undici';
import { callGemini, getGeminiApiKey, geminiModelId } from './gemini-client.mjs';

const key = getGeminiApiKey();
console.log('model env', geminiModelId());

// list models
const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
const listRes = await fetch(listUrl);
const list = await listRes.json();
const flash = (list.models ?? [])
  .filter((m) => /flash/i.test(m.name))
  .map((m) => m.name.replace('models/', ''));
console.log('flash models', flash.slice(0, 15));

const system = readFileSync(new URL('./gemini-audit-prompts.mjs', import.meta.url), 'utf8').slice(0, 500);

for (const jsonMode of [false, true]) {
  try {
    const out = await callGemini({
      systemInstruction: 'Responda JSON: {summary, issues:[]}',
      userContent: JSON.stringify({ resumo: { lancamentosCount: 27, saldoFinal: 4124.73 }, logDescartados: [] }),
      jsonMode,
    });
    console.log('audit-like jsonMode=' + jsonMode, 'OK', out.model, out.text.slice(0, 80));
  } catch (e) {
    console.log('audit-like jsonMode=' + jsonMode, 'FAIL', e.message.slice(0, 120));
  }
}
