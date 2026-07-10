/**
 * Desenvolvimento — API fiscal (:8780) + agent-api (:8790, Postgres/MinIO) + Vite (:3000) + doc-downloader (:8766).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { freeDevPorts } from './free-dev-ports.mjs';
import './load-env.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fiscalScript = path.join(root, 'scripts', 'fiscal-nfe-api.mjs');
const agentApiScript = path.join(root, 'scripts', 'agent-api-server.mjs');
const docDownloaderScript = path.join(root, 'scripts', 'start-doc-downloader.mjs');
const docVenvPython =
  process.platform === 'win32'
    ? path.join(root, 'doc_downloader', '.venv', 'Scripts', 'python.exe')
    : path.join(root, 'doc_downloader', '.venv', 'bin', 'python');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

freeDevPorts();
await delay(400);

const log = (msg) => console.info(`\x1b[36m[dev]\x1b[0m ${msg}`);
const spawnOpts = { cwd: root, stdio: 'inherit', windowsHide: false };

log('Iniciando API fiscal :8780…');
const fiscal = spawn(process.execPath, [fiscalScript], spawnOpts);

log('Iniciando agent-api :8790 (Postgres/MinIO)…');
const agentApi = existsSync(agentApiScript)
  ? spawn(process.execPath, [agentApiScript], spawnOpts)
  : null;

const vite = existsSync(viteBin)
  ? spawn(process.execPath, [viteBin], spawnOpts)
  : null;

if (!vite) {
  console.error('[dev] Vite não encontrado — rode npm install');
  process.exit(1);
}

log('Interface Vite — http://localhost:3000');

const docDownloader = existsSync(docVenvPython)
  ? spawn(process.execPath, [docDownloaderScript], { cwd: root, stdio: 'inherit' })
  : null;

let exiting = false;

function shutdown(code = 0) {
  if (exiting) return;
  exiting = true;
  for (const proc of [fiscal, agentApi, vite, docDownloader].filter(Boolean)) {
    try {
      if (process.platform === 'win32' && proc.pid) {
        spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } else {
        proc.kill('SIGTERM');
      }
    } catch {
      /* ok */
    }
  }
  setTimeout(() => process.exit(code), 400).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function onChildExit(name, code) {
  if (!exiting) {
    console.error(`[dev] ${name} encerrou (código ${code ?? '?'}). Parando os demais…`);
    shutdown(code ?? 1);
  }
}

fiscal.on('exit', (code) => onChildExit('API fiscal', code));
if (agentApi) {
  // agent-api offline não derruba o Vite (Gemini/IA ainda pode falhar), mas avisa.
  agentApi.on('exit', (code) => {
    if (!exiting) {
      console.error(
        `[dev] agent-api encerrou (código ${code ?? '?'}). Workspace Postgres fica indisponível até reiniciar.`,
      );
    }
  });
}
vite.on('exit', (code) => {
  if (!exiting) shutdown(code ?? 0);
});
if (docDownloader) {
  docDownloader.on('exit', (code) => onChildExit('Doc Downloader', code));
}
