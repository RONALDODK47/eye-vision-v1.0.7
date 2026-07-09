import { useMemo } from 'react';
import {
  getPriceProfileById,
  matchPriceBankProfile,
  PRICE_BANK_PROFILES,
} from '../../lib/bankPriceProfiles';
import { getSacProfileById, matchSacBankProfile, SAC_BANK_PROFILES } from '../../lib/bankSacProfiles';
import type { SacInterestAccrual, SacMoneyRoundingMode } from '../../lib/loanCalculator';
import type { SimTabFields, SimVarMode } from '../../lib/simTabFields';
import { CF_LOAN_SELECT } from '../lib/formFieldClasses';

export interface LoanCalcParamsPanelProps {
  system: 'SAC' | 'PRICE';
  varMode: SimVarMode;
  selicSeriesReady: boolean;
  tab: SimTabFields;
  onPatch: (patch: Partial<SimTabFields>) => void;
}

const inputCls = CF_LOAN_SELECT;

const labelCls = 'block text-[9px] font-bold uppercase opacity-55 mb-1';

const SAC_ACCRUAL_OPTIONS: { value: SacInterestAccrual; label: string }[] = [
  { value: 'mensalContrato', label: 'Mensal (competência cheia)' },
  { value: 'proRataCorridos', label: 'Pró-rata dias corridos ÷ 30' },
  { value: 'proRataMesCivil', label: 'Pró-rata mês civil' },
];

const SAC_ROUND_OPTIONS: { value: SacMoneyRoundingMode; label: string }[] = [
  { value: 'halfAwayFromZero', label: 'Meia-distância (centavos)' },
  { value: 'truncateCentavos', label: 'Truncar centavos' },
];

export default function LoanCalcParamsPanel({
  system,
  varMode: _varMode,
  selicSeriesReady: _selicSeriesReady,
  tab,
  onPatch,
}: LoanCalcParamsPanelProps) {
  const sacProfileId = useMemo(
    () =>
      matchSacBankProfile({
        sacInterestAccrual: tab.sacInterestAccrual,
        proRataDieMode: tab.proRataDieMode,
        sacMoneyRounding: tab.sacMoneyRounding,
      }) ?? '',
    [tab.sacInterestAccrual, tab.proRataDieMode, tab.sacMoneyRounding],
  );

  const priceProfileId = useMemo(
    () =>
      matchPriceBankProfile({
        priceInterestAccrual: tab.priceInterestAccrual,
        proRataDieMode: tab.proRataDieMode,
      }) ?? '',
    [tab.priceInterestAccrual, tab.proRataDieMode],
  );

  const activeProfileId = system === 'SAC' ? sacProfileId : priceProfileId;
  const profiles = system === 'SAC' ? SAC_BANK_PROFILES : PRICE_BANK_PROFILES;

  const handleProfileChange = (id: string) => {
    if (!id) return;
    if (system === 'SAC') {
      const p = getSacProfileById(id);
      if (!p) return;
      onPatch({
        sacInterestAccrual: p.sacInterestAccrual,
        proRataDieMode: p.proRataDieMode,
        sacMoneyRounding: p.sacMoneyRounding,
      });
      return;
    }
    const p = getPriceProfileById(id);
    if (!p) return;
    onPatch({
      priceInterestAccrual: p.priceInterestAccrual,
      proRataDieMode: p.proRataDieMode,
    });
  };

  return (
    <div className="border border-brand-border/60 bg-brand-sidebar/5 p-3 space-y-3 min-w-0 max-w-full overflow-hidden">
      <div className="min-w-0 max-w-full">
        <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-2">
          Parâmetros {system} (banco)
        </p>
        <label className={labelCls}>Perfil de referência</label>
        <select
          aria-label={`Perfil de referência ${system}`}
          value={activeProfileId}
          onChange={(e) => handleProfileChange(e.target.value)}
          className={inputCls}
        >
          <option value="">Personalizado / manual</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {system === 'SAC' ? (
        <div className="grid sm:grid-cols-2 gap-3 pt-1 border-t border-brand-border/30">
          <div>
            <label className={labelCls}>Arredondamento SAC</label>
            <select
              aria-label="Arredondamento monetário SAC"
              className={inputCls}
              value={tab.sacMoneyRounding}
              onChange={(e) =>
                onPatch({ sacMoneyRounding: e.target.value as SacMoneyRoundingMode })
              }
            >
              {SAC_ROUND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Base amortização SAC</label>
            <select
              aria-label="Base da amortização constante SAC"
              className={inputCls}
              value={tab.sacAmortizationBase}
              onChange={(e) =>
                onPatch({
                  sacAmortizationBase:
                    e.target.value === 'contractPrincipal' ? 'contractPrincipal' : 'incorporated',
                })
              }
            >
              <option value="incorporated">Saldo após carência ÷ parcelas</option>
              <option value="contractPrincipal">Principal do contrato ÷ parcelas</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Juros SAC (competência)</label>
            <select
              aria-label="Forma de juros SAC"
              className={inputCls}
              value={tab.sacInterestAccrual}
              onChange={(e) =>
                onPatch({ sacInterestAccrual: e.target.value as SacInterestAccrual })
              }
            >
              {SAC_ACCRUAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Pró-rata na taxa</label>
            <select
              aria-label="Pró-rata DIE"
              className={inputCls}
              value={tab.proRataDieMode}
              onChange={(e) =>
                onPatch({
                  proRataDieMode: e.target.value === 'compound' ? 'compound' : 'linear',
                })
              }
            >
              <option value="linear">Linear</option>
              <option value="compound">Composto</option>
            </select>
          </div>
        </div>
      ) : null}

      <div className="pt-1 border-t border-brand-border/30 space-y-2 min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest opacity-70">
          Curto/longo prazo (CPC fiscal)
        </p>
        <p className="text-[8px] opacity-50 leading-snug">
          Uma reclassificação LP→CP por ano (31/12), provisionando parcelas do ano seguinte (até 12).
          Se o empréstimo encerrar no ano, provisiona só o restante. Contas na aba Contas.
        </p>
      </div>
    </div>
  );
}
