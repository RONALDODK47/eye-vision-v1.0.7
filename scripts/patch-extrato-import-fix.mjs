import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = path.join(root, 'src/lib/ocrExtratoPositional.ts');
let s = fs.readFileSync(p, 'utf8');

function rep(from, to, label) {
  if (s.includes(to.split('\n')[0]?.trim())) return;
  if (!s.includes(from)) throw new Error(`missing: ${label}`);
  s = s.replace(from, to);
}

// 1) Coluna Valor (esquerda) — não coluna Saldo (direita)
rep(
  '  const pool = naColuna.length > 0 ? naColuna : candidatos;\n  return pool.sort((a, b) => b.y - a.y || b.x - a.x)[0] ?? null;',
  `  const pool = naColuna.length > 0 ? naColuna : candidatos;
  return pool.sort((a, b) => a.x - b.x || b.y - a.y)[0] ?? null;`,
  'extratoPickValorTokenDoCluster pool',
);
rep(
  '    return naColuna.sort((a, b) => b.y - a.y || b.x - a.x)[0] ?? null;',
  '    return naColuna.sort((a, b) => a.x - b.x || b.y - a.y)[0] ?? null;',
  'extratoPickValorTokenDoCluster strict',
);

// 2) Saldo anterior: ler _linhaOcr quando colunas vazias
rep(
  `  if (!mencionaSaldo && !extratoRowEhSaldoInformativo(row)) return 0;
  return (
    parseExtratoMoneyValue(row.valorDebito ?? '') ||
    parseExtratoMoneyValue(row.valorCredito ?? '') ||
    parseExtratoMoneyValue(row.valorMisto ?? '') ||
    0
  );
}`,
  `  if (!mencionaSaldo && !extratoRowEhSaldoInformativo(row)) return 0;
  const fromCols =
    parseExtratoMoneyValue(row.valorDebito ?? '') ||
    parseExtratoMoneyValue(row.valorCredito ?? '') ||
    parseExtratoMoneyValue(row.valorMisto ?? '') ||
    0;
  if (fromCols > 0.0001) return fromCols;
  const hits = scanValoresParaSplitExtrato(String(row._linhaOcr ?? ''));
  for (const h of hits) {
    if (h.value >= 1000) return h.value;
  }
  return 0;
}`,
  'extrairSaldoAnteriorDeRow',
);

// 3) Não trocar TED por SISPAG no enrich
rep(
  `      if (hist && extratoHistoricoEhPlausivel(hist)) {
        if (/\\bTED\\s*RECEB/i.test(hist)) {
          const alt = inferirHistoricoDeTextoPagina(blob, data, valor);
          if (alt && /\\bSISPAG\\b/i.test(alt)) return aplicarHistoricoEnriquecido(row, texto, alt);
        }
        return aplicarHistoricoEnriquecido(row, texto, hist);
      }`,
  `      if (hist && extratoHistoricoEhPlausivel(hist)) {
        return aplicarHistoricoEnriquecido(row, texto, hist);
      }`,
  'enrichExtratoHistorico TED SISPAG swap',
);

// 4) Fallback crédito órfão — busca TED sem valor nas linhas
rep(
  `export function extratoDescricaoFallbackCreditoOrfao(
  _rows: OcrExtratoRow[],
  _dataRef: string,
  valor: number,
  opts?: { allowGeneric?: boolean },
): string {
  if (valor > 0 && valor < 1) return 'RENDIMENTOS';
  if (opts?.allowGeneric && valor >= 50) return 'TED RECEBIDA — LANCAMENTO OCR';
  return '';
}`,
  `export function extratoDescricaoFallbackCreditoOrfao(
  rows: OcrExtratoRow[],
  dataRef: string,
  valor: number,
  opts?: { allowGeneric?: boolean },
): string {
  if (valor > 0 && valor < 1) return 'RENDIMENTOS';
  let best = '';
  let bestScore = 0;
  const dataKey = (dataRef ?? '').replace(/\\s+/g, '').slice(0, 10);
  for (const row of rows) {
    if (rowValorAbs(row) > 0.0001) continue;
    const linha = String(row._linhaOcr ?? '');
    const hist = inferDescricaoFromLinhaOcr(linha, row).trim();
    if (!hist || !extratoHistoricoEhPlausivel(hist)) continue;
    if (
      !/TED\\s*RECEB|TEDRECEB|RECEBIMENTOS|PIX\\s*RECEB|CAMARA|VEREADORES|OURINHOS|RIBEIRAO|FOZ|MUNICIPIO/i.test(
        hist,
      )
    ) {
      continue;
    }
    let score = hist.length;
    const rowData = extratoRowDataNormalizada(row);
    if (dataKey && rowData && rowData.replace(/\\s+/g, '').slice(0, 10) === dataKey) score += 120;
    if (score > bestScore) {
      bestScore = score;
      best = hist;
    }
  }
  if (best) return best;
  if (opts?.allowGeneric && valor >= 50) return 'TED RECEBIDA';
  return '';
}`,
  'extratoDescricaoFallbackCreditoOrfao',
);

// 5) Parear órfãos pelo melhor score (não o primeiro)
const oldParearLoop = `    for (let j = idx - 1; j >= 0 && idx - j <= 15; j--) {
      if (consumed.has(j)) continue;
      const target = working[j]!;
      if (data && !extratoRowsMesmaDataExtrato(target, data)) continue;
      if (!extratoRowJaTemValorResolvido(target, valor) && extratoRowScoreHistorico(target) >= 50) {
        anexarValorOrfaoExtratoRow(target, row);
        consumed.add(idx);
        paired = true;
        break;
      }
    }

    if (!paired) {
      for (let j = idx + 1; j < working.length && j - idx <= 5; j++) {
        if (consumed.has(j)) continue;
        const target = working[j]!;
        if (data && !extratoRowsMesmaDataExtrato(target, data)) continue;
        if (!extratoRowJaTemValorResolvido(target, valor) && extratoRowScoreHistorico(target) >= 50) {
          anexarValorOrfaoExtratoRow(target, row);
          consumed.add(idx);
          paired = true;
          break;
        }
      }
    }

    if (!paired) {
      const fallback = working.find((candidate, j) => {
        if (j === idx || consumed.has(j)) return false;
        if (data && !extratoRowsMesmaDataExtrato(candidate, data)) return false;
        if (extratoRowJaTemValorResolvido(candidate, valor)) return false;
        return extratoRowScoreHistorico(candidate) >= 50;
      });
      if (fallback) {
        anexarValorOrfaoExtratoRow(fallback, row);
        consumed.add(idx);
      }
    }`;

const newParearLoop = `    const pickBestTarget = (from: number, to: number, step: number): number => {
      let bestJ = -1;
      let bestScore = -1;
      for (let j = from; step > 0 ? j <= to : j >= to; j += step) {
        if (j === idx || consumed.has(j)) continue;
        const target = working[j]!;
        if (data && !extratoRowsMesmaDataExtrato(target, data)) continue;
        if (extratoRowJaTemValorResolvido(target, valor)) continue;
        let score = extratoRowScoreHistorico(target);
        if (score < 50) continue;
        const semValor = rowValorAbs(target) <= 0.0001;
        const linhaT = String(target._linhaOcr ?? '');
        if (valor > 500 && semValor && /TED\\s*RECEB|TEDRECEB|RECEBIMENTOS|PIX\\s*RECEB|CAMARA|VEREADORES|OURINHOS|RIBEIRAO/i.test(linhaT)) {
          score += 60;
        }
        if (/SISPAG|SANEAGO/i.test(linhaT) && semValor && valor > 5000) score -= 40;
        if (score > bestScore) {
          bestScore = score;
          bestJ = j;
        }
      }
      return bestJ;
    };

    let bestJ = pickBestTarget(idx - 1, Math.max(0, idx - 15), -1);
    if (bestJ < 0) bestJ = pickBestTarget(idx + 1, Math.min(working.length - 1, idx + 5), 1);
    if (bestJ < 0 && valor > 500) {
      bestJ = pickBestTarget(0, working.length - 1, 1);
    }
    if (bestJ >= 0) {
      anexarValorOrfaoExtratoRow(working[bestJ]!, row);
      consumed.add(idx);
      paired = true;
    }`;

if (s.includes(oldParearLoop)) {
  s = s.replace(oldParearLoop, newParearLoop);
} else if (!s.includes('const pickBestTarget = (from: number, to: number, step: number)')) {
  throw new Error('parearValoresOrfaos loop not found');
}

// 6) Valor operacional vs saldo na linha OCR
const oldValorPref = `export function extratoValorLancamentoPreferidoDaLinha(text: string): ExtratoValorTextoHit | null {
  const t = String(text ?? '').replace(/\\n+/g, ' ').replace(/\\s+/g, ' ').trim();
  if (!t) return null;
  const lanc = scanValoresLancamentoLinhaExtrato(t).filter((h) => h.value > 0.0001);
  if (lanc.length === 1) return lanc[0]!;
  if (lanc.length > 1) {
    const sorted = [...lanc].sort((a, b) => a.start - b.start);
    return sorted.find((h) => h.hasNature) ?? sorted[sorted.length - 1]!;
  }
  const all = scanValoresParaSplitExtrato(t);
  if (all.length === 0) return null;
  if (all.length === 1) return all[0]!;
  const sorted = [...all].sort((a, b) => a.start - b.start);
  return sorted.find((h) => h.hasNature) ?? sorted[sorted.length - 2] ?? all[0]!;
}`;

const newValorPref = `export function extratoValorLancamentoPreferidoDaLinha(text: string): ExtratoValorTextoHit | null {
  const t = String(text ?? '').replace(/\\n+/g, ' ').replace(/\\s+/g, ' ').trim();
  if (!t) return null;

  let hits = scanValoresParaSplitExtrato(t).filter((h) => h.value > 0.0001);
  if (hits.length === 0) {
    hits = scanValoresTextoLinhaExtrato(t).filter(
      (h) => h.value > 0.0001 && !extratoValorTextoEhSaldoDoDia(t, h),
    );
  }
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0]!;

  const sorted = [...hits].sort((a, b) => a.start - b.start);
  const indicaDeb = extratoLinhaIndicaDebitoOperacionalItau(t);
  const indicaCred = extratoLinhaIndicaCreditoOperacionalItau(t);

  const pickDebito = (): ExtratoValorTextoHit => {
    const comDeb = sorted.filter((h) => h.nature === 'D' || valorHitIndicaDebitoExtrato(t, h));
    if (comDeb.length) return comDeb.sort((a, b) => a.value - b.value)[0]!;
    return sorted.sort((a, b) => a.value - b.value)[0]!;
  };

  const pickCredito = (): ExtratoValorTextoHit => {
    const comCred = sorted.filter(
      (h) => h.nature === 'C' || (!valorHitIndicaDebitoExtrato(t, h) && h.nature !== 'D'),
    );
    if (comCred.length) {
      if (/\\bRENDIMENTOS|\\bREND\\b/i.test(t) && comCred.every((h) => h.value < 5)) {
        return comCred.sort((a, b) => a.value - b.value)[0]!;
      }
      return comCred.sort((a, b) => b.value - a.value)[0]!;
    }
    return sorted[sorted.length - 1]!;
  };

  if (indicaDeb && !indicaCred) return pickDebito();
  if (indicaCred && !indicaDeb) return pickCredito();

  if (sorted.length >= 2) {
    const byVal = [...sorted].sort((a, b) => a.value - b.value);
    const menor = byVal[0]!;
    const maior = byVal[byVal.length - 1]!;
    if (maior.value > menor.value * 3) return menor;
  }
  return sorted.find((h) => h.hasNature) ?? sorted[0]!;
}`;

if (s.includes(oldValorPref)) {
  s = s.replace(oldValorPref, newValorPref);
} else if (!s.includes('const pickDebito = (): ExtratoValorTextoHit =>')) {
  throw new Error('extratoValorLancamentoPreferidoDaLinha block not found');
}

const oldCorrigir = `export function extratoCorrigirRowNaturezaValorDesalinhado(row: OcrExtratoRow): OcrExtratoRow {
  const out = { ...row };
  const desc = resolveExtratoDescricaoText(out).trim();
  if (/^[DCdc]$/.test(desc)) {
    out.descricao = '';
    out.historicoOperacao = '';
    if (/^[DCdc]$/.test(String(out.natureza ?? '').trim())) out.natureza = '';
  }
  if (!resolveExtratoDescricaoText(out).trim() && out._linhaOcr?.trim()) {
    const inferred = inferDescricaoFromLinhaOcr(out._linhaOcr, out).trim();
    if (inferred && extratoHistoricoEhPlausivel(inferred)) {
      out.descricao = inferred;
      out.historicoOperacao = '';
    }
  }
  return out;
}`;

const newCorrigir = `export function extratoCorrigirRowNaturezaValorDesalinhado(row: OcrExtratoRow): OcrExtratoRow {
  const out = { ...row };
  const desc = resolveExtratoDescricaoText(out).trim();
  if (/^[DCdc]$/.test(desc)) {
    out.descricao = '';
    out.historicoOperacao = '';
    if (/^[DCdc]$/.test(String(out.natureza ?? '').trim())) out.natureza = '';
  }
  if (!resolveExtratoDescricaoText(out).trim() && out._linhaOcr?.trim()) {
    const inferred = inferDescricaoFromLinhaOcr(out._linhaOcr, out).trim();
    if (inferred && extratoHistoricoEhPlausivel(inferred)) {
      out.descricao = inferred;
      out.historicoOperacao = '';
    }
  }
  const linha = String(out._linhaOcr ?? '').replace(/\\s+/g, ' ').trim();
  if (linha) {
    const lancHit = extratoValorLancamentoPreferidoDaLinha(linha);
    const picked =
      parseExtratoMoneyValue(out.valorMisto ?? '') ||
      parseExtratoMoneyValue(out.valorDebito ?? '') ||
      parseExtratoMoneyValue(out.valorCredito ?? '');
    if (lancHit && lancHit.value > 0.0001 && picked > 0.0001) {
      const diverge =
        Math.abs(picked - lancHit.value) > 0.05 &&
        (picked > lancHit.value * 1.8 ||
          lancHit.value > picked * 1.8 ||
          extratoLinhaIndicaDebitoOperacionalItau(linha) ||
          extratoLinhaIndicaCreditoOperacionalItau(linha));
      if (diverge) {
        let nat: 'D' | 'C' = lancHit.nature ?? 'C';
        if (!lancHit.hasNature) {
          nat = inferirNaturezaValorExtratoHit(linha, lancHit);
        }
        out.valorMisto = formatExtratoValorAssinadoPt(lancHit.value, nat);
        out.valorDebito = '';
        out.valorCredito = '';
      }
    }
  }
  const ctx = [linha, resolveExtratoDescricaoText(out)].filter(Boolean).join(' ').trim();
  const picked =
    parseExtratoMoneyValue(out.valorMisto ?? '') ||
    parseExtratoMoneyValue(out.valorDebito ?? '') ||
    parseExtratoMoneyValue(out.valorCredito ?? '');
  if (ctx && picked > 0.0001 && out.valorMisto?.trim()) {
    const natAtual = extratoNaturezaPorValorAssinadoNoToken(out.valorMisto, picked);
    const indDeb = extratoLinhaIndicaDebitoOperacionalItau(ctx);
    const indCred = extratoLinhaIndicaCreditoOperacionalItau(ctx);
    let natCorreta: 'D' | 'C' | null = null;
    if (indDeb && !indCred) natCorreta = 'D';
    else if (indCred && !indDeb) natCorreta = 'C';
    if (natCorreta && natAtual !== natCorreta) {
      out.valorMisto = formatExtratoValorAssinadoPt(picked, natCorreta);
      out.valorDebito = '';
      out.valorCredito = '';
    }
  }
  return out;
}`;

if (s.includes(oldCorrigir)) {
  s = s.replace(oldCorrigir, newCorrigir);
} else if (!s.includes('const lancHit = extratoValorLancamentoPreferidoDaLinha(linha)')) {
  throw new Error('extratoCorrigirRowNaturezaValorDesalinhado block not found');
}

// 7) Reconciliar valor no pós-processamento
rep(
  `    cur = cur
      .map((r) => {
        const sanitized = sanitizeExtratoOcrRowColumns(r);
        if (!resolveExtratoDescricaoText(sanitized) && sanitized._linhaOcr?.trim()) {
          const inferred = inferDescricaoFromLinhaOcr(sanitized._linhaOcr, sanitized);
          if (inferred && !tokenEhValorExtrato(inferred)) sanitized.descricao = inferred;
        }
        return cleanExtratoOcrRowForImport(sanitized);
      })`,
  `    cur = cur
      .map((r) => {
        const corrected = extratoCorrigirRowNaturezaValorDesalinhado(r);
        const sanitized = sanitizeExtratoOcrRowColumns(corrected);
        if (!resolveExtratoDescricaoText(sanitized) && sanitized._linhaOcr?.trim()) {
          const inferred = inferDescricaoFromLinhaOcr(sanitized._linhaOcr, sanitized);
          if (inferred && !tokenEhValorExtrato(inferred)) sanitized.descricao = inferred;
        }
        return cleanExtratoOcrRowForImport(sanitized);
      })`,
  'postProcess extratoCorrigirRow',
);

// 8) Não descartar débito assinado quando há saldo com D/C na mesma linha
const oldPool = `  const comNatureza = matches.filter((x) => x.hasNature && x.value > 0.0001);
  const pool = comNatureza.length > 0 ? comNatureza : matches.filter((x) => x.value > 0.0001);
  return deduplicarValoresTextoLinhaExtrato(pool);`;

const newPool = `  const comNatureza = matches.filter((x) => x.hasNature && x.value > 0.0001);
  const comDebitoAssinado = matches.filter(
    (x) => x.value > 0.0001 && valorHitIndicaDebitoExtrato(linha, x) && !x.hasNature,
  );
  const comCreditoSemNature = matches.filter(
    (x) =>
      x.value > 0.0001 &&
      !x.hasNature &&
      !valorHitIndicaDebitoExtrato(linha, x) &&
      extratoLinhaIndicaCreditoOperacionalItau(linha),
  );
  const pool =
    comNatureza.length > 0 && comDebitoAssinado.length === 0 && comCreditoSemNature.length === 0
      ? comNatureza
      : matches.filter((x) => x.value > 0.0001);
  return deduplicarValoresTextoLinhaExtrato(pool);`;

if (s.includes(oldPool)) {
  s = s.replace(oldPool, newPool);
} else if (!s.includes('comDebitoAssinado')) {
  throw new Error('scanValoresTextoLinhaExtrato pool block not found');
}

// 9) scanValoresParaSplitExtrato — não retornar cedo com saldo único
rep(
  `  const comSinal = hits.filter((h) => valorHitIndicaDebitoExtrato(linha, h) || h.hasNature);
  if (comSinal.length === 1) return comSinal;
  return filtrarValoresParaSplitExtrato(linha, hits);`,
  `  const comSinal = hits.filter((h) => valorHitIndicaDebitoExtrato(linha, h) || h.hasNature);
  if (comSinal.length === 1 && hits.length === 1) return comSinal;
  return filtrarValoresParaSplitExtrato(linha, hits);`,
  'scanValoresParaSplitExtrato comSinal',
);

fs.writeFileSync(p, s);
console.log('OK patch-extrato-import-fix');
