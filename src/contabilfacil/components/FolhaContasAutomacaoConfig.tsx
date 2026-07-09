import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { CF_FIELD_COL, CF_FIELD_ROW, CF_INPUT_ACCOUNT } from '../lib/formFieldClasses';
import {
  FOLHA_RUBRICA_LABELS,
  FOLHA_RUBRICAS,
  type FolhaContasAutomacaoConfig,
  type FolhaRubricaId,
} from '../logic/folhaContasAutomacao';
import { loadFolhaContasAutomacao, saveFolhaContasAutomacao } from '../logic/folhaContasAutomacaoStorage';

type Props = {
  selectedCompany: string;
  onChange?: (config: FolhaContasAutomacaoConfig) => void;
};

export default function FolhaContasAutomacaoPanel({ selectedCompany, onChange }: Props) {
  const [contas, setContas] = useState<FolhaContasAutomacaoConfig>(() =>
    loadFolhaContasAutomacao(selectedCompany),
  );

  const persist = useCallback(
    (next: FolhaContasAutomacaoConfig) => {
      setContas(next);
      saveFolhaContasAutomacao(selectedCompany, next);
      onChange?.(next);
    },
    [selectedCompany, onChange],
  );

  useEffect(() => {
    const loaded = loadFolhaContasAutomacao(selectedCompany);
    setContas(loaded);
    onChange?.(loaded);
  }, [selectedCompany, onChange]);

  const patchPar = (id: FolhaRubricaId, field: 'debito' | 'credito', value: string) => {
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
          <h3 className="text-[10px] font-black uppercase tracking-widest">Contas — folha</h3>
          <p className="text-[9px] font-bold uppercase opacity-50 mt-0.5">
            Débito e crédito por rubrica (salários, pró-labore, INSS, FGTS, IRRF). Com arquivos importados, os
            lançamentos vão ao balancete automaticamente ao salvar.
          </p>
        </div>
      </div>
      <div className="p-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[10px] font-mono">
          <thead>
            <tr className="text-[9px] font-black uppercase opacity-60 border-b border-brand-border/40">
              <th className="pb-2 pr-4 w-[32%]">Rubrica</th>
              <th className="pb-2 pr-3">Conta débito</th>
              <th className="pb-2">Conta crédito</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border/15">
            {FOLHA_RUBRICAS.map((id) => (
              <tr key={id}>
                <td className="py-2 pr-4 font-bold uppercase align-middle text-[9px] leading-snug">
                  {FOLHA_RUBRICA_LABELS[id]}
                </td>
                <td className="py-2 pr-3 align-middle">
                  <div className={CF_FIELD_ROW}>
                    <div className={CF_FIELD_COL}>
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`Conta débito ${FOLHA_RUBRICA_LABELS[id]}`}
                        placeholder="Ex.: 4.1.01.01"
                        className={CF_INPUT_ACCOUNT}
                        value={contas[id].debito}
                        onChange={(e) => patchPar(id, 'debito', e.target.value)}
                      />
                    </div>
                  </div>
                </td>
                <td className="py-2 align-middle">
                  <div className={CF_FIELD_ROW}>
                    <div className={CF_FIELD_COL}>
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`Conta crédito ${FOLHA_RUBRICA_LABELS[id]}`}
                        placeholder="Ex.: 2.1.03.01"
                        className={CF_INPUT_ACCOUNT}
                        value={contas[id].credito}
                        onChange={(e) => patchPar(id, 'credito', e.target.value)}
                      />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
