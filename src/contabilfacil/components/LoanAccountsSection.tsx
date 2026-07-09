import { Folder } from 'lucide-react';
import type { LoanAccountFields } from '../types';
import { CF_FIELD_COL, CF_FIELD_ROW, CF_INPUT_ACCOUNT } from '../lib/formFieldClasses';

export interface LoanAccountsSectionProps {
  values: LoanAccountFields;
  onChange: (patch: Partial<LoanAccountFields>) => void;
}

interface AccountPairConfig {
  title: string;
  description?: string;
  debitKey: keyof LoanAccountFields;
  creditKey: keyof LoanAccountFields;
  debitPlaceholder: string;
  creditPlaceholder: string;
}

const ACCOUNT_PAIRS: AccountPairConfig[] = [
  {
    title: 'Provisão Juros a Apropriar (1º dia do mês)',
    debitKey: 'accJurosAproDebit',
    creditKey: 'accJurosAproCredit',
    debitPlaceholder: 'ex.: 1.1.01.001',
    creditPlaceholder: 'ex.: 2.1.01.001',
  },
  {
    title: 'Apropriação de Juros (último dia)',
    debitKey: 'accApropriacaoDebit',
    creditKey: 'accApropriacaoCredit',
    debitPlaceholder: 'ex.: 3.1.01.001',
    creditPlaceholder: 'ex.: 1.1.01.001',
  },
  {
    title: 'Transferência LP p/ CP (contrato + mensal)',
    description:
      'Na data do contrato (modo fiscal): transferência LP→CP com Curto − IOF e lançamento de saldo em longo prazo. Nas parcelas, reclassificação mensal (1º dia do mês seguinte).',
    debitKey: 'accTransferenciaDebit',
    creditKey: 'accTransferenciaCredit',
    debitPlaceholder: 'ex.: 2.2.01.001',
    creditPlaceholder: 'ex.: 2.1.01.001',
  },
  {
    title: 'Valor do Empréstimo',
    debitKey: 'accEmprestimoDebit',
    creditKey: 'accEmprestimoCredit',
    debitPlaceholder: 'ex.: 1.1.01.001',
    creditPlaceholder: 'ex.: 2.2.01.001',
  },
  {
    title: 'IOF do empréstimo (data do contrato)',
    debitKey: 'accIofDebit',
    creditKey: 'accIofCredit',
    debitPlaceholder: 'ex.: 3.1.02.001',
    creditPlaceholder: 'ex.: 2.1.01.010',
  },
];

function AccountPairRow({
  config,
  values,
  onChange,
}: {
  config: AccountPairConfig;
  values: LoanAccountFields;
  onChange: (patch: Partial<LoanAccountFields>) => void;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-black uppercase tracking-widest">{config.title}</h4>
      {config.description ? (
        <p className="text-[10px] opacity-50 leading-snug">{config.description}</p>
      ) : null}
      <div className={CF_FIELD_ROW}>
        <div className={CF_FIELD_COL}>
          <label className="text-[9px] font-black uppercase opacity-60 mb-1 block">Débito</label>
          <input
            aria-label={`Conta débito - ${config.title}`}
            title={`Conta débito - ${config.title}`}
            placeholder={config.debitPlaceholder}
            type="text"
            className={CF_INPUT_ACCOUNT}
            value={values[config.debitKey]}
            onChange={(e) => onChange({ [config.debitKey]: e.target.value })}
          />
        </div>
        <div className={CF_FIELD_COL}>
          <label className="text-[9px] font-black uppercase opacity-60 mb-1 block">Crédito</label>
          <input
            aria-label={`Conta crédito - ${config.title}`}
            title={`Conta crédito - ${config.title}`}
            placeholder={config.creditPlaceholder}
            type="text"
            className={CF_INPUT_ACCOUNT}
            value={values[config.creditKey]}
            onChange={(e) => onChange({ [config.creditKey]: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

export function LoanAccountsSection({ values, onChange }: LoanAccountsSectionProps) {
  return (
    <section className="technical-panel p-6 shadow-[4px_4px_0_0_#141414] space-y-6">
      <div className="flex items-center gap-2 border-b border-brand-border pb-3">
        <Folder className="w-4 h-4 shrink-0" />
        <h3 className="text-[10px] font-black uppercase tracking-widest">Contas Contábeis (Domínio)</h3>
      </div>

      <p className="text-[10px] opacity-50 leading-snug">
        Informe débito e crédito por tipo de lançamento (incluindo IOF na data do contrato). No dia do contrato,
        o TXT gera classificação CPC: transferência LP→CP (curto − IOF) e saldo longo prazo. Depois, reclasses
        mensais. Saldo devedor = principal + IOF.
      </p>

      <div className="space-y-5">
        {ACCOUNT_PAIRS.map((config) => (
          <AccountPairRow key={config.title} config={config} values={values} onChange={onChange} />
        ))}
      </div>
    </section>
  );
}
