/**
 * Aplica schema SQL multi-tenant (office_token).
 * Uso: npm run storage:migrate
 */
import '../load-env.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { closePgPool, getDatabaseUrl, isPostgresStorageEnabled, pgQuery } from './pg-client.mjs';
import { ensureMinioBucket, isMinioEnabled } from './minio-client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  if (!isPostgresStorageEnabled()) {
    console.error('[storage:migrate] Defina STORAGE_BACKEND=postgres no .env');
    process.exit(1);
  }
  if (!getDatabaseUrl()) {
    console.error('[storage:migrate] Defina DATABASE_URL no .env');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.info('[storage:migrate] Aplicando schema…');
  await pgQuery(sql);
  console.info('[storage:migrate] Schema OK');

  if (isMinioEnabled()) {
    await ensureMinioBucket();
    console.info('[storage:migrate] Bucket MinIO OK');
  } else {
    console.warn('[storage:migrate] MinIO não configurado — PDFs ficarão só no Postgres (sem blob).');
  }

  await closePgPool();
}

main().catch(async (err) => {
  console.error('[storage:migrate] Falha:', err?.message || err);
  try {
    await closePgPool();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
