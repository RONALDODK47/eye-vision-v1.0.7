/**
 * Pool PostgreSQL — só no servidor (agent-api).
 */
import pg from 'pg';

const { Pool } = pg;

/** @type {import('pg').Pool | null} */
let pool = null;

export function isPostgresStorageEnabled() {
  const backend = String(process.env.STORAGE_BACKEND || '').trim().toLowerCase();
  return (
    backend === 'postgres' ||
    backend === 'postgresql' ||
    backend === 'supabase' ||
    backend === 'docker'
  );
}

export function resolveServerStorageBackend() {
  const backend = String(process.env.STORAGE_BACKEND || 'docker').trim().toLowerCase();
  if (backend === 'supabase') return 'supabase';
  return 'docker';
}

function resolveSupabaseProjectRef(url) {
  const fromEnv = String(process.env.SUPABASE_PROJECT_REF || process.env.SUPABASE_REF || '').trim();
  if (fromEnv) return fromEnv;
  const hostMatch = String(url || '').match(/postgres\.([a-z0-9]+):/i);
  if (hostMatch?.[1]) return hostMatch[1];
  const dashboardMatch = String(process.env.SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (dashboardMatch?.[1]) return dashboardMatch[1];
  return '';
}

export function getDatabaseUrl() {
  let url = String(process.env.DATABASE_URL || '').trim();
  // Render/Supabase: remove colchetes do placeholder [SENHA] se colados por engano.
  url = url.replace(/:(\[([^[\]]+)\])@/, ':$2@');

  // Pooler Supabase exige usuário postgres.[ref] — corrige //postgres: comum no painel.
  if (/pooler\.supabase\.com/i.test(url) && /\/\/postgres:(?!\.)/i.test(url)) {
    const ref = resolveSupabaseProjectRef(url) || 'flyeahipaobtoixscfzq';
    url = url.replace(/\/\/postgres:/i, `//postgres.${ref}:`);
  }

  return url;
}

function needsSupabaseSsl(url) {
  return /supabase\.com|pooler\.supabase/i.test(String(url || ''));
}

export function getPgPool() {
  if (!isPostgresStorageEnabled()) {
    throw new Error('STORAGE_BACKEND não é postgres');
  }
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error('DATABASE_URL não configurada');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      ssl: needsSupabaseSsl(url) ? { rejectUnauthorized: false } : undefined,
    });
    pool.on('error', (err) => {
      console.error('[storage/pg] erro no pool:', err?.message || err);
    });
  }
  return pool;
}

export async function pgQuery(text, params = []) {
  const client = getPgPool();
  return client.query(text, params);
}

/** Garante UTF-8 na sessão Postgres (acentos em jsonb). */
export async function ensurePgUtf8() {
  if (!isPostgresStorageEnabled()) return;
  await pgQuery("SET client_encoding TO 'UTF8'");
}

export async function pgHealth() {
  if (!isPostgresStorageEnabled()) {
    return { ok: false, enabled: false, detail: 'STORAGE_BACKEND != postgres' };
  }
  try {
    const r = await pgQuery('SELECT 1 AS ok');
    return { ok: r.rows?.[0]?.ok === 1, enabled: true, detail: 'postgres ok' };
  } catch (err) {
    return {
      ok: false,
      enabled: true,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function closePgPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
