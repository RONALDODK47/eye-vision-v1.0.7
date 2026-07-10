/**
 * Pool PostgreSQL — só no servidor (agent-api).
 */
import pg from 'pg';

const { Pool } = pg;

/** @type {import('pg').Pool | null} */
let pool = null;

export function isPostgresStorageEnabled() {
  const backend = String(process.env.STORAGE_BACKEND || '').trim().toLowerCase();
  return backend === 'postgres' || backend === 'postgresql';
}

export function getDatabaseUrl() {
  return String(process.env.DATABASE_URL || '').trim();
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
