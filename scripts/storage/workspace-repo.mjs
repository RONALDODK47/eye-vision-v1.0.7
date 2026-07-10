/**
 * Repositório workspace — tudo filtrado por office_token.
 */
import { randomUUID } from 'crypto';
import { pgQuery } from './pg-client.mjs';
import {
  buildExtratoPdfKey,
  deleteObject,
  getObjectBuffer,
  putObject,
  isMinioEnabled,
} from './minio-client.mjs';
import { guardOfficePayload } from './office-registry-guard.mjs';

function nowIso() {
  return new Date().toISOString();
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

export async function ensureOfficeRow(officeToken, uid = '') {
  const token = String(officeToken || '').trim();
  if (!token) throw new Error('office_token obrigatório');
  await pgQuery(
    `INSERT INTO offices (office_token, updated_at, updated_by)
     VALUES ($1, NOW(), $2)
     ON CONFLICT (office_token) DO NOTHING`,
    [token, String(uid || '')],
  );
  await pgQuery(
    `INSERT INTO access_tokens (token, label, active)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (token) DO NOTHING`,
    [token, token],
  );
  return token;
}

export async function getOffice(officeToken) {
  const token = String(officeToken || '').trim();
  if (!token) return null;
  const r = await pgQuery(`SELECT * FROM offices WHERE office_token = $1`, [token]);
  const row = r.rows[0];
  if (!row) return null;
  return {
    office_token: row.office_token,
    name: row.name || '',
    companies_registry: asArray(row.companies_registry),
    selected_company: row.selected_company || '',
    pricing_companies_registry: asArray(row.pricing_companies_registry),
    pricing_selected_company: row.pricing_selected_company || '',
    simulador_contracts: asArray(row.simulador_contracts),
    simulador_parcelamentos: asArray(row.simulador_parcelamentos),
    simulador_aplicacoes: asArray(row.simulador_aplicacoes),
    simulador_precificacao: asArray(row.simulador_precificacao),
    extra_storage: asObject(row.extra_storage),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso(),
    updated_by: row.updated_by || '',
  };
}

export async function setOffice(officeToken, payload, uid = '') {
  const token = await ensureOfficeRow(officeToken, uid);
  const existing = await getOffice(token);
  const managers = await listManagerByOffice(token);
  const p = guardOfficePayload(payload && typeof payload === 'object' ? payload : {}, existing, managers);
  const updated_at = nowIso();
  await pgQuery(
    `INSERT INTO offices (
       office_token, name, companies_registry, selected_company,
       pricing_companies_registry, pricing_selected_company,
       simulador_contracts, simulador_parcelamentos, simulador_aplicacoes, simulador_precificacao,
       extra_storage, updated_at, updated_by
     ) VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,NOW(),$12)
     ON CONFLICT (office_token) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, offices.name),
       companies_registry = EXCLUDED.companies_registry,
       selected_company = EXCLUDED.selected_company,
       pricing_companies_registry = EXCLUDED.pricing_companies_registry,
       pricing_selected_company = EXCLUDED.pricing_selected_company,
       simulador_contracts = EXCLUDED.simulador_contracts,
       simulador_parcelamentos = EXCLUDED.simulador_parcelamentos,
       simulador_aplicacoes = EXCLUDED.simulador_aplicacoes,
       simulador_precificacao = EXCLUDED.simulador_precificacao,
       extra_storage = EXCLUDED.extra_storage,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by`,
    [
      token,
      String(p.name || ''),
      JSON.stringify(asArray(p.companies_registry)),
      String(p.selected_company || ''),
      JSON.stringify(asArray(p.pricing_companies_registry)),
      String(p.pricing_selected_company || ''),
      JSON.stringify(asArray(p.simulador_contracts)),
      JSON.stringify(asArray(p.simulador_parcelamentos)),
      JSON.stringify(asArray(p.simulador_aplicacoes)),
      JSON.stringify(asArray(p.simulador_precificacao)),
      JSON.stringify(asObject(p.extra_storage)),
      String(uid || ''),
    ],
  );
  return { updated_at };
}

export async function setManager(officeToken, companySlug, payload, uid = '') {
  const token = await ensureOfficeRow(officeToken, uid);
  const slug = String(companySlug || '').trim();
  if (!slug) throw new Error('company_slug obrigatório');
  const p = payload && typeof payload === 'object' ? payload : {};
  const data = p.data && typeof p.data === 'object' ? p.data : {};
  const companyName = String(p.company_name || '');
  const updated_at = nowIso();

  for (const [suffix, rows] of Object.entries(data)) {
    if (!suffix) continue;
    await pgQuery(
      `INSERT INTO company_manager_data
         (office_token, company_slug, company_name, suffix, data, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
       ON CONFLICT (office_token, company_slug, suffix) DO UPDATE SET
         company_name = EXCLUDED.company_name,
         data = EXCLUDED.data,
         updated_at = NOW()`,
      [token, slug, companyName, String(suffix), JSON.stringify(asArray(rows))],
    );
  }
  // Touch office updated_at so hydrate detects newer cloud
  await pgQuery(`UPDATE offices SET updated_at = NOW(), updated_by = $2 WHERE office_token = $1`, [
    token,
    String(uid || ''),
  ]);
  return { updated_at };
}

export async function deleteManager(officeToken, companySlug, uid = '') {
  const token = String(officeToken || '').trim();
  const slug = String(companySlug || '').trim();
  if (!token || !slug) return { updated_at: nowIso(), removed: 0 };
  const r = await pgQuery(
    `DELETE FROM company_manager_data WHERE office_token = $1 AND company_slug = $2`,
    [token, slug],
  );
  await pgQuery(`UPDATE offices SET updated_at = NOW(), updated_by = $2 WHERE office_token = $1`, [
    token,
    String(uid || ''),
  ]);
  return { updated_at: nowIso(), removed: r.rowCount ?? 0 };
}

export async function listManagerByOffice(officeToken) {
  const token = String(officeToken || '').trim();
  if (!token) return [];
  const r = await pgQuery(
    `SELECT office_token, company_slug, company_name, suffix, data, updated_at
     FROM company_manager_data
     WHERE office_token = $1
     ORDER BY company_slug, suffix`,
    [token],
  );
  /** @type {Map<string, { office_token: string, company_slug: string, company_name: string, data: Record<string, unknown[]>, updated_at: string }>} */
  const bySlug = new Map();
  for (const row of r.rows) {
    const slug = String(row.company_slug || '');
    let cur = bySlug.get(slug);
    if (!cur) {
      cur = {
        office_token: token,
        company_slug: slug,
        company_name: String(row.company_name || ''),
        data: {},
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso(),
      };
      bySlug.set(slug, cur);
    }
    cur.data[String(row.suffix)] = asArray(row.data);
    if (row.company_name) cur.company_name = String(row.company_name);
    const ts = row.updated_at ? new Date(row.updated_at).toISOString() : cur.updated_at;
    if (ts > cur.updated_at) cur.updated_at = ts;
  }
  return [...bySlug.values()].sort((a, b) =>
    a.company_slug.localeCompare(b.company_slug, 'pt-BR'),
  );
}

function mapPastaRow(row) {
  return {
    id: String(row.id),
    contaBanco: String(row.conta_banco || ''),
    bancoNome: String(row.banco_nome || ''),
    label: String(row.label || 'Extrato'),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : nowIso(),
    saldoAnterior: Number(row.saldo_anterior) || 0,
    total: Number(row.total) || 0,
    conciliadas: Number(row.conciliadas) || 0,
    pendentes: Number(row.pendentes) || 0,
    rows: asArray(row.rows),
    pdfObjectKey: row.pdf_object_key || undefined,
    pdfFilename: row.pdf_filename || undefined,
  };
}

export async function listExtratoPastas(officeToken, companySlug) {
  const token = String(officeToken || '').trim();
  const slug = String(companySlug || '').trim();
  if (!token || !slug) return [];
  const r = await pgQuery(
    `SELECT * FROM extrato_pastas
     WHERE office_token = $1 AND company_slug = $2
     ORDER BY created_at DESC`,
    [token, slug],
  );
  return r.rows.map(mapPastaRow);
}

export async function getExtratoPasta(officeToken, id) {
  const token = String(officeToken || '').trim();
  const pastaId = String(id || '').trim();
  if (!token || !pastaId) return null;
  const r = await pgQuery(
    `SELECT * FROM extrato_pastas WHERE office_token = $1 AND id = $2::uuid`,
    [token, pastaId],
  );
  return r.rows[0] ? mapPastaRow(r.rows[0]) : null;
}

/**
 * @param {string} officeToken
 * @param {string} companySlug
 * @param {object} input
 */
export async function saveExtratoPasta(officeToken, companySlug, input) {
  const token = await ensureOfficeRow(officeToken);
  const slug = String(companySlug || '').trim();
  if (!slug) throw new Error('company_slug obrigatório');

  const id = String(input.id || randomUUID());
  const rows = asArray(input.rows);
  const contaBanco = String(input.contaBanco || '').trim();
  if (!contaBanco) throw new Error('contaBanco obrigatório');
  if (!rows.length) throw new Error('Nenhum lançamento');

  let pdfObjectKey = input.pdfObjectKey ? String(input.pdfObjectKey) : null;
  const pdfFilename = input.pdfFilename ? String(input.pdfFilename) : null;

  if (input.pdfBase64 && isMinioEnabled()) {
    const buf = Buffer.from(String(input.pdfBase64), 'base64');
    pdfObjectKey = buildExtratoPdfKey(token, slug, id);
    await putObject(pdfObjectKey, buf, 'application/pdf');
  }

  const conciliadas = rows.filter(
    (r) => Boolean(r?.accountDebit?.trim?.()) && Boolean(r?.accountCredit?.trim?.()),
  ).length;

  await pgQuery(
    `INSERT INTO extrato_pastas (
       id, office_token, company_slug, conta_banco, banco_nome, label,
       saldo_anterior, total, conciliadas, pendentes, rows, pdf_object_key, pdf_filename, created_at
     ) VALUES (
       $1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,COALESCE($14::timestamptz, NOW())
     )
     ON CONFLICT (id) DO UPDATE SET
       conta_banco = EXCLUDED.conta_banco,
       banco_nome = EXCLUDED.banco_nome,
       label = EXCLUDED.label,
       saldo_anterior = EXCLUDED.saldo_anterior,
       total = EXCLUDED.total,
       conciliadas = EXCLUDED.conciliadas,
       pendentes = EXCLUDED.pendentes,
       rows = EXCLUDED.rows,
       pdf_object_key = COALESCE(EXCLUDED.pdf_object_key, extrato_pastas.pdf_object_key),
       pdf_filename = COALESCE(EXCLUDED.pdf_filename, extrato_pastas.pdf_filename)`,
    [
      id,
      token,
      slug,
      contaBanco,
      String(input.bancoNome || `Banco ${contaBanco}`),
      String(input.label || 'Extrato'),
      Number(input.saldoAnterior) || 0,
      rows.length,
      conciliadas,
      rows.length - conciliadas,
      JSON.stringify(rows),
      pdfObjectKey,
      pdfFilename,
      input.createdAt || null,
    ],
  );

  return getExtratoPasta(token, id);
}

export async function removeExtratoPasta(officeToken, id) {
  const token = String(officeToken || '').trim();
  const pastaId = String(id || '').trim();
  if (!token || !pastaId) return false;
  const existing = await getExtratoPasta(token, pastaId);
  if (!existing) return false;
  if (existing.pdfObjectKey) {
    await deleteObject(existing.pdfObjectKey);
  }
  await pgQuery(`DELETE FROM extrato_pastas WHERE office_token = $1 AND id = $2::uuid`, [
    token,
    pastaId,
  ]);
  return true;
}

export async function getExtratoPastaPdfBuffer(officeToken, id) {
  const pasta = await getExtratoPasta(officeToken, id);
  if (!pasta?.pdfObjectKey) return null;
  return getObjectBuffer(pasta.pdfObjectKey);
}

/**
 * Import one-shot: office payload + managers + pastas (com pdfBase64 opcional).
 */
export async function migrateFromLocal(officeToken, body, uid = '') {
  const token = await ensureOfficeRow(officeToken, uid);
  if (body?.office) {
    await setOffice(token, body.office, uid);
  }
  const managers = asArray(body?.managers);
  for (const m of managers) {
    const slug = String(m.company_slug || '').trim();
    if (!slug) continue;
    await setManager(token, slug, m, uid);
  }
  const pastas = asArray(body?.extratoPastas);
  for (const p of pastas) {
    const slug = String(p.companySlug || p.company_slug || '').trim();
    if (!slug) continue;
    await saveExtratoPasta(token, slug, p);
  }
  return { ok: true, office_token: token, updated_at: nowIso() };
}
