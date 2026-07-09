/**
 * Teste HTTP rápido — factual instantâneo + 1 pergunta LLM por IA.
 */
import { EMBEDDED_AI_CATALOG } from './embedded-ai.mjs';

const BASE = process.env.AGENT_API_URL || 'http://127.0.0.1:8790';

const FACTUAIS = [
  { msg: 'bom dia', max: 8000 },
  { msg: 'quanto é 15+27?', max: 8000 },
  { msg: 'que horas são?', max: 8000 },
  { msg: 'clima em São Paulo', max: 15000 },
  { msg: 'cotação do dólar', max: 15000 },
  { msg: 'o que você pode fazer?', max: 8000 },
  { msg: 'o que é inflação?', max: 15000 },
  { msg: 'me fala sobre python', max: 20000 },
];

const LLM = [
  { msg: 'pq?', max: 180_000, hist: [{ role: 'user', text: 'A inflação subiu' }, { role: 'model', text: 'Isso reduz o poder de compra.' }] },
  { msg: 'e como isso afeta empréstimos?', max: 180_000 },
];

function ok(text) {
  const t = String(text ?? '').trim();
  return t.length > 2 && !/demorou|offline|não foi possível/i.test(t);
}

async function chat(body, maxMs) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(maxMs),
  });
  const data = await res.json();
  return { ms: Date.now() - t0, status: res.status, text: data.text ?? '' };
}

async function setModel(modelId) {
  await fetch(`${BASE}/agent/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localModel: modelId }),
  });
}

async function main() {
  const health = await fetch(`${BASE}/agent/health`).then((r) => r.json()).catch(() => null);
  if (!health?.ok) {
    console.error('✗ Agent API offline — rode: node scripts/agent-api-server.mjs');
    process.exit(1);
  }
  console.log(`Agent API OK — modelo ativo: ${health.model}\n`);

  console.log('=== Respostas factuais (motor FlowMind) ===');
  let okCount = 0;
  for (const c of FACTUAIS) {
    try {
      const { ms, status, text } = await chat(
        { contents: [{ role: 'user', text: c.msg }], tools: [], fast: true },
        c.max,
      );
      const pass = status === 200 && ok(text);
      console.log(`${pass ? '✓' : '✗'} ${ms}ms | ${c.msg} → ${text.slice(0, 85)}`);
      if (pass) okCount++;
    } catch (err) {
      console.log(`✗ ERR | ${c.msg} → ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nFactual: ${okCount}/${FACTUAIS.length}\n`);

  for (const { id, label } of EMBEDDED_AI_CATALOG) {
    console.log(`=== LLM: ${label} (${id}) ===`);
    await setModel(id);
    await new Promise((r) => setTimeout(r, 2000));

    for (const c of LLM) {
      const contents = [...(c.hist ?? []), { role: 'user', text: c.msg }];
      try {
        const { ms, status, text } = await chat({ contents, tools: [], fast: true }, c.max);
        const pass = status === 200 && ok(text);
        console.log(`${pass ? '✓' : '✗'} ${ms}ms | ${c.msg} → ${text.slice(0, 90)}`);
        if (pass) okCount++;
        else process.exitCode = 1;
      } catch (err) {
        console.log(`✗ ERR | ${c.msg} → ${err instanceof Error ? err.message : err}`);
        process.exitCode = 1;
      }
    }
    console.log('');
  }

  const total = FACTUAIS.length + LLM.length * EMBEDDED_AI_CATALOG.length;
  console.log(`========== ${okCount}/${total} testes OK ==========`);
  if (process.exitCode) process.exit(1);
  console.log('✓ IAs respondendo normalmente via HTTP!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
