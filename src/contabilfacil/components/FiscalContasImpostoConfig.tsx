import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { CF_FIELD_COL, CF_FIELD_ROW, CF_INPUT_ACCOUNT } from '../lib/formFieldClasses';
import {
  FISCAL_IMPOSTO_LABELS,
  FISCAL_IMPOSTOS,
  type FiscalContaPar,
  type FiscalContasImpostoConfig,
  type FiscalImpostoId,
} from '../logic/fiscalContasImposto';
import { loadFiscalContasImposto, saveFiscalContasImposto } from '../logic/fiscalContasImpostoStorage';

type Props = {
  selectedCompany: string;
  onChange?: (config: FiscalContasImpostoConfig) => void;
};

type ContaField = keyof FiscalContaPar;

function ContaInput({
  id,
  field,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: FiscalImpostoId;
  field: ContaField;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={CF_FIELD_ROW}>
      <div className={CF_FIELD_COL}>
        <input
          type="text"
          inputMode="numeric"
          aria-label={label}
          placeholder={placeholder}
          className={CF_INPUT_ACCOUNT}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

export default function FiscalContasImpostoPanel({ selectedCompany, onChange }: Props) {
  const [contas, setContas] = useState<FiscalContasImpostoConfig>(() =>
    loadFiscalContasImposto(selectedCompany),
  );

  const persist = useCallback(
    (next: FiscalContasImpostoConfig) => {
      setContas(next);
      saveFiscalContasImposto(selectedCompany, next);
      onChange?.(next);
    },
    [selectedCompany, onChange],
  );

  useEffect(() => {
    const loaded = loadFiscalContasImposto(selectedCompany);
    setContas(loaded);
    onChange?.(loaded);
  }, [selectedCompany, onChange]);

  const patchPar = (id: FiscalImpostoId, field: ContaField, value: string) => {
    persist({
      ...contas,
      [id]: { ...contas[id], [field]: value },
    });
  };

  return (
    <div className="technical-panel shadow-[4px_4px_0_0_#141414] overflow-hidden">
      <div className="px-4 py-3 border-b border-brand-border bg-brand-sidebar/30 flex items-center gap-2">
        <BookOpen size={14} className="opacity-60" />
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-widest">Contas — impostos</h3>
          <p className="text-[9px] font-bold uppercase opacity-50 mt-0.5 max-w-3xl">
            Débito e crédito por tributo: a recolher (apuração / passivo) e a recuperar (créditos
            tributários / ativo). Com SPED importado, os lançamentos vão ao balancete ao salvar.
          </p>
        </div>
      </div>
      <div className="p-4 overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-[10px] font-mono">
          <thead>
            <tr className="text-[9px] font-black uppercase opacity-60 border-b border-brand-border/40">
              <th className="pb-2 pr-4 w-[18%]" rowSpan={2}>
                Imposto
              </th>
              <th className="pb-1 pr-2 text-center border-l border-brand-border/30" colSpan={2}>
                A recolher
              </th>
              <th className="pb-1 pl-2 text-center border-l border-brand-border/30" colSpan={2}>
                A recuperar
              </th>
            </tr>
            <tr className="text-[8px] font-black uppercase opacity-50 border-b border-brand-border/40">
              <th className="pb-2 pr-3 pl-2 border-l border-brand-border/30">Conta débito</th>
              <th className="pb-2 pr-3">Conta crédito</th>
              <th className="pb-2 pr-3 pl-2 border-l border-brand-border/30">Conta débito</th>
              <th className="pb-2">Conta crédito</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border/15">
            {FISCAL_IMPOSTOS.map((id) => (
              <tr key={id}>
                <td className="py-2 pr-4 font-bold uppercase align-middle">{FISCAL_IMPOSTO_LABELS[id]}</td>
                <td className="py-2 pr-3 pl-2 align-middle border-l border-brand-border/15">
                  <ContaInput
                    id={id}
                    field="debito"
                    label={`A recolher — débito ${FISCAL_IMPOSTO_LABELS[id]}`}
                    placeholder="Ex.: 3.1.02.01"
                    value={contas[id].debito}
                    onChange={(v) => patchPar(id, 'debito', v)}
                  />
                </td>
                <td className="py-2 pr-3 align-middle">
                  <ContaInput
                    id={id}
                    field="credito"
                    label={`A recolher — crédito ${FISCAL_IMPOSTO_LABELS[id]}`}
                    placeholder="Ex.: 2.1.08.01"
                    value={contas[id].credito}
                    onChange={(v) => patchPar(id, 'credito', v)}
                  />
                </td>
                <td className="py-2 pr-3 pl-2 align-middle border-l border-brand-border/15">
                  <ContaInput
                    id={id}
                    field="debitoRecuperar"
                    label={`A recuperar — débito ${FISCAL_IMPOSTO_LABELS[id]}`}
                    placeholder="Ex.: 1.1.08.01"
                    value={contas[id].debitoRecuperar}
                    onChange={(v) => patchPar(id, 'debitoRecuperar', v)}
                  />
                </td>
                <td className="py-2 align-middle">
                  <ContaInput
                    id={id}
                    field="creditoRecuperar"
                    label={`A recuperar — crédito ${FISCAL_IMPOSTO_LABELS[id]}`}
                    placeholder="Ex.: 3.1.02.01"
                    value={contas[id].creditoRecuperar}
                    onChange={(v) => patchPar(id, 'creditoRecuperar', v)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
