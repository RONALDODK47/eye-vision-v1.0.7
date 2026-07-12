import { type ComponentType, type LazyExoticComponent } from 'react';
import { lazyWithRetry } from '../lib/lazyWithRetry';
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
export const GESTAO_PAGES: GestaoPageDef[] = [
  {
    id: 'Dashboard',
    route: 'Dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    Component: lazyWithRetry(() => import('@gestao/pages/Dashboard')),
  },
  {
    id: 'Companies',
    route: 'Companies',
    label: 'Empresas',
    icon: Building2,
    shared: true,
    Component: lazyWithRetry(() => import('@gestao/pages/Companies')),
  },
  {
    id: 'CalendarManagement',
    route: 'CalendarManagement',
    label: 'Calendário',
    icon: Calendar,
    shared: true,
    Component: lazyWithRetry(() => import('@gestao/pages/CalendarManagement')),
  },
  {
    id: 'Exits',
    route: 'Exits',
    label: 'Baixa e Saída',
    icon: LogOut,
    Component: lazyWithRetry(() => import('@gestao/pages/Exits')),
  },
  {
    id: 'Chat',
    route: 'Chat',
    label: 'Chat',
    icon: MessagesSquare,
    shared: true,
    Component: lazyWithRetry(() => import('@gestao/pages/Chat')),
  },
  {
    id: 'Notices',
    route: 'Notices',
    label: 'Recados',
    icon: MessageSquare,
    Component: lazyWithRetry(() => import('@gestao/pages/Notices')),
  },
  {
    id: 'UsefulSites',
    route: 'UsefulSites',
    label: 'Links Úteis',
    icon: Globe,
    Component: lazyWithRetry(() => import('@gestao/pages/UsefulSites')),
  },
  {
    id: 'Trash',
    route: 'Trash',
    label: 'Lixeira',
    icon: Trash2,
    Component: lazyWithRetry(() => import('@gestao/pages/Trash')),
  },
  {
    id: 'AppSettings',
    route: 'AppSettings',
    label: 'Configurações',
    icon: Settings2,
    shared: true,
    Component: lazyWithRetry(() => import('@gestao/pages/AppSettings')),
  },
  {
    id: 'Profile',
    route: 'Profile',
    label: 'Perfil',
    icon: UserRound,
    Component: lazyWithRetry(() => import('@gestao/pages/Profile')),
  },
  {
    id: 'Novidades',
    route: 'Novidades',
    label: 'Novidades',
    icon: Bell,
    Component: lazyWithRetry(() => import('@gestao/pages/Novidades')),
  },
];
