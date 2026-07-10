/**
 * Impede que o office no Postgres perca empresas por push acidental (ex.: só TECHNOVA).
 */
import { randomUUID } from 'node:crypto';

const DEMO_SLUG = 'TECHNOVA_INDUSTRIA_LTDA';

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

export function normalizeCompanyName(name) {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function isDemoTechnovaCompany(name) {
  const n = normalizeCompanyName(name);
  if (!n) return false;
  if (n === 'TECHNOVA INDÚSTRIA LTDA' || n === 'TECHNOVA INDUSTRIA LTDA') return true;
  return n.includes('TECHNOVA') && n.includes('INDUSTRIA');
}

export function mergeCompaniesRegistryLists(...lists) {
  const byName = new Map();
  for (const list of lists) {
    for (const item of asArray(list)) {
      const name = normalizeCompanyName(item?.name);
      if (!name || isDemoTechnovaCompany(name)) continue;
      if (!byName.has(name)) {
        byName.set(name, {
          id: String(item?.id || randomUUID()),
          name,
          createdAt: String(item?.createdAt || new Date().toISOString()),
        });
      }
    }
  }
  return Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
  );
}

function managerRowHasData(row) {
  const data = row?.data;
  if (!data || typeof data !== 'object') return false;
  return Object.values(data).some((v) => Array.isArray(v) && v.length > 0);
}

function companiesFromManagers(managers) {
  const out = [];
  for (const row of asArray(managers)) {
    const slug = String(row?.company_slug || '').trim();
    if (!slug || slug === DEMO_SLUG || !managerRowHasData(row)) continue;
    const name = normalizeCompanyName(row?.company_name || slug.replace(/_/g, ' '));
    if (!name || isDemoTechnovaCompany(name)) continue;
    out.push({ id: randomUUID(), name, createdAt: new Date().toISOString() });
  }
  return out;
}

function pickSelectedCompany(selected, registry) {
  const sel = normalizeCompanyName(selected);
  if (sel && !isDemoTechnovaCompany(sel) && registry.some((c) => normalizeCompanyName(c.name) === sel)) {
    return registry.find((c) => normalizeCompanyName(c.name) === sel)?.name || sel;
  }
  return registry[0]?.name || '';
}

/**
 * Mescla payload recebido com office existente + managers com dados.
 * Nunca reduz o número de empresas reais.
 */
export function guardOfficePayload(incoming, existingOffice, managers) {
  const p = incoming && typeof incoming === 'object' ? incoming : {};
  const existingRegistry = mergeCompaniesRegistryLists(asArray(existingOffice?.companies_registry));
  const incomingRegistry = mergeCompaniesRegistryLists(asArray(p.companies_registry));
  const fromManagers = companiesFromManagers(managers);

  let registry;
  if (incomingRegistry.length < existingRegistry.length && incomingRegistry.length <= 1) {
    registry = mergeCompaniesRegistryLists(existingRegistry, incomingRegistry, fromManagers);
  } else {
    registry = mergeCompaniesRegistryLists(incomingRegistry, existingRegistry, fromManagers);
  }

  const selected = pickSelectedCompany(
    p.selected_company || existingOffice?.selected_company,
    registry,
  );

  return {
    ...p,
    companies_registry: registry,
    selected_company: selected,
  };
}
