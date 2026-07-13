import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import DataIngestionBox from './DataIngestionBox';
import MandarParaBalanceteButton from './MandarParaBalanceteButton';
import FiscalContasImpostoPanel from './FiscalContasImpostoConfig';
import FiscalAcumuladoresPanel from './FiscalAcumuladoresPanel';
import FiscalNotasFiscaisPanel from './FiscalNotasFiscaisPanel';
import { FolhaRelatorioVirtualTable, type FolhaRelatorioRow } from './FolhaVirtualTables';
import type { FiscalContasImpostoConfig } from '../logic/fiscalContasImposto';
import { loadFiscalContasImposto } from '../logic/fiscalContasImpostoStorage';
import { readManagerData, writeManagerData } from '../logic/companyWorkspace';
import { flushPersistenceAfterCriticalWrite } from '../logic/eyeVisionPersistenceFlush';
import {
  postFiscalOcrNoRazao,
  type FiscalOcrRelatorioRow,
} from '../logic/fiscalOcrAutomation';
import {
  FISCAL_PDF_VARIANTS,
  fiscalVariantDescriptionPrefix,
} from '../logic/ocrColunasConfig';

type FiscalInnerTab = 'importacao' | 'nfe' | 'acumuladores' | 'contas';

const INNER_TABS: { id: FiscalInnerTab; label: string }[] = [
  { id: 'importacao', label: 'Importação PDF' },
  { id: 'nfe', label: 'NF-e webservice' },
  { id: 'acumuladores', label: 'Acumuladores' },
  { id: 'contas', label: 'Contas' },
];

type Props = {
  selectedCompany: string;
};

export default function FiscalModule({ selectedCompany }: Props) {
  const [innerTab, setInnerTab] = useState<FiscalInnerTab>('importacao');
  const [fiscalOcrRows, setFiscalOcrRows] = useState<FiscalOcrRelatorioRow[]>(() =>
    readManagerData<FiscalOcrRelatorioRow>(selectedCompany, 'fiscalOcr'),
  );
  const [fiscalPdfVariant, setFiscalPdfVariant] = useState(FISCAL_PDF_VARIANTS[0]!.id);
  const [contasImposto, setContasImposto] = useState<FiscalContasImpostoConfig>(() =>
    loadFiscalContasImposto(selectedCompany),
  );
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setContasImposto(loadFiscalContasImposto(selectedCompany));
    setFiscalOcrRows(readManagerData<FiscalOcrRelatorioRow>(selectedCompany, 'fiscalOcr'));
  }, [selectedCompany, version]);

  const handleContasChange = (config: FiscalContasImpostoConfig) => {
    // Contas só salvam — postagem ao balancete é explícita pelo botão.
    setContasImposto(config);
  };

  const saveFiscalOcr = (rows: FiscalOcrRelatorioRow[]) => {
    writeManagerData(selectedCompany, 'fiscalOcr', rows);
    setFiscalOcrRows(rows);
    // Não posta automaticamente — use «MANDAR PARA O BALANCETE».
    setVersion((v) => v + 1);
  };

  const handleMandarFiscalBalancete = () => {
    const rows = readManagerData<FiscalOcrRelatorioRow>(selectedCompany, 'fiscalOcr');
    if (rows.length === 0) {
      alert('Nenhum lançamento fiscal importado para enviar ao balancete.');
      return;
    }
    try {
      const { gerados, pendencias } = postFiscalOcrNoRazao(selectedCompany, rows, contasImposto);
      void flushPersistenceAfterCriticalWrite();
      setVersion((v) => v + 1);
      if (pendencias.length && gerados <= 0) {
        alert(pendencias.slice(0, 5).join('\n'));
        return;
      }
      alert(
        gerados > 0
          ? `${gerados} lançamento(s) fiscais enviados ao balancete.\n\nAbra a aba Balancete para conferir.`
          : 'Nada novo para enviar — já estavam no balancete (ou configure as contas).',
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao enviar para o balancete.');
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
      </div>

      {innerTab === 'importacao' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            <div className="technical-panel shadow-[4px_4px_0_0_#141414] overflow-hidden">
              <div className="p-3 border-b border-brand-border bg-brand-sidebar/30 flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-[10px] font-black uppercase tracking-widest">
                  Lançamentos fiscais (recorte PDF)
                </h3>
                <div className="flex items-center gap-2">
                  <MandarParaBalanceteButton
                    onClick={handleMandarFiscalBalancete}
                    disabled={fiscalOcrRows.length === 0}
                    count={fiscalOcrRows.length}
                  />
                  {fiscalOcrRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => saveFiscalOcr([])}
                      className="technical-button border-red-800 text-red-800 text-[9px] px-2 py-1"
                    >
                      LIMPAR
                    </button>
                  )}
                </div>
              </div>
              <FolhaRelatorioVirtualTable rows={fiscalOcrRows as FolhaRelatorioRow[]} />
            </div>
          </div>
          <div className="lg:col-span-4 space-y-6">
            <DataIngestionBox
              dataType="fiscal"
              title="Recortar PDF Fiscal"
              selectedCompany={selectedCompany}
              ingestionMode="pdfOnly"
              pdfVariants={FISCAL_PDF_VARIANTS}
              onPdfVariantChange={setFiscalPdfVariant}
              onImport={(newItems) => {
                const prefix = fiscalVariantDescriptionPrefix(fiscalPdfVariant);
                const imported = (newItems as FiscalOcrRelatorioRow[])
                  .filter((i) => 'debito' in i && 'credito' in i)
                  .map((row) => ({
                    ...row,
                    description: row.description?.startsWith('[')
                      ? row.description
                      : `${prefix} ${row.description || ''}`.trim(),
                  }));
                if (imported.length === 0) return;
                saveFiscalOcr([...fiscalOcrRows, ...imported]);
              }}
            />
          </div>
        </div>
      )}

      {innerTab === 'nfe' && <FiscalNotasFiscaisPanel selectedCompany={selectedCompany} />}

      {innerTab === 'acumuladores' && (
        <FiscalAcumuladoresPanel
          key={`${selectedCompany}-${version}`}
          selectedCompany={selectedCompany}
          contasImposto={contasImposto}
        />
      )}
      {innerTab === 'contas' && (
        <FiscalContasImpostoPanel selectedCompany={selectedCompany} onChange={handleContasChange} />
      )}
    </div>
  );
}
