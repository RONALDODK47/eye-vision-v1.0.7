import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Upload } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import {
  CF_FIELD_COL,
  CF_FIELD_ROW,
  CF_INPUT_MED,
  CF_LABEL,
  CF_SELECT,
} from '../lib/formFieldClasses';
import { buildNfeCacheFromApi, mergeNfeCache } from '../logic/pricingNfeCredits';
import type { FiscalNfeCache } from '../logic/fiscalNfeStorage';
import { loadFiscalNfeCache, saveFiscalNfeCache } from '../logic/fiscalNfeStorage';
import {
  fetchNfeDistribuicaoSefaz,
  importNfeXmlFiles,
  NFE_SEFAZ_MIN_INTERVAL_MS,
  probeNfeFiscalApiStatus,
  type NfeFiscalApiStatus,
} from '../../services/nfePrecificacaoApi';

const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

type Props = {
  selectedCompany: string;
};

function fiscalApiStatusLabel(status: NfeFiscalApiStatus | null): string {
  if (!status) return '…';
  if (status.nfeReady) {
    if (status.mode === 'local') return 'online (:8780 local)';
    if (status.mode === 'proxy') return 'online (proxy local)';
    return 'online (nuvem)';
  }
  if (status.online) return 'health OK · NF-e OFF';
  return 'offline';
}

export default function FiscalNotasFiscaisPanel({ selectedCompany }: Props) {
  const certRef = useRef<HTMLInputElement>(null);
  const xmlRef = useRef<HTMLInputElement>(null);
  const [cache, setCache] = useState<FiscalNfeCache | undefined>(() =>
    loadFiscalNfeCache(selectedCompany),
  );
  const [cnpj, setCnpj] = useState('');
  const [uf, setUf] = useState('SP');
  const [ambiente, setAmbiente] = useState<'producao' | 'homologacao'>('producao');
  const [senha, setSenha] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [certFile, setCertFile] = useState<File | null>(null);
  const [manifestarCiencia, setManifestarCiencia] = useState(true);
  const [apiStatus, setApiStatus] = useState<NfeFiscalApiStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [importingXml, setImportingXml] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadFiscalNfeCache(selectedCompany);
    setCache(loaded);
    if (loaded?.cnpjSync) setCnpj(loaded.cnpjSync);
    if (loaded?.ufSync) setUf(loaded.ufSync);
  }, [selectedCompany]);

  useEffect(() => {
    probeNfeFiscalApiStatus().then(setApiStatus).catch(() =>
      setApiStatus({ online: false, nfeReady: false }),
    );
  }, []);

  const persistCache = useCallback(
    (next: FiscalNfeCache) => {
      setCache(next);
      saveFiscalNfeCache(selectedCompany, next);
    },
    [selectedCompany],
  );

  const proximaSyncPermitida = cache?.lastSyncAt
    ? new Date(cache.lastSyncAt).getTime() + NFE_SEFAZ_MIN_INTERVAL_MS
    : 0;
  const bloqueadoPorIntervalo = proximaSyncPermitida > Date.now();

  const syncSefaz = useCallback(async () => {
    setErro(null);
    setSucesso(null);
    const status = await probeNfeFiscalApiStatus();
    setApiStatus(status);
    if (!status.nfeReady) {
      setErro(
        status.hint ??
          'API fiscal NF-e indisponível. Rode npm run fiscal-api e abra http://localhost:3000.',
      );
      return;
    }
    if (!certFile) {
      setErro('Selecione o certificado digital e-CNPJ A1 (.pfx).');
      return;
    }
    if (!senha.trim()) {
      setErro('Informe a senha do certificado.');
      return;
    }
    if (cnpj.replace(/\D/g, '').length > 0 && cnpj.replace(/\D/g, '').length !== 14) {
      setErro('CNPJ inválido — use 14 dígitos ou deixe vazio para usar o do certificado.');
      return;
    }
    if (bloqueadoPorIntervalo) {
      const min = Math.ceil((proximaSyncPermitida - Date.now()) / 60_000);
      setErro(`Aguarde ~${min} min antes de nova consulta SEFAZ (evita bloqueio cStat 656).`);
      return;
    }

    setSyncing(true);
    try {
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      const ultNSU = cache?.cnpjSync === cnpjLimpo && cache?.ultNSU ? cache.ultNSU : '0';

      const result = await fetchNfeDistribuicaoSefaz({
        cnpj: cnpjLimpo,
        uf,
        ambiente,
        certificadoA1: certFile,
        senhaCertificado: senha,
        dataInicio: dataInicio || undefined,
        dataFim: dataFim || undefined,
        ultNSU,
        manifestarCiencia,
      });

      if (!result.ok) {
        setErro(result.mensagem);
        return;
      }

      const incoming = buildNfeCacheFromApi({
        notas: result.notas,
        itensEstoque: result.itensEstoque,
        creditosSugeridos: result.creditosSugeridos,
        ultNSU: result.ultNSU,
        maxNSU: result.maxNSU,
        manifestados: result.manifestados,
        cnpjSync: cnpjLimpo,
        ufSync: uf,
      });
      persistCache(mergeNfeCache(cache, incoming));
      setSucesso(result.mensagem);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao consultar webservice SEFAZ.');
    } finally {
      setSyncing(false);
    }
  }, [
    ambiente,
    bloqueadoPorIntervalo,
    cache,
    certFile,
    cnpj,
    dataFim,
    dataInicio,
    manifestarCiencia,
    persistCache,
    proximaSyncPermitida,
    senha,
    uf,
  ]);

  const resetarNsu = useCallback(() => {
    if (!cache) return;
    persistCache({ ...cache, ultNSU: '0', maxNSU: '0' });
    setSucesso('NSU reiniciado — próxima consulta buscará desde o início.');
    setErro(null);
  }, [cache, persistCache]);

  const importarXmls = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) {
        setErro('Selecione um ou mais arquivos .xml de NF-e.');
        return;
      }
      setErro(null);
      setSucesso(null);
      setImportingXml(true);
      try {
        const result = await importNfeXmlFiles([...files], {
          dataInicio: dataInicio || undefined,
          dataFim: dataFim || undefined,
        });
        if (!result.ok) {
          setErro(result.mensagem);
          return;
        }
        persistCache(mergeNfeCache(cache, buildNfeCacheFromApi(result)));
        setSucesso(result.mensagem);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Falha ao importar XMLs.');
      } finally {
        setImportingXml(false);
      }
    },
    [cache, dataFim, dataInicio, persistCache],
  );

  const limparCache = useCallback(() => {
    if (!window.confirm('Apagar todas as NF-e importadas desta empresa?')) return;
    setCache(undefined);
    saveFiscalNfeCache(selectedCompany, {
      notas: [],
      itensEstoque: [],
      creditosSugeridos: [],
    });
    setSucesso('Cache de NF-e limpo.');
    setErro(null);
  }, [selectedCompany]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase">Notas fiscais · Webservice SEFAZ</p>
          <p className="text-[9px] opacity-60 uppercase font-bold mt-1">
            Distribuição DF-e · certificado A1 · consulta oficial de NF-e recebidas
          </p>
        </div>
        <span
          className={cn(
            'text-[9px] font-mono uppercase px-2 py-1 border',
            apiStatus?.nfeReady
              ? 'border-green-700 text-green-800'
              : apiStatus?.online
                ? 'border-amber-700 text-amber-900'
                : 'border-red-700 text-red-800',
          )}
        >
          API fiscal {fiscalApiStatusLabel(apiStatus)}
        </span>
      </div>

      {!apiStatus?.nfeReady ? (
        <div className="technical-panel shadow-[3px_3px_0_0_#141414] p-4 text-[9px] font-mono leading-relaxed space-y-2">
          <p className="font-black uppercase text-[10px] mb-1">Como puxar NF-e agora</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Terminal 1: <code className="bg-brand-sidebar/40 px-1">npm run fiscal-api</code> (porta 8780)</li>
            <li>Terminal 2: <code className="bg-brand-sidebar/40 px-1">npm run dev</code></li>
            <li>Abra <strong>http://localhost:3000</strong> (não GitHub Pages — HTTPS bloqueia :8780 local)</li>
            <li>Volte em Fiscal → NF-e webservice e clique em Buscar</li>
          </ol>
          {apiStatus?.hint ? <p className="text-amber-900">{apiStatus.hint}</p> : null}
        </div>
      ) : null}

      <div className="technical-panel shadow-[3px_3px_0_0_#141414] p-4 space-y-3 text-[9px] leading-relaxed opacity-80">
        <p className="font-black uppercase text-[10px] opacity-100">Como funciona</p>
        <ol className="list-decimal list-inside space-y-1 font-mono">
          <li>
            <strong>ConsNSU</strong> — consulta o webservice Distribuição DF-e com o último NSU da SEFAZ.
          </li>
          <li>
            <strong>Manifesto</strong> — registra ciência da operação (210210) para liberar XML de terceiros.
          </li>
          <li>
            <strong>Download</strong> — recebe XML compactado, extrai dados da nota, itens e créditos sugeridos.
          </li>
        </ol>
      </div>

      <div className="technical-panel shadow-[3px_3px_0_0_#141414] p-4 space-y-4">
        <div className={CF_FIELD_ROW}>
          <label className={CF_FIELD_COL}>
            <span className={CF_LABEL}>CNPJ empresa</span>
            <input
              className={CF_INPUT_MED}
              placeholder="00.000.000/0001-00 (opcional se no cert.)"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
            />
          </label>
          <label className={CF_FIELD_COL}>
            <span className={CF_LABEL}>UF</span>
            <select className={CF_SELECT} value={uf} onChange={(e) => setUf(e.target.value)}>
              {UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className={CF_FIELD_COL}>
            <span className={CF_LABEL}>Ambiente</span>
            <select
              className={CF_SELECT}
              value={ambiente}
              onChange={(e) => setAmbiente(e.target.value as 'producao' | 'homologacao')}
            >
              <option value="producao">Produção</option>
              <option value="homologacao">Homologação</option>
            </select>
          </label>
          <label className={CF_FIELD_COL}>
            <span className={CF_LABEL}>Período início</span>
            <input
              type="date"
              className={CF_INPUT_MED}
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </label>
          <label className={CF_FIELD_COL}>
            <span className={CF_LABEL}>Período fim</span>
            <input
              type="date"
              className={CF_INPUT_MED}
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </label>
        </div>

        <div className={CF_FIELD_ROW}>
          <label className={CF_FIELD_COL}>
            <span className={CF_LABEL}>Certificado A1 (.pfx)</span>
            <input
              ref={certRef}
              type="file"
              accept=".pfx,.p12"
              className="hidden"
              onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="technical-button text-[9px] flex items-center gap-2"
              onClick={() => certRef.current?.click()}
            >
              <Upload size={12} />
              {certFile ? certFile.name : 'Selecionar certificado'}
            </button>
          </label>
          <label className={CF_FIELD_COL}>
            <span className={CF_LABEL}>Senha do certificado</span>
            <input
              type="password"
              className={CF_INPUT_MED}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-[9px] font-mono cursor-pointer">
          <input
            type="checkbox"
            checked={manifestarCiencia}
            onChange={(e) => setManifestarCiencia(e.target.checked)}
            className="accent-brand-border"
          />
          Manifestar ciência da operação automaticamente (recomendado para NF-e de terceiros)
        </label>

        {cache?.ultNSU ? (
          <p className="text-[9px] font-mono opacity-70">
            NSU salvo: <strong>{cache.ultNSU}</strong>
            {cache.maxNSU ? ` · máx ${cache.maxNSU}` : ''}
            {cache.manifestados ? ` · ${cache.manifestados} manifesto(s) na última sync` : ''}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={syncing || !apiStatus?.nfeReady || bloqueadoPorIntervalo}
            onClick={() => void syncSefaz()}
            className="technical-button-primary text-[9px] flex items-center gap-2 disabled:opacity-40"
            title={
              bloqueadoPorIntervalo
                ? 'Aguarde 1 h entre consultas SEFAZ'
                : 'Consultar webservice SEFAZ (Distribuição DF-e)'
            }
          >
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Buscar NF-e na SEFAZ
          </button>
          <button
            type="button"
            disabled={!cache?.ultNSU}
            onClick={resetarNsu}
            className="technical-button text-[9px] disabled:opacity-40"
          >
            Resetar NSU
          </button>
          <input
            ref={xmlRef}
            type="file"
            accept=".xml,application/xml,text/xml"
            multiple
            className="hidden"
            aria-label="Selecionar arquivos XML de NF-e"
            onChange={(e) => {
              void importarXmls(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={importingXml || !apiStatus?.nfeReady}
            onClick={() => xmlRef.current?.click()}
            className="technical-button text-[9px] flex items-center gap-2 disabled:opacity-40"
          >
            {importingXml ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            Importar XMLs (manual)
          </button>
          {cache?.notas?.length ? (
            <button type="button" onClick={limparCache} className="technical-button text-[9px] border-red-800 text-red-800">
              Limpar cache
            </button>
          ) : null}
        </div>

        {bloqueadoPorIntervalo && cache?.lastSyncAt ? (
          <p className="text-[9px] text-amber-800 font-mono">
            Próxima consulta SEFAZ liberada após{' '}
            {new Date(proximaSyncPermitida).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
          </p>
        ) : null}

        {erro ? <p className="text-[10px] text-red-800 font-bold">{erro}</p> : null}
        {sucesso ? <p className="text-[10px] text-green-800 font-bold">{sucesso}</p> : null}
      </div>

      {cache?.lastSyncAt ? (
        <div className="technical-panel shadow-[3px_3px_0_0_#141414] overflow-hidden">
          <div className="px-4 py-3 border-b border-brand-border text-[10px] font-black uppercase flex flex-wrap justify-between gap-2">
            <span>Notas importadas · {new Date(cache.lastSyncAt).toLocaleString('pt-BR')}</span>
            <span className="font-mono opacity-60">
              {cache.notas.length} nota(s) · {cache.creditosSugeridos.length} crédito(s)
            </span>
          </div>

          {cache.notas.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[9px] font-mono">
                <thead>
                  <tr className="border-b border-brand-border/40 text-[8px] font-black uppercase opacity-60">
                    <th className="px-3 py-2">NF</th>
                    <th className="px-3 py-2">Emissão</th>
                    <th className="px-3 py-2">Emitente</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Chave</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/10">
                  {cache.notas.map((n) => (
                    <tr key={n.chave}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {n.numero}/{n.serie}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{n.emissao || '—'}</td>
                      <td className="px-3 py-2 max-w-[220px] truncate" title={n.emitente}>
                        {n.emitente}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(n.total)}</td>
                      <td className="px-3 py-2 font-mono text-[8px] opacity-70 max-w-[200px] truncate" title={n.chave}>
                        {n.chave}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-[9px] font-mono opacity-60">Nenhuma nota no período consultado.</p>
          )}

          {cache.creditosSugeridos.length > 0 ? (
            <div className="border-t border-brand-border/30 p-4 space-y-2">
              <p className="text-[9px] font-black uppercase opacity-60">Créditos sugeridos (PIS/COFINS/ICMS)</p>
              <div className="max-h-40 overflow-y-auto divide-y divide-brand-border/10 text-[9px] font-mono">
                {cache.creditosSugeridos.slice(0, 30).map((c, i) => (
                  <div key={`${c.chave}-${c.tipo}-${i}`} className="py-1.5 flex justify-between gap-2">
                    <span className="truncate">
                      {c.tipo} · {c.fundamento}
                    </span>
                    <span className="shrink-0">{formatCurrency(c.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
