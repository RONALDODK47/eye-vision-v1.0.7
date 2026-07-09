import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import AutomationToggle from './AutomationToggle';
import FiscalContasImpostoPanel from './FiscalContasImpostoConfig';
import FiscalSpedImportPanel from './FiscalSpedImportPanel';
import FiscalSpedFolderPanel from './FiscalSpedFolderPanel';
import FiscalPgdasFolderPanel from './FiscalPgdasFolderPanel';
import FiscalAcumuladoresPanel from './FiscalAcumuladoresPanel';
import FiscalNotaBloqueioPanel from './FiscalNotaBloqueioPanel';
import type { FiscalContasImpostoConfig } from '../logic/fiscalContasImposto';
import { loadFiscalContasImposto } from '../logic/fiscalContasImpostoStorage';
import { readManagerData } from '../logic/companyWorkspace';
import { postFiscalImportsNoRazao, type FiscalPgdasArquivoSalvo } from '../logic/fiscalPgdasAutomation';
import { type FiscalSpedArquivoSalvo } from '../logic/fiscalSpedAutomation';
import { loadFiscalPgdasFolderSettings, saveFiscalPgdasFolderSettings } from '../logic/fiscalPgdasFolderStore';
import { loadFiscalSpedFolderSettings, saveFiscalSpedFolderSettings } from '../logic/fiscalSpedFolderStore';

type FiscalInnerTab = 'sped' | 'acumuladores' | 'contas' | 'bloqueio' | 'impostos';

const INNER_TABS: { id: FiscalInnerTab; label: string }[] = [
  { id: 'acumuladores', label: 'Acumuladores' },
  { id: 'contas', label: 'Contas' },
  { id: 'impostos', label: 'Impostos' },
  { id: 'bloqueio', label: 'Bloqueio NF' },
  { id: 'sped', label: 'Importações' },
];

type Props = {
  selectedCompany: string;
};

export default function FiscalModule({ selectedCompany }: Props) {
  const [innerTab, setInnerTab] = useState<FiscalInnerTab>('sped');
  const [spedVersion, setSpedVersion] = useState(0);
  const [contasImposto, setContasImposto] = useState<FiscalContasImpostoConfig>(() =>
    loadFiscalContasImposto(selectedCompany),
  );
  const [automationEnabled, setAutomationEnabled] = useState(
    () => loadFiscalSpedFolderSettings(selectedCompany).automationEnabled,
  );

  const postTodosFiscaisNoRazao = (config: FiscalContasImpostoConfig) => {
    const arquivosSped = readManagerData<FiscalSpedArquivoSalvo>(selectedCompany, 'fiscalSped');
    const arquivosPgdas = readManagerData<FiscalPgdasArquivoSalvo>(selectedCompany, 'fiscalPgdas');
    if (arquivosSped.length === 0 && arquivosPgdas.length === 0) return;
    postFiscalImportsNoRazao(selectedCompany, arquivosSped, arquivosPgdas, config);
    setSpedVersion((v) => v + 1);
  };

  const handleContasChange = (config: FiscalContasImpostoConfig) => {
    setContasImposto(config);
    if (!loadFiscalSpedFolderSettings(selectedCompany).automationEnabled) return;
    postTodosFiscaisNoRazao(config);
  };

  useEffect(() => {
    setContasImposto(loadFiscalContasImposto(selectedCompany));
    setAutomationEnabled(loadFiscalSpedFolderSettings(selectedCompany).automationEnabled);
  }, [selectedCompany]);

  const handleAutomationChange = (enabled: boolean) => {
    setAutomationEnabled(enabled);
    saveFiscalSpedFolderSettings(selectedCompany, { automationEnabled: enabled });
    saveFiscalPgdasFolderSettings(selectedCompany, { automationEnabled: enabled });
    if (!enabled) return;
    postTodosFiscaisNoRazao(contasImposto);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="flex border border-brand-border bg-brand-sidebar/20 shadow-[2px_2px_0_0_#141414] flex-1 min-w-[200px]">
        {INNER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setInnerTab(tab.id)}
            className={cn(
              'px-4 py-2 text-[10px] font-black uppercase tracking-widest border-r border-brand-border last:border-r-0 transition-all',
              innerTab === tab.id
                ? 'bg-brand-bg text-brand-text'
                : 'opacity-50 hover:opacity-100',
            )}
          >
            {tab.label}
          </button>
        ))}
        </div>
        <AutomationToggle
          enabled={automationEnabled}
          onChange={handleAutomationChange}
          description="Pastas SPED/PGDAS e importações → balancete quando as contas estiverem preenchidas."
          className="shrink-0"
        />
      </div>

      {innerTab === 'sped' && (
        <>
          <FiscalSpedFolderPanel
            selectedCompany={selectedCompany}
            onSynced={() => setSpedVersion((v) => v + 1)}
          />
          <FiscalPgdasFolderPanel
            selectedCompany={selectedCompany}
            onSynced={() => setSpedVersion((v) => v + 1)}
          />
        </>
      )}
      {innerTab === 'impostos' && (
        <FiscalSpedImportPanel
          key={`${selectedCompany}-${spedVersion}-impostos`}
          selectedCompany={selectedCompany}
          contasImposto={contasImposto}
          automationEnabled={automationEnabled}
          mode="impostos"
        />
      )}
      {innerTab === 'acumuladores' && (
        <FiscalAcumuladoresPanel
          key={`${selectedCompany}-${spedVersion}`}
          selectedCompany={selectedCompany}
          contasImposto={contasImposto}
        />
      )}
      {innerTab === 'contas' && (
        <FiscalContasImpostoPanel selectedCompany={selectedCompany} onChange={handleContasChange} />
      )}
      {innerTab === 'bloqueio' && (
        <FiscalNotaBloqueioPanel
          selectedCompany={selectedCompany}
          onChange={() => setSpedVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}
