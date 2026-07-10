/**
 * Cliente HTTP do workspace (PostgreSQL + MinIO via agent-api).
 * Mesma interface de dbClientFallback.EyeVisionWorkspace.
 */

const AGENT_API_BASE =
  typeof import.meta.env.VITE_AGENT_API_URL === 'string' && import.meta.env.VITE_AGENT_API_URL
    ? import.meta.env.VITE_AGENT_API_URL.replace(/\/$/, '')
    : '/api/agent';

export function isPostgresStorageClientEnabled(): boolean {
  const flag = String(import.meta.env.VITE_STORAGE_BACKEND || '').trim().toLowerCase();
  if (flag === 'postgres' || flag === 'postgresql') return true;
  // Em dev, tenta Postgres se não forçado para local
  if (flag === 'local' || flag === 'fallback') return false;
  // Default: tenta API (health decide)
  return true;
}

type GenericRecord = Record<string, unknown>;

async function workspaceFetch(
  path: string,
  opts: {
    method?: string;
    officeToken: string;
    uid?: string;
    body?: unknown;
  },
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Office-Token': opts.officeToken,
  };
  if (opts.uid) headers['X-User-Id'] = opts.uid;
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  return fetch(`${AGENT_API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers,
    body,
  });
}

let healthCache: { at: number; ok: boolean } | null = null;

/** Invalida cache do health (após subir Docker / agent-api). */
export function resetWorkspaceHealthCache(): void {
  healthCache = null;
}

export async function probeWorkspaceStorageHealth(): Promise<boolean> {
  const now = Date.now();
  if (healthCache && now - healthCache.at < 15_000) return healthCache.ok;
  try {
    const res = await fetch(`${AGENT_API_BASE}/workspace/health`, { method: 'GET' });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
    const ok = res.ok && json.ok === true;
    healthCache = { at: now, ok };
    return ok;
  } catch {
    // Não cacheia falha por muito tempo — agent-api pode subir em seguida.
    healthCache = { at: now - 12_000, ok: false };
    return false;
  }
}

async function setOffice(
  officeToken: string,
  payload: GenericRecord,
  uid: string,
): Promise<{ updated_at: string }> {
  const token = String(officeToken || '').trim();
  if (!token) return { updated_at: new Date().toISOString() };
  const res = await workspaceFetch('/workspace/office', {
    method: 'PUT',
    officeToken: token,
    uid,
    body: { payload, uid },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(String((err as { error?: string }).error || `HTTP ${res.status}`));
  }
  const json = (await res.json()) as { updated_at?: string };
  return { updated_at: json.updated_at || new Date().toISOString() };
}

async function getOffice(officeToken: string): Promise<GenericRecord | null> {
  const token = String(officeToken || '').trim();
  if (!token) return null;
  const res = await workspaceFetch('/workspace/office', {
    method: 'GET',
    officeToken: token,
  });
  if (!res.ok) {
    if (res.status === 503) return null;
    const err = await res.json().catch(() => ({}));
    throw new Error(String((err as { error?: string }).error || `HTTP ${res.status}`));
  }
  const json = (await res.json()) as { office?: GenericRecord | null };
  return json.office ?? null;
}

async function setManager(
  officeToken: string,
  companySlug: string,
  payload: GenericRecord,
  uid: string,
): Promise<{ updated_at: string }> {
  const token = String(officeToken || '').trim();
  const slug = String(companySlug || '').trim();
  if (!token || !slug) return { updated_at: new Date().toISOString() };
  const res = await workspaceFetch(`/workspace/manager/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    officeToken: token,
    uid,
    body: { payload, uid },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(String((err as { error?: string }).error || `HTTP ${res.status}`));
  }
  const json = (await res.json()) as { updated_at?: string };
  return { updated_at: json.updated_at || new Date().toISOString() };
}

async function listManagerByOffice(officeToken: string): Promise<GenericRecord[]> {
  const token = String(officeToken || '').trim();
  if (!token) return [];
  const res = await workspaceFetch('/workspace/manager', {
    method: 'GET',
    officeToken: token,
  });
  if (!res.ok) {
    if (res.status === 503) return [];
    const err = await res.json().catch(() => ({}));
    throw new Error(String((err as { error?: string }).error || `HTTP ${res.status}`));
  }
  const json = (await res.json()) as { managers?: GenericRecord[] };
  return Array.isArray(json.managers) ? json.managers : [];
}

async function deleteManager(
  officeToken: string,
  companySlug: string,
  uid: string,
): Promise<{ updated_at: string }> {
  const token = String(officeToken || '').trim();
  const slug = String(companySlug || '').trim();
  if (!token || !slug) return { updated_at: new Date().toISOString() };
  const res = await workspaceFetch(`/workspace/manager/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    officeToken: token,
    uid,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(String((err as { error?: string }).error || `HTTP ${res.status}`));
  }
  const json = (await res.json()) as { updated_at?: string };
  return { updated_at: json.updated_at || new Date().toISOString() };
}

export const postgresEyeVisionWorkspace = {
  setOffice,
  getOffice,
  setManager,
  listManagerByOffice,
  deleteManager,
};

export type ExtratoPastaApiItem = {
  id: string;
  contaBanco: string;
  bancoNome: string;
  label: string;
  createdAt: string;
  saldoAnterior: number;
  total: number;
  conciliadas: number;
  pendentes: number;
  rows: unknown[];
  pdfObjectKey?: string;
  pdfFilename?: string;
  pdfBase64?: string;
};

export async function apiListExtratoPastas(
  officeToken: string,
  companySlug: string,
): Promise<ExtratoPastaApiItem[]> {
  const res = await workspaceFetch(
    `/workspace/extrato-pastas?companySlug=${encodeURIComponent(companySlug)}`,
    { method: 'GET', officeToken },
  );
  if (!res.ok) throw new Error(`list pastas HTTP ${res.status}`);
  const json = (await res.json()) as { items?: ExtratoPastaApiItem[] };
  return Array.isArray(json.items) ? json.items : [];
}

export async function apiSaveExtratoPasta(
  officeToken: string,
  companySlug: string,
  input: Record<string, unknown>,
): Promise<ExtratoPastaApiItem> {
  const res = await workspaceFetch('/workspace/extrato-pastas', {
    method: 'POST',
    officeToken,
    body: { ...input, companySlug },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(String((err as { error?: string }).error || `HTTP ${res.status}`));
  }
  const json = (await res.json()) as { item: ExtratoPastaApiItem };
  return json.item;
}

export async function apiRemoveExtratoPasta(officeToken: string, id: string): Promise<boolean> {
  const res = await workspaceFetch(`/workspace/extrato-pastas/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    officeToken,
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { removed?: boolean };
  return Boolean(json.removed);
}

export async function apiDownloadExtratoPastaPdf(
  officeToken: string,
  id: string,
  filename?: string,
): Promise<void> {
  const res = await workspaceFetch(`/workspace/extrato-pastas/${encodeURIComponent(id)}/pdf`, {
    method: 'GET',
    officeToken,
  });
  if (!res.ok) throw new Error('PDF não encontrado no servidor');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `extrato_${id.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function apiMigrateFromLocal(
  officeToken: string,
  body: {
    uid?: string;
    office?: GenericRecord;
    managers?: GenericRecord[];
    extratoPastas?: Array<Record<string, unknown>>;
  },
): Promise<void> {
  const res = await workspaceFetch('/workspace/migrate-from-local', {
    method: 'POST',
    officeToken,
    uid: body.uid,
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(String((err as { error?: string }).error || `HTTP ${res.status}`));
  }
}
