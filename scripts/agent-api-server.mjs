/**
 * Servidor dedicado do agente IA — padrão FlowMind (processo separado do Vite).
 * Porta padrão: 8790 · rotas em /agent/*
 */
import './load-env.mjs';
import express from 'express';
import { registerAgentRoutes } from './agent-api-routes.mjs';

const app = express();
const PORT = Number(process.env.AGENT_API_PORT || 8790);
const HOST = process.env.AGENT_API_HOST || '127.0.0.1';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Office-Token, X-User-Id',
  );
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

/** Workspace/pastas podem trazer PDF base64 — limite maior. */
app.use(express.json({ limit: '64mb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'agent-api-server',
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

registerAgentRoutes(app);

const server = app.listen(PORT, HOST, () => {
  console.info(`[agent-api] Servidor online — http://${HOST}:${PORT}/agent/health`);
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`[agent-api] Porta ${PORT} em uso — rode npm run dev:free-ports`);
  } else {
    console.error('[agent-api] Falha ao subir:', err?.message || err);
  }
  process.exit(1);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
