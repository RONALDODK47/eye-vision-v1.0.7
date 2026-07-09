/**
 * Textos longos + store completo da inteligência da IA — IndexedDB.
 */
const DB_NAME = 'eye-vision-ai-inteligencia';
const DB_VERSION = 2;
const STORE_TEXTS = 'doc_texts';
const STORE_META = 'stores';

type DocTextRow = {
  id: string;
  companySlug: string;
  texto: string;
};

type StoreRow = {
  companySlug: string;
  payload: string;
  updatedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TEXTS)) {
        const store = db.createObjectStore(STORE_TEXTS, { keyPath: 'id' });
        store.createIndex('companySlug', 'companySlug', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'companySlug' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export async function idbPutDocText(
  companySlug: string,
  docId: string,
  texto: string,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_TEXTS, 'readwrite');
    tx.objectStore(STORE_TEXTS).put({
      id: `${companySlug}::${docId}`,
      companySlug,
      texto,
    } satisfies DocTextRow);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('idb put failed'));
  });
  db.close();
}

export async function idbGetDocText(companySlug: string, docId: string): Promise<string> {
  if (typeof indexedDB === 'undefined') return '';
  const db = await openDb();
  const row = await new Promise<DocTextRow | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_TEXTS, 'readonly');
    const req = tx.objectStore(STORE_TEXTS).get(`${companySlug}::${docId}`);
    req.onsuccess = () => resolve(req.result as DocTextRow | undefined);
    req.onerror = () => reject(req.error ?? new Error('idb get failed'));
  });
  db.close();
  return row?.texto ?? '';
}

export async function idbGetAllDocTexts(
  companySlug: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (typeof indexedDB === 'undefined') return map;
  const db = await openDb();
  const rows = await new Promise<DocTextRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE_TEXTS, 'readonly');
    const idx = tx.objectStore(STORE_TEXTS).index('companySlug');
    const req = idx.getAll(companySlug);
    req.onsuccess = () => resolve((req.result as DocTextRow[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('idb getAll failed'));
  });
  db.close();
  for (const r of rows) {
    const docId = r.id.includes('::') ? r.id.split('::').slice(1).join('::') : r.id;
    map.set(docId, r.texto);
  }
  return map;
}

export async function idbExportAllDocTexts(): Promise<
  Array<{ companySlug: string; docId: string; texto: string }>
> {
  const out: Array<{ companySlug: string; docId: string; texto: string }> = [];
  if (typeof indexedDB === 'undefined') return out;
  const db = await openDb();
  const rows = await new Promise<DocTextRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE_TEXTS, 'readonly');
    const req = tx.objectStore(STORE_TEXTS).getAll();
    req.onsuccess = () => resolve((req.result as DocTextRow[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('idb export failed'));
  });
  db.close();
  for (const r of rows) {
    const docId = r.id.includes('::') ? r.id.split('::').slice(1).join('::') : r.id;
    out.push({ companySlug: r.companySlug, docId, texto: r.texto });
  }
  return out;
}

export async function idbDeleteDocText(companySlug: string, docId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_TEXTS, 'readwrite');
    tx.objectStore(STORE_TEXTS).delete(`${companySlug}::${docId}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('idb delete failed'));
  });
  db.close();
}

/** Grava o store completo (lista de docs) no IndexedDB — fonte confiável. */
export async function idbPutInteligenciaStore(
  companySlug: string,
  payloadJson: string,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({
      companySlug,
      payload: payloadJson,
      updatedAt: new Date().toISOString(),
    } satisfies StoreRow);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('idb store put failed'));
  });
  db.close();
}

export async function idbGetInteligenciaStore(companySlug: string): Promise<string | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDb();
  const row = await new Promise<StoreRow | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(companySlug);
    req.onsuccess = () => resolve(req.result as StoreRow | undefined);
    req.onerror = () => reject(req.error ?? new Error('idb store get failed'));
  });
  db.close();
  return row?.payload ?? null;
}

/** Exporta todos os stores de inteligência (lista de docs por empresa). */
export async function idbExportAllInteligenciaStores(): Promise<
  Array<{ companySlug: string; payload: string; updatedAt: string }>
> {
  const out: Array<{ companySlug: string; payload: string; updatedAt: string }> = [];
  if (typeof indexedDB === 'undefined') return out;
  const db = await openDb();
  const rows = await new Promise<StoreRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).getAll();
    req.onsuccess = () => resolve((req.result as StoreRow[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('idb stores export failed'));
  });
  db.close();
  for (const r of rows) {
    if (r?.companySlug && r.payload) {
      out.push({ companySlug: r.companySlug, payload: r.payload, updatedAt: r.updatedAt || '' });
    }
  }
  return out;
}
