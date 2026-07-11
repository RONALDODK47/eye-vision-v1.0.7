/**
 * Extração automática dos documentos de cada pasta (texto salvo + IA quando possível).
 */
import { extractColigadasWithAi, extractSociosWithAi } from '../../lib/aiColigadasExtractClient';
import {
  ALL_INTELIGENCIA_PASTAS,
  extractColigadasFromTexto,
  extractSociosFromTexto,
  loadAiInteligenciaAsync,
  saveAiInteligencia,
  upsertColigadasFromExtract,
  upsertSociosFromExtract,
  type AiInteligenciaDoc,
  type AiInteligenciaPasta,
  type AiInteligenciaStore,
} from './aiInteligenciaStorage';
import { buildPastaTableRows } from './aiInteligenciaPastaTable';

export type PastaExtracaoResult = {
  store: AiInteligenciaStore;
  linhasTabela: number;
  docsProcessados: number;
  docsIgnorados: number;
  message: string;
};

export function docPrecisaExtracaoAutomatica(doc: AiInteligenciaDoc): boolean {
  const texto = String(doc.textoExtraido ?? '').trim();
  if (!texto || texto.startsWith('[arquivo]')) return true;
  if (/^imagem\s+anexada:/i.test(texto) && !/\[IA\s+/i.test(texto)) return true;
  if (texto.length < 80 && !/\[IA\s+/i.test(texto)) return true;
  return false;
}

function iaMarkerForPasta(pasta: AiInteligenciaPasta): string {
  if (pasta === 'coligadas') return 'coligadas';
  if (pasta === 'financeiras') return 'financeiras';
  if (pasta === 'honorarios') return 'honorarios';
  return 'socios';
}

export async function extrairDadosPastaInteligenciaIa(
  company: string,
  pasta: AiInteligenciaPasta,
): Promise<PastaExtracaoResult> {
  const store = await loadAiInteligenciaAsync(company);
  const docs = store.docs.filter((d) => d.pasta === pasta);
  if (docs.length === 0) {
    return {
      store,
      linhasTabela: buildPastaTableRows(pasta, [], {
        coligadas: store.coligadas,
        socios: store.socios,
      }).length,
      docsProcessados: 0,
      docsIgnorados: 0,
      message: 'Nenhum documento nesta pasta — configure os grupos ou envie arquivos.',
    };
  }

  let docsProcessados = 0;
  let docsIgnorados = 0;
  const allColigadas: Array<{ nome: string; aliases: string[] }> = [];
  const allSocios: Array<{ nome: string; aliases: string[] }> = [];
  const docsUpdated = [...store.docs];
  const marker = iaMarkerForPasta(pasta);

  for (const doc of docs) {
    const idx = docsUpdated.findIndex((d) => d.id === doc.id);
    if (idx < 0) continue;

    const texto = String(doc.textoExtraido ?? '').trim();
    if (!texto || texto.startsWith('[arquivo]')) {
      docsIgnorados += 1;
      continue;
    }

    docsProcessados += 1;
    let extra = texto;

    if (pasta === 'coligadas') {
      allColigadas.push(...extractColigadasFromTexto(texto));
      const precisaIa =
        /^imagem\s+anexada:/i.test(texto) || texto.length < 80 || !/\[IA\s+coligadas\]/i.test(texto);
      if (precisaIa && texto.length < 8000) {
        const ia = await extractColigadasWithAi({
          fileName: doc.nome,
          text: /^imagem\s+anexada:/i.test(texto) ? '' : texto,
          images: [],
        });
        if (ia.ok && ia.coligadas?.length) {
          allColigadas.push(...ia.coligadas);
          const nomes = ia.coligadas.map((c) => c.nome).join('; ');
          extra = `${texto}\n\n[IA coligadas] ${nomes}`.slice(0, 12_000);
        }
      }
    }

    if (pasta === 'contratos' || pasta === 'honorarios' || pasta === 'financeiras') {
      allSocios.push(...extractSociosFromTexto(texto));
      const precisaIa =
        /^imagem\s+anexada:/i.test(texto) ||
        texto.length < 80 ||
        !new RegExp(`\\[IA\\s+${marker}\\]`, 'i').test(texto);
      if (precisaIa && texto.length < 8000) {
        const ia = await extractSociosWithAi({
          fileName: doc.nome,
          text: /^imagem\s+anexada:/i.test(texto) ? '' : texto,
          images: [],
        });
        if (ia.ok && ia.coligadas?.length) {
          allSocios.push(...ia.coligadas);
          const nomes = ia.coligadas.map((c) => c.nome).join('; ');
          extra = `${texto}\n\n[IA ${marker}] ${nomes}`.slice(0, 12_000);
        }
      }
    }

    if (extra !== doc.textoExtraido) {
      docsUpdated[idx] = { ...docsUpdated[idx]!, textoExtraido: extra };
    }
  }

  let next = saveAiInteligencia(company, { ...store, docs: docsUpdated });
  if (allColigadas.length > 0 && pasta === 'coligadas') {
    next = upsertColigadasFromExtract(company, allColigadas);
  }
  if (allSocios.length > 0 && (pasta === 'contratos' || pasta === 'honorarios' || pasta === 'financeiras')) {
    next = upsertSociosFromExtract(company, allSocios);
  }

  const pastaDocs = next.docs.filter((d) => d.pasta === pasta);
  const linhasTabela = buildPastaTableRows(pasta, pastaDocs, {
    coligadas: next.coligadas,
    socios: next.socios,
  }).length;

  const partes: string[] = [];
  if (docsProcessados > 0) partes.push(`${docsProcessados} doc(s) processado(s)`);
  if (linhasTabela > 0) partes.push(`${linhasTabela} linha(s) na tabela`);
  if (docsIgnorados > 0) {
    partes.push(`${docsIgnorados} aguardando leitura — reenvie o arquivo se necessário`);
  }
  if (linhasTabela === 0 && docsProcessados > 0) {
    partes.push('nenhum dado estruturado encontrado — verifique a IA ou reenvie a imagem');
  }

  return {
    store: next,
    linhasTabela,
    docsProcessados,
    docsIgnorados,
    message: partes.length ? partes.join(' · ') : 'Nada a extrair.',
  };
}

/** Extrai automaticamente todas as pastas com documentos pendentes. */
export async function extrairPastasPendentesAutomaticamente(
  company: string,
  pastas?: AiInteligenciaPasta[],
): Promise<{ store: AiInteligenciaStore; messages: string[] }> {
  const store = await loadAiInteligenciaAsync(company);
  const alvo = (pastas ?? ALL_INTELIGENCIA_PASTAS).filter((pasta) =>
    store.docs.some((d) => d.pasta === pasta),
  );
  let current = store;
  const messages: string[] = [];
  for (const pasta of alvo) {
    const temPendente = current.docs.some(
      (d) => d.pasta === pasta && docPrecisaExtracaoAutomatica(d),
    );
    const temDocs = current.docs.some((d) => d.pasta === pasta);
    if (!temDocs) continue;
    if (
      !temPendente &&
      buildPastaTableRows(pasta, current.docs.filter((d) => d.pasta === pasta), {
        coligadas: current.coligadas,
        socios: current.socios,
      }).length > 0
    ) {
      continue;
    }
    const result = await extrairDadosPastaInteligenciaIa(company, pasta);
    current = result.store;
    if (result.message && result.message !== 'Nada a extrair.') {
      messages.push(`${pasta}: ${result.message}`);
    }
  }
  return { store: current, messages };
}
