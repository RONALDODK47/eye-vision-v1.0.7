import type { ActiveTab } from '../types';

export interface TabLauncherEntry {
  id: ActiveTab;
  name: string;
  symbol: string;
  /** Pasta lógica — cada aba como mini software */
  folder: string;
  description: string;
  /** Módulos operacionais aparecem primeiro */
  primary: boolean;
}

/** Catálogo de mini softwares — só o escolhido é montado na RAM. */
export const TAB_LAUNCHER_CATALOG: TabLauncherEntry[] = [
  {
    id: 'manager',
    name: 'Contabil',
    symbol: 'C',
    folder: 'modules/manager',
    description: 'Contábil, empréstimos, parcelamento e aplicações',
    primary: true,
  },
  {
    id: 'pricing',
    name: 'Precificação',
    symbol: 'P',
    folder: 'modules/pricing',
    description: 'NF-e SEFAZ, créditos a recuperar e itens de estoque',
    primary: true,
  },
  {
    id: 'gestao',
    name: 'Gestão Empresarial',
    symbol: 'G',
    folder: 'modules/gestao-contabil',
    description: 'Empresas, calendário, chat e configurações do escritório',
    primary: true,
  },
  {
    id: 'admin',
    name: 'Administrador',
    symbol: 'A',
    folder: 'modules/administrator',
    description: 'Clientes cloud, tokens, permissões e gestão do escritório',
    primary: true,
  },
  {
    id: 'debug',
    name: 'Debug',
    symbol: 'B',
    folder: 'modules/debug',
    description: 'Console e diagnóstico',
    primary: false,
  },
];

export function launcherEntry(tab: ActiveTab): TabLauncherEntry | undefined {
  return TAB_LAUNCHER_CATALOG.find((e) => e.id === tab);
}
