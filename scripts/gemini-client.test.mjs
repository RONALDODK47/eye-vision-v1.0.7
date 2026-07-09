import { describe, expect, it } from 'vitest';
import { parseGeminiJson, salvageExtratoAiJson } from './gemini-client.mjs';

describe('parseGeminiJson', () => {
  it('aceita JSON puro', () => {
    const parsed = parseGeminiJson('{"rows":[{"data":"01/04/2026"}],"saldoAnterior":100}');
    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.saldoAnterior).toBe(100);
  });

  it('remove cercas markdown', () => {
    const parsed = parseGeminiJson('```json\n{"rows":[],"saldoFinal":10}\n```');
    expect(parsed?.saldoFinal).toBe(10);
  });

  it('recupera rows de JSON truncado', () => {
    const broken =
      '{"rows":[{"data":"01/04/2026","descricao":"Pix","valorCredito":"10,00"},{"data":"02/04/2026","descricao":"TED","valorDebito":"5,00"},{"data":"03/04/2026","descricao":"Tarifa","valorDebito":"1,00';
    const salvaged = salvageExtratoAiJson(broken);
    expect(salvaged?.rows?.length).toBeGreaterThanOrEqual(2);
    const parsed = parseGeminiJson(broken);
    expect(parsed?.rows?.length).toBeGreaterThanOrEqual(2);
  });
});
