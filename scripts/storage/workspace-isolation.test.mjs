/**
 * Teste de isolamento por office_token no repositório (requer Postgres).
 * Rode: STORAGE_BACKEND=postgres npm run storage:migrate && npx vitest run scripts/storage/workspace-isolation.test.mjs
 */
import { describe, expect, it } from 'vitest';
import '../load-env.mjs';
import { isPostgresStorageEnabled } from './pg-client.mjs';
import * as repo from './workspace-repo.mjs';

const enabled = isPostgresStorageEnabled() && Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)('workspace isolation by office_token', () => {
  it('token A e token B não compartilham office/manager', async () => {
    const tokA = `TEST-A-${Date.now()}`;
    const tokB = `TEST-B-${Date.now()}`;

    await repo.setOffice(
      tokA,
      {
        companies_registry: [{ id: '1', name: 'Empresa A', createdAt: new Date().toISOString() }],
        selected_company: 'Empresa A',
        extra_storage: { secret_a: true },
      },
      'uid-a',
    );
    await repo.setManager(
      tokA,
      'empresa_a',
      { company_name: 'Empresa A', data: { extrato: [{ id: 'e1', value: 10 }] } },
      'uid-a',
    );

    await repo.setOffice(
      tokB,
      {
        companies_registry: [{ id: '2', name: 'Empresa B', createdAt: new Date().toISOString() }],
        selected_company: 'Empresa B',
        extra_storage: { secret_b: true },
      },
      'uid-b',
    );

    const officeA = await repo.getOffice(tokA);
    const officeB = await repo.getOffice(tokB);
    expect(officeA?.selected_company).toBe('Empresa A');
    expect(officeB?.selected_company).toBe('Empresa B');
    expect(officeA?.extra_storage?.secret_a).toBe(true);
    expect(officeB?.extra_storage?.secret_b).toBe(true);
    expect(officeA?.extra_storage?.secret_b).toBeUndefined();

    const managersA = await repo.listManagerByOffice(tokA);
    const managersB = await repo.listManagerByOffice(tokB);
    expect(managersA.some((m) => m.company_slug === 'empresa_a')).toBe(true);
    expect(managersB.some((m) => m.company_slug === 'empresa_a')).toBe(false);
  });
});
