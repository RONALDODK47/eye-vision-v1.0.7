import { describe, expect, it } from 'vitest';
import {
  mergeArquivosSped,
  spedImportSlotKey,
  type FiscalSpedArquivoSalvo,
} from '../logic/fiscalSpedAutomation';
import type { ParsedSpedFiscal } from '../../extratoVision/utils/spedFiscalParser';

function parsed(partial: Partial<ParsedSpedFiscal> & Pick<ParsedSpedFiscal, 'tipo' | 'fileName'>): ParsedSpedFiscal {
  return {
    cnpj: '',
    empresa: '',
    dtIni: partial.dtIni ?? '01032026',
    dtFin: partial.dtFin ?? '31032026',
    dtFinLabel: '31/03/2026',
    itens: partial.itens ?? [{ kind: 'imposto', natureza: 'credora', registro: 'M205', codigo: '1', descricao: 'x', imposto: 'PIS/Pasep', valor: 10, linha: 1, data: '31/03/2026' }],
    issues: [],
    ...partial,
  };
}

function arq(fileName: string, tipo: ParsedSpedFiscal['tipo'], dtFin: string): FiscalSpedArquivoSalvo {
  return {
    id: crypto.randomUUID(),
    parsed: parsed({ tipo, fileName, dtFin, dtIni: `01${dtFin.slice(0, 6)}` }),
  };
}

describe('spedImportSlotKey', () => {
  it('agrupa por tipo e mês do período', () => {
    expect(spedImportSlotKey(parsed({ tipo: 'CONTRIBUICOES', fileName: 'a.txt', dtFin: '31032026' }))).toBe(
      'CONTRIBUICOES|2026-03',
    );
    expect(spedImportSlotKey(parsed({ tipo: 'ICMS_IPI', fileName: 'b.txt', dtFin: '31012026' }))).toBe(
      'ICMS_IPI|2026-01',
    );
  });
});

describe('mergeArquivosSped', () => {
  it('adiciona arquivos novos de meses diferentes', () => {
    const existentes: FiscalSpedArquivoSalvo[] = [];
    const novos = [
      arq('mar-contrib.txt', 'CONTRIBUICOES', '31032026'),
      arq('mar-icms.txt', 'ICMS_IPI', '31032026'),
    ];
    const { merged, imported, skipped } = mergeArquivosSped(existentes, novos, 'Empresa');
    expect(merged).toHaveLength(2);
    expect(imported).toBe(2);
    expect(skipped).toBe(0);
  });

  it('ignora o mesmo período se já importado (sem company não checa razão)', () => {
    const existentes = [arq('mar.txt', 'CONTRIBUICOES', '31032026')];
    const novos = [arq('mar-novo.txt', 'CONTRIBUICOES', '31032026')];
    const { merged, imported, skipped } = mergeArquivosSped(existentes, novos);
    expect(merged).toHaveLength(1);
    expect(imported).toBe(0);
    expect(skipped).toBe(1);
  });

  it('ignora fingerprint idêntico', () => {
    const existentes = [arq('igual.txt', 'CONTRIBUICOES', '31032026')];
    const novos = [arq('igual.txt', 'CONTRIBUICOES', '31032026')];
    const { imported, skipped } = mergeArquivosSped(existentes, novos);
    expect(imported).toBe(0);
    expect(skipped).toBe(1);
  });
});
