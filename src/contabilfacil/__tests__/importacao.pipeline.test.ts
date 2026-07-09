import { describe, expect, it } from 'vitest';
import { parseDominioLancamentosTxt, isDominioLancamentosTxt } from '../../extratoVision/utils/dominioLancamentosTxt';
import { parsePlanoContasText } from '../../extratoVision/utils/planoContasTxtParser';
import { detectContabilTxtFormat } from '../logic/txtFormatDetect';
import {
  accountPlansToVisionPlano,
  normalizeRazaoImport,
  visionPlanoRowsToAccountPlans,
} from '../logic/contabilPipeline';
import { extrairPeriodoRazao } from '../../extratoVision/utils/razaoContabil';
import { montarComparativoMensal } from '../../extratoVision/utils/balanceteComparativoMensal';
import { buildDominioPlanoTxt, buildDominioRazaoTxt } from './fixtures/dominioFixtures';
import {
  buildDominioPlanoTxtFromAccounts,
  formatDominioPlanoLinha,
} from '../logic/planoContasMapper';

describe('Pipeline importação Domínio (simulação usuário)', () => {
  const planoTxt = buildDominioPlanoTxt();
  const razaoTxt = buildDominioRazaoTxt(420);

  it('detecta formatos TXT', () => {
    expect(detectContabilTxtFormat(planoTxt)).toBe('plano_dominio');
    expect(detectContabilTxtFormat(razaoTxt)).toBe('dominio_lanc');
    expect(isDominioLancamentosTxt(razaoTxt)).toBe(true);
  });

  it('importa plano com contas analíticas', () => {
    const vision = parsePlanoContasText(planoTxt);
    expect(vision.length).toBeGreaterThanOrEqual(4);
    const accounts = visionPlanoRowsToAccountPlans(vision);
    expect(accounts.some((a) => a.tipo === 'A')).toBe(true);
  });

  it('exporta e reimporta plano Domínio (round-trip)', () => {
    const vision = parsePlanoContasText(planoTxt);
    const accounts = visionPlanoRowsToAccountPlans(vision);
    const exported = buildDominioPlanoTxtFromAccounts(accounts);
    expect(exported).toContain(formatDominioPlanoLinha(accounts[0]!).slice(0, 7));
    const reimport = parsePlanoContasText(exported);
    expect(reimport.length).toBe(accounts.length);
  });

  it('importa razão com centenas de lançamentos e período 2025', () => {
    const parsed = parseDominioLancamentosTxt(razaoTxt);
    expect(parsed.length).toBeGreaterThan(300);
    const normalized = normalizeRazaoImport(parsed);
    expect(normalized.length).toBeGreaterThan(300);
    const periodo = extrairPeriodoRazao(normalized);
    expect(periodo.min).toBe('31/01/2025');
    expect(periodo.max).toBe('31/12/2025');
  });

  it('monta comparativo mensal 12 meses em tempo aceitável', () => {
    const visionPlano = parsePlanoContasText(planoTxt);
    const planoRows = accountPlansToVisionPlano(visionPlanoRowsToAccountPlans(visionPlano));
    const razao = normalizeRazaoImport(parseDominioLancamentosTxt(razaoTxt));
    const t0 = performance.now();
    const { linhas, periodos } = montarComparativoMensal({
      razaoRows: razao,
      planoRows,
      dataDe: '01/01/2025',
      dataAte: '31/12/2025',
      somenteComMovimento: true,
    });
    const elapsed = performance.now() - t0;
    expect(periodos.length).toBe(12);
    expect(linhas.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(15_000);
  });

  it('totais débito/crédito coerentes no razão importado', () => {
    const razao = normalizeRazaoImport(parseDominioLancamentosTxt(razaoTxt));
    const deb = razao.reduce((s, r) => s + (r.debito ?? 0), 0);
    const cred = razao.reduce((s, r) => s + (r.credito ?? 0), 0);
    expect(deb).toBeGreaterThan(0);
    expect(cred).toBeGreaterThan(0);
    expect(Math.abs(deb - cred)).toBeLessThan(deb * 0.01);
  });
});
