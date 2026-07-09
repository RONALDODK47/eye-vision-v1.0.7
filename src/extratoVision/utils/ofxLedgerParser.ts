/**
 * Converte movimentos OFX/QFX (home banking) no formato de lançamentos D/C usado na Conciliação Vision.
 * Convenção: TRNAMT > 0 → crédito na conta; TRNAMT < 0 → débito (valores absolutos nas colunas).
 */

export type OfxLedgerRow = {
  data?: string;
  historico: string;
  debito: number;
  credito: number;
};

function parseTrnAmt(raw: string): number {
  let t = String(raw ?? '')
    .trim()
    .replace(/\s/g, '');
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
  } else if (lastComma !== -1) {
    t = t.replace(',', '.');
  }
  const n = parseFloat(t.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/** Converte YYYYMMDD ou YYYYMMDDHHMMSS em dd/MM/yyyy */
function parseDtPosted(raw: string): string | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(raw ?? '').trim());
  if (!m) return undefined;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function firstTag(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([^<\\n\\r]*)`, 'i');
  const x = re.exec(block);
  return x?.[1]?.trim() || undefined;
}

export function parseOfxToLedgerRows(content: string): OfxLedgerRow[] {
  const out: OfxLedgerRow[] = [];
  if (!content || content.length < 20) return out;

  const blocks = content.split(/<STMTTRN>/i).slice(1);

  for (const rawBlock of blocks) {
    const block = rawBlock.split(/<\/STMTTRN>/i)[0] ?? rawBlock;
    const amtStr = firstTag(block, 'TRNAMT');
    if (amtStr === undefined) continue;
    const amt = parseTrnAmt(amtStr);
    if (!Number.isFinite(amt) || Math.abs(amt) < 0.0001) continue;

    const memo = firstTag(block, 'MEMO') ?? '';
    const name = firstTag(block, 'NAME') ?? '';
    const payee = firstTag(block, 'PAYEE') ?? '';
    const historico =
      [memo, name, payee].filter((s) => s && String(s).trim()).join(' · ').trim() || '(movimento OFX)';

    const dtRaw = firstTag(block, 'DTPOSTED') ?? firstTag(block, 'DTUSER') ?? '';
    const data = parseDtPosted(dtRaw);

    const trntype = (firstTag(block, 'TRNTYPE') ?? '').toUpperCase();
    let debito = 0;
    let credito = 0;
    if (amt < 0) {
      debito = Math.abs(amt);
    } else if (
      amt > 0 &&
      ['DEBIT', 'ATM', 'POS', 'CHECK', 'DEB', 'WITHDRAWAL', 'FEE', 'SRVCHG'].includes(trntype)
    ) {
      debito = amt;
    } else {
      credito = amt;
    }

    out.push({ data, historico, debito, credito });
  }

  return out;
}
