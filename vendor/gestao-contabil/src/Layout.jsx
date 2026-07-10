import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ThemeProvider, { useTheme } from "./components/ThemeProvider";
import { useQuery } from "@tanstack/react-query";
import { dbClient } from "@/api/dbClient";
import { useAuth } from "@/lib/AuthContext";
import {
  Bell,
  Building2,
  Calendar,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  MessagesSquare,
  Moon,
  ShieldCheck,
  Sun,
  Settings2,
  Trash2,
  UserRound,
  Users2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildInovDeadlines, filterInovDeadlinesForBell } from "@/lib/calendarInovData";
import { getInovUserArea } from "@/lib/calendarInovStorage";
import { INOV_AREA_LABELS } from "@/lib/calendarInovArea";
import { useWorkspaceCalendarSync } from "@/lib/workspaceCalendarSettings";
import { useCloudAccess } from "@/lib/useCloudAccess";
 
const navItems = [
  { name: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
  { name: "Empresas", page: "Companies", icon: Building2, shared: true },
  { name: "Calendário", page: "CalendarManagement", icon: Calendar, shared: true },
  { name: "Baixa e Saída", page: "Exits", icon: LogOut },
  { name: "Chat", page: "Chat", icon: MessagesSquare, shared: true },
  { name: "Recados", page: "Notices", icon: MessageSquare },
  { name: "Links Úteis", page: "UsefulSites", icon: Globe },
  { name: "Lixeira", page: "Trash", icon: Trash2 },
  { name: "Configurações", page: "AppSettings", icon: Settings2, shared: true },
  { name: "Perfil", page: "Profile", icon: UserRound },
  { name: "Administrador", page: "administrator", icon: ShieldCheck },
];

function LayoutInner({ children, currentPageName }) {
  const {
    theme,
    toggleTheme,
    bgImage,
    logoUrl,
    logoBgColor,
    primaryColor,
    sidebarColor,
  } = useTheme();
  const { user, logout } = useAuth();
  const { isAdminEmail, tabAccess, companyTokenOk, hasOfficeCalendarAccess, currentCompanyId } = useCloudAccess();
  const layoutUid = user?.uid;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inovUserArea, setInovUserArea] = useState(() => getInovUserArea());
  const { data: inovCompletions = [] } = useQuery({
    queryKey: ["calendarInovCompletions", layoutUid, hasOfficeCalendarAccess],
    queryFn: () => {
      if (currentCompanyId) {
        return dbClient.entities.CalendarInovCompletion.listByCompanyId(currentCompanyId);
      }
      return layoutUid ? dbClient.entities.CalendarInovCompletion.listByUid(layoutUid) : [];
    },
    enabled: !!layoutUid && Boolean(hasOfficeCalendarAccess),
    refetchInterval: 45_000,
    retry: false,
  });
  const inovCompletedIds = useMemo(() => {
    if (!hasOfficeCalendarAccess) return new Set();
    const s = new Set();
    inovCompletions.forEach((c) => {
      if (c.deadline_id) s.add(c.deadline_id);
    });
    return s;
  }, [inovCompletions, hasOfficeCalendarAccess]);

  const { data: directChatThreads = [] } = useQuery({
    queryKey: ["directChatThreads", layoutUid],
    queryFn: () => (layoutUid ? dbClient.entities.DirectChatThread.listForUser(layoutUid) : []),
    enabled: !!layoutUid && Boolean(companyTokenOk),
    refetchInterval: 12_000,
    retry: false,
  });
  const directChatUnread = useMemo(() => {
    if (!layoutUid || !companyTokenOk) return 0;
    return directChatThreads.reduce((s, t) => s + Number(t.unread?.[layoutUid] || 0), 0);
  }, [directChatThreads, layoutUid, companyTokenOk]);

  useEffect(() => {
    const sync = () => setInovUserArea(getInovUserArea());
    window.addEventListener("storage", sync);
    window.addEventListener("inov-calendar-area", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("inov-calendar-area", sync);
    };
  }, []);

  const workspaceCalendarSync = useWorkspaceCalendarSync();
  const { data: inovLiveSnap } = useQuery({
    queryKey: ["inovCalendarLiveSnapshot", currentCompanyId],
    queryFn: () => currentCompanyId ? dbClient.entities.InovCalendarSnapshot.getByCompanyId(currentCompanyId) : dbClient.entities.InovCalendarSnapshot.getLive(),
    staleTime: 0,
    retry: false,
    enabled: Boolean(hasOfficeCalendarAccess),
  });
  const occurrenceOverrides =
    inovLiveSnap?.occurrence_overrides && typeof inovLiveSnap.occurrence_overrides === "object"
      ? inovLiveSnap.occurrence_overrides
      : {};
  const templateOverrides =
    inovLiveSnap?.template_overrides && typeof inovLiveSnap.template_overrides === "object"
      ? inovLiveSnap.template_overrides
      : {};
  const customEntries =
    inovLiveSnap?.custom_entries && typeof inovLiveSnap.custom_entries === "object"
      ? inovLiveSnap.custom_entries
      : {};
  const referenceTableOverrides =
    inovLiveSnap?.reference_table_overrides && typeof inovLiveSnap.reference_table_overrides === "object"
      ? inovLiveSnap.reference_table_overrides
      : {};
  const overrideGeneration = inovLiveSnap?.updated_at || "";
  const inovDeadlines = useMemo(
    () => {
      if (!hasOfficeCalendarAccess) return [];
      return buildInovDeadlines({
        occurrenceOverrides,
        templateOverrides,
        customEntries,
        referenceTableOverrides,
        overrideGeneration,
      });
    },
    [workspaceCalendarSync, occurrenceOverrides, templateOverrides, customEntries, referenceTableOverrides, overrideGeneration, hasOfficeCalendarAccess]
  );
  const inovBellItems = useMemo(
    () => {
      if (!hasOfficeCalendarAccess) return [];
      return filterInovDeadlinesForBell(inovDeadlines, inovUserArea, inovCompletedIds);
    },
    [inovDeadlines, inovUserArea, inovCompletedIds, hasOfficeCalendarAccess]
  );

  const bellBadgeCount = (hasOfficeCalendarAccess ? inovBellItems.length : 0) + (companyTokenOk ? directChatUnread : 0);
  const bellAreaLabel = inovUserArea
    ? INOV_AREA_LABELS[inovUserArea] || inovUserArea
    : "Setor não definido";
  const activeNavStyle = {
    backgroundColor: primaryColor,
    color: "var(--brand-primary-text)",
    boxShadow: `0 14px 30px -14px ${primaryColor}cc`,
  };
  const visibleNavItems = useMemo(() => {
    return navItems.filter((item) => {
      if (item.page === "AppSettings" && !user) return false;
      if (item.page === "administrator" && !isAdminEmail) return false;
      if (item.page in tabAccess && !tabAccess[item.page]) return false;
      return true;
    });
  }, [user, isAdminEmail, tabAccess]);

  return (
    <div
      className={`min-h-screen flex ${theme === "dark" ? "bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-900"}`}
      style={
        bgImage
          ? {
              backgroundImage: `url(${bgImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundAttachment: "fixed",
            }
          : {}
      }
    >
      {bgImage && (
        <div
          className={`fixed inset-0 z-0 ${theme === "dark" ? "bg-gray-900/40" : "bg-white/30"} backdrop-blur-[2px]`}
          aria-hidden
        />
      )}

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
        <span className="font-bold text-lg tracking-tight flex items-center gap-2">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo"
              className="h-9 w-9 rounded-md object-contain"
              style={{ backgroundColor: logoBgColor || "transparent" }}
            />
          ) : null}
          Gestão Empresarial
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen z-40 w-64 flex-shrink-0 transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${theme === "dark" ? "border-gray-700" : "border-gray-200"} border-r backdrop-blur-md`}
        style={{ backgroundColor: sidebarColor || (theme === "dark" ? "#111827" : "#ffffff") }}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            {logoUrl ? (
              <div className="mb-3">
                <img
                  src={logoUrl}
                  alt="Logo da empresa"
                  className="h-20 w-20 rounded-xl object-contain shadow-sm"
                  style={{ backgroundColor: logoBgColor || "transparent" }}
                />
              </div>
            ) : null}
            <h1 className="text-xl font-bold tracking-tight" style={{ color: primaryColor }}>
              Gestão Empresarial
            </h1>
            <p className={`text-xs mt-1 ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}>Controle completo</p>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {visibleNavItems.map((item) => {
              const isActive = currentPageName === item.page;
              const Icon = item.icon;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "text-white shadow-lg"
                      : "sidebar-nav-item hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  style={isActive ? activeNavStyle : undefined}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate">{item.name}</span>
                  {item.shared ? (
                    <span
                      title="Área partilhada — visível para todos os utilizadores com acesso"
                      className={`shrink-0 flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium ${
                        isActive
                          ? ""
                          : theme === "dark"
                          ? "bg-gray-700 text-gray-400"
                          : "bg-gray-100 text-gray-500"
                      }`}
                      style={isActive ? { color: "var(--brand-primary-text)", border: "1px solid var(--brand-primary-text)" } : undefined}
                    >
                      <Users2 className="w-2.5 h-2.5" />
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <Link
              to={createPageUrl("Novidades")}
              onClick={() => setSidebarOpen(false)}
              className={`mb-2 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                currentPageName === "Novidades"
                  ? "text-white shadow-lg"
                  : "sidebar-nav-item hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
              style={currentPageName === "Novidades" ? activeNavStyle : undefined}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Bell className="w-4 h-4 shrink-0" />
                <span className="truncate flex flex-col leading-tight">
                  <span className="truncate">Novidades</span>
                  <span className="text-[10px] opacity-80 truncate">Setor: {bellAreaLabel}</span>
                </span>
              </span>
              {bellBadgeCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-red-500 text-white shrink-0">
                  {bellBadgeCount}
                </span>
              )}
            </Link>

            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={toggleTheme}
              style={{ color: "var(--brand-sidebar-text)" }}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === "dark" ? "Modo Claro" : "Modo Escuro"}
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 mt-1"
              onClick={logout}
              style={{ color: "#ef4444" }}
            >
              <LogOut className="w-4 h-4" />
              Deslogar
            </Button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <main className="flex-1 relative z-10 lg:pl-0 pt-14 lg:pt-0 min-h-screen overflow-x-auto">
        <div className="p-4 md:p-8 max-w-7xl mx-auto min-w-0">{children}</div>
      </main>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <ThemeProvider>
      <LayoutInner currentPageName={currentPageName}>{children}</LayoutInner>
    </ThemeProvider>
  );
}