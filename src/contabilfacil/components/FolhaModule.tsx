import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import AutomationToggle from './AutomationToggle';
import FolhaFolderPanel from './FolhaFolderPanel';
import FolhaContasAutomacaoPanel from './FolhaContasAutomacaoConfig';
import type { FolhaContasAutomacaoConfig } from '../logic/folhaContasAutomacao';
import { loadFolhaFolderSettings, saveFolhaFolderSettings } from '../logic/folhaFolderStore';
import { postFolhaNoRazao } from '../logic/folhaAutomation';
import { readManagerData } from '../logic/companyWorkspace';
import type { FolhaRelatorioImportRow } from '../logic/dominioTxtIO';
import type { FolhaPayrollLinha } from '../logic/folhaToRazao';

type FolhaInnerTab = 'importacao' | 'contas';

const INNER_TABS: { id: FolhaInnerTab; label: string }[] = [
  { id: 'importacao', label: 'Importação automática' },
  { id: 'contas', label: 'Contas' },
];

type Props = {
  selectedCompany: string;
  onSynced?: () => void;
};

export default function FolhaModule({ selectedCompany, onSynced }: Props) {
  const [innerTab, setInnerTab] = useState<FolhaInnerTab>('importacao');
  const [automationEnabled, setAutomationEnabled] = useState(
    () => loadFolhaFolderSettings(selectedCompany).automationEnabled,
  );

  useEffect(() => {
    setAutomationEnabled(loadFolhaFolderSettings(selectedCompany).automationEnabled);
  }, [selectedCompany]);

  const handleContasChange = (config: FolhaContasAutomacaoConfig) => {
    if (!loadFolhaFolderSettings(selectedCompany).automationEnabled) return;
    const relatorio = readManagerData<FolhaRelatorioImportRow>(selectedCompany, 'folhaRelatorio');
    const payroll = readManagerData<FolhaPayrollLinha>(selectedCompany, 'folha');
    if (relatorio.length > 0 || payroll.length > 0) {
      postFolhaNoRazao(selectedCompany, config);
      onSynced?.();
    }
  };

  const handleAutomationChange = (enabled: boolean) => {
    setAutomationEnabled(enabled);
    saveFolhaFolderSettings(selectedCompany, { automationEnabled: enabled });
    if (!enabled) return;
    const relatorio = readManagerData<FolhaRelatorioImportRow>(selectedCompany, 'folhaRelatorio');
    const payroll = readManagerData<FolhaPayrollLinha>(selectedCompany, 'folha');
    if (relatorio.length > 0 || payroll.length > 0) {
      postFolhaNoRazao(selectedCompany);
      onSynced?.();
    }
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
          description="Pasta e importação da folha → balancete quando as contas estiverem preenchidas."
          className="shrink-0"
        />
      </div>

      {innerTab === 'importacao' && (
        <FolhaFolderPanel
          selectedCompany={selectedCompany}
          onSynced={onSynced}
        />
      )}
      {innerTab === 'contas' && (
        <FolhaContasAutomacaoPanel selectedCompany={selectedCompany} onChange={handleContasChange} />
      )}
    </div>
  );
}
