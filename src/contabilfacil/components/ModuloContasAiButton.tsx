import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { suggestModuloContasWithAi } from '../../lib/aiModuloContasClient';
import { listAiInteligenciaTextoParaIaAsync } from '../logic/aiInteligenciaStorage';
import { getModuloContasCampoDefs, type ModuloContasAiId } from '../logic/moduloContasAiSchemas';
import {
  buildPlanoPayloadForModuloAi,
  loadPlanoAnaliticoForAi,
  loadPlanoCompletoForContaResolve,
  resolveCodigoReduzidoSugestaoPlano,
} from '../logic/planoContasAiContext';

type Props = {
  company: string;
  modulo: ModuloContasAiId;
  contasAtuais: Record<string, string>;
  onApply: (patch: Record<string, string>) => void;
  contexto?: Record<string, string | boolean | number | undefined>;
  disabled?: boolean;
  className?: string;
  /** Se true, só preenche campos vazios (padrão). */
  onlyEmpty?: boolean;
};

/**
 * Botão «IA colocar as contas» — sugere código reduzido do plano para a aba Contas (somente IA).
 */
export default function ModuloContasAiButton({
  company,
  modulo,
  contasAtuais,
  onApply,
  contexto,
  disabled = false,
  className,
  onlyEmpty = true,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleClick = async () => {
    setMsg(null);
    const planoRows = loadPlanoAnaliticoForAi(company);
    const planoResolve = loadPlanoCompletoForContaResolve(company);
    const plano = buildPlanoPayloadForModuloAi(planoRows);
    if (!plano.length) {
      setMsg(
        'Importe o plano de contas na aba Gerencial com Código Reduzido preenchido antes de usar a IA.',
      );
      return;
    }

    const campos = getModuloContasCampoDefs(modulo);
    setBusy(true);
    try {
      let anexosTexto: string[] = [];
      try {
        anexosTexto = (await listAiInteligenciaTextoParaIaAsync(company)).slice(0, 8);
      } catch {
        /* opcional */
      }

      const result = await suggestModuloContasWithAi({
        company,
        modulo,
        message: onlyEmpty
          ? 'Preencha apenas as contas vazias com os melhores códigos reduzidos do plano.'
          : 'Sugira/substitua as contas do módulo com os melhores códigos reduzidos do plano.',
        plano,
        campos,
        contasAtuais,
        contexto,
        anexosTexto,
      });

      const patch: Record<string, string> = {};
      if (result.ok && Object.keys(result.contas).length > 0) {
        for (const [key, raw] of Object.entries(result.contas)) {
          if (onlyEmpty && (contasAtuais[key] ?? '').trim()) continue;
          const resolved = resolveCodigoReduzidoSugestaoPlano(raw, planoResolve);
          if (resolved && !resolved.includes('.')) patch[key] = resolved;
        }
      }

      if (Object.keys(patch).length === 0) {
        setMsg(
          result.detail ||
            result.resumo ||
            'A IA não retornou códigos reduzidos válidos. Verifique o plano e tente novamente.',
        );
        return;
      }

      setMsg(result.resumo || `${Object.keys(patch).length} conta(s) preenchida(s) pela IA.`);
      onApply(patch);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falha ao sugerir contas pela IA.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('flex flex-col items-end gap-1', className)}>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={disabled || busy}
        title="A IA sugere códigos reduzidos do plano de contas para este módulo"
        className="technical-button-primary text-[9px] py-1 px-2 inline-flex items-center gap-1 disabled:opacity-40"
      >
        {busy ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <Sparkles size={11} aria-hidden />}
        {busy ? 'IA SUGERINDO…' : 'IA COLOCAR AS CONTAS'}
      </button>
      {msg ? (
        <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500 max-w-[280px] text-right leading-snug">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
