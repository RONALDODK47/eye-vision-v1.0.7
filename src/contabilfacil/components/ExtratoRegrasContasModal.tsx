import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Copy, ListOrdered, Plus, Trash2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ExtratoRegraConta, ExtratoRegraContaNature } from '../logic/extratoRegrasContasStorage';
import {
  addExtratoRegraConta,
  filterExtratoRegrasPorBanco,
  loadExtratoRegrasBancoSelecionado,
  migrateExtratoRegrasParaCodigoReduzido,
  normalizeExtratoMatchText,
  normalizeExtratoRegraTexto,
  normContaBancoCode,
  removeExtratoRegraConta,
  replicateExtratoRegrasParaBanco,
  saveExtratoRegrasBancoSelecionado,
  saveExtratoRegrasContas,
} from '../logic/extratoRegrasContasStorage';
import { setExtratoContaBancoAtiva } from '../logic/extratoOcrLayoutStorage';
import {
  isClassificacaoHierarquica,
  resolveCodigoReduzidoDoPlano,
  sanitizeCodigoReduzido,
} from '../logic/planoContasMapper';
import {
  findUncoveredExtratoRows,
  summarizeUncoveredForAi,
  buildFallbackRegrasParaCobertura,
  chunkUncoveredForAiBatches,
  filterUncoveredByUserHint,
  buildRegrasFromUserChatIntent,
  resolveContaFromUserMessage,
} from '../logic/extratoRegrasCobertura';
import {
  countAiInteligenciaDocs,
  isContaFornecedorNome,
  listAiInteligenciaTextoParaIaAsync,
  matchColigadaNoHistorico,
  pickContaColigadaNoPlano,
  syncColigadasFromInteligenciaDocs,
} from '../logic/aiInteligenciaStorage';
import { suggestRegrasContasWithAi } from '../../lib/aiRegrasContasClient';
import { CF_FORM_INPUT_LONG } from '../lib/formFieldClasses';
import ExtratoContaPicker from './ExtratoContaPicker';
import ExtratoRegrasContasAiPanel from './ExtratoRegrasContasAiChat';

export type PlanoOption = { code: string; name: string; codigoReduzido?: string };

export type ExtratoRegrasContasModalProps = {
  open: boolean;
  company: string;
  regras: ExtratoRegraConta[];
  /** Contas de contrapartida (sem banco/caixa). */
  planoOptions: PlanoOption[];
  /** Contas banco do plano (para configurar o lado banco). */
  bancoOptions: PlanoOption[];
  defaultContaBanco?: string;
  /** Amostra do extrato para a IA sugerir regras. */
  extratoSample?: Array<{ description: string; nature: string; value: number }>;
  onClose: () => void;
  onChange: (next: ExtratoRegraConta[]) => void;
  /** Chamado quando a conta banco da conciliação é definida/alterada. */
  onContaBancoChange?: (contaBanco: string) => void;
  onReaplicar?: () => void;
  /** Abre o modal de pastas da Inteligência IA. */
  onOpenInteligencia?: () => void;
};

const INPUT_REGRA_CLS = cn(
  CF_FORM_INPUT_LONG,
  'max-w-none w-full h-[26px] text-[10px] uppercase',
);

export default memo(function ExtratoRegrasContasModal({
  open,
  company,
  regras,
  planoOptions,
  bancoOptions,
  defaultContaBanco = '',
  extratoSample = [],
  onClose,
  onChange,
  onContaBancoChange,
  onReaplicar,
  onOpenInteligencia,
}: ExtratoRegrasContasModalProps) {
  const [selectedBanco, setSelectedBanco] = useState(defaultContaBanco);
  const [draftDescricao, setDraftDescricao] = useState('');
  const [draftNature, setDraftNature] = useState<ExtratoRegraContaNature>('D');
  const [draftConta, setDraftConta] = useState('');
  const [bancoSavedOk, setBancoSavedOk] = useState(false);
  const [addError, setAddError] = useState('');
  const [replicateTarget, setReplicateTarget] = useState('');
  const [replicateMsg, setReplicateMsg] = useState('');
  const [corrigindoIa, setCorrigindoIa] = useState(false);
  const [corrigirMsg, setCorrigirMsg] = useState('');
  const [docsCount, setDocsCount] = useState(() => countAiInteligenciaDocs(company));
  const regrasListRef = useRef<HTMLDivElement>(null);

  const handleMostrarRegras = useCallback(() => {
    const el = regrasListRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('ring-2', 'ring-amber-400');
    window.setTimeout(() => {
      el.classList.remove('ring-2', 'ring-amber-400');
    }, 1200);
  }, []);

  const allPlano = useMemo(() => [...bancoOptions, ...planoOptions], [bancoOptions, planoOptions]);

  const toReduzido = useCallback(
    (code: string) => resolveCodigoReduzidoDoPlano(code, allPlano),
    [allPlano],
  );

  const matchBancoCode = useCallback(
    (code: string) => {
      if (!code.trim()) return '';
      const asRed = toReduzido(code);
      if (asRed) return asRed;
      const exactRed = bancoOptions.find(
        (b) => sanitizeCodigoReduzido(b.codigoReduzido) === sanitizeCodigoReduzido(code),
      );
      if (exactRed) return sanitizeCodigoReduzido(exactRed.codigoReduzido) || '';
      const byClassif = bancoOptions.find((b) => b.code === code);
      if (byClassif) return sanitizeCodigoReduzido(byClassif.codigoReduzido) || '';
      return sanitizeCodigoReduzido(code) || '';
    },
    [bancoOptions, toReduzido],
  );

  useEffect(() => {
    if (!open) return;
    // Corrige regras antigas da IA que gravaram classificação em vez de reduzido.
    const migrated = migrateExtratoRegrasParaCodigoReduzido(company, allPlano);
    onChange(migrated);

    const saved = loadExtratoRegrasBancoSelecionado(company, defaultContaBanco);
    const pick =
      matchBancoCode(saved) ||
      matchBancoCode(defaultContaBanco) ||
      (bancoOptions[0] ? sanitizeCodigoReduzido(bancoOptions[0].codigoReduzido) || '' : '') ||
      '';
    setSelectedBanco(pick);
    if (pick) saveExtratoRegrasBancoSelecionado(company, pick);
    setDraftDescricao('');
    setDraftNature('D');
    setDraftConta('');
    setBancoSavedOk(false);
    setAddError('');
    setReplicateTarget('');
    setReplicateMsg('');
    setCorrigirMsg('');
    setDocsCount(countAiInteligenciaDocs(company));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- migra só ao abrir
  }, [open, company, defaultContaBanco, bancoOptions, allPlano, matchBancoCode]);

  const regrasDoBanco = useMemo(
    () => filterExtratoRegrasPorBanco(regras, selectedBanco),
    [regras, selectedBanco],
  );

  const uncoveredRows = useMemo(
    () => findUncoveredExtratoRows(extratoSample, regrasDoBanco),
    [extratoSample, regrasDoBanco],
  );

  const outrosBancos = useMemo(() => {
    const atual = sanitizeCodigoReduzido(selectedBanco) || selectedBanco.trim();
    return bancoOptions.filter((b) => {
      const red = sanitizeCodigoReduzido(b.codigoReduzido) || '';
      return red && red !== atual;
    });
  }, [bancoOptions, selectedBanco]);

  const applyContaBanco = useCallback(
    (code: string) => {
      const resolved = matchBancoCode(code);
      if (!resolved) {
        setAddError('Use o CÓDIGO REDUZIDO da conta banco — classificação (ex.: 1.1.10…) é proibida.');
        return;
      }
      setSelectedBanco(resolved);
      saveExtratoRegrasBancoSelecionado(company, resolved);
      const bancoOpt = bancoOptions.find(
        (b) => sanitizeCodigoReduzido(b.codigoReduzido) === resolved || b.code === code,
      );
      setExtratoContaBancoAtiva(company, resolved, bancoOpt?.name);
      onContaBancoChange?.(resolved);
      setBancoSavedOk(true);
      setAddError('');
      window.setTimeout(() => setBancoSavedOk(false), 2500);
    },
    [bancoOptions, company, matchBancoCode, onContaBancoChange],
  );

  /** Permite apagar o campo e digitar outro código; só confirma quando o reduzido é válido. */
  const handleBancoChange = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) {
        setSelectedBanco('');
        setAddError('');
        setBancoSavedOk(false);
        return;
      }
      if (isClassificacaoHierarquica(trimmed)) {
        setSelectedBanco(trimmed);
        setAddError('Use o CÓDIGO REDUZIDO da conta banco — classificação é proibida.');
        return;
      }
      const resolved = matchBancoCode(trimmed);
      if (resolved && sanitizeCodigoReduzido(resolved)) {
        applyContaBanco(resolved);
        return;
      }
      // Digitação parcial — mantém o que o usuário digitou sem travar
      setSelectedBanco(trimmed);
      setAddError('');
    },
    [applyContaBanco, matchBancoCode],
  );

  const handleReplicate = useCallback(() => {
    const target = sanitizeCodigoReduzido(replicateTarget) || matchBancoCode(replicateTarget);
    const origem = sanitizeCodigoReduzido(selectedBanco) || matchBancoCode(selectedBanco);
    if (!origem) {
      setReplicateMsg('Selecione o banco de origem (conta ativa) com as regras.');
      return;
    }
    if (!target) {
      setReplicateMsg('Escolha o banco de destino (código reduzido).');
      return;
    }
    if (normContaBancoCode(origem) === normContaBancoCode(target)) {
      setReplicateMsg('Origem e destino são o mesmo banco.');
      return;
    }
    // Usa as regras visíveis na tela (não só o storage) — evita falha silenciosa.
    const sourceRules =
      regrasDoBanco.length > 0
        ? regrasDoBanco
        : filterExtratoRegrasPorBanco(regras, origem);
    if (sourceRules.length === 0) {
      setReplicateMsg(
        'Não há regras neste banco para replicar. Cadastre ou use a IA no banco de origem primeiro.',
      );
      return;
    }
    const result = replicateExtratoRegrasParaBanco(company, origem, target, sourceRules);
    onChange(result.regras);
    const destLabel =
      bancoOptions.find((b) => sanitizeCodigoReduzido(b.codigoReduzido) === target)?.name || target;
    if (result.added === 0) {
      setReplicateMsg(
        result.skipped > 0
          ? `Nada novo: ${result.skipped} regra(s) já existiam em ${destLabel}.`
          : 'Nenhuma regra replicada.',
      );
      // Mesmo assim abre o destino para o usuário conferir
      applyContaBanco(target);
      setReplicateTarget('');
      return;
    }
    setReplicateMsg(
      `Replicadas ${result.added} regra(s) para ${target} — ${destLabel}` +
        (result.skipped ? ` (${result.skipped} já existiam)` : ''),
    );
    // Troca para o banco destino para as regras aparecerem na lista
    applyContaBanco(target);
    setReplicateTarget('');
  }, [
    applyContaBanco,
    bancoOptions,
    company,
    matchBancoCode,
    onChange,
    regras,
    regrasDoBanco,
    replicateTarget,
    selectedBanco,
  ]);

  const handleCorrigirRegrasComIa = useCallback(async () => {
    const bancoAtivo = sanitizeCodigoReduzido(selectedBanco) || matchBancoCode(selectedBanco);
    if (!bancoAtivo) {
      setCorrigirMsg('Selecione a conta banco (código reduzido) antes de corrigir.');
      return;
    }
    if (planoOptions.length === 0) {
      setCorrigirMsg('Importe o plano de contas com código reduzido.');
      return;
    }
    if (extratoSample.length === 0) {
      setCorrigirMsg('Importe o extrato na conciliação para a IA cobrir todos os lançamentos.');
      return;
    }

    setCorrigindoIa(true);
    setCorrigirMsg(
      `Corrigindo regras do banco ${bancoAtivo}: auditar vs Inteligência IA + cobrir não conciliados…`,
    );
    setDocsCount(countAiInteligenciaDocs(company));

    const applySugestoes = (
      current: ExtratoRegraConta[],
      sugestoes: Array<{ descricao: string; nature: string; contaContrapartida: string }>,
    ): { next: ExtratoRegraConta[]; added: number; updated: number } => {
      let next = [...current];
      let added = 0;
      let updated = 0;
      const existingKeys = new Set(
        filterExtratoRegrasPorBanco(next, bancoAtivo).map(
          (r) =>
            `${r.nature}|${normalizeExtratoMatchText(r.descricao)}|${normContaBancoCode(r.contaContrapartida)}`,
        ),
      );
      const toAppend: ExtratoRegraConta[] = [];

      for (const sug of sugestoes) {
        const contra =
          resolveCodigoReduzidoDoPlano(sug.contaContrapartida, allPlano) ||
          sanitizeCodigoReduzido(sug.contaContrapartida) ||
          '';
        const desc = normalizeExtratoRegraTexto(sug.descricao);
        if (!contra || !desc) continue;
        const nature = sug.nature === 'C' ? 'C' : 'D';
        const descNorm = normalizeExtratoMatchText(desc);
        const key = `${nature}|${descNorm}|${normContaBancoCode(contra)}`;

        // Mesma descrição neste banco (qualquer natureza) → corrige conta e/ou natureza
        const sameDesc = next.find(
          (r) =>
            normContaBancoCode(r.contaBanco) === normContaBancoCode(bancoAtivo) &&
            normalizeExtratoMatchText(r.descricao) === descNorm,
        );
        if (sameDesc) {
          const contraMudou =
            normContaBancoCode(sameDesc.contaContrapartida) !== normContaBancoCode(contra);
          const natureMudou = sameDesc.nature !== nature;
          if (contraMudou || natureMudou) {
            next = next.map((r) =>
              r.id === sameDesc.id
                ? {
                    ...r,
                    nature,
                    contaContrapartida: contra,
                    nome: desc.slice(0, 40),
                    descricao: desc,
                  }
                : r,
            );
            updated += 1;
          }
          existingKeys.add(key);
          continue;
        }
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        toAppend.push({
          id: crypto.randomUUID(),
          nome: desc.slice(0, 40),
          descricao: desc,
          nature,
          contaBanco: bancoAtivo,
          contaContrapartida: contra,
        });
        added += 1;
      }
      if (toAppend.length > 0) next = [...next, ...toAppend];
      return { next, added, updated };
    };

    try {
      // Relê docs da Inteligência IA e sincroniza TODAS as coligadas (não só AJTF)
      const coligadas = syncColigadasFromInteligenciaDocs(company);
      const docs = await listAiInteligenciaTextoParaIaAsync(company);

      const planoByReduzido = new Map(
        allPlano.map((p) => {
          const red = sanitizeCodigoReduzido(p.codigoReduzido) || sanitizeCodigoReduzido(p.code) || '';
          return [red, p] as const;
        }),
      );

      /** Se a sugestão aponta FORNECEDOR/CLIENTE para uma coligada, troca para conta de coligada. */
      const sanitizeSugestaoColigada = (sug: {
        descricao: string;
        nature: string;
        contaContrapartida: string;
      }) => {
        const hit = matchColigadaNoHistorico(sug.descricao, coligadas);
        if (!hit) return sug;
        const red =
          resolveCodigoReduzidoDoPlano(sug.contaContrapartida, allPlano) ||
          sanitizeCodigoReduzido(sug.contaContrapartida) ||
          '';
        const planoHit = red ? planoByReduzido.get(red) : undefined;
        const nomeConta = planoHit?.name || '';
        const bad = isContaFornecedorNome(nomeConta) || /\bCLIENTE/i.test(nomeConta);
        if (!bad) return sug;
        const better =
          hit.contaReduzida ||
          pickContaColigadaNoPlano(planoOptions, hit.nome) ||
          pickContaColigadaNoPlano(allPlano, hit.nome);
        if (better && better !== red) {
          return { ...sug, contaContrapartida: better };
        }
        // Sem conta de coligada no plano: bloqueia fornecedor/cliente — não grava errado
        return { ...sug, contaContrapartida: '' };
      };

      const callIa = async (
        doBanco: ExtratoRegraConta[],
        uncovered: Array<{ description: string; nature: string; value: number }>,
        phaseMsg: string,
      ) => {
        setCorrigirMsg(phaseMsg);
        return suggestRegrasContasWithAi({
          company,
          contaBanco: bancoAtivo,
          bancoNome:
            bancoOptions.find((b) => sanitizeCodigoReduzido(b.codigoReduzido) === bancoAtivo)
              ?.name || bancoAtivo,
          mode: 'corrigir_cobertura',
          message: [
            'DUAS TAREFAS OBRIGATÓRIAS:',
            '1) CORRIGIR regras já cadastradas que NÃO batem com os documentos da Inteligência IA',
            '   (coligada≠cliente≠fornecedor, nome completo, conta errada no plano).',
            '2) CRIAR regras para TODOS os lançamentos SEM regra / NÃO CONCILIADOS.',
            'COLIGADAS DA LISTA NÃO SÃO FORNECEDOR — use conta de coligada/partes relacionadas/mútuo.',
            'NOME COMPLETO: POLO SUL CLIMATIZACAO ≠ POLO SUL REFRIGERACAO.',
            `Banco ativo: ${bancoAtivo}. Regras existentes: ${doBanco.length}. Sem regra: ${uncovered.length}. Coligadas: ${coligadas.length}.`,
          ].join(' '),
          plano: planoOptions,
          extratoSample,
          uncoveredExtrato: uncovered,
          anexosTexto: docs,
          coligadas: coligadas.map((c) => ({
            nome: c.nome,
            aliases: c.aliases,
            contaReduzida: c.contaReduzida,
          })),
          regrasExistentes: doBanco.map((r) => ({
            descricao: r.descricao,
            nature: r.nature,
            contaContrapartida: r.contaContrapartida,
          })),
        });
      };

      let current = [...regras];
      let totalAdded = 0;
      let totalUpdated = 0;
      let lastResumo = '';

      // Corrige regras existentes que já apontam FORNECEDOR para coligada (sem esperar a IA)
      {
        let localFixed = 0;
        const doBanco = filterExtratoRegrasPorBanco(current, bancoAtivo);
        for (const r of doBanco) {
          const hit = matchColigadaNoHistorico(r.descricao, coligadas);
          if (!hit) continue;
          const red =
            resolveCodigoReduzidoDoPlano(r.contaContrapartida, allPlano) ||
            sanitizeCodigoReduzido(r.contaContrapartida) ||
            '';
          const planoHit = red ? planoByReduzido.get(red) : undefined;
          if (!planoHit || (!isContaFornecedorNome(planoHit.name) && !/\bCLIENTE/i.test(planoHit.name))) {
            continue;
          }
          const better =
            hit.contaReduzida ||
            pickContaColigadaNoPlano(planoOptions, hit.nome) ||
            pickContaColigadaNoPlano(allPlano, hit.nome);
          if (!better || better === red) continue;
          current = current.map((x) =>
            x.id === r.id ? { ...x, contaContrapartida: better } : x,
          );
          localFixed += 1;
        }
        if (localFixed > 0) {
          totalUpdated += localFixed;
          setCorrigirMsg(
            `Pré-correção: ${localFixed} regra(s) de coligada que estavam como fornecedor/cliente…`,
          );
        }
      }

      // ——— FASE 1: auditar/corrigir regras existentes vs Inteligência IA ———
      {
        const doBanco = filterExtratoRegrasPorBanco(current, bancoAtivo);
        const uncovered0 = summarizeUncoveredForAi(
          findUncoveredExtratoRows(extratoSample, doBanco),
          40,
        );
        if (doBanco.length > 0 || docs.length > 0 || coligadas.length > 0) {
          const result = await callIa(
            doBanco,
            uncovered0,
            `Fase 1/2: auditando ${doBanco.length} regra(s) + ${coligadas.length} coligada(s) vs Inteligência IA` +
              (uncovered0.length ? ` e cobrindo lote de ${uncovered0.length} sem regra…` : '…'),
          );
          if (result.resumo) lastResumo = result.resumo;
          if (result.regras.length > 0) {
            const sanitized = result.regras.map(sanitizeSugestaoColigada);
            const applied = applySugestoes(current, sanitized);
            current = applied.next;
            totalAdded += applied.added;
            totalUpdated += applied.updated;
          } else if (!result.ok && result.detail) {
            setCorrigirMsg(`${result.detail} — seguindo para cobertura local…`);
          }
        }
      }

      // ——— FASE 2: lotes só para não conciliados restantes ———
      const BATCH_SIZE = 40;
      const MAX_BATCHES = 8;
      for (let batchIdx = 0; batchIdx < MAX_BATCHES; batchIdx++) {
        const doBanco = filterExtratoRegrasPorBanco(current, bancoAtivo);
        const uncoveredAll = findUncoveredExtratoRows(extratoSample, doBanco);
        if (uncoveredAll.length === 0) break;
        const batches = chunkUncoveredForAiBatches(uncoveredAll, BATCH_SIZE);
        const batch = batches[0];
        if (!batch?.length) break;

        const result = await callIa(
          doBanco,
          batch,
          `Fase 2/2 · lote ${batchIdx + 1}: criando regras para ${batch.length} de ${uncoveredAll.length} sem regra…`,
        );

        if (result.resumo) lastResumo = result.resumo;
        if (!result.ok && result.regras.length === 0) {
          if (batchIdx === 0 && result.detail) {
            setCorrigirMsg(
              `${result.detail} — aplicando cobertura local automática para não deixar lançamento descoberto.`,
            );
          }
          break;
        }

        const sanitized = result.regras.map(sanitizeSugestaoColigada);
        const applied = applySugestoes(current, sanitized);
        current = applied.next;
        totalAdded += applied.added;
        totalUpdated += applied.updated;
        if (applied.added === 0 && applied.updated === 0) break;
      }

      // Fallback local: o que a IA não cobriu, gera regra automática pelo nome no plano
      let fallbackAdded = 0;
      {
        const doBanco = filterExtratoRegrasPorBanco(current, bancoAtivo);
        const still = findUncoveredExtratoRows(extratoSample, doBanco);
        if (still.length > 0) {
          setCorrigirMsg(
            `Completando ${still.length} não conciliado(s) restantes com cobertura automática…`,
          );
          const fallbacks = buildFallbackRegrasParaCobertura({
            uncovered: still,
            contaBanco: bancoAtivo,
            plano: planoOptions,
          });
          if (fallbacks.length > 0) {
            const applied = applySugestoes(
              current,
              fallbacks.map((f) => ({
                descricao: f.descricao,
                nature: f.nature,
                contaContrapartida: f.contaContrapartida,
              })),
            );
            current = applied.next;
            fallbackAdded = applied.added;
            totalAdded += applied.added;
          }
        }
      }

      if (totalAdded > 0 || totalUpdated > 0) {
        current = saveExtratoRegrasContas(company, current);
      }
      onChange(current);

      const after = filterExtratoRegrasPorBanco(current, bancoAtivo);
      const stillOpen = findUncoveredExtratoRows(extratoSample, after).length;
      const parts = [
        lastResumo,
        totalAdded || totalUpdated
          ? `Resultado: ${totalUpdated} regra(s) corrigida(s) pela Inteligência IA, ${totalAdded} nova(s) para não conciliados${
              fallbackAdded ? ` (inclui ${fallbackAdded} cobertura automática)` : ''
            }.`
          : 'Nenhuma alteração da IA (regras já ok ou sem evidência nos docs).',
        stillOpen === 0
          ? 'Cobertura: 100% — todos os lançamentos da conciliação têm regra.'
          : `Ainda faltam ${stillOpen} padrão(ões) sem conta no plano correspondente — cadastre a conta ou rode de novo.`,
      ].filter(Boolean);
      setCorrigirMsg(parts.join(' '));

      // Reaplica na grade da conciliação (preenche débito/crédito)
      if (totalAdded > 0 || totalUpdated > 0) {
        window.setTimeout(() => onReaplicar?.(), 0);
      }
    } catch (err) {
      setCorrigirMsg(err instanceof Error ? err.message : 'Falha ao corrigir com IA.');
    } finally {
      setCorrigindoIa(false);
    }
  }, [
    allPlano,
    bancoOptions,
    company,
    extratoSample,
    matchBancoCode,
    onChange,
    onReaplicar,
    planoOptions,
    regras,
    selectedBanco,
  ]);

  /** Chat livre: pedido do usuário → aplica local + IA em lotes. */
  const handleChatRegrasComIa = useCallback(
    async (userMessage: string): Promise<{ ok: boolean; reply: string }> => {
      const bancoAtivo = sanitizeCodigoReduzido(selectedBanco) || matchBancoCode(selectedBanco);
      if (!bancoAtivo) {
        return { ok: false, reply: 'Selecione a conta banco (código reduzido) antes.' };
      }
      if (planoOptions.length === 0) {
        return { ok: false, reply: 'Importe o plano de contas com código reduzido.' };
      }

      setCorrigindoIa(true);
      setCorrigirMsg('Chat: aplicando pedido em lotes…');
      setDocsCount(countAiInteligenciaDocs(company));

      const applySugestoes = (
        current: ExtratoRegraConta[],
        sugestoes: Array<{ descricao: string; nature: string; contaContrapartida: string }>,
      ): { next: ExtratoRegraConta[]; added: number; updated: number } => {
        let next = [...current];
        let added = 0;
        let updated = 0;
        const existingKeys = new Set(
          filterExtratoRegrasPorBanco(next, bancoAtivo).map(
            (r) =>
              `${r.nature}|${normalizeExtratoMatchText(r.descricao)}|${normContaBancoCode(r.contaContrapartida)}`,
          ),
        );
        const toAppend: ExtratoRegraConta[] = [];

        for (const sug of sugestoes) {
          const contra =
            resolveCodigoReduzidoDoPlano(sug.contaContrapartida, allPlano) ||
            sanitizeCodigoReduzido(sug.contaContrapartida) ||
            '';
          const desc = normalizeExtratoRegraTexto(sug.descricao);
          if (!contra || !desc) continue;
          const nature = sug.nature === 'C' ? 'C' : 'D';
          const descNorm = normalizeExtratoMatchText(desc);
          const key = `${nature}|${descNorm}|${normContaBancoCode(contra)}`;

          const sameDesc = next.find(
            (r) =>
              normContaBancoCode(r.contaBanco) === normContaBancoCode(bancoAtivo) &&
              normalizeExtratoMatchText(r.descricao) === descNorm,
          );
          if (sameDesc) {
            const contraMudou =
              normContaBancoCode(sameDesc.contaContrapartida) !== normContaBancoCode(contra);
            const natureMudou = sameDesc.nature !== nature;
            if (contraMudou || natureMudou) {
              next = next.map((r) =>
                r.id === sameDesc.id
                  ? {
                      ...r,
                      nature,
                      contaContrapartida: contra,
                      nome: desc.slice(0, 40),
                      descricao: desc,
                    }
                  : r,
              );
              updated += 1;
            }
            existingKeys.add(key);
            continue;
          }
          if (existingKeys.has(key)) continue;
          existingKeys.add(key);
          toAppend.push({
            id: crypto.randomUUID(),
            nome: desc.slice(0, 40),
            descricao: desc,
            nature,
            contaBanco: bancoAtivo,
            contaContrapartida: contra,
          });
          added += 1;
        }
        if (toAppend.length > 0) next = [...next, ...toAppend];
        return { next, added, updated };
      };

      try {
        const coligadas = syncColigadasFromInteligenciaDocs(company);
        const docs = await listAiInteligenciaTextoParaIaAsync(company);
        const contaPedida = resolveContaFromUserMessage(userMessage, planoOptions);
        let current = [...regras];
        let totalAdded = 0;
        let totalUpdated = 0;
        const resumos: string[] = [];

        // 1) Aplicação local imediata do pedido (rápido, sem esperar a IA)
        {
          const doBanco = filterExtratoRegrasPorBanco(current, bancoAtivo);
          const uncoveredAll = findUncoveredExtratoRows(extratoSample, doBanco);
          const localRules = buildRegrasFromUserChatIntent({
            userMessage,
            uncovered: uncoveredAll,
            contaBanco: bancoAtivo,
            plano: planoOptions,
            contaContrapartida: contaPedida,
          });
          if (localRules.length > 0) {
            const applied = applySugestoes(
              current,
              localRules.map((r) => ({
                descricao: r.descricao,
                nature: r.nature,
                contaContrapartida: r.contaContrapartida,
              })),
            );
            current = applied.next;
            totalAdded += applied.added;
            totalUpdated += applied.updated;
            setCorrigirMsg(
              `Pedido aplicado localmente: ${applied.added} regra(s)` +
                (contaPedida ? ` → conta ${contaPedida}` : '') +
                '. Refinando com IA em lotes…',
            );
          }
        }

        // 2) IA em lotes só nos padrões que casam com o pedido
        {
          const doBanco = filterExtratoRegrasPorBanco(current, bancoAtivo);
          const uncoveredAll = findUncoveredExtratoRows(extratoSample, doBanco);
          const focused = filterUncoveredByUserHint(uncoveredAll, userMessage);
          const batches = chunkUncoveredForAiBatches(focused, 40);
          const maxBatches = Math.min(batches.length, 6);

          for (let i = 0; i < maxBatches; i++) {
            const batch = batches[i];
            setCorrigirMsg(
              `Chat lote ${i + 1}/${maxBatches}: ${batch.length} padrão(ões)…`,
            );
            const result = await suggestRegrasContasWithAi({
              company,
              contaBanco: bancoAtivo,
              bancoNome:
                bancoOptions.find((b) => sanitizeCodigoReduzido(b.codigoReduzido) === bancoAtivo)
                  ?.name || bancoAtivo,
              mode: 'chat_pedido',
              message: [
                'PEDIDO DO USUÁRIO (OBEDEÇA):',
                userMessage,
                contaPedida
                  ? `Conta destino já resolvida no plano: código reduzido ${contaPedida}. Use esta contaContrapartida.`
                  : 'Resolva a conta destino pelo NOME no plano (ex.: fundo fixo de caixa).',
                'Crie regras só para históricos deste lote que casam com o pedido.',
                `Banco: ${bancoAtivo}. Lote ${i + 1}/${maxBatches}.`,
              ].join(' '),
              plano: planoOptions,
              extratoSample: batch,
              uncoveredExtrato: batch,
              anexosTexto: docs.slice(0, 8),
              coligadas: coligadas.map((c) => ({
                nome: c.nome,
                aliases: c.aliases,
                contaReduzida: c.contaReduzida,
              })),
              regrasExistentes: filterExtratoRegrasPorBanco(current, bancoAtivo)
                .slice(0, 40)
                .map((r) => ({
                  descricao: r.descricao,
                  nature: r.nature,
                  contaContrapartida: r.contaContrapartida,
                })),
            });

            if (result.resumo) resumos.push(result.resumo);
            if (result.regras.length > 0) {
              const forced = result.regras.map((r) =>
                contaPedida ? { ...r, contaContrapartida: contaPedida } : r,
              );
              const applied = applySugestoes(current, forced);
              current = applied.next;
              totalAdded += applied.added;
              totalUpdated += applied.updated;
            }
          }
        }

        if (totalAdded > 0 || totalUpdated > 0) {
          current = saveExtratoRegrasContas(company, current);
          onChange(current);
          window.setTimeout(() => onReaplicar?.(), 0);
        }

        const reply = [
          resumos[0],
          totalAdded || totalUpdated
            ? `Aplicado do seu pedido: ${totalUpdated} corrigida(s), ${totalAdded} nova(s)${
                contaPedida ? ` (conta ${contaPedida})` : ''
              }.`
            : contaPedida
              ? `Achei a conta ${contaPedida} no plano, mas nenhum histórico do extrato casou com o texto do pedido. Seja mais específico no nome.`
              : 'Não encontrei no plano a conta citada nem históricos que casem com o pedido. Informe o nome da conta (ex.: fundo fixo) ou o código reduzido.',
        ]
          .filter(Boolean)
          .join(' ');
        setCorrigirMsg(reply);
        return { ok: totalAdded > 0 || totalUpdated > 0, reply };
      } catch (err) {
        const fail = err instanceof Error ? err.message : 'Falha no chat com a IA.';
        setCorrigirMsg(fail);
        return { ok: false, reply: fail };
      } finally {
        setCorrigindoIa(false);
      }
    },
    [
      allPlano,
      bancoOptions,
      company,
      extratoSample,
      matchBancoCode,
      onChange,
      onReaplicar,
      planoOptions,
      regras,
      selectedBanco,
    ],
  );

  /** Implanta regras do zero (quando o banco ainda não tem regras) — em lotes. */
  const handleImplantarRegrasComIa = useCallback(async () => {
    const bancoAtivo = sanitizeCodigoReduzido(selectedBanco) || matchBancoCode(selectedBanco);
    if (!bancoAtivo) {
      setCorrigirMsg('Selecione a conta banco (código reduzido) antes de implantar.');
      return;
    }
    if (planoOptions.length === 0) {
      setCorrigirMsg('Importe o plano de contas com código reduzido.');
      return;
    }
    if (extratoSample.length === 0) {
      setCorrigirMsg('Importe o extrato na conciliação para implantar regras.');
      return;
    }

    setCorrigindoIa(true);
    setCorrigirMsg(`Implantando regras do banco ${bancoAtivo} em lotes…`);
    setDocsCount(countAiInteligenciaDocs(company));

    const applySugestoes = (
      current: ExtratoRegraConta[],
      sugestoes: Array<{ descricao: string; nature: string; contaContrapartida: string }>,
    ): { next: ExtratoRegraConta[]; added: number; updated: number } => {
      let next = [...current];
      let added = 0;
      let updated = 0;
      const existingKeys = new Set(
        filterExtratoRegrasPorBanco(next, bancoAtivo).map(
          (r) =>
            `${r.nature}|${normalizeExtratoMatchText(r.descricao)}|${normContaBancoCode(r.contaContrapartida)}`,
        ),
      );
      const toAppend: ExtratoRegraConta[] = [];

      for (const sug of sugestoes) {
        const contra =
          resolveCodigoReduzidoDoPlano(sug.contaContrapartida, allPlano) ||
          sanitizeCodigoReduzido(sug.contaContrapartida) ||
          '';
        const desc = normalizeExtratoRegraTexto(sug.descricao);
        if (!contra || !desc) continue;
        const nature = sug.nature === 'C' ? 'C' : 'D';
        const descNorm = normalizeExtratoMatchText(desc);
        const key = `${nature}|${descNorm}|${normContaBancoCode(contra)}`;
        const sameDesc = next.find(
          (r) =>
            normContaBancoCode(r.contaBanco) === normContaBancoCode(bancoAtivo) &&
            normalizeExtratoMatchText(r.descricao) === descNorm,
        );
        if (sameDesc) {
          const contraMudou =
            normContaBancoCode(sameDesc.contaContrapartida) !== normContaBancoCode(contra);
          const natureMudou = sameDesc.nature !== nature;
          if (contraMudou || natureMudou) {
            next = next.map((r) =>
              r.id === sameDesc.id
                ? {
                    ...r,
                    nature,
                    contaContrapartida: contra,
                    nome: desc.slice(0, 40),
                    descricao: desc,
                  }
                : r,
            );
            updated += 1;
          }
          existingKeys.add(key);
          continue;
        }
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        toAppend.push({
          id: crypto.randomUUID(),
          nome: desc.slice(0, 40),
          descricao: desc,
          nature,
          contaBanco: bancoAtivo,
          contaContrapartida: contra,
        });
        added += 1;
      }
      if (toAppend.length > 0) next = [...next, ...toAppend];
      return { next, added, updated };
    };

    try {
      const coligadas = syncColigadasFromInteligenciaDocs(company);
      const docs = await listAiInteligenciaTextoParaIaAsync(company);
      let current = [...regras];
      let totalAdded = 0;
      let totalUpdated = 0;
      let lastResumo = '';

      const doBanco0 = filterExtratoRegrasPorBanco(current, bancoAtivo);
      const uncoveredAll = findUncoveredExtratoRows(extratoSample, doBanco0);
      const batches = chunkUncoveredForAiBatches(uncoveredAll, 40);
      const maxBatches = Math.min(batches.length, 10);

      for (let i = 0; i < maxBatches; i++) {
        const batch = batches[i];
        const doBanco = filterExtratoRegrasPorBanco(current, bancoAtivo);
        setCorrigirMsg(
          `Implantar lote ${i + 1}/${maxBatches}: ${batch.length} padrão(ões) sem regra…`,
        );
        const result = await suggestRegrasContasWithAi({
          company,
          contaBanco: bancoAtivo,
          bancoNome:
            bancoOptions.find((b) => sanitizeCodigoReduzido(b.codigoReduzido) === bancoAtivo)
              ?.name || bancoAtivo,
          mode: 'implantar',
          message: [
            'IMPLANTAR REGRAS DO ZERO neste banco.',
            'Crie regras para TODOS os lançamentos deste lote.',
            'COLIGADAS NÃO SÃO FORNECEDOR/CLIENTE. NOME COMPLETO no discriminador.',
            `Banco: ${bancoAtivo}. Lote ${i + 1}/${maxBatches}.`,
          ].join(' '),
          plano: planoOptions,
          extratoSample: batch,
          uncoveredExtrato: batch,
          anexosTexto: docs,
          coligadas: coligadas.map((c) => ({
            nome: c.nome,
            aliases: c.aliases,
            contaReduzida: c.contaReduzida,
          })),
          regrasExistentes: doBanco.map((r) => ({
            descricao: r.descricao,
            nature: r.nature,
            contaContrapartida: r.contaContrapartida,
          })),
        });

        if (result.resumo) lastResumo = result.resumo;
        if (result.regras.length > 0) {
          const applied = applySugestoes(current, result.regras);
          current = applied.next;
          totalAdded += applied.added;
          totalUpdated += applied.updated;
        }
      }

      // Fallback local no que sobrou
      {
        const doBanco = filterExtratoRegrasPorBanco(current, bancoAtivo);
        const still = findUncoveredExtratoRows(extratoSample, doBanco);
        if (still.length > 0) {
          setCorrigirMsg(`Completando ${still.length} restante(s) com cobertura automática…`);
          const fallbacks = buildFallbackRegrasParaCobertura({
            uncovered: still,
            contaBanco: bancoAtivo,
            plano: planoOptions,
          });
          if (fallbacks.length > 0) {
            const applied = applySugestoes(
              current,
              fallbacks.map((f) => ({
                descricao: f.descricao,
                nature: f.nature,
                contaContrapartida: f.contaContrapartida,
              })),
            );
            current = applied.next;
            totalAdded += applied.added;
          }
        }
      }

      if (totalAdded > 0 || totalUpdated > 0) {
        current = saveExtratoRegrasContas(company, current);
        onChange(current);
        window.setTimeout(() => onReaplicar?.(), 0);
      }

      const after = filterExtratoRegrasPorBanco(current, bancoAtivo);
      const stillOpen = findUncoveredExtratoRows(extratoSample, after).length;
      setCorrigirMsg(
        [
          lastResumo,
          `Implantação: ${totalAdded} regra(s) criada(s)${
            totalUpdated ? `, ${totalUpdated} ajustada(s)` : ''
          }.`,
          stillOpen === 0
            ? 'Cobertura: 100%.'
            : `Ainda faltam ${stillOpen} padrão(ões) sem conta no plano.`,
        ]
          .filter(Boolean)
          .join(' '),
      );
    } catch (err) {
      setCorrigirMsg(err instanceof Error ? err.message : 'Falha ao implantar regras.');
    } finally {
      setCorrigindoIa(false);
    }
  }, [
    allPlano,
    bancoOptions,
    company,
    extratoSample,
    matchBancoCode,
    onChange,
    onReaplicar,
    planoOptions,
    regras,
    selectedBanco,
  ]);

  const persist = useCallback(
    (next: ExtratoRegraConta[]) => {
      onChange(saveExtratoRegrasContas(company, next));
    },
    [company, onChange],
  );

  const handleAdd = useCallback(() => {
    const descricao = normalizeExtratoRegraTexto(draftDescricao);
    const contraRed = toReduzido(draftConta) || sanitizeCodigoReduzido(draftConta);
    if (!descricao || !selectedBanco.trim()) return;
    if (!contraRed) {
      setAddError(
        isClassificacaoHierarquica(draftConta)
          ? 'PROIBIDO usar classificação (ex.: 2.1.10.100.001). Selecione o CÓDIGO REDUZIDO.'
          : 'Informe o código reduzido da contrapartida.',
      );
      return;
    }
    setAddError('');
    persist(
      addExtratoRegraConta(company, {
        nome: descricao.slice(0, 40),
        descricao,
        nature: draftNature,
        contaBanco: selectedBanco.trim(),
        contaContrapartida: contraRed,
      }),
    );
    setDraftDescricao('');
    setDraftNature('D');
    setDraftConta('');
  }, [company, draftConta, draftDescricao, draftNature, persist, selectedBanco, toReduzido]);

  const handleRemove = useCallback(
    (id: string) => {
      persist(removeExtratoRegraConta(company, id));
    },
    [company, persist],
  );

  const contaLabel = useCallback(
    (code: string) => {
      const red = sanitizeCodigoReduzido(code) || code;
      const hit =
        planoOptions.find((p) => sanitizeCodigoReduzido(p.codigoReduzido) === red) ||
        bancoOptions.find((p) => sanitizeCodigoReduzido(p.codigoReduzido) === red) ||
        planoOptions.find((p) => p.code === code) ||
        bancoOptions.find((p) => p.code === code);
      if (!hit) return red;
      const r = sanitizeCodigoReduzido(hit.codigoReduzido);
      return r ? `${r} — ${hit.name}` : `${hit.code} — ${hit.name}`;
    },
    [bancoOptions, planoOptions],
  );

  const bancoLabel = useCallback(
    (code: string) => {
      const red = sanitizeCodigoReduzido(code) || code;
      const hit =
        bancoOptions.find((p) => sanitizeCodigoReduzido(p.codigoReduzido) === red) ||
        bancoOptions.find((p) => p.code === code);
      if (!hit) return red;
      const r = sanitizeCodigoReduzido(hit.codigoReduzido);
      return r ? `${r} — ${hit.name}` : `${hit.code} — ${hit.name}`;
    },
    [bancoOptions],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[81] flex items-center justify-center p-3 bg-black/50">
      <div
        className="technical-panel shadow-[6px_6px_0_0_#141414] w-full max-w-6xl max-h-[92vh] h-[92vh] min-h-0 flex flex-col overflow-hidden"
        role="dialog"
        aria-labelledby="extrato-regras-contas-title"
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-brand-border bg-brand-sidebar/40 shrink-0">
          <div className="flex-1 min-w-0">
            <h2
              id="extrato-regras-contas-title"
              className="text-sm font-black uppercase tracking-widest inline-flex items-center gap-2"
            >
              <ListOrdered size={16} aria-hidden="true" />
              Regras de Contas
            </h2>
            <p className="text-[9px] text-slate-600 mt-0.5 leading-snug">
              Só <strong>código reduzido</strong> — classificação hierárquica é{' '}
              <strong className="text-rose-700">proibida</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-red-600 shrink-0"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Corpo rolável: banco + regras + IA */}
        <div className="flex-1 min-h-0 overflow-y-scroll overscroll-contain">
          <div className="p-3 border-b border-brand-border bg-white space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 size={14} className="text-brand-text/70 shrink-0" aria-hidden="true" />
              <p className="text-[9px] font-black uppercase tracking-wider">
                Conta contábil do banco
              </p>
              {bancoSavedOk ? (
                <span className="text-[8px] font-bold uppercase text-green-700 border border-green-600 bg-green-50 px-1.5 py-0.5">
                  Salva para conciliação
                </span>
              ) : null}
            </div>
            <p className="text-[9px] text-brand-text/55 leading-snug max-w-2xl">
              Informe o <strong>código reduzido</strong> da conta banco. Pode apagar e digitar outro.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-w-4xl">
              <div className="space-y-1.5 min-w-0">
                {bancoOptions.length > 0 ? (
                  <ExtratoContaPicker
                    value={selectedBanco}
                    options={bancoOptions}
                    placeholder="Código reduzido do banco…"
                    ariaLabel="Conta contábil do banco (código reduzido)"
                    onChange={handleBancoChange}
                  />
                ) : (
                  <p className="text-[9px] text-amber-800 italic">
                    Importe o plano de contas com código reduzido para configurar.
                  </p>
                )}
                {selectedBanco && sanitizeCodigoReduzido(selectedBanco) ? (
                  <p
                    className="text-[9px] font-mono text-brand-text/70 truncate"
                    title={bancoLabel(selectedBanco)}
                  >
                    Ativa na conciliação: {bancoLabel(selectedBanco)}
                  </p>
                ) : selectedBanco ? (
                  <p className="text-[9px] text-amber-800">
                    Digite o código reduzido completo ou escolha na lista.
                  </p>
                ) : null}
                {addError ? (
                  <p className="text-[9px] text-rose-700 font-bold uppercase">{addError}</p>
                ) : null}
              </div>

              {selectedBanco && sanitizeCodigoReduzido(selectedBanco) && outrosBancos.length > 0 ? (
                <div className="space-y-1.5 min-w-0 border border-brand-border/40 p-2 bg-brand-sidebar/10">
                  <p className="text-[9px] font-black uppercase tracking-wider text-brand-text/70">
                    Replicar regras para outro banco
                  </p>
                  <p className="text-[8px] text-brand-text/50 leading-snug">
                    Copia as {regrasDoBanco.length} regra(s) deste banco (sem duplicar).
                  </p>
                  <div className="flex gap-2 items-stretch">
                    <div className="flex-1 min-w-0">
                      <ExtratoContaPicker
                        value={replicateTarget}
                        options={outrosBancos}
                        placeholder="Banco de destino (código reduzido)…"
                        ariaLabel="Banco de destino para replicar regras"
                        onChange={(code) => {
                          setReplicateTarget(code);
                          setReplicateMsg('');
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleReplicate}
                      disabled={!replicateTarget.trim() || regrasDoBanco.length === 0}
                      className="technical-button text-[9px] py-1 px-3 inline-flex items-center justify-center gap-1 disabled:opacity-40 shrink-0"
                    >
                      <Copy size={12} aria-hidden="true" />
                      Replicar
                    </button>
                  </div>
                  {replicateMsg ? (
                    <p className="text-[9px] font-bold text-green-800 uppercase leading-snug">
                      {replicateMsg}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
            <div className="flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-brand-border">
              <div className="p-3 border-b border-brand-border/40 space-y-2 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-brand-text/60">
                    Nova regra · contrapartida (código reduzido) ·{' '}
                    {bancoLabel(selectedBanco) || 'sem banco'}
                  </p>
                </div>
                {uncoveredRows.length > 0 ? (
                  <p className="text-[8px] text-amber-800">
                    {uncoveredRows.length} padrão(ões) do extrato ainda sem regra — use{' '}
                    <strong>IA Corrigir regras</strong> ao lado.
                  </p>
                ) : extratoSample.length > 0 ? (
                  <p className="text-[8px] text-green-800">
                    Todos os lançamentos do extrato têm regra neste banco.
                  </p>
                ) : null}
                <div className="flex flex-col sm:flex-row gap-2 items-stretch">
                  <input
                    type="text"
                    aria-label="Descrição no extrato"
                    value={draftDescricao}
                    onChange={(e) => setDraftDescricao(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAdd();
                      }
                    }}
                    placeholder="Descrição no extrato (ex.: PAGAMENTO, COMPE)"
                    className={cn(INPUT_REGRA_CLS, 'flex-[2] min-w-0')}
                    disabled={!selectedBanco}
                  />
                  <div className="shrink-0 sm:w-[108px]">
                    <p className="text-[8px] font-bold uppercase opacity-50 mb-0.5 sm:sr-only">
                      Natureza
                    </p>
                    <div className="flex border border-brand-border h-[26px]">
                      <button
                        type="button"
                        onClick={() => setDraftNature('D')}
                        disabled={!selectedBanco}
                        className={cn(
                          'flex-1 text-[8px] font-black uppercase',
                          draftNature === 'D' ? 'bg-red-600 text-white' : 'bg-transparent',
                        )}
                      >
                        D
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraftNature('C')}
                        disabled={!selectedBanco}
                        className={cn(
                          'flex-1 text-[8px] font-black uppercase',
                          draftNature === 'C' ? 'bg-blue-600 text-white' : 'bg-transparent',
                        )}
                      >
                        C
                      </button>
                    </div>
                  </div>
                  <div className="flex-[2] min-w-0">
                    <ExtratoContaPicker
                      value={draftConta}
                      options={planoOptions}
                      placeholder="Código reduzido da contrapartida…"
                      ariaLabel="Conta contrapartida (código reduzido)"
                      onChange={(code) => {
                        setDraftConta(code);
                        setAddError('');
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!draftDescricao.trim() || !draftConta.trim() || !selectedBanco.trim()}
                    className="technical-button-primary text-[9px] py-1 px-4 shrink-0 inline-flex items-center justify-center gap-1 disabled:opacity-40 self-stretch min-h-[26px]"
                  >
                    <Plus size={12} aria-hidden="true" />
                    ADD
                  </button>
                </div>
              </div>

              <div
                id="regras-do-banco-lista"
                ref={regrasListRef}
                className="p-3 space-y-2 scroll-mt-2 transition-shadow"
              >
                <p className="text-[9px] font-black uppercase tracking-widest text-brand-text/60">
                  Regras deste banco · {regrasDoBanco.length}
                </p>
                {regrasDoBanco.length === 0 ? (
                  <p className="text-[10px] text-brand-text/45 italic text-center py-8">
                    Nenhuma regra para este banco. Use <strong>IA Corrigir regras</strong> ao lado
                    ou cadastre manualmente.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {regrasDoBanco.map((regra) => (
                      <li
                        key={regra.id}
                        className="border border-brand-border/40 p-3 flex flex-col sm:flex-row sm:items-center gap-2"
                      >
                        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <p className="text-[9px] text-brand-text/60 sm:col-span-1">
                            <span className="font-bold uppercase text-brand-text/45 block text-[8px] mb-0.5">
                              Descrição
                            </span>
                            {regra.descricao}
                          </p>
                          <p className="text-[9px] text-brand-text/60">
                            <span className="font-bold uppercase text-brand-text/45 block text-[8px] mb-0.5">
                              Natureza
                            </span>
                            <span
                              className={cn(
                                'inline-block text-[8px] font-black uppercase',
                                'px-1.5 py-0.5 border',
                                regra.nature === 'D'
                                  ? 'bg-red-600 text-white border-red-800'
                                  : 'bg-blue-600 text-white border-blue-800',
                              )}
                            >
                              {regra.nature === 'D' ? 'Débito' : 'Crédito'}
                            </span>
                          </p>
                          <p
                            className="text-[9px] text-brand-text/60 truncate sm:col-span-1"
                            title={contaLabel(regra.contaContrapartida)}
                          >
                            <span className="font-bold uppercase text-brand-text/45 block text-[8px] mb-0.5">
                              Contrapartida (reduzido)
                            </span>
                            {contaLabel(regra.contaContrapartida)}
                            {isClassificacaoHierarquica(regra.contaContrapartida) ? (
                              <span className="block text-[8px] text-rose-700 font-bold uppercase mt-0.5">
                                Classificação inválida — reabra o modal para corrigir
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemove(regra.id)}
                          className="technical-button text-[8px] py-1 px-2 inline-flex items-center gap-1 shrink-0 self-start sm:self-center"
                        >
                          <Trash2 size={11} aria-hidden="true" />
                          Remover
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex flex-col p-2 lg:sticky lg:top-0 lg:self-start">
              <ExtratoRegrasContasAiPanel
                company={company}
                contaBanco={selectedBanco}
                bancoNome={bancoLabel(selectedBanco)}
                docsCount={docsCount}
                busy={corrigindoIa}
                message={corrigirMsg}
                uncoveredCount={uncoveredRows.length}
                regrasCount={regrasDoBanco.length}
                onCorrigir={() => void handleCorrigirRegrasComIa()}
                onImplantar={() => void handleImplantarRegrasComIa()}
                onMostrarRegras={handleMostrarRegras}
                onOpenInteligencia={onOpenInteligencia}
                onChat={handleChatRegrasComIa}
              />
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-brand-border flex justify-end gap-2 shrink-0 bg-brand-bg">
          <button type="button" onClick={onClose} className="technical-button text-[10px] py-1 px-3">
            Fechar
          </button>
          {onReaplicar ? (
            <button
              type="button"
              onClick={() => {
                if (selectedBanco.trim()) applyContaBanco(selectedBanco);
                // Próximo tick: options do Manager já refletem o banco/regras salvos
                window.setTimeout(() => {
                  onReaplicar();
                  onClose();
                }, 50);
              }}
              disabled={regras.length === 0 && !selectedBanco.trim()}
              className="technical-button-primary text-[10px] py-1 px-4 disabled:opacity-40"
            >
              Salvar e reaplicar conciliação
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
});
