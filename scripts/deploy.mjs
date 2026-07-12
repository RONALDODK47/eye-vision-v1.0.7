/**
 * Deploy Eye Vision — Supabase (schema) + build + Vercel (frontend) + push GitHub.
 *
 * Pré-requisitos:
 * 1. Arquivo .env.production com DATABASE_URL (Supabase), GEMINI_API_KEY, MINIO_S3_*, CORS_ALLOWED_ORIGIN
 * 2. VITE_AGENT_API_URL e VITE_STORAGE_BACKEND=supabase (build do frontend)
 * 3. VERCEL_TOKEN (opcional) ou `vercel login` feito antes
 *
 * Uso: npm run deploy
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.NODE_ENV = 'production';

const envProduction = path.join(root, '.env.production');
if (!fs.existsSync(envProduction)) {
  console.error('\n[deploy] Falta .env.production');
  console.error('  Copie .env.production.example → .env.production e preencha Supabase + Render + Vercel.');
  console.error('  Guia: docs/deploy-vercel-render-supabase.md\n');
  process.exit(1);
}

function run(label, cmd, args, extraEnv = {}) {
  console.info(`\n[deploy] ${label}…`);
  const useShell =
    process.platform === 'win32' &&
    typeof cmd === 'string' &&
    (cmd.endsWith('.cmd') || cmd.endsWith('.bat'));
  const result = spawnSync(cmd, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv, NODE_ENV: 'production', PRODUCTION_CHECK: '1' },
    stdio: 'inherit',
    shell: useShell,
    windowsHide: false,
  });
  if ((result.status ?? 1) !== 0) {
    console.error(`\n[deploy] Falhou: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.info('[deploy] Eye Vision — produção (Supabase + Vercel + GitHub)\n');

run('Schema + validação Supabase', process.execPath, ['scripts/production-setup.mjs']);
run('Build frontend', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);

const vercelToken = String(process.env.VERCEL_TOKEN || '').trim();
if (vercelToken) {
  run('Vercel (produção)', process.platform === 'win32' ? 'npx.cmd' : 'npx', [
    'vercel',
    'deploy',
    '--prebuilt',
    '--prod',
    '--yes',
    '--token',
    vercelToken,
  ]);
} else {
  console.info('\n[deploy] VERCEL_TOKEN não definido — pulando Vercel CLI.');
  console.info('  Opções:');
  console.info('  • Adicione VERCEL_TOKEN no .env.production e rode npm run deploy de novo');
  console.info('  • Ou conecte o repo no painel Vercel (deploy automático no git push)');
  console.info('  • Ou rode: npx vercel login && npx vercel deploy --prod\n');
}

console.info('[deploy] Backend (Render): conecte o repo ou use render.yaml no painel Render.');
console.info('  Start: node scripts/agent-api-server.mjs');
console.info('  Health: /health\n');
console.info('[deploy] Concluído.\n');
