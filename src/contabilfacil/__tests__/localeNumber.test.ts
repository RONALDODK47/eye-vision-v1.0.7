import { describe, expect, it } from 'vitest';
import {
  formatLocaleNumberForInput,
  parseLocaleNumber,
  sanitizeNumericDraft,
  tryParseLocaleNumber,
} from '../../lib/localeNumber';

describe('parseLocaleNumber', () => {
  it('aceita vírgula como decimal', () => {
    expect(parseLocaleNumber('2,3')).toBeCloseTo(2.3);
    expect(parseLocaleNumber('30000,50')).toBeCloseTo(30000.5);
  });

  it('aceita ponto como decimal', () => {
    expect(parseLocaleNumber('30000.50')).toBeCloseTo(30000.5);
    expect(parseLocaleNumber('2.5')).toBeCloseTo(2.5);
  });

  it('aceita separador de milhar brasileiro', () => {
    expect(parseLocaleNumber('30.000')).toBe(30000);
    expect(parseLocaleNumber('1.234.567,89')).toBeCloseTo(1234567.89);
    expect(parseLocaleNumber('6.268,75')).toBeCloseTo(6268.75);
  });

  it('aceita separador de milhar americano', () => {
    expect(parseLocaleNumber('30,000')).toBe(30000);
    expect(parseLocaleNumber('30,000.50')).toBeCloseTo(30000.5);
  });

  it('aceita múltiplas vírgulas (ex.: 0,0,0)', () => {
    expect(parseLocaleNumber('0,0,0')).toBe(0);
  });

  it('aceita inteiro sem separador', () => {
    expect(parseLocaleNumber('30000')).toBe(30000);
  });

  it('tryParse retorna parcial com separador no fim', () => {
    expect(tryParseLocaleNumber('2,')).toBeCloseTo(2);
    expect(tryParseLocaleNumber('2.')).toBeCloseTo(2);
    expect(tryParseLocaleNumber('')).toBe(0);
    expect(tryParseLocaleNumber('-')).toBeNull();
  });

  it('sanitizeNumericDraft remove lixo e mantém separadores', () => {
    expect(sanitizeNumericDraft('30.000,50')).toBe('30.000,50');
    expect(sanitizeNumericDraft('abc30,5x')).toBe('30,5');
    expect(sanitizeNumericDraft('-12,34')).toBe('-12,34');
  });

  it('formatLocaleNumberForInput usa milhar e vírgula decimal', () => {
    expect(formatLocaleNumberForInput(30000.5, 2)).toBe('30.000,5');
    expect(formatLocaleNumberForInput(6268.75, 2)).toBe('6.268,75');
    expect(formatLocaleNumberForInput(0)).toBe('');
  });
});
