import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { auth } from "@/lib/firebase";
import { dbClient } from "@/api/dbClient";
import { createPageUrl } from "@/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck, Settings } from "lucide-react";
import { useTheme } from "../components/ThemeProvider";

export default function Conversations() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const uid = auth.currentUser?.uid;

  const [selectedThreadId, setSelectedThreadId] = useState("");

  const { data: threads = [] } = useQuery({
    queryKey: ["conversationThreads", uid],
    queryFn: () => (uid ? dbClient.entities.ConversationThread.list(uid) : []),
    enabled: !!uid,
    retry: false,
  });

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  const { data: messages = [] } = useQuery({
    queryKey: ["conversationMessages", uid, selectedThreadId],
    queryFn: () =>
      uid && selectedThreadId
        ? dbClient.entities.ConversationMessage.filter({ uid, thread_id: selectedThreadId })
        : [],
    enabled: !!uid && !!selectedThreadId,
    retry: false,
  });

  const upsertThreadMutation = useMutation({
    mutationFn: async ({ id, data }) => dbClient.entities.ConversationThread.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversationThreads", uid] });
      queryClient.invalidateQueries({ queryKey: ["conversationThreadsUnread", uid] });
    },
  });

  const markAsRead = () => {
    if (!selectedThread?.id) return;
    upsertThreadMutation.mutate({
      id: selectedThread.id,
      data: { unread_count: 0 },
    });
  };

  const unreadTotal = threads.reduce((sum, t) => sum + Number(t.unread_count || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Novidades</h1>
          <p className={`text-sm ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}>
            Histórico de mensagens e status das conversas. Modelos, datas de documentos e envio manual em lote ficam em
            Configurações.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            {unreadTotal} nova(s)
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link to={createPageUrl("AppSettings")} className="inline-flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Configurar mensagens e lembretes
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className={`p-3 ${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
          <h3 className="font-semibold mb-3">Conversas</h3>
          <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
            {threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedThreadId(t.id)}
                className={`w-full text-left rounded-md px-3 py-2 border ${
                  selectedThreadId === t.id
                    ? "border-indigo-500 bg-indigo-50/10"
                    : theme === "dark"
                      ? "border-gray-800 hover:bg-gray-800"
                      : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{t.company_name || "Empresa"}</span>
                  {!!t.unread_count && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white shrink-0">
                      {t.unread_count}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1 truncate">
                  {t.channel} • {t.contact}
                </p>
              </button>
            ))}
            {threads.length === 0 && (
              <p className="text-sm text-gray-500">
                Nenhuma conversa ainda. Cadastre em{" "}
                <Link to={createPageUrl("AppSettings")} className="text-indigo-500 underline">
                  Configurações
                </Link>
                .
              </p>
            )}
          </div>
        </Card>

        <Card className={`p-4 lg:col-span-2 ${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
          {!selectedThread ? (
            <p className="text-sm text-gray-500">Selecione uma conversa para ver o histórico de mensagens.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="font-semibold">{selectedThread.company_name}</h3>
                  <p className="text-xs text-gray-500">
                    {selectedThread.channel} • {selectedThread.contact}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={markAsRead}>
                  <CheckCheck className="w-4 h-4 mr-1" /> Marcar como lido
                </Button>
              </div>

              <div className="border-t border-gray-700/20 dark:border-gray-600/40 pt-4">
                <h4 className="font-semibold mb-2">Histórico</h4>
                <div className="space-y-2 max-h-[min(420px,50vh)] overflow-auto pr-1">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-md p-3 text-sm ${
                        m.direction === "incoming"
                          ? theme === "dark"
                            ? "bg-emerald-950/40 border border-emerald-900/50"
                            : "bg-emerald-50 border border-emerald-100"
                          : theme === "dark"
                            ? "bg-gray-800"
                            : "bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                        <span>
                          {m.direction === "incoming" ? "Recebida" : "Enviada"} •{" "}
                          {m.message_type === "file" ? "Arquivo" : "Texto"}
                          {m.direction === "incoming" && (
                            <span className="ml-1 font-medium text-emerald-600 dark:text-emerald-400">(resposta)</span>
                          )}
                        </span>
                        <span>{m.created_at ? new Date(m.created_at).toLocaleString("pt-BR") : ""}</span>
                      </div>
                      {m.content && <p className="mt-2 whitespace-pre-wrap break-words">{m.content}</p>}
                      {m.file_url && (
                        <a
                          href={m.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-500 underline mt-2 inline-block"
                        >
                          {m.file_name || "Abrir arquivo"}
                        </a>
                      )}
                    </div>
                  ))}
                  {messages.length === 0 && <p className="text-sm text-gray-500">Sem mensagens nesta conversa ainda.</p>}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
