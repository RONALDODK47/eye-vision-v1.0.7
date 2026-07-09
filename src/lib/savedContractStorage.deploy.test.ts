import { describe, expect, it } from 'vitest';
import { getDeployDataBundle } from './deployDataBundle';
import { loadContractsFromStorage } from './savedContractStorage';

describe('pacote deploy — contratos salvos', () => {
  it('bundle embutido expõe estrutura contracts + companies', () => {
    const bundle = getDeployDataBundle();
    expect(Array.isArray(bundle.contracts)).toBe(true);
    expect(Array.isArray(bundle.companies)).toBe(true);
  });

  it('normaliza contratos do pacote como contratos salvos', () => {
    const sample = {
      id: 'test-1',
      companyName: 'EMPRESA TESTE',
      contractNumber: '004.309.649',
      formState: {
        monthsStr: '37',
        contractDateStr: '2023-02-10',
        firstInstallmentDateStr: '2024-03-10',
        parcelTab: { varMode: 'pronampe', system: 'SAC', principalStr: '150.000,00' },
      },
    };
    const loaded = loadContractsFromStorage(JSON.stringify([sample]));
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.contractNumber).toBe('004.309.649');
  });
});
