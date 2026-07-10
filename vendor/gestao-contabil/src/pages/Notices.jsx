import React, { useState } from "react";
import { dbClient } from "@/api/dbClient";
import { useAuth } from "@/lib/AuthContext";
import { useCloudAccess } from "@/lib/useCloudAccess";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Check, Pencil } from "lucide-react";
import { useTheme } from "../components/ThemeProvider";
import {
  GestaoPageHeader,
  GestaoRestrictedPanel,
  GestaoPanel,
  gestaoNativeBtnPrimary,
  gestaoNativeMuted,
  gestaoNativeCard,
} from "@/components/GestaoEyeVisionChrome";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import CsvImportActions from "@/components/CsvImportActions";
import { getRowValue, normalizeDateInput, parseBoolean } from "@/lib/csvUtils";
import { useWorkspacePeerUids } from "@/hooks/useWorkspacePeerUids";
import { isFirestoreQuotaError, FIRESTORE_QUOTA_USER_MESSAGE, toFirestoreQuotaError } from "@/lib/firestoreQuota";
import { readNoticesCache, writeNoticesCache } from "@/lib/noticesLocalCache";

const urgencyConfig = {
  blue: { bg: "bg-blue-50 border-blue-200", text: "text-blue-800", dot: "bg-blue-500", label: "Informação", darkBg: "bg-blue-950 border-blue-800", darkText: "text-blue-300" },
  yellow: { bg: "bg-yellow-50 border-yellow-200", text: "text-yellow-800", dot: "bg-yellow-500", label: "Atenção", darkBg: "bg-yellow-950 border-yellow-800", darkText: "text-yellow-300" },
  red: { bg: "bg-red-50 border-red-200", text: "text-red-800", dot: "bg-red-500", label: "Urgente", darkBg: "bg-red-950 border-red-800", darkText: "text-red-300" },
};

export default function Notices() {
  const { user } = useAuth();
  const uid = user?.uid;
  const { isAdminEmail, isMasterUser, tabAccess } = useCloudAccess();
  const canEditOfficeContent = Boolean(isAdminEmail || isMasterUser);
  const { officePeerUids, stableOfficeUidsKey } = useWorkspacePeerUids();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingNoticeId, setEditingNoticeId] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [urgency, setUrgency] = useState("blue");

  const [quotaFromCache, setQuotaFromCache] = useState(false);

  const { data: notices = [], isError, error, isFetching } = useQuery({
    queryKey: ["notices", uid, isAdminEmail, stableOfficeUidsKey],
    queryFn: async () => {
      if (!uid) return [];
      const cacheKey = stableOfficeUidsKey || uid;
      const uids = officePeerUids.length ? officePeerUids : [uid];
      try {
        const rows = await dbClient.entities.Notice.listByUids(uids);
        writeNoticesCache(cacheKey, rows);
        setQuotaFromCache(false);
        return rows;
      } catch (err) {
        if (isFirestoreQuotaError(err)) {
          const cached = readNoticesCache(cacheKey);
          if (cached?.rows?.length) {
            setQuotaFromCache(true);
            return cached.rows;
          }
          throw toFirestoreQuotaError();
        }
        throw err;
      }
    },
    enabled: !!uid,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => !isFirestoreQuotaError(err) && failureCount < 1,
  });

  const createMutation = useMutation({
    mutationFn: (data) =>
      dbClient.entities.Notice.create({
        ...data,
        uid,
        created_date: new Date().toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notices"] });
      setShowForm(false);
      resetForm();
    },
    onError: (err) => {
      if (isFirestoreQuotaError(err)) {
        window.alert(FIRESTORE_QUOTA_USER_MESSAGE);
        return;
      }
      window.alert("Erro ao criar recado: " + (err?.message || "erro desconhecido"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const row = notices.find((n) => n.id === id);
      const ownerUid = String(row?.uid || uid || "").trim();
      if (!uid || (!canEditOfficeContent && ownerUid !== String(uid).trim())) throw new Error("Só o autor pode alterar este recado.");
      return dbClient.entities.Notice.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notices"] });
      setShowForm(false);
      resetForm();
    },
    onError: (err) => {
      if (isFirestoreQuotaError(err)) {
        window.alert(FIRESTORE_QUOTA_USER_MESSAGE);
        return;
      }
      window.alert("Erro ao alterar o recado: " + err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (noticeId) => {
      const row = notices.find((n) => n.id === noticeId);
      const ownerUid = String(row?.uid || uid || "").trim();
      if (!uid || (!canEditOfficeContent && ownerUid !== String(uid).trim())) throw new Error("Só o autor pode remover este recado.");
      await dbClient.entities.Notice.delete(noticeId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notices"] }),
    onError: (err) => {
      if (isFirestoreQuotaError(err)) {
        window.alert(FIRESTORE_QUOTA_USER_MESSAGE);
        return;
      }
      window.alert("Erro ao remover o recado: " + err.message);
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (noticeId) => {
      const row = notices.find((n) => n.id === noticeId);
      const ownerUid = String(row?.uid || uid || "").trim();
      if (!uid || (!canEditOfficeContent && ownerUid !== String(uid).trim())) throw new Error("Só o autor pode marcar este recado como lido.");
      return dbClient.entities.Notice.update(noticeId, { is_read: true });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notices"] }),
    onError: (err) => {
      if (isFirestoreQuotaError(err)) {
        window.alert(FIRESTORE_QUOTA_USER_MESSAGE);
        return;
      }
      window.alert("Erro ao marcar o recado como lido: " + err.message);
    },
  });

  if (!tabAccess.Notices) {
    return (
      <GestaoRestrictedPanel message="Você não tem permissão para acessar os recados. Entre em contato com o administrador." />
    );
  }

  const resetForm = () => {
    setEditingNoticeId(null);
    setTitle("");
    setContent("");
    setUrgency("blue");
  };

  const openCreateDialog = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditDialog = (notice) => {
    if (!canEditOfficeContent && String(notice.uid || uid || "") !== String(uid || "")) {
      window.alert("Só o autor pode editar este recado.");
      return;
    }
    setEditingNoticeId(notice.id);
    setTitle(notice.title || "");
    setContent(notice.content || "");
    setUrgency(notice.urgency || "blue");
    setShowForm(true);
  };

  const handleSubmitNotice = () => {
    if (!title || !content) return;
    if (editingNoticeId) {
      updateMutation.mutate({ id: editingNoticeId, data: { title, content, urgency } });
      return;
    }
    createMutation.mutate({ title, content, urgency });
  };

  const handleImportNotices = async (rows) => {
    if (!uid) {
      throw new Error("Você precisa estar logado para importar.");
    }

    let created = 0;
    let skipped = 0;

    for (const row of rows) {
      const titleValue = getRowValue(row, ["titulo", "title"]);
      const contentValue = getRowValue(row, ["conteudo", "conteúdo", "content"]);
      if (!titleValue || !contentValue) {
        skipped += 1;
        continue;
      }

      const urgencyRaw = getRowValue(row, ["urgencia", "urgência", "urgency"], "blue").toLowerCase();
      let urgencyValue = "blue";
      if (urgencyRaw.includes("verm") || urgencyRaw.includes("urg")) urgencyValue = "red";
      if (urgencyRaw.includes("amar") || urgencyRaw.includes("aten")) urgencyValue = "yellow";

      const createdDate =
        normalizeDateInput(getRowValue(row, ["data_criacao", "data", "created_date"])) ||
        new Date().toISOString().split("T")[0];

      await dbClient.entities.Notice.create({
        uid,
        title: titleValue,
        content: contentValue,
        urgency: urgencyValue,
        created_date: createdDate,
        is_read: parseBoolean(getRowValue(row, ["lido", "is_read"]), false),
      });
      created += 1;
    }

    await queryClient.invalidateQueries({ queryKey: ["notices"] });
    return {
      message: `Importação concluída: ${created} recados criados, ${skipped} linhas ignoradas.`,
    };
  };

  const unreadOwn = notices.filter((n) => !n.is_read && (!n.uid || String(n.uid) === String(uid))).length;

  const quotaBlocked = quotaFromCache || error?.message === "FIRESTORE_QUOTA";

  return (
    <div className="space-y-6">
      <GestaoPageHeader
        title="Recados"
        subtitle={`Escritório unificado · ${unreadOwn} seus recados não lidos`}
        actions={
          <>
          <Button onClick={openCreateDialog} className={gestaoNativeBtnPrimary}>
            <Plus className="w-4 h-4 mr-2" /> Novo Recado
          </Button>
          <CsvImportActions
            templateFileName="modelo_recados.csv"
            templateHeaders={["titulo", "conteudo", "urgencia", "data_criacao", "lido"]}
            templateRows={[
              ["Prazo Fiscal", "Enviar documentos até sexta-feira.", "yellow", "2026-03-10", "nao"],
            ]}
            onImportRows={handleImportNotices}
          />
          </>
        }
      />
      {quotaBlocked ? (
        <GestaoPanel className="border-amber-500/80 bg-amber-50/90">
          <p className={gestaoNativeMuted}>
            {FIRESTORE_QUOTA_USER_MESSAGE}
            {quotaFromCache ? " A lista abaixo é a última cópia salva neste navegador." : ""}
          </p>
        </GestaoPanel>
      ) : null}
      {isError && !quotaBlocked ? (
        <p className="text-sm text-red-600 max-w-xl">
          Não foi possível carregar os recados ({String(error?.message || "verifique rede ou permissões Firebase")}). Tente atualizar a página.
        </p>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
        {notices.map((notice) => {
          const cfg = urgencyConfig[notice.urgency] || urgencyConfig.blue;
          const isMine = Boolean(uid) && (canEditOfficeContent || !notice.uid || String(notice.uid) === String(uid));
          return (
            <Card
              key={notice.id}
              className={cn(
                "gestao-notice-card-fixed w-full h-[20rem] min-h-[20rem] max-h-[20rem] flex flex-col border border-brand-border overflow-hidden rounded-none shadow-none",
                gestaoNativeCard,
                theme === "dark" ? cfg.darkBg : cfg.bg,
                notice.is_read ? "opacity-60" : ""
              )}
            >
              <div className="p-3 flex flex-col h-full min-h-0 gap-2">
                <div className="flex items-start justify-between gap-2 shrink-0">
                  <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${cfg.dot}`} />
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${theme === "dark" ? cfg.darkText : cfg.text}`}>
                      {cfg.label}
                    </span>
                    <span className={`text-[10px] ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                      {notice.created_date ? format(new Date(notice.created_date), "dd/MM/yyyy HH:mm") : ""}
                    </span>
                  </div>
                  <div className="flex gap-0.5 shrink-0 -mr-1">
                    {isMine ? (
                      <>
                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-none border-brand-border shadow-none" onClick={() => openEditDialog(notice)}>
                          <Pencil className="w-4 h-4 text-blue-500" />
                        </Button>
                        {!notice.is_read && (
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-none border-brand-border shadow-none"
                            onClick={() => markReadMutation.mutate(notice.id)}
                          >
                            <Check className="w-4 h-4 text-green-500" />
                          </Button>
                        )}
                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-none border-brand-border shadow-none" onClick={() => deleteMutation.mutate(notice.id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
                <h3
                  className={cn(
                    "font-semibold text-sm leading-snug line-clamp-2 break-words shrink-0",
                    theme === "dark" ? cfg.darkText : cfg.text
                  )}
                >
                  {notice.title}
                </h3>
                <div className="gestao-notice-card-body flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable]">
                  <p
                    className={cn(
                      "text-xs leading-relaxed whitespace-pre-wrap break-words hyphens-auto",
                      theme === "dark" ? "text-gray-300" : "text-gray-700"
                    )}
                  >
                    {notice.content}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
        {notices.length === 0 && !isError && (
          <p className="text-center py-10 text-gray-400">{isFetching ? "A carregar…" : "Nenhum recado ainda"}</p>
        )}
      </div>

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editingNoticeId ? "Editar Recado" : "Novo Recado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do recado" />
            </div>
            <div className="space-y-2">
              <Label>Conteúdo</Label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Escreva o recado..." />
            </div>
            <div className="space-y-2">
              <Label>Urgência</Label>
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blue">🔵 Informação</SelectItem>
                  <SelectItem value="yellow">🟡 Atenção</SelectItem>
                  <SelectItem value="red">🔴 Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleSubmitNotice} disabled={!title || !content} className="bg-indigo-600 hover:bg-indigo-700">
              {editingNoticeId ? "Salvar Alterações" : "Criar Recado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}