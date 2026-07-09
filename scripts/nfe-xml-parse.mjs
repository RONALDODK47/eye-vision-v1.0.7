function findTagValue(xml, tag) {
  const re = new RegExp(`<${tag}>([^<]+)<\\/${tag}>`);
  const m = xml.match(re);
  return m?.[1]?.trim();
}

function findTagInFragment(frag, tag) {
  return findTagValue(frag, tag);
}

function parseBrNumber(raw) {
  if (raw == null || raw === '') return 0;
  const n = Number(String(raw).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function toBrDate(v) {
  if (!v) return undefined;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return v;
  return undefined;
}

function matchDateRange(emissaoBr, dataInicio, dataFim) {
  if (!dataInicio && !dataFim) return true;
  if (!emissaoBr) return true;
  const [d, m, y] = emissaoBr.split('/').map(Number);
  if (!d || !m || !y) return true;
  const ts = new Date(y, m - 1, d).getTime();
  const inicioIso = dataInicio?.slice(0, 10);
  const fimIso = dataFim?.slice(0, 10);
  if (inicioIso) {
    const t0 = new Date(`${inicioIso}T00:00:00`).getTime();
    if (!Number.isNaN(t0) && ts < t0) return false;
  }
  if (fimIso) {
    const t1 = new Date(`${fimIso}T23:59:59`).getTime();
    if (!Number.isNaN(t1) && ts > t1) return false;
  }
  return true;
}

function notaResumoFromXml(xml) {
  let chave = findTagValue(xml, 'chNFe') ?? '';
  if (!chave) {
    const id = findTagValue(xml, 'Id') ?? '';
    if (id.startsWith('NFe')) chave = id.slice(3);
  }
  const numero = findTagValue(xml, 'nNF') ?? '';
  const serie = findTagValue(xml, 'serie') ?? '';
  const dhEmi = findTagValue(xml, 'dhEmi') ?? findTagValue(xml, 'dEmi') ?? '';
  const emissao = toBrDate(dhEmi);
  const emitente = findTagValue(xml, 'xNome') ?? '';
  const totalRaw = findTagValue(xml, 'vNF') ?? '0';
  const total = Number(String(totalRaw).replace(',', '.')) || 0;
  if (!chave) return null;
  return { chave, numero, serie, emissao, total, emitente, destinatario: '' };
}

/**
 * Extrai nota, itens de estoque e créditos sugeridos de um XML NF-e (nfeProc / procNFe / NFe / resNFe).
 */
export function parseNfeXmlString(xml, range = {}) {
  const text = String(xml ?? '').trim();
  if (!text || (!/nfeProc|procNFe|NFe|resNFe|chNFe/i.test(text) && !/<infNFe/i.test(text))) {
    return null;
  }

  const isResumo = /<resNFe\b/i.test(text) || /\bschema="resNFe/i.test(text);
  const notaBase = notaResumoFromXml(text);
  if (!notaBase?.chave) return null;
  if (!matchDateRange(notaBase.emissao, range.dataInicio, range.dataFim)) return null;

  if (isResumo || (!/<det[\s>]/i.test(text) && !/<infNFe/i.test(text))) {
    return { nota: notaBase, itens: [], creditos: [], isResumo: true };
  }

  const itens = [];
  const creditos = [];
  const detBlocks = [...text.matchAll(/<det[\s\S]*?<\/det>/gi)];

  for (const block of detBlocks) {
    const frag = block[0];
    const descricao = findTagInFragment(frag, 'xProd') ?? '';
    const codigo = findTagInFragment(frag, 'cProd') ?? '';
    const quantidade = parseBrNumber(findTagInFragment(frag, 'qCom'));
    const valorUnitario = parseBrNumber(findTagInFragment(frag, 'vUnCom'));
    const unidade = findTagInFragment(frag, 'uCom') ?? 'un';
    if (!descricao) continue;
    const categoria = /materia|mp\b|matéria/i.test(descricao) ? 'materia_prima' : 'insumo';
    itens.push({
      chave: notaBase.chave,
      codigo,
      descricao,
      quantidade: quantidade > 0 ? quantidade : 1,
      valorUnitario,
      unidade,
      categoria,
    });
    const icms = parseBrNumber(findTagInFragment(frag, 'vICMS'));
    const pis = parseBrNumber(findTagInFragment(frag, 'vPIS'));
    const cofins = parseBrNumber(findTagInFragment(frag, 'vCOFINS'));
    if (icms > 0) {
      creditos.push({
        chave: notaBase.chave,
        tipo: 'ICMS a recuperar',
        valor: icms,
        fundamento: 'NF-e item — crédito ICMS (Lei Kandir / LC 87/96)',
        regime: 'Lucro Real',
      });
    }
    if (pis > 0) {
      creditos.push({
        chave: notaBase.chave,
        tipo: 'PIS a recuperar',
        valor: pis,
        fundamento: 'NF-e item — crédito PIS (Lei 10.637/2002)',
        regime: 'Lucro Real',
      });
    }
    if (cofins > 0) {
      creditos.push({
        chave: notaBase.chave,
        tipo: 'COFINS a recuperar',
        valor: cofins,
        fundamento: 'NF-e item — crédito COFINS (Lei 10.833/2003)',
        regime: 'Lucro Real',
      });
    }
  }

  const totalIcms = parseBrNumber(findTagValue(text, 'vICMS'));
  const totalPis = parseBrNumber(findTagValue(text, 'vPIS'));
  const totalCofins = parseBrNumber(findTagValue(text, 'vCOFINS'));
  if (!creditos.length) {
    if (totalIcms > 0) {
      creditos.push({
        chave: notaBase.chave,
        tipo: 'ICMS a recuperar',
        valor: totalIcms,
        fundamento: 'NF-e total — ICMS',
        regime: 'Lucro Real',
      });
    }
    if (totalPis > 0) {
      creditos.push({
        chave: notaBase.chave,
        tipo: 'PIS a recuperar',
        valor: totalPis,
        fundamento: 'NF-e total — PIS',
        regime: 'Lucro Real',
      });
    }
    if (totalCofins > 0) {
      creditos.push({
        chave: notaBase.chave,
        tipo: 'COFINS a recuperar',
        valor: totalCofins,
        fundamento: 'NF-e total — COFINS',
        regime: 'Lucro Real',
      });
    }
  }

  return { nota: notaBase, itens, creditos };
}

/** Agrega vários XMLs (deduplica por chave). */
export function aggregateNfeParseResults(parsedList) {
  const notas = [];
  const itensEstoque = [];
  const creditosSugeridos = [];
  const seenChaves = new Set();

  for (const parsed of parsedList) {
    if (!parsed?.nota?.chave) continue;
    if (!seenChaves.has(parsed.nota.chave)) {
      seenChaves.add(parsed.nota.chave);
      notas.push(parsed.nota);
    }
    itensEstoque.push(...(parsed.itens ?? []));
    creditosSugeridos.push(...(parsed.creditos ?? []));
  }

  return { notas, itensEstoque, creditosSugeridos };
}
