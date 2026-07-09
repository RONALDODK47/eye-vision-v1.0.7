import { describe, expect, it, vi } from 'vitest';
import {
  lineNeedsLlamaRefine,
  pickLinesForLlamaRefine,
  scoreOcrLineQuality,
  validateOcrLinesAccounting,
} from './ocrLayeredRefine';

vi.mock('./aiProactiveNotify', () => ({
  notifyValidationIssue: vi.fn(),
}));

import { notifyValidationIssue } from './aiProactiveNotify';

describe('ocrLayeredRefine', () => {
  it('linha com data e valor alta confiança não precisa Llama', () => {
    const line = '15/03/2024 TED RECEBIDA 1.250,00';
    expect(scoreOcrLineQuality(line, 'extrato')).toBeGreaterThanOrEqual(72);
    expect(lineNeedsLlamaRefine(line, 'extrato', 92)).toBe(false);
  });

  it('aceita data dd/mm sem ano no score', () => {
    const line = '02/04 PIX RECEBIDO 423,37';
    expect(scoreOcrLineQuality(line, 'extrato')).toBeGreaterThanOrEqual(72);
  });

  it('linha suspeita vai para Llama no modo inteligente', () => {
    const line = '15/O3/2O24 PAGAMENTO l.250,OO';
    expect(lineNeedsLlamaRefine(line, 'extrato')).toBe(true);
    const idx = pickLinesForLlamaRefine([line, '15/03/2024 100,00'], 'extrato', 'inteligente');
    expect(idx).toContain(0);
    expect(idx).not.toContain(1);
  });

  it('modo turbo não envia nada para Llama', () => {
    const lines = ['15/O3/2O24', '15/03/2024 100,00'];
    expect(pickLinesForLlamaRefine(lines, 'extrato', 'turbo')).toEqual([]);
  });

  it('extrato Bradesco: não alerta em linhas de continuação sem data/valor', () => {
    vi.mocked(notifyValidationIssue).mockClear();
    validateOcrLinesAccounting(
      [
        '01/04/2026 LIQUIDACAO DE COBRANCA 423,37',
        'TRANSFERENCIA PIX REMETENTE',
        '02/04/2026 TED ENVIADA 1.250,00',
        'COMPLEMENTO HISTORICO',
        '03/04/2026 TARIFA 12,90',
        '04/04/2026 PIX 100,00',
      ],
      'extrato',
    );
    expect(notifyValidationIssue).not.toHaveBeenCalled();
  });
});
