import { describe, expect, it } from 'vitest';
import {
  isSacProfileEnabledForVarMode,
  sacProfileChangesInterest,
  usesSelicOverDailyMotor,
} from './loanProfileApplicability';

describe('loanProfileApplicability', () => {
  it('PRONAMPE (Selic Over diária) com série carregada trava perfis de pró-rata', () => {
    expect(usesSelicOverDailyMotor('pronampe', true)).toBe(true);
    expect(sacProfileChangesInterest('pronampe', true)).toBe(false);
    expect(isSacProfileEnabledForVarMode('linearDiasDiv30', 'pronampe', true)).toBe(false);
    expect(isSacProfileEnabledForVarMode('mensalTruncate', 'pronampe', true)).toBe(true);
  });

  it('pré-fixado permite todos os perfis', () => {
    expect(usesSelicOverDailyMotor('none', true)).toBe(false);
    expect(sacProfileChangesInterest('none', false)).toBe(true);
    expect(isSacProfileEnabledForVarMode('compostoMesCivil', 'none', false)).toBe(true);
  });
});
