import { createElement, lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  Building2,
  Calendar,
  Globe,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MessagesSquare,
  Settings2,
  Trash2,
  UserRound,
} from 'lucide-react';
import GestaoPagePlaceholder from './GestaoPagePlaceholder';

export type GestaoPageId =
  | 'Dashboard'
  | 'Companies'
  | 'CalendarManagement'
  | 'Exits'
  | 'Chat'
  | 'Notices'
  | 'UsefulSites'
  | 'Trash'
  | 'AppSettings'
  | 'Profile'
  | 'Novidades';

export interface GestaoPageDef {
  id: GestaoPageId;
  route: GestaoPageId;
  label: string;
  icon: LucideIcon;
  shared?: boolean;
  adminOnly?: boolean;
  Component: LazyExoticComponent<ComponentType<unknown>>;
}

/** Páginas do módulo Gestão Empresarial no Eye Vision (mesmo conjunto do Layout.jsx da Gestão). */
function placeholderPage(title: string): LazyExoticComponent<ComponentType<unknown>> {
  return lazy(async () => ({
    default: () => createElement(GestaoPagePlaceholder, { title }),
  }));
}

export const GESTAO_PAGES: GestaoPageDef[] = [
  {
    id: 'Dashboard',
    route: 'Dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    Component: placeholderPage('Dashboard'),
  },
  {
    id: 'Companies',
    route: 'Companies',
    label: 'Empresas',
    icon: Building2,
    shared: true,
    Component: placeholderPage('Empresas'),
  },
  {
    id: 'CalendarManagement',
    route: 'CalendarManagement',
    label: 'Calendário',
    icon: Calendar,
    shared: true,
    Component: placeholderPage('Calendário'),
  },
  {
    id: 'Exits',
    route: 'Exits',
    label: 'Baixa e Saída',
    icon: LogOut,
    Component: placeholderPage('Baixa e Saída'),
  },
  {
    id: 'Chat',
    route: 'Chat',
    label: 'Chat',
    icon: MessagesSquare,
    shared: true,
    Component: placeholderPage('Chat'),
  },
  {
    id: 'Notices',
    route: 'Notices',
    label: 'Recados',
    icon: MessageSquare,
    Component: placeholderPage('Recados'),
  },
  {
    id: 'UsefulSites',
    route: 'UsefulSites',
    label: 'Links Úteis',
    icon: Globe,
    Component: placeholderPage('Links Úteis'),
  },
  {
    id: 'Trash',
    route: 'Trash',
    label: 'Lixeira',
    icon: Trash2,
    Component: placeholderPage('Lixeira'),
  },
  {
    id: 'AppSettings',
    route: 'AppSettings',
    label: 'Configurações',
    icon: Settings2,
    shared: true,
    Component: placeholderPage('Configurações'),
  },
  {
    id: 'Profile',
    route: 'Profile',
    label: 'Perfil',
    icon: UserRound,
    Component: placeholderPage('Perfil'),
  },
  {
    id: 'Novidades',
    route: 'Novidades',
    label: 'Novidades',
    icon: Bell,
    Component: placeholderPage('Novidades'),
  },
];
