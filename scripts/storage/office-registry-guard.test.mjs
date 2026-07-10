import { describe, expect, it } from 'vitest';
import { guardOfficePayload, mergeCompaniesRegistryLists } from './office-registry-guard.mjs';

describe('office-registry-guard', () => {
  const seven = [
    { id: '1', name: 'COMERCIAL FERNANDES', createdAt: '2026-01-01' },
    { id: '2', name: 'ORGANO', createdAt: '2026-01-01' },
    { id: '3', name: 'POLO SUL CLIMATIZAÇÃO', createdAt: '2026-01-01' },
    { id: '4', name: 'PROMETAL ESTRUTURAS', createdAt: '2026-01-01' },
    { id: '5', name: 'SINDICATO', createdAt: '2026-01-01' },
    { id: '6', name: 'TOP SERVICOS', createdAt: '2026-01-01' },
    { id: '7', name: 'XXX', createdAt: '2026-01-01' },
  ];

  it('rejeita encolhimento para só TECHNOVA', () => {
    const guarded = guardOfficePayload(
      {
        companies_registry: [{ id: 't', name: 'TECHNOVA INDÚSTRIA LTDA', createdAt: '2026-01-01' }],
        selected_company: 'TECHNOVA INDÚSTRIA LTDA',
      },
      { companies_registry: seven, selected_company: 'POLO SUL CLIMATIZAÇÃO' },
      [],
    );
    expect(guarded.companies_registry.length).toBe(7);
    expect(guarded.selected_company).not.toMatch(/TECHNOVA/i);
  });

  it('reconstrói registry a partir de managers com dados', () => {
    const guarded = guardOfficePayload(
      { companies_registry: [], selected_company: '' },
      { companies_registry: [], selected_company: '' },
      [
        {
          company_slug: 'A_ECONOMICA',
          company_name: 'A ECONOMICA',
          data: { plano: [{ code: '1', name: 'ATIVO' }], extrato: [{ id: '1' }] },
        },
      ],
    );
    expect(guarded.companies_registry.some((c) => c.name === 'A ECONOMICA')).toBe(true);
    expect(guarded.selected_company).toBe('A ECONOMICA');
  });

  it('mergeCompaniesRegistryLists ignora TECHNOVA', () => {
    const merged = mergeCompaniesRegistryLists(seven, [
      { id: 't', name: 'TECHNOVA INDÚSTRIA LTDA', createdAt: '2026-01-01' },
    ]);
    expect(merged.length).toBe(7);
    expect(merged.some((c) => /TECHNOVA/i.test(c.name))).toBe(false);
  });
});
