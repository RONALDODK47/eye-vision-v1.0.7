import React, { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/lib/AuthContext";
import { useCloudAccess } from "@/lib/useCloudAccess";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dbClient } from "@/api/dbClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  Trash2, 
  RotateCcw, 
  Building2, 
  MessageSquare, 
  Calendar,
} from "lucide-react";
import { useWorkspacePeerUids } from "@/hooks/useWorkspacePeerUids";
import { GestaoPageHeader, GestaoPanel, GestaoSubTabs } from "@/components/GestaoEyeVisionChrome";

export default function Trash() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const uid = user?.uid;
  const queryClient = useQueryClient();
  const { isAdminEmail, isMasterUser, currentCompanyId, internalStaffFullAccess } = useCloudAccess();
  const { officePeerUids: officeUids, stableOfficeUidsKey, officeToken } = useWorkspacePeerUids();
  
  const [activeTab, setActiveTab] = useState("companies");

  const officeWideListing = Boolean(internalStaffFullAccess || isMasterUser);

  // 1. Fetch Companies
  const { data: companies = [], refetch: refetchCompanies } = useQuery({
    queryKey: ["companies", "workspace", uid, officeToken, stableOfficeUidsKey, officeWideListing, isAdminEmail],
    queryFn: async () => {
      if (!uid) return [];
      let allCompanies;
      if (officeWideListing) {
        const all = await dbClient.entities.Company.listAll();
        if (!Array.isArray(all)) return [];
        allCompanies = [...all];
      } else {
        const uidList = officeUids.length > 0 ? officeUids : [uid];
        allCompanies = await mergeIndexedDocs((u) => dbClient.entities.Company.list(u), uidList);
      }

      // Filter based on token and ownership
      return allCompanies.filter((company) => {
        const companyToken = String(company.assigned_company_token || "").trim();
        const userOfficeToken = String(officeToken || "").trim();
        if (companyToken) return userOfficeToken === companyToken;
        return String(company.uid || "").trim() === String(uid).trim();
      });
    },
    enabled: !!uid,
    retry: false,
  });

  const deletedCompanies = companies.filter((c) => c.is_deleted === true);

  // Helper helper to mergeIndexedDocs locally if not imported
  async function mergeIndexedDocs(fn, uids) {
    const arrs = await Promise.all(uids.map(async (u) => {
      try { return await fn(u) || []; } catch { return []; }
    }));
    const unique = new Map();
    arrs.flat().forEach((d) => {
      if (d && d.id) unique.set(d.id, d);
    });
    return Array.from(unique.values());
  }

  // 2. Fetch Notices
  const { data: deletedNotices = [], refetch: refetchNotices } = useQuery({
    queryKey: ["deletedNotices", uid, isAdminEmail],
    queryFn: async () => {
      if (!uid) return [];
      const all = await dbClient.entities.Notice.listDeleted();
      return all.filter((n) => String(n.uid).trim() === String(uid).trim());
    },
    enabled: !!uid,
  });

  // 3. Fetch Calendar Custom Tasks and Hidden Occurrences
  const { data: liveSnap, refetch: refetchCalendar } = useQuery({
    queryKey: ["inovCalendarLiveSnapshot", currentCompanyId],
    queryFn: () => currentCompanyId ? dbClient.entities.InovCalendarSnapshot.getByCompanyId(currentCompanyId) : dbClient.entities.InovCalendarSnapshot.getLive(),
    enabled: !!uid,
    retry: false,
  });

  const customEntries = liveSnap?.custom_entries && typeof liveSnap.custom_entries === "object" ? liveSnap.custom_entries : {};
  const deletedCalendarTasks = Object.entries(customEntries)
    .filter(([, entry]) => entry?.is_deleted === true)
    .map(([id, entry]) => ({ id, ...entry, isCustom: true }));

  const occurrenceOverrides = liveSnap?.occurrence_overrides && typeof liveSnap.occurrence_overrides === "object" ? liveSnap.occurrence_overrides : {};
  const deletedSpreadsheetOccurrences = Object.entries(occurrenceOverrides)
    .filter(([, entry]) => entry?.hidden === true)
    .map(([id, entry]) => ({ 
      id, 
      ...entry, 
      isCustom: false,
      raw: entry.raw || "Tarefa da Planilha (Ocultada)",
      due_date: entry.due_date 
    }));

  const allDeletedCalendarItems = [...deletedCalendarTasks, ...deletedSpreadsheetOccurrences];

  // MUTATIONS - COMPANIES
  const restoreCompanyMut = useMutation({
    mutationFn: (company) => dbClient.entities.Company.update(company.id, { is_deleted: false, deleted_at: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      refetchCompanies();
    },
    onError: (err) => alert("Erro ao restaurar: " + err.message),
  });

  const deleteCompanyPermanentMut = useMutation({
    mutationFn: (company) => dbClient.entities.Company.delete(company.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      refetchCompanies();
    },
    onError: (err) => alert("Erro ao deletar permanente: " + err.message),
  });

  // MUTATIONS - NOTICES
  const restoreNoticeMut = useMutation({
    mutationFn: (noticeId) => dbClient.entities.Notice.restore(noticeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notices"] });
      refetchNotices();
    },
    onError: (err) => alert("Erro ao restaurar recado: " + err.message),
  });

  const deleteNoticePermanentMut = useMutation({
    mutationFn: (noticeId) => dbClient.entities.Notice.deletePermanently(noticeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notices"] });
      refetchNotices();
    },
    onError: (err) => alert("Erro ao deletar recado permanentemente: " + err.message),
  });

  // MUTATIONS - CALENDAR
  const restoreCalendarMut = useMutation({
    mutationFn: async (item) => {
      if (item.isCustom) {
        await dbClient.entities.InovCalendarSnapshot.restoreCustomEntry(uid, item.id, currentCompanyId);
      } else {
        // Occurrence overrides: remove the hidden: true flag
        await dbClient.entities.InovCalendarSnapshot.mergeOccurrenceOverride(uid, item.id, { hidden: false }, {
          companyId: currentCompanyId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inovCalendarLiveSnapshot"] });
      refetchCalendar();
    },
    onError: (err) => alert("Erro ao restaurar tarefa: " + err.message),
  });

  const deleteCalendarPermanentMut = useMutation({
    mutationFn: async (item) => {
      if (item.isCustom) {
        await dbClient.entities.InovCalendarSnapshot.deleteCustomEntryPermanently(uid, item.id, currentCompanyId);
      } else {
        // Occurrence overrides: completely remove the override object for this spreadsheet row
        await dbClient.entities.InovCalendarSnapshot.mergeOccurrenceOverride(uid, item.id, {}, {
          companyId: currentCompanyId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inovCalendarLiveSnapshot"] });
      refetchCalendar();
    },
    onError: (err) => alert("Erro ao deletar tarefa permanentemente: " + err.message),
  });

  const formatBrDate = (isoStr) => {
    if (!isoStr) return "—";
    try {
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return isoStr;
    }
  };

  const formatYmdDate = (ymdStr) => {
    if (!ymdStr) return "—";
    const parts = ymdStr.split("-");
    if (parts.length !== 3) return ymdStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const trashTabs = [
    { id: "companies", label: `Empresas (${deletedCompanies.length})` },
    { id: "notices", label: `Recados (${deletedNotices.length})` },
    { id: "calendar", label: `Calendário (${allDeletedCalendarItems.length})` },
  ];

  return (
    <div className="space-y-6">
      <GestaoPageHeader
        title="Lixeira"
        subtitle="Restaure ou exclua permanentemente itens removidos nas outras abas"
      />

      <GestaoSubTabs
        tabs={trashTabs}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Tipos de item na lixeira"
      />

      <GestaoPanel className="p-4 md:p-6">
        
        {/* TAB 1: COMPANIES */}
        {activeTab === "companies" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-500" />
              Empresas na Lixeira
            </h2>
            
            {deletedCompanies.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Nenhuma empresa na lixeira.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nome da Empresa</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Excluído em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedCompanies.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.code || "—"}</TableCell>
                        <TableCell className="font-semibold">{c.name || "—"}</TableCell>
                        <TableCell className="text-slate-500 text-xs">{c.cnpj || "—"}</TableCell>
                        <TableCell className="text-slate-500 text-xs">{formatBrDate(c.deleted_at)}</TableCell>
                        <TableCell className="text-right space-x-2 whitespace-nowrap">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 dark:text-emerald-400 gap-1.5"
                            onClick={() => {
                              if (window.confirm(`Deseja restaurar a empresa "${c.name}"?`)) {
                                restoreCompanyMut.mutate(c);
                              }
                            }}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restaurar
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            className="bg-red-600 hover:bg-red-700 gap-1.5"
                            onClick={() => {
                              if (window.confirm(`ATENÇÃO! Deseja excluir permanentemente a empresa "${c.name}"? Esta ação é irreversível!`)) {
                                deleteCompanyPermanentMut.mutate(c);
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Excluir
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: NOTICES */}
        {activeTab === "notices" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-500" />
              Recados na Lixeira
            </h2>

            {deletedNotices.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Nenhum recado na lixeira.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Conteúdo</TableHead>
                      <TableHead>Urgência</TableHead>
                      <TableHead>Excluído em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedNotices.map((n) => (
                      <TableRow key={n.id}>
                        <TableCell className="font-semibold max-w-[150px] truncate">{n.title || "—"}</TableCell>
                        <TableCell className="max-w-[280px] truncate text-slate-500 text-xs">{n.content || "—"}</TableCell>
                        <TableCell>
                          <Badge 
                            variant="secondary"
                            className={cn(
                              "font-normal text-xs uppercase",
                              n.urgency === "red" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" :
                              n.urgency === "yellow" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" :
                              "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                            )}
                          >
                            {n.urgency === "red" ? "Urgente" : n.urgency === "yellow" ? "Atenção" : "Informação"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs">{formatBrDate(n.deleted_at)}</TableCell>
                        <TableCell className="text-right space-x-2 whitespace-nowrap">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 dark:text-emerald-400 gap-1.5"
                            onClick={() => {
                              if (window.confirm(`Restaurar o recado "${n.title || ""}"?`)) {
                                restoreNoticeMut.mutate(n.id);
                              }
                            }}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restaurar
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            className="bg-red-600 hover:bg-red-700 gap-1.5"
                            onClick={() => {
                              if (window.confirm(`Excluir permanentemente o recado "${n.title || ""}"? Esta ação é irreversível!`)) {
                                deleteNoticePermanentMut.mutate(n.id);
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Excluir
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CALENDAR */}
        {activeTab === "calendar" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-500" />
              Tarefas do Calendário na Lixeira
            </h2>

            {allDeletedCalendarItems.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Nenhuma tarefa do calendário na lixeira.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Origem</TableHead>
                      <TableHead>Data base</TableHead>
                      <TableHead>Grupo / Setor</TableHead>
                      <TableHead>Descrição da Tarefa</TableHead>
                      <TableHead>Excluído em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allDeletedCalendarItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Badge 
                            variant="outline"
                            className={cn(
                              "font-normal text-xs",
                              item.isCustom 
                                ? "border-purple-500 text-purple-600 bg-purple-50/10 dark:text-purple-400" 
                                : "border-slate-500 text-slate-600 bg-slate-50/10 dark:text-slate-400"
                            )}
                          >
                            {item.isCustom ? "Manual (Custom)" : "Planilha (Oculto)"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold">
                          {formatYmdDate(item.due_date)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.group_number ? `Grupo ${item.group_number}` : "—"}
                          {item.reference_month ? ` (${item.reference_month})` : ""}
                        </TableCell>
                        <TableCell className="max-w-[320px] truncate text-slate-600 text-xs font-medium">
                          {item.raw?.split("]").pop()?.trim() || item.raw}
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs">
                          {item.deleted_at ? formatBrDate(item.deleted_at) : "—"}
                        </TableCell>
                        <TableCell className="text-right space-x-2 whitespace-nowrap">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 dark:text-emerald-400 gap-1.5"
                            onClick={() => {
                              if (window.confirm("Deseja restaurar esta tarefa para o calendário?")) {
                                restoreCalendarMut.mutate(item);
                              }
                            }}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restaurar
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            className="bg-red-600 hover:bg-red-700 gap-1.5"
                            onClick={() => {
                              if (window.confirm("Excluir permanentemente esta tarefa do calendário? Esta ação é irreversível!")) {
                                deleteCalendarPermanentMut.mutate(item);
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Excluir
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </GestaoPanel>
    </div>
  );
}
