import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/lib/AuthContext";
import { useCloudAccess } from "@/lib/useCloudAccess";
import { dbClient } from "@/api/dbClient";
import { buildInovDeadlines } from "@/lib/calendarInovData";
import { INOV_AREA_IDS, INOV_AREA_LABELS } from "@/lib/calendarInovArea";
import { getInovUserArea } from "@/lib/calendarInovStorage";
import { splitInovWorkTextByArea } from "@/lib/calendarInovColumnLayout";
import { useWorkspaceCalendarSync } from "@/lib/workspaceCalendarSettings";
import {
  GestaoPageHeader,
  GestaoPanel,
  GestaoRestrictedPanel,
} from "@/components/GestaoEyeVisionChrome";

function fmtBr(ymd) {
  const s = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function daysUntil(ymd) {
  const d = new Date(`${String(ymd || "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

function shortRaw(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "—";
  return normalized.length > 140 ? `${normalized.slice(0, 140)}…` : normalized;
}

function extractAreaText(raw, area) {
  const parts = splitInovWorkTextByArea(raw);
  const text = String(parts?.[area] || "").trim();
  if (text) return text;
  const fallback = String(parts?.outros || "").trim();
  if (fallback) return fallback;
  const full = String(raw || "").trim();
  const li = full.lastIndexOf("]");
  const base = (li >= 0 ? full.slice(li + 1) : full).trim();
  return base;
}

export default function Novidades() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { tabAccess, companyTokenOk, isAdminEmail, currentCompanyId } = useCloudAccess();
  const uid = user?.uid;
  const workspaceCalendarSync = useWorkspaceCalendarSync();
  const [configuredArea, setConfiguredArea] = useState(() => getInovUserArea());

  useEffect(() => {
    const syncArea = () => setConfiguredArea(getInovUserArea());
    window.addEventListener("storage", syncArea);
    window.addEventListener("inov-calendar-area", syncArea);
    return () => {
      window.removeEventListener("storage", syncArea);
      window.removeEventListener("inov-calendar-area", syncArea);
    };
  }, []);

  const { data: directChatThreads = [] } = useQuery({
    queryKey: ["directChatThreads", uid],
    queryFn: () => (uid ? dbClient.entities.DirectChatThread.listForUser(uid) : []),
    enabled: !!uid && Boolean(companyTokenOk),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const directUnread = useMemo(() => {
    if (!uid || !companyTokenOk) return [];
    return directChatThreads
      .filter((t) => Number(t.unread?.[uid] || 0) > 0)
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }, [directChatThreads, uid, companyTokenOk]);

  const { data: completions = [] } = useQuery({
    queryKey: ["calendarInovCompletions", uid, currentCompanyId],
    queryFn: () => {
      if (currentCompanyId) {
        return dbClient.entities.CalendarInovCompletion.listByCompanyId(currentCompanyId);
      }
      return uid ? dbClient.entities.CalendarInovCompletion.listByUid(uid) : [];
    },
    enabled: !!uid && Boolean(isAdminEmail || currentCompanyId),
    retry: false,
  });
  const doneSet = useMemo(() => {
    if (!isAdminEmail && !currentCompanyId) return new Set();
    const s = new Set();
    completions.forEach((c) => c?.deadline_id && s.add(c.deadline_id));
    return s;
  }, [completions, isAdminEmail, currentCompanyId]);

  const { data: liveSnap } = useQuery({
    queryKey: ["inovCalendarLiveSnapshot", currentCompanyId],
    queryFn: () => currentCompanyId ? dbClient.entities.InovCalendarSnapshot.getByCompanyId(currentCompanyId) : dbClient.entities.InovCalendarSnapshot.getLive(),
    retry: false,
    staleTime: 0,
    enabled: Boolean(isAdminEmail || currentCompanyId),
  });
  const occurrenceOverrides =
    liveSnap?.occurrence_overrides && typeof liveSnap.occurrence_overrides === "object"
      ? liveSnap.occurrence_overrides
      : {};
  const templateOverrides =
    liveSnap?.template_overrides && typeof liveSnap.template_overrides === "object"
      ? liveSnap.template_overrides
      : {};
  const customEntries =
    liveSnap?.custom_entries && typeof liveSnap.custom_entries === "object"
      ? liveSnap.custom_entries
      : {};
  const referenceTableOverrides =
    liveSnap?.reference_table_overrides && typeof liveSnap.reference_table_overrides === "object"
      ? liveSnap.reference_table_overrides
      : {};
  const allDeadlines = useMemo(
    () => {
      if (!isAdminEmail && !currentCompanyId) return [];
      return buildInovDeadlines({
        occurrenceOverrides,
        templateOverrides,
        customEntries,
        referenceTableOverrides,
        overrideGeneration: liveSnap?.updated_at || "",
      });
    },
    [workspaceCalendarSync, occurrenceOverrides, templateOverrides, customEntries, referenceTableOverrides, liveSnap?.updated_at, isAdminEmail, currentCompanyId]
  );

  const upcomingRows = useMemo(() => {
    if (!isAdminEmail && !currentCompanyId) return [];
    
    const areaFilter =
      configuredArea === "todas" || INOV_AREA_IDS.includes(configuredArea) ? configuredArea : "";
    if (!areaFilter) return [];

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 2);
    const end = new Date(today);
    end.setDate(end.getDate() + 21);
    const startYmd = start.toISOString().slice(0, 10);
    const endYmd = end.toISOString().slice(0, 10);

    const rows = [];
    allDeadlines.forEach((row) => {
      if (doneSet.has(row.id)) return;
      const ed = String(row.effectiveDueDate || "");
      if (ed < startYmd || ed > endYmd) return;
      if (areaFilter === "todas") {
        const parts = splitInovWorkTextByArea(row.raw);
        const allAreas = ["contabil", "fiscal", "folha", "paralegal", "ti", "outros"];
        allAreas.forEach((aid) => {
          const txt = String(parts?.[aid] || "").trim();
          if (!txt) return;
          rows.push({
            ...row,
            lineId: `${row.id}:${aid}`,
            areaId: aid,
            areaText: txt,
          });
        });
        return;
      }
      if (!Array.isArray(row.areas) || !row.areas.includes(areaFilter)) return;
      const areaText = extractAreaText(row.raw, areaFilter);
      if (!String(areaText).trim()) return;
      rows.push({
        ...row,
        lineId: `${row.id}:${areaFilter}`,
        areaId: areaFilter,
        areaText,
      });
    });
    rows.sort(
      (a, b) =>
        a.effectiveDueDate.localeCompare(b.effectiveDueDate) ||
        String(a.areaId || "").localeCompare(String(b.areaId || "")) ||
        String(a.areaText || "").localeCompare(String(b.areaText || ""))
    );
    return rows;
  }, [allDeadlines, doneSet, configuredArea, workspaceCalendarSync, tabAccess.CalendarManagement]);

  const totalUpcoming = upcomingRows.length;

  if (!tabAccess.CalendarManagement) {
    return (
      <GestaoRestrictedPanel message="Você não tem permissão para acessar as novidades. Entre em contato com o administrador." />
    );
  }

  return (
    <div className="space-y-6">
      <GestaoPageHeader
        title="Novidades"
        subtitle="Alertas do seu setor no calendário e respostas do chat"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GestaoPanel className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Chat interno</p>
          <p className="text-2xl font-bold">{directUnread.length}</p>
          <p className="text-xs text-muted-foreground">conversa(s) com mensagem nova</p>
        </GestaoPanel>
        <GestaoPanel className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Prazos próximos</p>
          <p className="text-2xl font-bold">{totalUpcoming}</p>
          <p className="text-xs text-muted-foreground">itens na janela de antecedência</p>
        </GestaoPanel>
      </div>

      <GestaoPanel className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">Respostas no chat</h2>
          <Link to={createPageUrl("Chat")}>
            <Button type="button" variant="outline" size="sm">
              Abrir Chat
            </Button>
          </Link>
        </div>
        {directUnread.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem respostas novas no chat.</p>
        ) : (
          <ul className="space-y-2">
            {directUnread.slice(0, 20).map((t) => {
              const n = Number(t.unread?.[uid] || 0);
              return (
                <li
                  key={t.id}
                  className={theme === "dark" ? "rounded-md border border-gray-700 p-2 bg-gray-800/60" : "rounded-md border p-2"}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">Nova resposta</span>
                    <Badge className="bg-red-600 hover:bg-red-600 text-white">{n}</Badge>
                  </div>
                  <p className={theme === "dark" ? "text-xs text-gray-300 mt-1" : "text-xs text-gray-600 mt-1"}>
                    {String(t.last_message_text || "").trim() || "(sem pré-visualização)"}
                  </p>
                  <Link
                    to={`${createPageUrl("Chat")}?thread=${encodeURIComponent(t.id)}`}
                    className={theme === "dark" ? "text-xs mt-1 inline-block text-indigo-400" : "text-xs mt-1 inline-block text-indigo-600"}
                  >
                    Abrir conversa
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </GestaoPanel>

      <GestaoPanel className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">Prazos do setor configurado (com antecedência)</h2>
          <Link to={createPageUrl("CalendarManagement")}>
            <Button type="button" variant="outline" size="sm">
              Abrir Calendário
            </Button>
          </Link>
        </div>
        <div className="space-y-4">
          {!(configuredArea === "todas" || INOV_AREA_IDS.includes(configuredArea)) ? (
            <p className="text-sm text-muted-foreground">
              Configure seu setor na aba de calendário para ver os prazos na aba Novidades.
            </p>
          ) : (
            <div>
              <h3 className="text-sm font-semibold mb-2">
                {INOV_AREA_LABELS[configuredArea] || configuredArea}{" "}
                <span className="text-muted-foreground font-normal">({upcomingRows.length})</span>
              </h3>
              {upcomingRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum prazo próximo no período.</p>
              ) : (
                <ul className="space-y-2">
                  {upcomingRows.slice(0, 10).map((row) => {
                    const d = daysUntil(row.effectiveDueDate);
                    return (
                      <li
                        key={row.lineId || `${configuredArea}-${row.id}`}
                        className={theme === "dark" ? "rounded-md border border-gray-700 p-2 bg-gray-800/60" : "rounded-md border p-2"}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium tabular-nums">{fmtBr(row.effectiveDueDate)}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {INOV_AREA_LABELS[row.areaId] || row.areaId}
                            </Badge>
                          </div>
                          <Badge variant="secondary">
                            {d == null ? "—" : d < 0 ? `${Math.abs(d)} dia(s) atrasado` : d === 0 ? "vence hoje" : `${d} dia(s)`}
                          </Badge>
                        </div>
                        <p className={theme === "dark" ? "text-xs text-gray-300 mt-1" : "text-xs text-gray-600 mt-1"}>
                          {shortRaw(row.areaText)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </GestaoPanel>
    </div>
  );
}

