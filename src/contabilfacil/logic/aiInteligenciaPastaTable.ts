/**
 * Tabela de dados extraídos por pasta da Inteligência IA.
 */
import {
  extractColigadasFromTexto,
  extractSociosFromTexto,
  parseIaMarkerNomes,
  type AiColigada,
  type AiInteligenciaDoc,
  type AiInteligenciaPasta,
  type AiInteligenciaPastaConfig,
  type AiSocio,
} from './aiInteligenciaStorage';

export type PastaTableColumn = { key: string; label: string };
export type PastaTableRow = Record<string, string>;

export type PastaTableStoreExtras = {
  coligadas?: AiColigada[];
  socios?: AiSocio[];
};

export function getPastaTableColumns(pasta: AiInteligenciaPasta): PastaTableColumn[] {
  switch (pasta) {
    case 'coligadas':
      return [
        { key: 'documento', label: 'Documento' },
        { key: 'nome', label: 'Empresa coligada' },
        { key: 'aliases', label: 'Aliases' },
      ];
    case 'contratos':
      return [
        { key: 'documento', label: 'Documento' },
        { key: 'nome', label: 'Sócio / parte' },
        { key: 'aliases', label: 'Aliases' },
      ];
    case 'honorarios':
      return [
        { key: 'documento', label: 'Documento' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'nome', label: 'Descrição' },
        { key: 'aliases', label: 'Aliases' },
      ];
    case 'financeiras':
      return [
        { key: 'documento', label: 'Documento' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'nome', label: 'Descrição' },
        { key: 'aliases', label: 'Aliases' },
      ];
    default:
      return [];
  }
}

export function getPastaGrupoTableColumns(): PastaTableColumn[] {
  return [
    { key: 'sentido', label: 'Sentido' },
    { key: 'grupo', label: 'Grupo sintético' },
  ];
}

export function buildPastaGrupoTableRows(
  config?: AiInteligenciaPastaConfig | null,
): PastaTableRow[] {
  const rows: PastaTableRow[] = [];
  if (config?.contaGrupoSaida?.trim()) {
    rows.push({ sentido: 'Saída (D no banco)', grupo: config.contaGrupoSaida.trim() });
  }
  if (config?.contaGrupoEntrada?.trim()) {
    rows.push({ sentido: 'Entrada (C no banco)', grupo: config.contaGrupoEntrada.trim() });
  }
  return rows;
}

function extractHonorariosFromTexto(texto: string): Array<{ nome: string; aliases: string[] }> {
  const lines = String(texto ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 200);
  const out: Array<{ nome: string; aliases: string[] }> = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (!/honor[aá]rio|mensalidade|retainer|fee|presta[cç][aã]o\s+de\s+serv/i.test(line)) continue;
    const cleaned = line.replace(/^[-*•·\d.)\]]+\s*/, '').slice(0, 120);
    if (cleaned.length < 4 || seen.has(cleaned.toUpperCase())) continue;
    seen.add(cleaned.toUpperCase());
    out.push({ nome: cleaned, aliases: [cleaned.toUpperCase()] });
    if (out.length >= 20) break;
  }
  for (const item of parseIaMarkerNomes(texto, ['honorarios'])) {
    const key = item.nome.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function extractFinanceirasFromTexto(texto: string): Array<{ nome: string; aliases: string[]; tipo: string }> {
  const lines = String(texto ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 200);
  const out: Array<{ nome: string; aliases: string[]; tipo: string }> = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (!/tarifa|juros|rendimento|iof|financeir|aplicac|desconto|multa\s+banc/i.test(line)) continue;
    const cleaned = line.replace(/^[-*•·\d.)\]]+\s*/, '').slice(0, 120);
    if (cleaned.length < 4 || seen.has(cleaned.toUpperCase())) continue;
    seen.add(cleaned.toUpperCase());
    const tipo = /rendimento|aplicac|juros/i.test(cleaned) ? 'Receita financeira' : 'Despesa financeira';
    out.push({ nome: cleaned, aliases: [cleaned.toUpperCase()], tipo });
    if (out.length >= 20) break;
  }
  for (const item of parseIaMarkerNomes(texto, ['financeiras'])) {
    const key = item.nome.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const tipo = /rendimento|aplicac|juros|receita/i.test(item.nome)
      ? 'Receita financeira'
      : 'Despesa financeira';
    out.push({ ...item, tipo });
  }
  return out;
}

function rowKey(row: PastaTableRow): string {
  return `${row.nome ?? ''}|${row.documento ?? ''}`.toUpperCase();
}

function appendStoreRows(
  rows: PastaTableRow[],
  seen: Set<string>,
  items: Array<{ nome: string; aliases: string[] }>,
  docLabel: string,
  extra?: Partial<PastaTableRow>,
): void {
  for (const item of items) {
    const row: PastaTableRow = {
      documento: docLabel,
      nome: item.nome,
      aliases: item.aliases.join(' · '),
      ...extra,
    };
    const key = rowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
}

export function buildPastaTableRows(
  pasta: AiInteligenciaPasta,
  docs: AiInteligenciaDoc[],
  storeExtras?: PastaTableStoreExtras,
): PastaTableRow[] {
  const rows: PastaTableRow[] = [];
  const seen = new Set<string>();

  for (const doc of docs) {
    const texto = String(doc.textoExtraido || '').trim();
    const docLabel = doc.nome;
    if (!texto || texto.startsWith('[arquivo]')) continue;

    if (pasta === 'coligadas') {
      for (const item of extractColigadasFromTexto(texto)) {
        const row = { documento: docLabel, nome: item.nome, aliases: item.aliases.join(' · ') };
        const key = rowKey(row);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
      continue;
    }

    if (pasta === 'contratos') {
      for (const item of extractSociosFromTexto(texto)) {
        const row = { documento: docLabel, nome: item.nome, aliases: item.aliases.join(' · ') };
        const key = rowKey(row);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
      continue;
    }

    if (pasta === 'honorarios') {
      for (const item of extractHonorariosFromTexto(texto)) {
        const row = {
          documento: docLabel,
          tipo: 'Honorário',
          nome: item.nome,
          aliases: item.aliases.join(' · '),
        };
        const key = rowKey(row);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
      for (const item of extractSociosFromTexto(texto)) {
        const row = {
          documento: docLabel,
          tipo: 'Sócio / parte',
          nome: item.nome,
          aliases: item.aliases.join(' · '),
        };
        const key = rowKey(row);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
      continue;
    }

    if (pasta === 'financeiras') {
      for (const item of extractFinanceirasFromTexto(texto)) {
        const row = {
          documento: docLabel,
          tipo: item.tipo,
          nome: item.nome,
          aliases: item.aliases.join(' · '),
        };
        const key = rowKey(row);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
    }
  }

  if (pasta === 'coligadas' && storeExtras?.coligadas?.length) {
    appendStoreRows(rows, seen, storeExtras.coligadas, '(cadastro IA)', {});
  }
  if ((pasta === 'contratos' || pasta === 'honorarios') && storeExtras?.socios?.length) {
    appendStoreRows(rows, seen, storeExtras.socios, '(cadastro IA)', {
      tipo: pasta === 'honorarios' ? 'Sócio / parte' : undefined,
    });
  }

  return rows.slice(0, 200);
}
