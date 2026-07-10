import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../gestaoContabil/dbClientPostgres', () => ({
  isPostgresStorageClientEnabled: () => true,
}));

import {
  listExtratoOcrLayouts,
  saveExtratoOcrLayout,
} from '../logic/extratoOcrLayoutStorage';
import { companyStorageSlug } from '../logic/companyWorkspace';

describe('extratoOcrLayoutStorage — leitura em memória (Docker)', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
    });
    vi.stubGlobal('crypto', { randomUUID: () => 'layout-test-id' });
  });

  it('lista layout logo após salvar sem usar localStorage direto', () => {
    const company = 'CAROL ALIMENTOS E UTILIDADES LTDA';
    const key = `contabilfacil_${companyStorageSlug(company)}_extrato_ocr_layouts_v1`;

    saveExtratoOcrLayout(company, {
      bancoNome: 'Bradesco',
      contaBanco: '1.1.1.01.00001',
      ignoreLineWords: 'SALDO ANTERIOR',
      semDelimitacaoVertical: false,
      columns: [],
      columnsNorm: [{ id: 'data', startNorm: 0, endNorm: 0.14 }],
      faixaStart: 0,
      faixaEnd: 100,
      faixaStartNorm: 0.1,
      faixaEndNorm: 0.9,
      faixaInicioMarcado: true,
      faixaFimMarcado: true,
      imgWidth: 800,
      imgHeight: 1200,
    });

    expect(localStorage.getItem(key)).toBeNull();
    const layouts = listExtratoOcrLayouts(company);
    expect(layouts).toHaveLength(1);
    expect(layouts[0]!.bancoNome).toBe('Bradesco');
    expect(layouts[0]!.contaBanco).toBe('1.1.1.01.00001');
  });
});
