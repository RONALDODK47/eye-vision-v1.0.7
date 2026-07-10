/**
 * Rotas /agent/workspace/* — persistência por office_token (PostgreSQL + MinIO).
 */
import { isPostgresStorageEnabled, pgHealth, ensurePgUtf8 } from './pg-client.mjs';
import { minioHealth } from './minio-client.mjs';
import * as repo from './workspace-repo.mjs';

function readOfficeToken(req) {
  const header = String(req.headers['x-office-token'] || '').trim();
  if (header) return header;
  const auth = String(req.headers.authorization || '').trim();
  if (/^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, '').trim();
  }
  const q = req.query?.officeToken || req.query?.token;
  if (q) return String(q).trim();
  if (req.body?.officeToken) return String(req.body.officeToken).trim();
  return '';
}

function requireToken(req, res) {
  const token = readOfficeToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'X-Office-Token obrigatório' });
    return null;
  }
  return token;
}

function requirePostgres(res) {
  if (!isPostgresStorageEnabled()) {
    res.status(503).json({
      ok: false,
      error: 'STORAGE_BACKEND não é postgres — defina no .env e rode npm run storage:setup',
    });
    return false;
  }
  return true;
}

export function registerWorkspaceRoutes(app) {
  void ensurePgUtf8().catch(() => {});

  app.get('/agent/workspace/health', async (_req, res) => {
    const pg = await pgHealth();
    const minio = await minioHealth();
    res.status(pg.ok ? 200 : 503).json({
      ok: pg.ok,
      storageBackend: process.env.STORAGE_BACKEND || 'local',
      postgres: pg,
      minio,
    });
  });

  app.get('/agent/workspace/office', async (req, res) => {
    if (!requirePostgres(res)) return;
    const token = requireToken(req, res);
    if (!token) return;
    try {
      const office = await repo.getOffice(token);
      res.json({ ok: true, office });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put('/agent/workspace/office', async (req, res) => {
    if (!requirePostgres(res)) return;
    const token = requireToken(req, res);
    if (!token) return;
    try {
      const uid = String(req.body?.uid || req.headers['x-user-id'] || '').trim();
      const payload = req.body?.payload ?? req.body ?? {};
      const result = await repo.setOffice(token, payload, uid);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/agent/workspace/manager', async (req, res) => {
    if (!requirePostgres(res)) return;
    const token = requireToken(req, res);
    if (!token) return;
    try {
      const managers = await repo.listManagerByOffice(token);
      res.json({ ok: true, managers });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put('/agent/workspace/manager/:slug', async (req, res) => {
    if (!requirePostgres(res)) return;
    const token = requireToken(req, res);
    if (!token) return;
    try {
      const slug = String(req.params.slug || '').trim();
      const uid = String(req.body?.uid || req.headers['x-user-id'] || '').trim();
      const payload = req.body?.payload ?? req.body ?? {};
      const result = await repo.setManager(token, slug, payload, uid);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/agent/workspace/manager/:slug', async (req, res) => {
    if (!requirePostgres(res)) return;
    const token = requireToken(req, res);
    if (!token) return;
    try {
      const slug = String(req.params.slug || '').trim();
      const uid = String(req.body?.uid || req.headers['x-user-id'] || '').trim();
      const result = await repo.deleteManager(token, slug, uid);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/agent/workspace/extrato-pastas', async (req, res) => {
    if (!requirePostgres(res)) return;
    const token = requireToken(req, res);
    if (!token) return;
    try {
      const companySlug = String(req.query.companySlug || req.query.slug || '').trim();
      if (!companySlug) {
        res.status(400).json({ ok: false, error: 'companySlug obrigatório' });
        return;
      }
      const items = await repo.listExtratoPastas(token, companySlug);
      res.json({ ok: true, items });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/agent/workspace/extrato-pastas', async (req, res) => {
    if (!requirePostgres(res)) return;
    const token = requireToken(req, res);
    if (!token) return;
    try {
      const companySlug = String(req.body?.companySlug || '').trim();
      const item = await repo.saveExtratoPasta(token, companySlug, req.body || {});
      res.status(201).json({ ok: true, item });
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/agent/workspace/extrato-pastas/:id', async (req, res) => {
    if (!requirePostgres(res)) return;
    const token = requireToken(req, res);
    if (!token) return;
    try {
      const removed = await repo.removeExtratoPasta(token, req.params.id);
      res.json({ ok: true, removed });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/agent/workspace/extrato-pastas/:id/pdf', async (req, res) => {
    if (!requirePostgres(res)) return;
    const token = requireToken(req, res);
    if (!token) return;
    try {
      const pasta = await repo.getExtratoPasta(token, req.params.id);
      if (!pasta) {
        res.status(404).json({ ok: false, error: 'Extrato não encontrado' });
        return;
      }
      const buf = await repo.getExtratoPastaPdfBuffer(token, req.params.id);
      if (!buf) {
        res.status(404).json({ ok: false, error: 'PDF não encontrado no MinIO' });
        return;
      }
      const filename = pasta.pdfFilename || `extrato_${pasta.id.slice(0, 8)}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buf);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/agent/workspace/migrate-from-local', async (req, res) => {
    if (!requirePostgres(res)) return;
    const token = requireToken(req, res);
    if (!token) return;
    try {
      const uid = String(req.body?.uid || req.headers['x-user-id'] || '').trim();
      const result = await repo.migrateFromLocal(token, req.body || {}, uid);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
