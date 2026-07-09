import { fiscalApiCandidateBases } from './fiscalApiBase';
import type {
  NfeCreditoSugerido,
  NfeItemEstoque,
  NfeNotaResumo,
} from '../contabilfacil/logic/pricingTypes';

export type NfeDistribuicaoParams = {
  cnpj: string;
  uf?: string;
  ambiente?: 'homologacao' | 'producao';
  certificadoA1: File;
  senhaCertificado: string;
  dataInicio?: string;
  dataFim?: string;
  /** Último NSU já consultado — continua de onde parou. */
  ultNSU?: string;
  /** Manifestar ciência da operação (210210) para liberar XML completo. */
  manifestarCiencia?: boolean;
};

export type NfeDistribuicaoResult = {
  ok: boolean;
  mensagem: string;
  notas: NfeNotaResumo[];
  itensEstoque: NfeItemEstoque[];
  creditosSugeridos: NfeCreditoSugerido[];
  fonte?: string;
  ultNSU?: string;
  maxNSU?: string;
  manifestados?: number;
};

/** Intervalo mínimo entre sincronizações SEFAZ (evita cStat 656). */
export const NFE_SEFAZ_MIN_INTERVAL_MS = 60 * 60 * 1000;

export async function pingNfePrecificacaoApi(): Promise<boolean> {
  for (const base of fiscalApiCandidateBases()) {
    try {
      const res = await fetch(`${base}/health`, { cache: 'no-store' });
      if (res.ok) return true;
    } catch {
      // próximo
    }
  }
  return false;
}

export async function fetchNfeDistribuicaoSefaz(
  params: NfeDistribuicaoParams,
): Promise<NfeDistribuicaoResult> {
  const fd = new FormData();
  fd.append('cnpj', params.cnpj.replace(/\D/g, ''));
  fd.append('uf', (params.uf ?? 'SP').trim().toUpperCase());
  fd.append('ambiente', params.ambiente ?? 'producao');
  fd.append('senhaCertificado', params.senhaCertificado);
  fd.append('certificadoA1', params.certificadoA1);
  if (params.dataInicio) fd.append('dataInicio', params.dataInicio);
  if (params.dataFim) fd.append('dataFim', params.dataFim);
  if (params.ultNSU) fd.append('ultNSU', params.ultNSU.replace(/\D/g, '') || '0');
  fd.append('manifestarCiencia', params.manifestarCiencia === false ? 'false' : 'true');

  let lastErr = 'API fiscal offline (:8780)';
  for (const base of fiscalApiCandidateBases()) {
    try {
      const res = await fetch(`${base}/sefaz/nfe/distribuicao`, {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json()) as NfeDistribuicaoResult & { mensagem?: string };
      if (!res.ok) {
        lastErr = data.mensagem ?? `HTTP ${res.status}`;
        continue;
      }
      return {
        ok: data.ok !== false,
        mensagem: data.mensagem ?? 'NFe sincronizadas.',
        notas: data.notas ?? [],
        itensEstoque: data.itensEstoque ?? [],
        creditosSugeridos: data.creditosSugeridos ?? [],
        fonte: data.fonte ?? 'sefaz_distdfe',
        ultNSU: data.ultNSU,
        maxNSU: data.maxNSU,
        manifestados: data.manifestados,
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : lastErr;
    }
  }
  return {
    ok: false,
    mensagem: lastErr,
    notas: [],
    itensEstoque: [],
    creditosSugeridos: [],
  };
}

export async function importNfeXmlFiles(
  files: File[],
  opts: { dataInicio?: string; dataFim?: string } = {},
): Promise<NfeDistribuicaoResult> {
  const fd = new FormData();
  for (const file of files) fd.append('arquivos', file);
  if (opts.dataInicio) fd.append('dataInicio', opts.dataInicio);
  if (opts.dataFim) fd.append('dataFim', opts.dataFim);

  let lastErr = 'API fiscal offline (:8780)';
  for (const base of fiscalApiCandidateBases()) {
    try {
      const res = await fetch(`${base}/sefaz/nfe/importar-xml`, { method: 'POST', body: fd });
      const data = (await res.json()) as NfeDistribuicaoResult & { mensagem?: string; ignorados?: string[] };
      if (!res.ok) {
        lastErr = data.mensagem ?? `HTTP ${res.status}`;
        continue;
      }
      let msg = data.mensagem ?? 'XMLs importados.';
      if (data.ignorados?.length) {
        msg += ` (${data.ignorados.length} arquivo(s) ignorado(s))`;
      }
      return {
        ok: data.ok !== false,
        mensagem: msg,
        notas: data.notas ?? [],
        itensEstoque: data.itensEstoque ?? [],
        creditosSugeridos: data.creditosSugeridos ?? [],
        fonte: data.fonte ?? 'xml_upload',
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : lastErr;
    }
  }
  return {
    ok: false,
    mensagem: lastErr,
    notas: [],
    itensEstoque: [],
    creditosSugeridos: [],
  };
}

export async function sugerirLancamentoReceitaFederal(linhaNome: string): Promise<{
  fundamentoLegal?: string;
  impostoKey?: string;
  historicoSugerido?: string;
}> {
  for (const base of fiscalApiCandidateBases()) {
    try {
      const res = await fetch(`${base}/receita-federal/sugerir-lancamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linhaNome, origem: 'fiscal' }),
      });
      if (!res.ok) continue;
      return (await res.json()) as {
        fundamentoLegal?: string;
        impostoKey?: string;
        historicoSugerido?: string;
      };
    } catch {
      // próximo
    }
  }
  return {};
}
