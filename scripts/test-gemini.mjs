import './load-env.mjs';
import { callGemini, pingGeminiApi, listFreeTierGeminiModels, sanitizeGeminiModel } from './gemini-client.mjs';

console.log('Modelos free tier:', listFreeTierGeminiModels().join(', '));
console.log('Modelo .env sanitizado:', sanitizeGeminiModel(process.env.GEMINI_MODEL));

const ping = await pingGeminiApi();
console.log('Health:', JSON.stringify(ping, null, 2));

const audit = await callGemini({
  systemInstruction: 'Responda JSON: {summary, issues:[]}',
  userContent: JSON.stringify({ resumo: { lancamentosCount: 27, saldoFinal: 4124.73 } }),
  jsonMode: true,
});
console.log('Audit OK:', audit.model, audit.text.slice(0, 100));
