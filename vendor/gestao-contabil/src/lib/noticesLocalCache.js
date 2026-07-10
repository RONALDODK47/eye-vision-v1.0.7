const STORAGE_KEY = "gestao_notices_cache_v1";

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw?.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota localStorage */
  }
}

export function readNoticesCache(cacheKey) {
  const key = String(cacheKey || "").trim();
  if (!key) return null;
  const entry = readStore()[key];
  if (!entry || !Array.isArray(entry.rows)) return null;
  return entry;
}

export function writeNoticesCache(cacheKey, rows) {
  const key = String(cacheKey || "").trim();
  if (!key || !Array.isArray(rows)) return;
  const store = readStore();
  store[key] = {
    rows,
    fetchedAt: new Date().toISOString(),
  };
  writeStore(store);
}

export function patchNoticesCache(cacheKey, rows) {
  writeNoticesCache(cacheKey, rows);
}
