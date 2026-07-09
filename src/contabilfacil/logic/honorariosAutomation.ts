import type { VisionBalanceteRow } from '../../extratoVision/types/accounting';
import { readManagerData, writeManagerData, flushManagerDataWrites } from './companyWorkspace';
import { normalizeRazaoImport } from './contabilPipeline';
import type { HonorariosContasAutomacaoConfig } from './honorariosContasAutomacao';
import { loadHonorariosContasAutomacao } from './honorariosContasAutomacaoStorage';
import {
  loadHonorariosAutomacaoSettings,
  loadHonorariosValoresMes,
  saveHonorariosAutomacaoSettings,
  saveHonorariosValoresMes,
  type HonorariosAutomacaoSettings,
  type HonorariosValorMes,
} from './honorariosAutomacaoStorage';
import {
  gerarLancamentosHonorariosAutomacao,
  isHonorariosLancamentoAuto,
  mesclarLancamentosHonorarios,
} from './honorariosScheduler';
import {
  buildRazaoFromHonorarios,
  mergeHonorariosRazaoComExistente,
  type HonorariosLancamento,
} from './honorariosToRazao';

export function loadHonorariosLancamentos(companyName: string): HonorariosLancamento[] {
  return readManagerData<HonorariosLancamento>(companyName, 'honorariosLancamentos');
}

export function saveHonorariosLancamentos(
  companyName: string,
  lancamentos: HonorariosLancamento[],
): void {
  writeManagerData(companyName, 'honorariosLancamentos', lancamentos);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('contabilfacil-honorarios-updated', { detail: { company: companyName } }),
    );
  }
}

export function postHonorariosNoRazao(
  companyName: string,
  contas?: HonorariosContasAutomacaoConfig,
): { gerados: number; pendencias: string[] } {
  const cfg = contas ?? loadHonorariosContasAutomacao(companyName);
  const lancamentos = loadHonorariosLancamentos(companyName);
  const { rows, gerados, pendencias } = buildRazaoFromHonorarios(lancamentos, cfg);
  if (gerados <= 0) return { gerados: 0, pendencias };

  const existente = readManagerData<VisionBalanceteRow>(companyName, 'razao');
  const merged = normalizeRazaoImport(mergeHonorariosRazaoComExistente(existente, rows));
  writeManagerData(companyName, 'razao', merged);
  flushManagerDataWrites();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('contabilfacil-razao-updated', { detail: { company: companyName } }),
    );
  }
  return { gerados, pendencias };
}

export function sincronizarHonorariosAutomacao(
  companyName: string,
  contas?: HonorariosContasAutomacaoConfig,
): { ok: boolean; pendencias: string[]; gerados: number } {
  const settings = loadHonorariosAutomacaoSettings(companyName);
  if (!settings.automationEnabled) {
    return { ok: true, pendencias: [], gerados: 0 };
  }

  const valoresMes = loadHonorariosValoresMes(companyName);
  const anoAtual = new Date().getFullYear();
  const automaticos = gerarLancamentosHonorariosAutomacao(settings, valoresMes, anoAtual);
  const manuais = loadHonorariosLancamentos(companyName);
  const merged = mesclarLancamentosHonorarios(manuais, automaticos);
  saveHonorariosLancamentos(companyName, merged);

  const posted = postHonorariosNoRazao(companyName, contas);
  return {
    ok: posted.gerados > 0 || posted.pendencias.length === 0,
    pendencias: posted.pendencias,
    gerados: posted.gerados,
  };
}

export function atualizarValoresHonorariosMeses(
  companyName: string,
  params: { ano: number; meses: number[]; valor: number; historico?: string },
  contas?: HonorariosContasAutomacaoConfig,
): { ok: boolean; pendencias: string[] } {
  const valor = Math.abs(params.valor);
  if (valor < 0.0001) {
    return { ok: false, pendencias: ['Informe um valor maior que zero.'] };
  }
  if (!params.meses.length) {
    return { ok: false, pendencias: ['Selecione ao menos um mês.'] };
  }

  const atuais = loadHonorariosValoresMes(companyName);
  const map = new Map(atuais.map((v) => [`${v.ano}-${v.mes}`, v] as const));
  const hist = params.historico?.trim().toUpperCase();

  for (const mes of params.meses) {
    if (mes < 1 || mes > 12) continue;
    map.set(`${params.ano}-${mes}`, {
      ano: params.ano,
      mes,
      valor,
      historico: hist,
    });
  }

  saveHonorariosValoresMes(companyName, [...map.values()]);

  const settings = loadHonorariosAutomacaoSettings(companyName);
  if (settings.automationEnabled) {
    const sync = sincronizarHonorariosAutomacao(companyName, contas);
    return { ok: sync.ok, pendencias: sync.pendencias };
  }

  return { ok: true, pendencias: [] };
}

export function salvarConfigHonorariosAutomacao(
  companyName: string,
  patch: Partial<HonorariosAutomacaoSettings>,
  contas?: HonorariosContasAutomacaoConfig,
): { ok: boolean; pendencias: string[] } {
  const prev = loadHonorariosAutomacaoSettings(companyName);
  const next = saveHonorariosAutomacaoSettings(companyName, {
    ...patch,
    anoInicio: patch.anoInicio ?? (patch.automationEnabled && !prev.automationEnabled ? new Date().getFullYear() : prev.anoInicio),
  });

  if (!next.automationEnabled) {
    const semAuto = loadHonorariosLancamentos(companyName).filter((l) => !isHonorariosLancamentoAuto(l.id));
    saveHonorariosLancamentos(companyName, semAuto);
    postHonorariosNoRazao(companyName, contas);
    return { ok: true, pendencias: [] };
  }

  const sync = sincronizarHonorariosAutomacao(companyName, contas);
  return { ok: sync.ok, pendencias: sync.pendencias };
}

export function registrarHonorario(
  companyName: string,
  params: { date: string; valor: number; historico?: string },
  contas?: HonorariosContasAutomacaoConfig,
): { ok: boolean; pendencias: string[]; lancamento?: HonorariosLancamento } {
  const settings = loadHonorariosAutomacaoSettings(companyName);
  if (settings.automationEnabled) {
    return {
      ok: false,
      pendencias: ['Desligue a automação ou use «Editar valores» para alterar honorários recorrentes.'],
    };
  }

  const valor = Math.abs(params.valor);
  if (valor < 0.0001) {
    return { ok: false, pendencias: ['Informe um valor maior que zero.'] };
  }

  const cfg = contas ?? loadHonorariosContasAutomacao(companyName);
  const lancamento: HonorariosLancamento = {
    id: crypto.randomUUID(),
    date: params.date,
    valor,
    historico: (params.historico || 'HONORÁRIOS CONTÁBEIS').trim().toUpperCase(),
    automatico: false,
  };

  const existentes = loadHonorariosLancamentos(companyName);
  saveHonorariosLancamentos(companyName, [...existentes, lancamento]);

  const posted = postHonorariosNoRazao(companyName, cfg);
  if (posted.gerados <= 0 && posted.pendencias.length) {
    return { ok: false, pendencias: posted.pendencias, lancamento };
  }
  return { ok: true, pendencias: posted.pendencias, lancamento };
}

export function removerHonorario(companyName: string, id: string): void {
  if (isHonorariosLancamentoAuto(id)) {
    const m = id.match(/honor-auto-(\d{4})-(\d{2})/);
    if (m) {
      const ano = Number(m[1]);
      const mes = Number(m[2]);
      const valores = loadHonorariosValoresMes(companyName).filter(
        (v) => !(v.ano === ano && v.mes === mes),
      );
      saveHonorariosValoresMes(companyName, valores);
      const settings = loadHonorariosAutomacaoSettings(companyName);
      if (settings.valorPadrao < 0.0001) {
        const next = loadHonorariosLancamentos(companyName).filter((l) => l.id !== id);
        saveHonorariosLancamentos(companyName, next);
        postHonorariosNoRazao(companyName);
        return;
      }
    }
  }

  const next = loadHonorariosLancamentos(companyName).filter((l) => l.id !== id);
  saveHonorariosLancamentos(companyName, next);

  const settings = loadHonorariosAutomacaoSettings(companyName);
  if (settings.automationEnabled) {
    sincronizarHonorariosAutomacao(companyName);
  } else {
    postHonorariosNoRazao(companyName);
  }
}

export function tryAutoSyncHonorariosOnOpen(companyName: string): void {
  const settings = loadHonorariosAutomacaoSettings(companyName);
  if (!settings.automationEnabled) return;
  sincronizarHonorariosAutomacao(companyName);
}
