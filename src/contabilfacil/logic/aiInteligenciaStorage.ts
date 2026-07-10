/**
 * Documentos de inteligência da IA + empresas coligadas (aliases) por empresa.
 * Meta leve no localStorage; textos longos no IndexedDB (evita QuotaExceeded).
 */
import { writePersistedLocalStorageJson } from '../../lib/persistentLocalStorage';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../../lib/safeLocalStorage';
import {
  idbDeleteDocText,
  idbGetAllDocTexts,
  idbGetInteligenciaStore,
  idbPutDocText,
  idbPutInteligenciaStore,
} from '../../lib/aiInteligenciaIdb';
import { companyStorageSlug } from './companyWorkspace';
import { sanitizeCodigoReduzido, resolveCodigoReduzidoDoPlano } from './planoContasMapper';

export type AiInteligenciaPasta =
  | 'coligadas'
  | 'contratos'
  | 'balancetes'
  | 'outros';

export type AiInteligenciaDoc = {
  id: string;
  nome: string;
  pasta: AiInteligenciaPasta;
  mimeType: string;
  size: number;
  /** Texto extraído — em memória/IDB; no LS só preview curto. */
  textoExtraido: string;
  uploadedAt: string;
};

export type AiColigada = {
  id: string;
  nome: string;
  aliases: string[];
  contaReduzida?: string;
  notas?: string;
};

export type AiInteligenciaStore = {
  docs: AiInteligenciaDoc[];
  coligadas: AiColigada[];
  updatedAt: string;
};

const SUFFIX = 'ai_inteligencia_v1';
const MAX_DOCS = 40;
/** Preview no localStorage — texto completo vai para IndexedDB. */
const MAX_TEXTO_LS_PREVIEW = 400;
const MAX_TEXTO_POR_DOC = 12_000;

/** Cache em memória: companySlug → docId → texto completo */
const textCache = new Map<string, Map<string, string>>();
/** Store completo em memória — fonte da verdade na sessão */
const storeCache = new Map<string, AiInteligenciaStore>();

function storageKey(company: string): string {
  return `contabilfacil_${companyStorageSlug(company)}_${SUFFIX}`;
}

function emptyStore(): AiInteligenciaStore {
  return { docs: [], coligadas: [], updatedAt: new Date().toISOString() };
}

function getTextMap(slug: string): Map<string, string> {
  let m = textCache.get(slug);
  if (!m) {
    m = new Map();
    textCache.set(slug, m);
  }
  return m;
}

function parseStoreRaw(raw: string | null | undefined): AiInteligenciaStore | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AiInteligenciaStore>;
    const docs = Array.isArray(parsed.docs)
      ? parsed.docs.map(sanitizeDoc).filter((d): d is AiInteligenciaDoc => Boolean(d))
      : [];
    const coligadas = Array.isArray(parsed.coligadas)
      ? parsed.coligadas.map(sanitizeColigada).filter((c): c is AiColigada => Boolean(c))
      : [];
    return {
      docs,
      coligadas,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function sanitizeAliases(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of raw) {
    const s = String(a ?? '')
      .trim()
      .toUpperCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 24) break;
  }
  return out;
}

function sanitizeColigada(raw: Partial<AiColigada>): AiColigada | null {
  const nome = String(raw.nome ?? '').trim();
  if (!nome) return null;
  const aliases = sanitizeAliases(raw.aliases);
  if (aliases.length === 0) {
    aliases.push(nome.toUpperCase());
  }
  return {
    id: raw.id?.trim() || crypto.randomUUID(),
    nome,
    aliases,
    contaReduzida: String(raw.contaReduzida ?? '').trim() || undefined,
    notas: String(raw.notas ?? '').trim() || undefined,
  };
}

function sanitizeDoc(raw: Partial<AiInteligenciaDoc>): AiInteligenciaDoc | null {
  const nome = String(raw.nome ?? '').trim();
  if (!nome) return null;
  const pasta: AiInteligenciaPasta =
    raw.pasta === 'coligadas' ||
    raw.pasta === 'contratos' ||
    raw.pasta === 'balancetes' ||
    raw.pasta === 'outros'
      ? raw.pasta
      : 'outros';
  return {
    id: raw.id?.trim() || crypto.randomUUID(),
    nome,
    pasta,
    mimeType: String(raw.mimeType ?? '').trim() || 'application/octet-stream',
    size: Number(raw.size) || 0,
    textoExtraido: String(raw.textoExtraido ?? '').slice(0, MAX_TEXTO_POR_DOC),
    uploadedAt: raw.uploadedAt || new Date().toISOString(),
  };
}

/** Payload leve para localStorage (sem textos longos). */
function toLightStore(store: AiInteligenciaStore): AiInteligenciaStore {
  return {
    ...store,
    docs: store.docs.map((d) => ({
      ...d,
      textoExtraido: d.textoExtraido.slice(0, MAX_TEXTO_LS_PREVIEW),
    })),
  };
}

function applyTextCache(slug: string, store: AiInteligenciaStore): AiInteligenciaStore {
  const cache = getTextMap(slug);
  for (const d of store.docs) {
    if (d.textoExtraido.length > MAX_TEXTO_LS_PREVIEW) {
      cache.set(d.id, d.textoExtraido);
    } else if (cache.has(d.id)) {
      d.textoExtraido = cache.get(d.id)!;
    }
  }
  return store;
}

export function loadAiInteligencia(company: string): AiInteligenciaStore {
  const slug = companyStorageSlug(company);
  const cached = storeCache.get(slug);
  if (cached) {
    return applyTextCache(slug, {
      docs: cached.docs.map((d) => ({ ...d })),
      coligadas: cached.coligadas.map((c) => ({ ...c, aliases: [...c.aliases] })),
      updatedAt: cached.updatedAt,
    });
  }

  try {
    const fromLs = parseStoreRaw(safeLocalStorageGetItem(storageKey(company)));
    if (fromLs) {
      const store = applyTextCache(slug, fromLs);
      storeCache.set(slug, store);
      void hydrateFromIdb(company);
      return store;
    }
  } catch {
    /* segue para IDB */
  }

  // Sem LS — tenta IDB em background; não sobrescreve cache se já houver dados
  void hydrateFromIdb(company);
  const existing = storeCache.get(slug);
  if (existing) {
    return applyTextCache(slug, {
      docs: existing.docs.map((d) => ({ ...d })),
      coligadas: existing.coligadas.map((c) => ({ ...c, aliases: [...c.aliases] })),
      updatedAt: existing.updatedAt,
    });
  }
  const empty = emptyStore();
  storeCache.set(slug, empty);
  return empty;
}

/** Carrega store + textos do IndexedDB (fonte confiável após reload). */
async function hydrateFromIdb(company: string): Promise<void> {
  const slug = companyStorageSlug(company);
  try {
    const idbRaw = await idbGetInteligenciaStore(slug);
    const fromIdb = parseStoreRaw(idbRaw);
    const mem = storeCache.get(slug);

    if (fromIdb) {
      const memCount = mem?.docs.length ?? 0;
      const idbCount = fromIdb.docs.length;
      const useIdb =
        memCount === 0 ||
        idbCount > memCount ||
        (idbCount === memCount &&
          Date.parse(fromIdb.updatedAt) > Date.parse(mem?.updatedAt || 0));

      if (useIdb) {
        storeCache.set(slug, fromIdb);
        safeLocalStorageSetItem(storageKey(company), JSON.stringify(toLightStore(fromIdb)));
      } else if (mem && memCount > idbCount) {
        try {
          await idbPutInteligenciaStore(slug, JSON.stringify(toLightStore(mem)));
        } catch {
          /* ignore */
        }
      }
    }

    const fromTexts = await idbGetAllDocTexts(slug);
    const cache = getTextMap(slug);
    for (const [id, texto] of fromTexts) {
      cache.set(id, texto);
    }
    const store = storeCache.get(slug);
    if (store) {
      for (const d of store.docs) {
        const full = cache.get(d.id);
        if (full) d.textoExtraido = full;
      }
    }
  } catch {
    /* IDB opcional */
  }
}

async function persistTextsAndSlim(company: string, store: AiInteligenciaStore): Promise<void> {
  const slug = companyStorageSlug(company);
  const cache = getTextMap(slug);
  for (const d of store.docs) {
    const full = (cache.get(d.id) || d.textoExtraido).slice(0, MAX_TEXTO_POR_DOC);
    if (full) {
      cache.set(d.id, full);
      try {
        await idbPutDocText(slug, d.id, full);
      } catch {
        /* continua com cache */
      }
    }
  }
  try {
    await idbPutInteligenciaStore(slug, JSON.stringify(toLightStore(store)));
  } catch {
    /* ignore */
  }
  safeLocalStorageSetItem(storageKey(company), JSON.stringify(toLightStore(store)));
  void import('../logic/eyeVisionOperationalSave').then(({ scheduleEyeVisionOperationalSave }) => {
    scheduleEyeVisionOperationalSave();
  });
}

export function saveAiInteligencia(
  company: string,
  store: AiInteligenciaStore,
): AiInteligenciaStore {
  const slug = companyStorageSlug(company);
  const next: AiInteligenciaStore = {
    docs: store.docs
      .map(sanitizeDoc)
      .filter((d): d is AiInteligenciaDoc => Boolean(d))
      .slice(0, MAX_DOCS),
    coligadas: store.coligadas
      .map(sanitizeColigada)
      .filter((c): c is AiColigada => Boolean(c))
      .slice(0, 80),
    updatedAt: new Date().toISOString(),
  };

  const cache = getTextMap(slug);
  for (const d of next.docs) {
    if (d.textoExtraido) cache.set(d.id, d.textoExtraido);
  }

  // Memória = fonte da verdade na sessão (UI atualiza na hora)
  storeCache.set(slug, next);

  const light = toLightStore(next);
  const lightJson = JSON.stringify(light);
  safeLocalStorageSetItem(storageKey(company), lightJson);
  writePersistedLocalStorageJson(storageKey(company), light);

  // Persistência completa em background (IDB + pasta)
  void persistAiInteligenciaToFolder(company, next);

  return next;
}

/**
 * Grava Inteligência IA no IndexedDB e faz flush imediato na pasta configurada
 * (eye-vision-dados.json). Preferir após upload de documentos.
 */
export async function persistAiInteligenciaToFolder(
  company: string,
  store?: AiInteligenciaStore,
): Promise<{ ok: boolean; error?: string; folderLabel?: string }> {
  const slug = companyStorageSlug(company);
  const next = store || storeCache.get(slug) || loadAiInteligencia(company);
  const light = toLightStore(next);
  const lightJson = JSON.stringify(light);
  const cache = getTextMap(slug);

  try {
    await idbPutInteligenciaStore(slug, lightJson);
  } catch {
    /* continua — LS já tem a meta */
  }
  for (const d of next.docs) {
    const full = cache.get(d.id) || d.textoExtraido;
    if (full) {
      try {
        await idbPutDocText(slug, d.id, full.slice(0, MAX_TEXTO_POR_DOC));
      } catch {
        /* ignore */
      }
    }
  }

  try {
    const {
      isLocalFolderDbConfigured,
      getLocalFolderDbMeta,
      scheduleLocalDatabaseSave,
    } = await import('../../lib/localFolderDatabase');
    if (isLocalFolderDbConfigured()) {
      scheduleLocalDatabaseSave();
      return { ok: true, folderLabel: getLocalFolderDbMeta()?.folderLabel };
    }
    scheduleLocalDatabaseSave();
    return {
      ok: false,
      error:
        'Pasta de dados não configurada. Use CONFIGURAR no seletor de módulos e depois SALVAR.',
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Falha ao gravar na pasta',
    };
  }
}

/** Recarrega do IDB e atualiza cache (usar ao abrir o modal). */
export async function loadAiInteligenciaAsync(company: string): Promise<AiInteligenciaStore> {
  const slug = companyStorageSlug(company);
  await hydrateFromIdb(company);
  const store = storeCache.get(slug) || loadAiInteligencia(company);
  return applyTextCache(slug, {
    docs: store.docs.map((d) => ({ ...d })),
    coligadas: store.coligadas.map((c) => ({ ...c, aliases: [...c.aliases] })),
    updatedAt: store.updatedAt,
  });
}

export function countAiInteligenciaDocs(company: string): number {
  return loadAiInteligencia(company).docs.length;
}

/** Textos para a IA (sync — usa cache/IDB já hidratado + preview). Balancetes primeiro. */
export function listAiInteligenciaTextoParaIa(company: string): string[] {
  const store = loadAiInteligencia(company);
  const slug = companyStorageSlug(company);
  const cache = getTextMap(slug);
  const pastaOrdem: Record<AiInteligenciaPasta, number> = {
    balancetes: 0,
    coligadas: 1,
    contratos: 2,
    outros: 3,
  };
  return [...store.docs]
    .sort((a, b) => (pastaOrdem[a.pasta] ?? 9) - (pastaOrdem[b.pasta] ?? 9))
    .map((d) => {
      const texto = (cache.get(d.id) || d.textoExtraido || '').trim();
      if (!texto) return '';
      return `[${d.pasta.toUpperCase()} · ${d.nome}]\n${texto}`;
    })
    .filter(Boolean);
}

/** Garante textos do IDB antes de chamar a IA (preferir este). */
export async function listAiInteligenciaTextoParaIaAsync(company: string): Promise<string[]> {
  await hydrateFromIdb(company);
  return listAiInteligenciaTextoParaIa(company);
}

export function listAiColigadasParaIa(company: string): AiColigada[] {
  return loadAiInteligencia(company).coligadas;
}

export function inferPastaFromFileName(name: string): AiInteligenciaPasta {
  const n = name.toLowerCase();
  if (/coligad|grupo|participad|controlad|ajtf|relacionad/.test(n)) return 'coligadas';
  if (/contrato|social|socios|sócios|estatuto/.test(n)) return 'contratos';
  if (/balanc|razao|razão|dre|plano/.test(n)) return 'balancetes';
  return 'outros';
}

export function compactAliasKey(text: string): string {
  const upper = String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!upper) return '';
  const collapsed = upper.replace(/\b([A-Z])(?:\s+([A-Z]))+\b/g, (m) => m.replace(/\s+/g, ''));
  return collapsed.replace(/\s+/g, '');
}

export function aliasMatchesHistorico(historico: string, alias: string): boolean {
  const histNorm = String(historico ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!histNorm || !alias.trim()) return false;

  const aliasNorm = alias
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (aliasNorm.length >= 3 && histNorm.includes(aliasNorm)) return true;

  const histKey = compactAliasKey(histNorm);
  const aliasKey = compactAliasKey(alias);
  if (aliasKey.length >= 3 && histKey.includes(aliasKey)) return true;

  if (aliasKey.length >= 3 && aliasKey.length <= 8) {
    const spaced = aliasKey.split('').join('\\s*');
    try {
      if (new RegExp(`(?:^|\\s)${spaced}(?:\\s|$)`).test(histNorm)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function matchColigadaNoHistorico(
  historico: string,
  coligadas: AiColigada[] | null | undefined,
): AiColigada | null {
  if (!coligadas?.length || !historico.trim()) return null;
  for (const c of coligadas) {
    const candidates = [c.nome, ...c.aliases];
    for (const alias of candidates) {
      if (aliasMatchesHistorico(historico, alias)) return c;
    }
  }
  return null;
}

export function extractColigadasFromTexto(texto: string): Array<{ nome: string; aliases: string[] }> {
  const raw = String(texto ?? '');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 400);
  const found: Array<{ nome: string; aliases: string[] }> = [];
  const seen = new Set<string>();

  const push = (nomeRaw: string, aliases: string[] = []) => {
    let nome = nomeRaw
      .replace(/^[\d.\-)\]\s]+/, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/[;,:]+$/g, '')
      .trim();
    // Remove rótulos comuns
    nome = nome
      .replace(/^(coligad[ao]s?|participad[ao]s?|controlad[ao]s?|grupo|empresa)\s*[:\-–]?\s*/i, '')
      .trim();
    if (nome.length < 2 || nome.length > 90) return;
    // Ignora linhas que são só números / cabeçalhos genéricos
    if (/^(saldo|total|conta|codigo|código|página|pagina)\b/i.test(nome)) return;
    if (/^\d+([.,]\d+)?%?$/.test(nome)) return;

    const key = compactAliasKey(nome) || nome.toUpperCase();
    if (!key || key.length < 3 || seen.has(key)) return;
    seen.add(key);

    const aliasSet = new Set<string>();
    for (const a of [nome, ...aliases]) {
      const t = a.trim().toUpperCase();
      if (t) aliasSet.add(t);
      const compact = compactAliasKey(a);
      if (compact.length >= 3) aliasSet.add(compact);
      if (/^[A-Z]{3,8}$/.test(compact)) {
        aliasSet.add(compact.split('').join(' '));
        aliasSet.add(compact.split('').join('.'));
        aliasSet.add(compact.split('').join('. ') + '.');
      }
      // Sem LTDA / ME / EPP para casar no extrato
      const semTipo = t
        .replace(/\b(LTDA|LTD|ME|EPP|S\/?A|SA|EIRELI)\b\.?/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (semTipo.length >= 3) aliasSet.add(semTipo);
    }
    found.push({ nome: nome.trim(), aliases: Array.from(aliasSet).slice(0, 24) });
  };

  // Seção explícita de coligadas / partes relacionadas
  let inColigadasSection = false;
  for (const line of lines) {
    if (
      /coligad|participad|controlad|partes?\s+relacionad|empresas?\s+do\s+grupo|grupo\s+empresarial/i.test(
        line,
      )
    ) {
      inColigadasSection = true;
      const after = line.match(
        /(?:coligad[ao]s?|participad[ao]s?|controlad[ao]s?|relacionad[ao]s?)\s*[:\-–]\s*(.+)$/i,
      );
      if (after?.[1]) {
        for (const part of after[1].split(/[;|/•·]|(?:\s+e\s+)/i)) {
          const n = part.trim();
          if (n.length >= 2) push(n, [n]);
        }
      }
      continue;
    }
    // Sai da seção em cabeçalhos claramente outros
    if (
      inColigadasSection &&
      /^(balanc|dre|ativo|passivo|patrimonio|sócios|socios|contrato|anexo)\b/i.test(line)
    ) {
      inColigadasSection = false;
    }

    const coligadaHit = line.match(/coligad[ao]s?\s*[:\-–]?\s*(.+)$/i);
    if (coligadaHit?.[1]) {
      push(coligadaHit[1], [coligadaHit[1]]);
      continue;
    }

    // Siglas tipo A.J.T.F / A J T F
    if (/^[A-Z](?:[.\s]*[A-Z]){2,7}\.?$/i.test(line) && line.replace(/[^A-Za-z]/g, '').length <= 8) {
      push(line, [line]);
      continue;
    }

    // Razão social típica (COMERCIO, LTDA, REFRIGERAÇÃO…)
    const looksLikeCompany =
      /\b(LTDA|LTD|EIRELI|S\/?A|ME|EPP|COM[EÉ]RCIO|COMERCIO|REFRIGERA[CÇ][AÃ]O|CLIMATIZA[CÇ][AÃ]O|INDUSTRIA|IND[UÚ]STRIA|SERVICOS|SERVI[CÇ]OS|HOLDING|PARTICIPA[CÇ][OÕ]ES)\b/i.test(
        line,
      ) &&
      line.length >= 5 &&
      line.length <= 90 &&
      !/^\d/.test(line);

    if (inColigadasSection || looksLikeCompany) {
      // Lista numerada / com bullet
      const cleaned = line.replace(/^[-*•·\d.)\]]+\s*/, '').trim();
      if (cleaned.length >= 3 && (inColigadasSection || looksLikeCompany)) {
        push(cleaned, [cleaned]);
      }
    }
  }

  if (/\bA[\s.]*J[\s.]*T[\s.]*F\b/i.test(raw) || /\bAJTF\b/i.test(raw)) {
    push('A.J.T.F. LTDA', [
      'AJTF',
      'A.J.T.F',
      'A.J.T.F.',
      'A J T F',
      'A. J. T. F',
      'A. J. T. F.',
      'A.J.T.F. LTDA',
      'AJTF LTDA',
    ]);
  }

  return found.slice(0, 40);
}

/**
 * Relê todos os documentos da Inteligência IA e sincroniza a lista de coligadas.
 * Chamar antes de "IA Corrigir regras" para a IA não tratar coligada como fornecedor.
 */
export function syncColigadasFromInteligenciaDocs(company: string): AiColigada[] {
  const store = loadAiInteligencia(company);
  const extracted: Array<{ nome: string; aliases: string[] }> = [];
  for (const d of store.docs) {
    const texto = d.textoExtraido || '';
    if (!texto.trim() || texto.startsWith('[arquivo]')) continue;
    extracted.push(...extractColigadasFromTexto(texto));
    // Docs na pasta coligadas: cada linha razoável vira candidata
    if (d.pasta === 'coligadas') {
      for (const line of texto.split(/\r?\n/)) {
        const t = line.trim();
        if (t.length >= 3 && t.length <= 90 && !t.startsWith('[')) {
          extracted.push({ nome: t, aliases: [t] });
        }
      }
    }
  }
  if (extracted.length > 0) {
    upsertColigadasFromExtract(company, extracted);
  }
  return listAiColigadasParaIa(company);
}

/** Conta do plano parece de fornecedor (terceiro) — proibida para coligada. */
export function isContaFornecedorNome(nomeConta: string): boolean {
  return /\bFORNECEDOR|\bFORN\b|DUPLICATA\s+A\s+PAGAR/i.test(String(nomeConta ?? ''));
}

/** Contas de patrimônio/ajuste — proibidas para coligada (ex.: reavaliação de ativos). */
export function isContaPatrimonioOuAjuste(nomeConta: string): boolean {
  return /REAVALIAC|DEPRECIAC|AMORTIZAC|PATRIMONIO\s+LIQUIDO|CAPITAL\s+SOCIAL|RESERVA|LUCROS?\s+A\s+DISTRIBUIR|PREJUIZO|AJUSTE\s+DE\s+EXERCIC/i.test(
    String(nomeConta ?? ''),
  );
}

/** Nome da conta no plano combina com coligada (razão social ou alias). */
export function contaCombinaComColigada(nomeConta: string, coligada: AiColigada): boolean {
  const candidates = [coligada.nome, ...coligada.aliases];
  for (const alias of candidates) {
    if (aliasMatchesHistorico(nomeConta, alias)) return true;
  }
  return false;
}

/** Conta adequada para lançamento de coligada (nome combina ou conta de mútuo/coligada). */
export function contaAceitavelParaColigada(nomeConta: string, coligada: AiColigada): boolean {
  if (isContaFornecedorNome(nomeConta) || /\bCLIENTE/i.test(nomeConta)) return false;
  if (isContaPatrimonioOuAjuste(nomeConta)) return false;
  if (contaCombinaComColigada(nomeConta, coligada)) return true;
  if (isContaColigadaNome(nomeConta)) return true;
  return false;
}

/** Conta do plano adequada para coligada / partes relacionadas. */
export function isContaColigadaNome(nomeConta: string): boolean {
  return /COLIGAD|PARTES?\s+RELACIONAD|EMPR[EÉ]STIMO\s+ENTRE|M[UÚ]TUO|CONTROLAD|PARTICIPAD|INTERCOMPANY|INTER\s*COMPAN/i.test(
    String(nomeConta ?? ''),
  );
}

/** Escolhe no plano a melhor conta de coligada (nunca fornecedor). */
export function pickContaColigadaNoPlano(
  plano: Array<{ code: string; name: string; codigoReduzido?: string }>,
  nomeColigada?: string,
): string {
  const prefer = plano.filter((p) => isContaColigadaNome(p.name));
  const pool = prefer.length > 0 ? prefer : [];
  if (pool.length === 0) return '';
  if (nomeColigada?.trim()) {
    const key = compactAliasKey(nomeColigada);
    const hit = pool.find((p) => compactAliasKey(p.name).includes(key) || key.includes(compactAliasKey(p.name)));
    if (hit) {
      return sanitizeCodigoReduzido(hit.codigoReduzido) || hit.code;
    }
  }
  const first = pool[0]!;
  return sanitizeCodigoReduzido(first.codigoReduzido) || first.code;
}

type PlanoColigadaRow = {
  code: string;
  name: string;
  codigoReduzido?: string;
  group?: string;
  grupo?: string;
};

function scoreContaPlanoParaColigada(
  p: PlanoColigadaRow,
  coligada: AiColigada,
  nature: 'D' | 'C',
): number {
  if (/^\s*BANCO\b/i.test(p.name)) return 0;
  if (isContaFornecedorNome(p.name) || /\bCLIENTE/i.test(p.name)) return 0;
  if (isContaPatrimonioOuAjuste(p.name)) return 0;

  let score = 0;
  if (contaCombinaComColigada(p.name, coligada)) score += 55;
  if (isContaColigadaNome(p.name)) score += 18;
  if (grupoContaPlano(p) === (nature === 'D' ? 'ATIVO' : 'PASSIVO')) score += 22;
  if (/\bLTDA\b|\bME\b|\bEIRELI\b/.test(p.name)) score += 8;
  return score;
}

/**
 * Busca no plano a conta cujo NOME combina com a coligada (razão social no plano).
 * Cruza aliases — ex.: AJTF → "A.J.T.F. LTDA" reduzido 1094.
 */
export function pickContaColigadaPorNomeNoPlano(
  plano: PlanoColigadaRow[],
  coligada: AiColigada,
  nature: 'D' | 'C',
): string {
  const ranked = plano
    .map((p) => ({ p, score: scoreContaPlanoParaColigada(p, coligada, nature) }))
    .filter((x) => x.score >= 40)
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      const aExplicit = Boolean(a.p.group || a.p.grupo);
      const bExplicit = Boolean(b.p.group || b.p.grupo);
      if (aExplicit !== bExplicit) return aExplicit ? -1 : 1;
      return compactAliasKey(b.p.name).length - compactAliasKey(a.p.name).length;
    });
  const best = ranked[0];
  if (!best) return '';
  return sanitizeCodigoReduzido(best.p.codigoReduzido) || best.p.code;
}

/** Preenche contaReduzida das coligadas a partir do plano (quando ainda não cadastrada). */
export function enrichColigadasComContasDoPlano(
  coligadas: AiColigada[],
  plano: PlanoColigadaRow[],
): AiColigada[] {
  if (!coligadas.length || !plano.length) return coligadas;
  return coligadas.map((c) => {
    if (c.contaReduzida?.trim()) return c;
    const red =
      pickContaColigadaPorNomeNoPlano(plano, c, 'D') ||
      pickContaColigadaPorNomeNoPlano(plano, c, 'C');
    return red ? { ...c, contaReduzida: red } : c;
  });
}

function grupoContaPlano(p: { code: string; group?: string; grupo?: string }): string {
  const g = String(p.group ?? p.grupo ?? '').trim().toUpperCase();
  if (g) return g;
  const digits = String(p.code ?? '').replace(/\D/g, '');
  if (digits.startsWith('1')) return 'ATIVO';
  if (digits.startsWith('2')) return 'PASSIVO';
  return '';
}

/**
 * Conta correta para coligada conforme natureza do lançamento.
 * Saída (D) → ATIVO (mútuo a receber); entrada (C) → PASSIVO (mútuo a pagar).
 */
export function resolveContaColigadaParaNatureza(
  coligada: AiColigada,
  nature: 'D' | 'C',
  plano: Array<{ code: string; name: string; codigoReduzido?: string; group?: string; grupo?: string }>,
): string {
  const preferGrupo = nature === 'D' ? 'ATIVO' : 'PASSIVO';

  if (coligada.contaReduzida?.trim()) {
    const red =
      sanitizeCodigoReduzido(coligada.contaReduzida) ||
      resolveCodigoReduzidoDoPlano(coligada.contaReduzida, plano) ||
      '';
    if (red) {
      const hit = plano.find(
        (p) =>
          sanitizeCodigoReduzido(p.codigoReduzido) === red ||
          sanitizeCodigoReduzido(p.code) === red,
      );
      if (hit && contaAceitavelParaColigada(hit.name, coligada)) {
        return red;
      }
    }
  }

  const porNome = pickContaColigadaPorNomeNoPlano(plano, coligada, nature);
  if (porNome) return porNome;

  const coligContas = plano.filter(
    (p) => isContaColigadaNome(p.name) && !isContaPatrimonioOuAjuste(p.name),
  );
  const key = compactAliasKey(coligada.nome);
  const byNome = coligContas.filter((p) => {
    const pk = compactAliasKey(p.name);
    return pk.includes(key) || key.includes(pk);
  });
  const pool = byNome.length > 0 ? byNome : coligContas;

  const byGrupo = pool.find((p) => grupoContaPlano(p) === preferGrupo);
  if (byGrupo) {
    return sanitizeCodigoReduzido(byGrupo.codigoReduzido) || byGrupo.code;
  }

  const byNomePlano = pickContaColigadaNoPlano(plano, coligada.nome);
  if (byNomePlano) return byNomePlano;

  const first = pool[0];
  return first ? sanitizeCodigoReduzido(first.codigoReduzido) || first.code : '';
}

/** Busca coligada na descrição da regra ou nos históricos do extrato do lote. */
export function matchColigadaParaRegra(
  descricao: string,
  coligadas: AiColigada[],
  extratoHistoricos: string[] = [],
): AiColigada | null {
  const hit = matchColigadaNoHistorico(descricao, coligadas);
  if (hit) return hit;
  for (const h of extratoHistoricos) {
    const hHit = matchColigadaNoHistorico(h, coligadas);
    if (hHit) return hHit;
  }
  return null;
}

export function upsertColigadasFromExtract(
  company: string,
  extracted: Array<{ nome: string; aliases: string[] }>,
): AiInteligenciaStore {
  const store = loadAiInteligencia(company);
  if (extracted.length === 0) return store;
  const next = [...store.coligadas];
  for (const ex of extracted) {
    const key = compactAliasKey(ex.nome);
    const existing = next.find(
      (c) =>
        compactAliasKey(c.nome) === key ||
        c.aliases.some((a) => compactAliasKey(a) === key),
    );
    if (existing) {
      const merged = new Set([...existing.aliases, ...ex.aliases.map((a) => a.toUpperCase())]);
      existing.aliases = Array.from(merged).slice(0, 24);
    } else {
      const c = sanitizeColigada({
        nome: ex.nome,
        aliases: ex.aliases,
      });
      if (c) next.push(c);
    }
  }
  return saveAiInteligencia(company, { ...store, coligadas: next });
}

export function addAiInteligenciaDocs(
  company: string,
  docs: Array<Omit<AiInteligenciaDoc, 'id' | 'uploadedAt'> & { id?: string }>,
): AiInteligenciaStore {
  const store = loadAiInteligencia(company);
  const added: AiInteligenciaDoc[] = [];
  for (const d of docs) {
    const doc = sanitizeDoc({
      ...d,
      id: d.id || crypto.randomUUID(),
      uploadedAt: new Date().toISOString(),
      textoExtraido: String(d.textoExtraido ?? '').slice(0, MAX_TEXTO_POR_DOC),
    });
    if (doc) added.push(doc);
  }
  // Dedup por pasta + nome + tamanho (mesmo arquivo em pastas diferentes é permitido)
  const existingKeys = new Set(store.docs.map((d) => `${d.pasta}::${d.nome}::${d.size}`));
  const fresh = added.filter((d) => !existingKeys.has(`${d.pasta}::${d.nome}::${d.size}`));
  if (fresh.length === 0 && added.length > 0) {
    // Já existia — devolve store atual (não é falha)
    return store;
  }
  return saveAiInteligencia(company, {
    ...store,
    docs: [...fresh, ...store.docs].slice(0, MAX_DOCS),
  });
}

export function removeAiInteligenciaDoc(company: string, id: string): AiInteligenciaStore {
  const store = loadAiInteligencia(company);
  const slug = companyStorageSlug(company);
  getTextMap(slug).delete(id);
  void idbDeleteDocText(slug, id);
  return saveAiInteligencia(company, {
    ...store,
    docs: store.docs.filter((d) => d.id !== id),
  });
}

export function upsertAiColigada(
  company: string,
  draft: Omit<AiColigada, 'id'> & { id?: string },
): AiInteligenciaStore {
  const store = loadAiInteligencia(company);
  const col = sanitizeColigada(draft);
  if (!col) return store;
  const idx = store.coligadas.findIndex((c) => c.id === col.id);
  const coligadas =
    idx >= 0
      ? store.coligadas.map((c, i) => (i === idx ? col : c))
      : [...store.coligadas, col];
  return saveAiInteligencia(company, { ...store, coligadas });
}

export function removeAiColigada(company: string, id: string): AiInteligenciaStore {
  const store = loadAiInteligencia(company);
  return saveAiInteligencia(company, {
    ...store,
    coligadas: store.coligadas.filter((c) => c.id !== id),
  });
}

export function purgeAiInteligenciaCachesForCompany(company: string): void {
  const slug = companyStorageSlug(company);
  storeCache.delete(slug);
  textCache.delete(slug);
}

export const PASTA_LABELS: Record<AiInteligenciaPasta, string> = {
  coligadas: 'Coligadas',
  contratos: 'Contratos / sócios',
  balancetes: 'Balancetes',
  outros: 'Outros',
};

/** Limpa só textos GIGANTES legados — preserva lista de documentos nas pastas. */
export function migrateAiInteligenciaOutOfLocalStorage(company: string): void {
  const key = storageKey(company);
  try {
    const raw = safeLocalStorageGetItem(key);
    if (!raw) return;
    // Só enxuga se o payload legado for enorme (textos embutidos)
    if (raw.length <= 80_000) return;
  } catch {
    return;
  }
  const store = loadAiInteligencia(company);
  void persistTextsAndSlim(company, store);
}
