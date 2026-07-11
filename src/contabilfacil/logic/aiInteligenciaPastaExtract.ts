/**
 * Extração automática via IA — somente do documento enviado na pasta.
 */
import { extractColigadasWithAi, extractSociosWithAi } from '../../lib/aiColigadasExtractClient';
import {
  ALL_INTELIGENCIA_PASTAS,
  formatIaExtractBlock,
  iaMarkersForPasta,
  loadAiInteligencia,
  loadAiInteligenciaAsync,
  mergeInteligenciaStorePreferNewer,
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
  const markers = iaMarkersForPasta(doc.pasta);
  if (markers.some((m) => new RegExp(`\\[IA\\s+${m}\\]`, 'i').test(texto))) return false;
  return true;
}

function iaMarkerForPasta(pasta: AiInteligenciaPasta): string {
  if (pasta === 'coligadas') return 'coligadas';
  if (pasta === 'financeiras') return 'financeiras';
  if (pasta === 'honorarios') return 'honorarios';
  return 'socios';
}

async function extrairDocumentoComIa(
  pasta: AiInteligenciaPasta,
  doc: AiInteligenciaDoc,
): Promise<{ texto: string; coligadas: Array<{ nome: string; aliases: string[] }>; socios: Array<{ nome: string; aliases: string[] }> }> {
  const textoAtual = String(doc.textoExtraido ?? '').trim();
  const marker = iaMarkerForPasta(pasta);
  const markers = iaMarkersForPasta(pasta);
  if (markers.some((m) => new RegExp(`\\[IA\\s+${m}\\]`, 'i').test(textoAtual))) {
    return { texto: textoAtual, coligadas: [], socios: [] };
  }

  const ocrText = /^imagem\s+anexada:/i.test(textoAtual) || textoAtual.startsWith('[arquivo]') ? '' : textoAtual;

  if (pasta === 'coligadas') {
    const ia = await extractColigadasWithAi({
      fileName: doc.nome,
      text: ocrText,
      images: [],
    });
    if (ia.ok && ia.coligadas?.length) {
      return {
        texto: formatIaExtractBlock('coligadas', ia.coligadas),
        coligadas: ia.coligadas,
        socios: [],
      };
    }
    return { texto: textoAtual, coligadas: [], socios: [] };
  }

  const ia = await extractSociosWithAi({
    fileName: doc.nome,
    text: ocrText,
    images: [],
  });
  if (ia.ok && ia.coligadas?.length) {
    return {
      texto: formatIaExtractBlock(marker, ia.coligadas),
      coligadas: [],
      socios: ia.coligadas,
    };
  }
  return { texto: textoAtual, coligadas: [], socios: [] };
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
      linhasTabela: 0,
      docsProcessados: 0,
      docsIgnorados: 0,
      message: 'Nenhum documento nesta pasta.',
    };
  }

  let docsProcessados = 0;
  let docsIgnorados = 0;
  const allColigadas: Array<{ nome: string; aliases: string[] }> = [];
  const allSocios: Array<{ nome: string; aliases: string[] }> = [];
  const textoPatches = new Map<string, string>();

  for (const doc of docs) {
    const live = loadAiInteligencia(company);
    if (!live.docs.some((d) => d.id === doc.id)) continue;

    const texto = String(doc.textoExtraido ?? '').trim();
    if (!texto || texto.startsWith('[arquivo]')) {
      docsIgnorados += 1;
      continue;
    }

    docsProcessados += 1;
    const result = await extrairDocumentoComIa(pasta, doc);
    if (!loadAiInteligencia(company).docs.some((d) => d.id === doc.id)) continue;
    allColigadas.push(...result.coligadas);
    allSocios.push(...result.socios);
    if (result.texto !== doc.textoExtraido) {
      textoPatches.set(doc.id, result.texto);
    }
  }

  const liveBeforeSave = loadAiInteligencia(company);
  const mergedDocs = liveBeforeSave.docs.map((d) =>
    textoPatches.has(d.id) ? { ...d, textoExtraido: textoPatches.get(d.id)! } : d,
  );
  let next = saveAiInteligencia(company, { ...liveBeforeSave, docs: mergedDocs });
  if (allColigadas.length > 0 && pasta === 'coligadas') {
    next = upsertColigadasFromExtract(company, allColigadas);
  }
  if (allSocios.length > 0 && (pasta === 'contratos' || pasta === 'honorarios' || pasta === 'financeiras')) {
    next = upsertSociosFromExtract(company, allSocios);
  }

  const pastaDocs = next.docs.filter((d) => d.pasta === pasta);
  const linhasTabela = buildPastaTableRows(pasta, pastaDocs).length;

  const partes: string[] = [];
  if (docsProcessados > 0) partes.push(`${docsProcessados} doc(s) processado(s)`);
  if (linhasTabela > 0) partes.push(`${linhasTabela} linha(s) extraída(s) pela IA`);
  if (docsIgnorados > 0) {
    partes.push(`${docsIgnorados} aguardando leitura — reenvie o arquivo`);
  }
  if (linhasTabela === 0 && docsProcessados > 0) {
    partes.push('IA não encontrou dados neste documento — reenvie ou verifique a chave IA');
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
  let current = loadAiInteligencia(company);
  const messages: string[] = [];
  for (const pasta of alvo) {
    current = loadAiInteligencia(company);
    const temDocs = current.docs.some((d) => d.pasta === pasta);
    if (!temDocs) continue;
    const temPendente = current.docs.some(
      (d) => d.pasta === pasta && docPrecisaExtracaoAutomatica(d),
    );
    const linhasAtuais = buildPastaTableRows(
      pasta,
      current.docs.filter((d) => d.pasta === pasta),
    ).length;
    if (!temPendente && linhasAtuais > 0) continue;

    const result = await extrairDadosPastaInteligenciaIa(company, pasta);
    current = mergeInteligenciaStorePreferNewer(loadAiInteligencia(company), result.store);
    if (result.message && result.message !== 'Nada a extrair.') {
      messages.push(`${pasta}: ${result.message}`);
    }
  }
  return { store: current, messages };
}
