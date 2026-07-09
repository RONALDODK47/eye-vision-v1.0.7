import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  collectSimuladorFullBackup,
  importSimuladorFullBackupOverwrite,
} from '../../lib/simuladorFullBackup';

describe('Backup — dados gerenciais contabilfacil_*', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    const ls = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
    };
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
  });

  afterEach(() => {
    store.clear();
  });

  it('exporta e restaura chaves contabilfacil_', () => {
    store.set(
      'contabilfacil_EMPRESA_TESTE_plano',
      JSON.stringify([{ code: '1.1', name: 'CAIXA', tipo: 'A' }]),
    );
    store.set(
      'contabilfacil_EMPRESA_TESTE_razao',
      JSON.stringify([
        {
          codigo: '101',
          classificacao: '1.1',
          nome: 'CAIXA',
          data: '01/01/2025',
          debito: 100,
          credito: 0,
          saldoInicial: 0,
          saldoFinal: 0,
        },
      ]),
    );
    store.set('simulador_contracts', JSON.stringify([]));

    const backup = collectSimuladorFullBackup();
    expect(backup.storage['contabilfacil_EMPRESA_TESTE_plano']).toBeDefined();
    expect(backup.storage['contabilfacil_EMPRESA_TESTE_razao']).toBeDefined();

    store.clear();
    const summary = importSimuladorFullBackupOverwrite(backup);
    expect(summary.gerencialKeys).toBeGreaterThanOrEqual(2);
    expect(store.get('contabilfacil_EMPRESA_TESTE_plano')).toBeTruthy();
    expect(store.get('contabilfacil_EMPRESA_TESTE_razao')).toBeTruthy();
  });
});
