const RE_DATA = /\b\d{2}\/\d{2}\/\d{4}\b/;
const RE_MOEDA = /[0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+\.[0-9]{2}/;
const RE_CLASSIFICACAO = /^\d+(?:\.\d+){2,6}(?:\.\d{2,5})?$/;

function parseMoney(raw: string | undefined): number {
  if (!raw?.trim()) return 0;
  const s = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function dedupeHistoricoText(text: string): string {
  const parts = text
    .split(/\s{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return text.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.join(' ').trim();
}

export function linhaEhMetadadoRazaoDominio(texto: string): boolean {
  const t = texto.trim();
  if (!t) return true;
  const lower = t.toLowerCase();
  if (/sistema\s+licenciado|inov\s+consultoria/i.test(lower)) return true;
  if (/\bemiss[ãa]o\s*:/i.test(lower)) return true;
  if (/^data\s+n[uú]mero\s+hist[oó]rico/i.test(lower.replace(/\s+/g, ' '))) return true;
  if (/^folha\s*:/i.test(lower)) return true;
  if (/saldo-exerc[ií]cio/i.test(lower)) return true;
  if (/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(t)) return true;
  if (/c\.?\s*n\.?\s*p\.?\s*j|empresa\s*:/i.test(lower) && !RE_CLASSIFICACAO.test(t.replace(/\s/g, ''))) {
    return true;
  }
  return false;
}

export function mergeRazaoFieldsFromLine(
  fields: Record<string, string>,
  linhaCompleta: string,
  classificacaoConta?: string,
): Record<string, string> {
  const out = { ...fields };
  const texto = dedupeHistoricoText(linhaCompleta);

  const dataMatch = texto.match(RE_DATA);
  if (dataMatch && !out.data?.trim()) out.data = dataMatch[0];

  if (classificacaoConta?.trim()) {
    out.contaPartida = classificacaoConta.trim();
    out.classificacao = classificacaoConta.trim();
    if (!out.codigo?.trim()) {
      out.codigo = classificacaoConta.replace(/\./g, '');
    }
  }

  if (
    !out.contaContrapartida?.trim() &&
    out.codigo?.trim() &&
    (!classificacaoConta?.trim() || out.codigo.trim() !== classificacaoConta.replace(/\./g, ''))
  ) {
    out.contaContrapartida = out.codigo.trim();
  }

  const descParts: string[] = [];
  if (out.descricao?.trim()) descParts.push(out.descricao.trim());
  const histFromLine = texto
    .replace(RE_DATA, '')
    .replace(RE_MOEDA, '')
    .replace(/\b\d{4,6}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (histFromLine.length > 3 && !/^cta\.?c\.?part/i.test(histFromLine)) {
    descParts.push(histFromLine);
  }
  if (descParts.length > 0) {
    out.descricao = dedupeHistoricoText(descParts.join(' ')).toUpperCase();
  }

  const deb = parseMoney(out.debito);
  const cred = parseMoney(out.credito);
  if (deb > 0 && cred <= 0) {
    out.debito = deb.toFixed(2).replace('.', ',');
    out.credito = '';
  } else if (cred > 0 && deb <= 0) {
    out.credito = cred.toFixed(2).replace('.', ',');
    out.debito = '';
  }

  const codigoReduzido = (out.codigo || '').trim();
  if (/^\d{3,5}$/.test(codigoReduzido) && classificacaoConta?.trim()) {
    out.codigo = codigoReduzido;
  }

  return out;
}

export function extractClassificacaoContaFromCluster(
  items: Array<{ str: string; x: number }>,
): string | null {
  for (const it of items) {
    const t = it.str.trim();
    if (it.x >= 55 && it.x <= 130 && RE_CLASSIFICACAO.test(t)) return t;
  }
  return null;
}
