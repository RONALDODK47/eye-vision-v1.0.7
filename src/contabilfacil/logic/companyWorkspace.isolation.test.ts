import { describe, expect, it } from 'vitest';
import {
  companyManagerStorageKey,
  companyStorageSlug,
  readManagerData,
  writeManagerDataNow,
} from './companyWorkspace';
import { loadExtratoRegrasContas, saveExtratoRegrasContas } from './extratoRegrasContasStorage';

describe('isolamento por empresa', () => {
  it('plano de contas não compartilha entre empresas', () => {
    writeManagerDataNow('EMPRESA ISOL A', 'plano', [
      { code: '1.1', name: 'CAIXA A', codigoReduzido: '10' },
    ]);
    writeManagerDataNow('EMPRESA ISOL B', 'plano', [
      { code: '1.1', name: 'CAIXA B', codigoReduzido: '20' },
    ]);

    const planoA = readManagerData<{ name: string; codigoReduzido: string }>('EMPRESA ISOL A', 'plano');
    const planoB = readManagerData<{ name: string; codigoReduzido: string }>('EMPRESA ISOL B', 'plano');

    expect(planoA[0]?.name).toBe('CAIXA A');
    expect(planoB[0]?.name).toBe('CAIXA B');
    expect(companyManagerStorageKey('EMPRESA ISOL A', 'plano')).not.toBe(
      companyManagerStorageKey('EMPRESA ISOL B', 'plano'),
    );
  });

  it('regras de extrato ficam em chave separada por empresa', () => {
    saveExtratoRegrasContas('EMPRESA REGRA A', [
      {
        id: '1',
        nome: 'PIX EMIT',
        descricao: 'PIX EMIT',
        nature: 'D',
        contaBanco: '100',
        contaContrapartida: '200',
      },
    ]);
    saveExtratoRegrasContas('EMPRESA REGRA B', [
      {
        id: '2',
        nome: 'PIX REC',
        descricao: 'PIX REC',
        nature: 'C',
        contaBanco: '300',
        contaContrapartida: '400',
      },
    ]);

    const regrasA = loadExtratoRegrasContas('EMPRESA REGRA A');
    const regrasB = loadExtratoRegrasContas('EMPRESA REGRA B');

    expect(regrasA).toHaveLength(1);
    expect(regrasB).toHaveLength(1);
    expect(regrasA[0]!.descricao).toBe('PIX EMIT');
    expect(regrasB[0]!.descricao).toBe('PIX REC');
    expect(companyStorageSlug('EMPRESA REGRA A')).not.toBe(companyStorageSlug('EMPRESA REGRA B'));
  });
});
