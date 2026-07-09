import { describe, expect, it } from 'vitest';
import {
  API_IDS_BY_SCOPE,
  apiStatusScopeForTab,
  getApiStatusRegistryForTab,
} from './apiStatusRegistry';

describe('apiStatusRegistry — filtro por aba', () => {
  it('Precificação: Receita Federal e SEFAZ ICMS', () => {
    expect(apiStatusScopeForTab('pricing')).toBe('pricing');
    const ids = getApiStatusRegistryForTab('pricing').map((e) => e.id);
    expect(ids).toEqual([...API_IDS_BY_SCOPE.pricing]);
    expect(ids).not.toContain('bcb');
    expect(ids).not.toContain('calendario');
    expect(ids).not.toContain('sped');
  });

  it('Gerencial: BCB, calendário, Receita Federal, SPED e Gemini AI', () => {
    expect(apiStatusScopeForTab('manager')).toBe('manager');
    const ids = getApiStatusRegistryForTab('manager').map((e) => e.id);
    expect(ids).toEqual([...API_IDS_BY_SCOPE.manager]);
    expect(ids).not.toContain('sefaz-icms');
    expect(ids).toContain('gemini');
  });

  it('Gestão e Administrador: nenhuma API no cabeçalho', () => {
    expect(getApiStatusRegistryForTab('gestao')).toEqual([]);
    expect(getApiStatusRegistryForTab('admin')).toEqual([]);
  });

  it('Debug: todas as integrações', () => {
    const ids = getApiStatusRegistryForTab('debug').map((e) => e.id);
    expect(ids).toEqual([...API_IDS_BY_SCOPE.debug]);
  });
});
