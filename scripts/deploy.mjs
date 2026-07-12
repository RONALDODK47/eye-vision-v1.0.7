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

function runSilent(cmd, args) {
  const useShell = process.platform === 'win32' && typeof cmd === 'string' && (cmd.endsWith('.cmd') || cmd.endsWith('.bat'));
  const result = spawnSync(cmd, args, {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'ignore',
    shell: useShell,
    windowsHide: false,
  });
  return (result.status ?? 1) === 0;
}

function runOutput(cmd, args) {
  const useShell = process.platform === 'win32' && typeof cmd === 'string' && (cmd.endsWith('.cmd') || cmd.endsWith('.bat'));
  const result = spawnSync(cmd, args, {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: useShell,
    windowsHide: false,
  });
  return result.stdout ? result.stdout.toString().trim() : '';
}

function hasVercelLogin() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return runSilent(npx, ['vercel', 'whoami']);
}

function deployWithVercel(token) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['vercel', 'deploy', '--prebuilt', '--prod', '--yes'];
  if (token) args.push('--token', token);
  run('Vercel (produção)', npx, args);
}

function getGitBranch() {
  return runOutput('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
}

function isGitRepo() {
  return runSilent('git', ['rev-parse', '--is-inside-work-tree']);
}

function isGitClean() {
  return runSilent('git', ['diff', '--quiet']) && runSilent('git', ['diff', '--cached', '--quiet']);
}

function hasGitRemoteOrigin() {
  return runSilent('git', ['ls-remote', '--exit-code', 'origin', 'HEAD']);
}

function pushGitAutoDeploy() {
  if (!isGitRepo()) return false;
  if (!isGitClean()) {
    console.info('[deploy] Git working tree não está limpo — não farei push automático.');
    return false;
  }
  if (!hasGitRemoteOrigin()) {
    console.info('[deploy] Git origin não configurado — não farei push automático.');
    return false;
  }
  const branch = getGitBranch() || 'main';
  run('Git push para origem', 'git', ['push', 'origin', `${branch}:${branch}`]);
  return true;
}

function runRenderHook(renderHookUrl) {
  if (!renderHookUrl) return false;
  const payload = JSON.stringify({});
  const script = `
    import { request } from 'node:http';
    import { request as requestHttps } from 'node:https';
    const url = new URL(${JSON.stringify(renderHookUrl)});
    const client = url.protocol === 'https:' ? requestHttps : request;
    const req = client(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(${JSON.stringify(payload)}) } }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) process.exit(0);
      console.error('Render hook falhou:', res.statusCode);
      process.exit(1);
    });
    req.on('error', (err) => { console.error('Render hook erro:', err.message); process.exit(1); });
    req.write(${JSON.stringify(payload)});
    req.end();
  `;
  run('Render deploy hook', process.execPath, ['-e', script]);
  return true;
}

console.info('[deploy] Eye Vision — produção (Supabase + Vercel + GitHub)\n');

run('Schema + validação Supabase', process.execPath, ['scripts/production-setup.mjs']);
run('Build frontend', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);

const vercelToken = String(process.env.VERCEL_TOKEN || '').trim();
if (vercelToken) {
  deployWithVercel(vercelToken);
} else if (hasVercelLogin()) {
  deployWithVercel();
} else {
  console.info('\n[deploy] VERCEL_TOKEN não definido e usuário Vercel CLI não logado — pulando Vercel CLI.');
  console.info('  Opções:');
  console.info('  • Adicione VERCEL_TOKEN no .env.production e rode npm run deploy de novo');
  console.info('  • Ou conecte o repo no painel Vercel (deploy automático no git push)');
  console.info('  • Ou rode: npx vercel login && npm run deploy\n');
}

const renderHook = String(process.env.RENDER_DEPLOY_HOOK_URL || process.env.RENDER_DEPLOY_HOOK || '').trim();
if (renderHook) {
  runRenderHook(renderHook);
} else {
  console.info('[deploy] RENDER_DEPLOY_HOOK_URL não definido — o deploy do backend pelo Render deve ser feito via painel ou git push.');
}

console.info('[deploy] Backend (Render): conecte o repo ou use render.yaml no painel Render.');
console.info('  Start: node scripts/agent-api-server.mjs');
console.info('  Health: /health\n');
console.info('[deploy] Concluído.\n');
