import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { auth } from "@/lib/firebase";
import { dbClient } from "@/api/dbClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, SendHorizontal } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { openWhatsAppChat } from "@/lib/whatsappOpenUrl";
import { DEFAULT_FOLLOWUP_SEND_TIME, normalizeFollowupSendTime } from "@/lib/followupSchedule";

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateIso, days) {
  const d = new Date(dateIso || todayIso());
  d.setDate(d.getDate() + Number(days || 1));
  return d.toISOString().split("T")[0];
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

export default function ConversationFollowupSettings() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const uid = auth.currentUser?.uid;

  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");
  const [newChannel, setNewChannel] = useState("whatsapp");
  const [newContact, setNewContact] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [newNextDate, setNewNextDate] = useState(todayIso());
  const [newFollowup, setNewFollowup] = useState(true);
  const [newInterval, setNewInterval] = useState("1");

  const [msgDirection, setMsgDirection] = useState("incoming");
  const [msgType, setMsgType] = useState("text");
  const [msgText, setMsgText] = useState("");
  const [msgFileName, setMsgFileName] = useState("");
  const [msgFileUrl, setMsgFileUrl] = useState("");
  const [threadTemplate, setThreadTemplate] = useState("");
  const [threadNextDate, setThreadNextDate] = useState(todayIso());
  const [threadFollowupEnabled, setThreadFollowupEnabled] = useState(true);
  const [threadFollowupInterval, setThreadFollowupInterval] = useState("1");
  const [threadWaitingReply, setThreadWaitingReply] = useState(true);

  const { data: companies = [] } = useQuery({
    queryKey: ["companies", uid],
    queryFn: () => (uid ? dbClient.entities.Company.list(uid) : []),
    enabled: !!uid,
    retry: false,
  });

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

  /** Evita apagar o texto ao digitar/refetch: só sincroniza ao trocar de conversa ou quando o Firestore muda updated_at. */
  const threadFormSyncRef = useRef({ threadId: null, updatedAt: "" });

  useEffect(() => {
    if (!selectedThreadId) {
      threadFormSyncRef.current = { threadId: null, updatedAt: "" };
      return;
    }
    if (!selectedThread) return;

    const id = selectedThread.id;
    const updatedAt = String(selectedThread.updated_at || "");
    const switched = threadFormSyncRef.current.threadId !== id;
    const serverNewer =
      threadFormSyncRef.current.threadId === id && updatedAt !== threadFormSyncRef.current.updatedAt;

    if (switched || serverNewer) {
      threadFormSyncRef.current = { threadId: id, updatedAt };
      setThreadTemplate(selectedThread.template_message || "");
      setThreadNextDate(selectedThread.next_followup_date || todayIso());
      setThreadFollowupEnabled(!!selectedThread.followup_enabled);
      setThreadFollowupInterval(String(selectedThread.followup_interval_days || 1));
      setThreadWaitingReply(!!selectedThread.waiting_reply);
    }
  }, [selectedThreadId, selectedThread]);

  useEffect(() => {
    if (!newCompanyId) return;
    const company = companies.find((c) => c.id === newCompanyId);
    if (!company) return;
    if (newChannel === "whatsapp") {
      setNewContact(String(company.contact_phone || "").trim());
    } else {
      setNewContact(String(company.contact_email || "").trim());
    }
  }, [newCompanyId, newChannel, companies]);

  const upsertThreadMutation = useMutation({
    mutationFn: async (payload) => {
      if (payload.id) {
        return dbClient.entities.ConversationThread.update(payload.id, payload.data);
      }
      return dbClient.entities.ConversationThread.create(payload.data);
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["conversationThreads", uid] });
      await queryClient.invalidateQueries({ queryKey: ["conversationThreadsUnread", uid] });
      if (!selectedThreadId && result?.id) setSelectedThreadId(result.id);
    },
    onError: (error) => {
      alert(`Não foi possível salvar a conversa: ${error?.message || "erro desconhecido"}`);
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: (data) => dbClient.entities.ConversationMessage.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversationMessages", uid, selectedThreadId] }),
  });

  const handleCreateThread = async () => {
    if (!uid || !newCompanyId || !newContact.trim()) return;
    const company = companies.find((c) => c.id === newCompanyId);
    const existing = await dbClient.entities.ConversationThread.filter({
      uid,
      company_id: newCompanyId,
      channel: newChannel,
    });
    if (existing.length > 0) {
      setSelectedThreadId(existing[0].id);
      return;
    }
    const data = {
      uid,
      company_id: newCompanyId,
      company_name: company?.name || "",
      channel: newChannel,
      contact: newChannel === "whatsapp" ? normalizePhone(newContact) : newContact.trim(),
      template_message: newTemplate.trim(),
      next_followup_date: newNextDate || todayIso(),
      followup_send_time: normalizeFollowupSendTime(DEFAULT_FOLLOWUP_SEND_TIME),
      followup_enabled: !!newFollowup,
      followup_interval_days: Number(newInterval || 1),
      waiting_reply: true,
      unread_count: 0,
    };
    upsertThreadMutation.mutate({ data });
  };

  const handleSaveThreadSettings = () => {
    if (!selectedThread?.id) return;
    upsertThreadMutation.mutate({
      id: selectedThread.id,
      data: {
        template_message: threadTemplate.trim(),
        next_followup_date: threadNextDate || todayIso(),
        followup_send_time: normalizeFollowupSendTime(
          selectedThread.followup_send_time || DEFAULT_FOLLOWUP_SEND_TIME
        ),
        followup_enabled: !!threadFollowupEnabled,
        followup_interval_days: Number(threadFollowupInterval || 1),
        waiting_reply: !!threadWaitingReply,
      },
    });
  };

  const handleSendNow = async () => {
    if (!selectedThread || !uid) return;
    const message = (threadTemplate.trim() || String(selectedThread.template_message || "").trim()).trim();
    if (!message) {
      alert("Preencha a mensagem modelo para enviar.");
      return;
    }

    if (selectedThread.channel === "whatsapp") {
      const phone = normalizePhone(selectedThread.contact);
      if (!phone) {
        alert("Telefone da conversa inválido para abrir o WhatsApp.");
        return;
      }
      openWhatsAppChat(phone, message);
      await createMessageMutation.mutateAsync({
        uid,
        thread_id: selectedThread.id,
        company_id: selectedThread.company_id,
        direction: "outgoing",
        message_type: "text",
        content: message,
        channel: selectedThread.channel,
      });
      await upsertThreadMutation.mutateAsync({
        id: selectedThread.id,
        data: {
          template_message: message,
          followup_send_time: normalizeFollowupSendTime(
            selectedThread.followup_send_time || DEFAULT_FOLLOWUP_SEND_TIME
          ),
          waiting_reply: true,
          next_followup_date: addDays(
            selectedThread.next_followup_date || todayIso(),
            selectedThread.followup_interval_days || 1
          ),
          last_message: message,
          last_message_at: new Date().toISOString(),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["conversationMessages", uid, selectedThread.id] });
      await queryClient.invalidateQueries({ queryKey: ["conversationThreadsUnread", uid] });
      alert("Abrimos o WhatsApp com o texto. Conclua o envio na janela que abriu.");
      return;
    }

    await dbClient.integrations.Core.SendEmail({
      to: selectedThread.contact,
      subject: `Mensagem - ${selectedThread.company_name || "Cliente"}`,
      body: message,
    });

    await createMessageMutation.mutateAsync({
      uid,
      thread_id: selectedThread.id,
      company_id: selectedThread.company_id,
      direction: "outgoing",
      message_type: "text",
      content: message,
      channel: selectedThread.channel,
    });

    await upsertThreadMutation.mutateAsync({
      id: selectedThread.id,
      data: {
        template_message: message,
        followup_send_time: normalizeFollowupSendTime(
          selectedThread.followup_send_time || DEFAULT_FOLLOWUP_SEND_TIME
        ),
        waiting_reply: true,
        next_followup_date: addDays(
          selectedThread.next_followup_date || todayIso(),
          selectedThread.followup_interval_days || 1
        ),
        last_message: message,
        last_message_at: new Date().toISOString(),
      },
    });
  };

  const handleSendAllWhatsAppNow = async () => {
    if (!uid) return;
    const candidates = threads.filter(
      (t) =>
        t.channel === "whatsapp" &&
        String(t.template_message || "").trim() &&
        normalizePhone(t.contact)
    );
    if (candidates.length === 0) {
      alert("Nenhuma conversa WhatsApp com modelo preenchido e telefone válido.");
      return;
    }
    if (
      !window.confirm(
        `Abrir o WhatsApp para ${candidates.length} conversa(s), em sequência (uma janela a cada meio segundo).\n\n` +
          `O navegador pode bloquear muitas abas; nesse caso use «Enviar agora» em cada conversa.\n\n` +
          `Continuar?`
      )
    ) {
      return;
    }
    for (let i = 0; i < candidates.length; i++) {
      const t = candidates[i];
      const message = String(t.template_message || "").trim();
      const phone = normalizePhone(t.contact);
      const now = new Date().toISOString();
      openWhatsAppChat(phone, message);
      await createMessageMutation.mutateAsync({
        uid,
        thread_id: t.id,
        company_id: t.company_id,
        direction: "outgoing",
        message_type: "text",
        content: message,
        channel: "whatsapp",
      });
      await upsertThreadMutation.mutateAsync({
        id: t.id,
        data: {
          template_message: message,
          followup_send_time: normalizeFollowupSendTime(t.followup_send_time || DEFAULT_FOLLOWUP_SEND_TIME),
          waiting_reply: true,
          next_followup_date: addDays(t.next_followup_date || todayIso(), t.followup_interval_days || 1),
          last_message: message,
          last_message_at: now,
        },
      });
      if (i < candidates.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["conversationThreads", uid] });
    await queryClient.invalidateQueries({ queryKey: ["conversationThreadsUnread", uid] });
    alert("Sequência concluída: abas abertas e registros atualizados.");
  };

  const handleAddMessage = async () => {
    if (!uid || !selectedThread) return;
    const content = msgType === "text" ? msgText.trim() : msgText.trim();
    if (!content && msgType === "text") return;

    await createMessageMutation.mutateAsync({
      uid,
      thread_id: selectedThread.id,
      company_id: selectedThread.company_id,
      direction: msgDirection,
      message_type: msgType,
      content,
      file_name: msgType === "file" ? msgFileName.trim() : "",
      file_url: msgType === "file" ? msgFileUrl.trim() : "",
      channel: selectedThread.channel,
    });

    if (msgType === "file" && msgFileUrl.trim()) {
      await dbClient.entities.CompanyFile.create({
        uid,
        company_id: selectedThread.company_id,
        name: msgFileName.trim() || "arquivo_whatsapp",
        file_url: msgFileUrl.trim(),
      });
    }

    const nextUnread =
      msgDirection === "incoming" ? (selectedThread.unread_count || 0) + 1 : selectedThread.unread_count || 0;
    upsertThreadMutation.mutate({
      id: selectedThread.id,
      data: {
        waiting_reply: msgDirection === "incoming" ? false : true,
        unread_count: nextUnread,
        last_message: content || msgFileName || "Arquivo recebido",
        last_message_at: new Date().toISOString(),
      },
    });

    setMsgText("");
    setMsgFileName("");
    setMsgFileUrl("");
  };

  if (!uid) {
    return null;
  }

  return (
    <Card className={`p-5 space-y-6 ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white"}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="font-semibold text-lg">Mensagens e lembretes (WhatsApp manual)</h3>
          <p className={`text-sm mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
            Cadastre o modelo por conversa, a <strong className="font-medium">data prevista de envio de documentos</strong> (ou
            próximo contato) e o intervalo sugerido para a próxima data após você enviar. O WhatsApp só abre no navegador ou app —
            não há envio por API. Use <strong className="font-medium">Enviar todas</strong> depois de configurar os textos. O sininho
            em Novidades resume datas e se o cliente ainda está aguardando resposta.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendAllWhatsAppNow}
            disabled={upsertThreadMutation.isPending || createMessageMutation.isPending}
            className="whitespace-nowrap"
          >
            <SendHorizontal className="w-4 h-4 mr-1" /> Enviar todas (WhatsApp manual)
          </Button>
        </div>
      </div>

      <div className={`rounded-lg border p-4 space-y-3 ${theme === "dark" ? "border-gray-700 bg-gray-900/40" : "border-gray-200 bg-gray-50"}`}>
        <h4 className="font-semibold text-sm">Nova conversa (WhatsApp ou e-mail)</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select value={newCompanyId} onValueChange={setNewCompanyId}>
            <SelectTrigger>
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={newChannel} onValueChange={setNewChannel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
            </SelectContent>
          </Select>
          <div className="space-y-1 min-w-0">
            <Input
              value={newContact}
              onChange={(e) => setNewContact(e.target.value)}
              placeholder={newChannel === "whatsapp" ? "Telefone (com DDI)" : "E-mail"}
              aria-label={newChannel === "whatsapp" ? "Telefone WhatsApp" : "E-mail"}
            />
            <p className={`text-xs leading-snug ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
              {newCompanyId
                ? newChannel === "whatsapp"
                  ? "Preenchido com o telefone do cadastro da empresa; ajuste se precisar."
                  : "Preenchido com o e-mail do cadastro da empresa; ajuste se precisar."
                : "Escolha uma empresa para preencher automaticamente."}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-normal text-gray-500">Data documentos / próximo contato</Label>
            <Input type="date" value={newNextDate} onChange={(e) => setNewNextDate(e.target.value)} />
          </div>
          <Input
            className="lg:col-span-2"
            value={newTemplate}
            onChange={(e) => setNewTemplate(e.target.value)}
            placeholder="Mensagem modelo (WhatsApp / e-mail)"
          />
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={newFollowup} onChange={(e) => setNewFollowup(e.target.checked)} />
            <Label>Acompanhar até responder (lembrete no sininho)</Label>
          </div>
          <Input
            value={newInterval}
            onChange={(e) => setNewInterval(e.target.value)}
            placeholder="Intervalo em dias"
          />
        </div>
        <Button onClick={handleCreateThread} className="bg-indigo-600 hover:bg-indigo-700">
          Criar conversa
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`p-3 rounded-lg border ${theme === "dark" ? "border-gray-700 bg-gray-900/30" : "border-gray-200 bg-white"}`}>
          <h4 className="font-semibold mb-3 text-sm">Conversas cadastradas</h4>
          <div className="space-y-2 max-h-[50vh] overflow-auto pr-1">
            {threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedThreadId(t.id)}
                className={`w-full text-left rounded-md px-3 py-2 border text-sm ${
                  selectedThreadId === t.id
                    ? "border-indigo-500 bg-indigo-50/10"
                    : theme === "dark"
                      ? "border-gray-800 hover:bg-gray-800"
                      : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="font-medium truncate">{t.company_name || "Empresa"}</div>
                <p className="text-xs text-gray-500 mt-1 truncate">
                  {t.channel} • {t.contact}
                </p>
              </button>
            ))}
            {threads.length === 0 && <p className="text-sm text-gray-500">Nenhuma conversa cadastrada.</p>}
          </div>
        </div>

        <div className={`p-4 lg:col-span-2 rounded-lg border ${theme === "dark" ? "border-gray-700 bg-gray-900/30" : "border-gray-200 bg-white"}`}>
          {!selectedThread ? (
            <p className="text-sm text-gray-500">Selecione uma conversa para editar envios e registrar mensagens manualmente.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h4 className="font-semibold">{selectedThread.company_name}</h4>
                  <p className="text-xs text-gray-500">
                    {selectedThread.channel} • {selectedThread.contact}
                  </p>
                </div>
                <Button size="sm" onClick={handleSendNow} className="bg-indigo-600 hover:bg-indigo-700">
                  <Send className="w-4 h-4 mr-1" /> Enviar agora
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2 md:col-span-2">
                  <Label>Mensagem modelo</Label>
                  <Textarea value={threadTemplate} onChange={(e) => setThreadTemplate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Data documentos / próximo contato</Label>
                  <Input type="date" value={threadNextDate} onChange={(e) => setThreadNextDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Intervalo sugerido após enviar (dias)</Label>
                  <Input
                    type="number"
                    value={threadFollowupInterval}
                    onChange={(e) => setThreadFollowupInterval(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={threadFollowupEnabled}
                    onChange={(e) => setThreadFollowupEnabled(e.target.checked)}
                  />
                  <Label>Acompanhar até responder (lembrete no sininho)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={threadWaitingReply}
                    onChange={(e) => setThreadWaitingReply(e.target.checked)}
                  />
                  <Label>Aguardando resposta</Label>
                </div>
                <div className="md:col-span-2">
                  <Button variant="outline" size="sm" onClick={handleSaveThreadSettings}>
                    Salvar configurações desta conversa
                  </Button>
                </div>
              </div>

              <div className={`border-t pt-4 ${theme === "dark" ? "border-gray-700" : "border-gray-200"}`}>
                <h4 className="font-semibold mb-2 text-sm">Registrar mensagem manualmente</h4>
                <p className={`text-xs mb-3 ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                  Use se precisar anotar algo que não entrou pelo webhook (ex.: resposta registrada fora do sistema).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <Select value={msgDirection} onValueChange={setMsgDirection}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="incoming">Recebida</SelectItem>
                      <SelectItem value="outgoing">Enviada</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={msgType} onValueChange={setMsgType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="file">Arquivo</SelectItem>
                    </SelectContent>
                  </Select>
                  {msgType === "file" && (
                    <>
                      <Input
                        value={msgFileName}
                        onChange={(e) => setMsgFileName(e.target.value)}
                        placeholder="Nome do arquivo"
                      />
                      <Input
                        value={msgFileUrl}
                        onChange={(e) => setMsgFileUrl(e.target.value)}
                        placeholder="URL do arquivo"
                      />
                    </>
                  )}
                </div>
                <Textarea
                  className="mt-2"
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  placeholder={msgType === "file" ? "Observação do arquivo (opcional)" : "Mensagem"}
                />
                <div className="mt-2">
                  <Button onClick={handleAddMessage} className="bg-indigo-600 hover:bg-indigo-700">
                    Salvar mensagem
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
