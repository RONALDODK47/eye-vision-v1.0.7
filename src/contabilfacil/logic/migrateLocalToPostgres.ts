/**
 * Migração one-shot: localStorage do token atual → PostgreSQL/MinIO.
 */
import {
  apiMigrateFromLocal,
  isPostgresStorageClientEnabled,
  probeWorkspaceStorageHealth,
} from '../../gestaoContabil/dbClientPostgres';
import {
  collectLocalOfficePayload,
  collectLocalManagerPayload,
  listLocalManagerSlugs,
} from './eyeVisionCloudSync';
import { loadCompaniesRegistry, companyStorageSlug } from './companyWorkspace';
import { listExtratoPastas } from './extratoPastasStorage';
import { readStoredCompanyAccessToken } from './eyeVisionAdmin';

const MIGRATED_KEY = 'eye_vision_pg_migrated_tokens_v1';

function readMigratedTokens(): string[] {
  try {
    const raw = localStorage.getItem(MIGRATED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function markTokenMigrated(token: string): void {
  const set = new Set(readMigratedTokens());
  set.add(token);
  localStorage.setItem(MIGRATED_KEY, JSON.stringify([...set]));
}

export function wasTokenMigratedToPostgres(token: string): boolean {
  return readMigratedTokens().includes(String(token || '').trim());
}

/**
 * Se o servidor Postgres está vazio para este token e há dados locais,
 * envia office + managers + pastas (com PDF base64) uma vez.
 */
export async function migrateLocalWorkspaceToPostgresIfNeeded(
  officeToken: string,
  uid: string,
  opts?: { force?: boolean; cloudAlreadyHasData?: boolean },
): Promise<boolean> {
  const token = String(officeToken || readStoredCompanyAccessToken() || '').trim();
  if (!token) return false;
  if (!isPostgresStorageClientEnabled()) return false;
  if (!opts?.force && wasTokenMigratedToPostgres(token)) return false;
  if (opts?.cloudAlreadyHasData) {
    markTokenMigrated(token);
    return false;
  }

  const healthy = await probeWorkspaceStorageHealth();
  if (!healthy) return false;

  const office = collectLocalOfficePayload();
  const slugs = listLocalManagerSlugs();

  const managers = slugs.map((slug) => collectLocalManagerPayload(slug)).filter((m) => {
    return m.data && Object.keys(m.data).length > 0;
  });

  const extratoPastas: Array<Record<string, unknown>> = [];
  for (const company of loadCompaniesRegistry()) {
    const slug = companyStorageSlug(company.name);
    for (const pasta of listExtratoPastas(company.name)) {
      extratoPastas.push({
        id: pasta.id,
        companySlug: slug,
        contaBanco: pasta.contaBanco,
        bancoNome: pasta.bancoNome,
        label: pasta.label,
        createdAt: pasta.createdAt,
        saldoAnterior: pasta.saldoAnterior,
        rows: pasta.rows,
        pdfBase64: pasta.pdfBase64,
        pdfFilename: pasta.pdfFilename,
      });
    }
  }

  const hasAnything =
    (office.companies_registry?.length ?? 0) > 0 ||
    managers.length > 0 ||
    extratoPastas.length > 0 ||
    Object.keys(office.extra_storage || {}).length > 0;

  if (!hasAnything) {
    markTokenMigrated(token);
    return false;
  }

  await apiMigrateFromLocal(token, {
    uid,
    office: office as unknown as Record<string, unknown>,
    managers: managers as unknown as Record<string, unknown>[],
    extratoPastas,
  });
  markTokenMigrated(token);
  return true;
}
