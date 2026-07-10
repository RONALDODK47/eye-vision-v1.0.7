import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, COMPANY_ACCESS_TOKEN_KEY } from "@/lib/AuthContext";
import { useCloudAccess } from "@/lib/useCloudAccess";
import { dbClient } from "@/api/dbClient";
import { useTheme } from "@/components/ThemeProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessagesSquare, Search, Send, Loader2, User, Users, Briefcase, MoreVertical, Pencil, Trash2, Plus, Copy, Check } from "lucide-react";
import { APP_VERSION } from "@/config/appRelease";
import { cn } from "@/lib/utils";
import { GestaoPageHeader, GestaoPanel, gestaoNativeMuted } from "@/components/GestaoEyeVisionChrome";
import { useDirectChatMessages, useDirectChatThreads } from "@/hooks/useDirectChatRealtime";

function profileLabel(profile, uid) {
  if (profile?.display_name?.trim()) return profile.display_name.trim();
  const em = profile?.email?.trim();
  if (em && !em.endsWith("@gestao.local")) return em;
  if (em) return em.split("@")[0] || shortId(uid);
  return shortId(uid);
}

function shortId(uid) {
  if (!uid) return "—";
  return uid.length > 12 ? `${uid.slice(0, 10)}…` : uid;
}

function normalizeEmailChat(em) {
  return String(em || "").trim().toLowerCase();
}

function slugifyPortalPlaceholderLocalPart(displayName) {
  return (
    String(displayName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "cliente"
  );
}

function generatePortalPlaceholderEmail(displayName) {
  const slug = slugifyPortalPlaceholderLocalPart(displayName);
  const uniq =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${slug}-${uniq}@portal.gc.local`;
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      console.error(e);
    }
    document.body.removeChild(textArea);
  }
}

function isSelfEmail(email, myEmail) {
  const norm = String(email || "").trim().toLowerCase();
  const selfSet = new Set([
    "ronaldojunior.gyn@gmail.com",
    "ronaldojunior.gyn@usuario.local",
    "ronaldojunior.gyn.emergencia@usuario.local",
  ]);
  if (myEmail) {
    selfSet.add(String(myEmail).trim().toLowerCase());
  }
  return selfSet.has(norm);
}

/** Contas de portal convite / cliente final empresa / placeholder @portal.gc.local ou linha Gestão cliente. */
function isDirectoryCliente(profile, portalClientEmails) {
  if (!profile?.uid) return false;
  const em = normalizeEmailChat(profile.email);
  if (em.endsWith("@portal.gc.local")) return true;
  if (profile.gc_portal_client === true) return true;
  if (profile.gc_empresa_portal_guest === true) return true;
  return portalClientEmails.has(em);
}

function otherParticipant(thread, myUid) {
  const parts = thread?.participants || [];
  return parts.find((p) => p !== myUid) || null;
}

/** ID do tópico é `uidOrdenadoMenor__uidOrdenadoMaior` (ver DirectChatThread.threadIdForPair). */
function otherUidFromThreadId(threadId, myUid) {
  if (!threadId || !myUid) return null;
  const parts = String(threadId).split("__");
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (a === myUid) return b;
  if (b === myUid) return a;
  return null;
}

export default function Chat() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const uid = user?.uid;
  const { config: cloudAccessConfig, isAdminEmail, clientEntry, companyTokenOk } = useCloudAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const messagesEndRef = useRef(null);

  /** `usuarios` = equipa / internos; `clientes` = portal Gestão ou convite empresa. */
  const [directoryTab, setDirectoryTab] = useState("usuarios");
  const [userSearch, setUserSearch] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingText, setEditingText] = useState("");

  // Estados para geração de link de chat para cliente final
  const [createClientPortalLinkOpen, setCreateClientPortalLinkOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [generatedLinkInfo, setGeneratedLinkInfo] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Token effectivo: do clientEntry (equipa/portal) ou do localStorage (admin/master sem clientEntry)
  const effectiveCompanyToken = useMemo(() => {
    const fromEntry = String(clientEntry?.assigned_company_token || "").trim();
    if (fromEntry) return fromEntry;
    // Fallback: token armazenado no login (admins e masters não têm clientEntry)
    try {
      return String(localStorage.getItem(COMPANY_ACCESS_TOKEN_KEY) || "").trim();
    } catch {
      return "";
    }
  }, [clientEntry?.assigned_company_token]);

  const officeEmails = useMemo(() => {
    const token = effectiveCompanyToken;
    const set = new Set();
    const myEmailNorm = normalizeEmailChat(user?.email);
    if (myEmailNorm) set.add(myEmailNorm);

    // Se não há token nenhum, retorna conjunto apenas com o próprio — filtro restritivo
    if (!token) return set;

    const clientsMap =
      cloudAccessConfig?.clients && typeof cloudAccessConfig.clients === "object"
        ? cloudAccessConfig.clients
        : {};

    Object.values(clientsMap).forEach((c) => {
      if (!c || typeof c !== "object") return;
      if (String(c.assigned_company_token || "").trim() === token) {
        const em = normalizeEmailChat(c.email);
        if (em) set.add(em);
      }
    });

    return set;
  }, [effectiveCompanyToken, cloudAccessConfig, user?.email]);

  const officeEmailsList = useMemo(() => [...officeEmails], [officeEmails]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["chatOfficeProfiles", uid, officeEmailsList.join("|")],
    queryFn: () => dbClient.entities.UserProfile.listByEmails(officeEmailsList),
    enabled: !!uid && Boolean(companyTokenOk) && officeEmailsList.length > 0,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const profileByUid = useMemo(() => {
    const m = new Map();
    profiles.forEach((p) => {
      if (p.uid) m.set(p.uid, p);
    });
    return m;
  }, [profiles]);

  const chatEnabled = Boolean(uid && companyTokenOk);
  const { threads, threadsLoading, threadsError } = useDirectChatThreads(uid, chatEnabled);
  const { messages, messagesLoading, messagesError } = useDirectChatMessages(
    selectedThreadId,
    chatEnabled && Boolean(selectedThreadId),
  );

  const filteredThreads = useMemo(() => {
    const myEmail = normalizeEmailChat(user?.email);
    return threads.filter((t) => {
      const ou = otherParticipant(t, uid);
      if (!ou || ou === uid) return false;
      const prof = profileByUid.get(ou);
      if (prof?.email && isSelfEmail(prof.email, myEmail)) return false;

      // Filtrar sempre pelo conjunto de e-mails do escritório (inclui fallback de admin via localStorage token)
      if (prof?.email) {
        const emNorm = normalizeEmailChat(prof.email);
        if (!officeEmails.has(emNorm)) return false;
      }
      return true;
    });
  }, [threads, uid, user?.email, profileByUid, officeEmails]);

  const selectedThread = useMemo(
    () => filteredThreads.find((t) => t.id === selectedThreadId) || null,
    [filteredThreads, selectedThreadId]
  );

  const otherUid = useMemo(() => {
    if (!uid) return null;
    if (selectedThread) return otherParticipant(selectedThread, uid);
    if (selectedThreadId) return otherUidFromThreadId(selectedThreadId, uid);
    return null;
  }, [selectedThread, selectedThreadId, uid]);

  const portalClienteEmailsNorm = useMemo(() => {
    const map =
      cloudAccessConfig?.clients && typeof cloudAccessConfig.clients === "object"
        ? cloudAccessConfig.clients
        : {};
    const set = new Set();
    Object.values(map).forEach((row) => {
      if (!row || typeof row !== "object") return;
      if (String(row.account_type || "").toLowerCase() !== "client") return;
      const em = normalizeEmailChat(row.email);
      if (em) set.add(em);
    });
    return set;
  }, [cloudAccessConfig]);

  const searchTerms = useMemo(() => {
    return userSearch
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }, [userSearch]);

  const filteredDirectoryRows = useMemo(() => {
    if (!uid) return [];
    const wantClientes = directoryTab === "clientes";
    const myEmail = normalizeEmailChat(user?.email);
    let list = profiles.filter((p) => {
      if (!p.uid || p.uid === uid) return false;
      if (p.email && isSelfEmail(p.email, myEmail)) return false;

      // Filtrar SEMPRE pelo conjunto do escritório — inclui admin via token do localStorage
      if (p.email) {
        const emNorm = normalizeEmailChat(p.email);
        if (!officeEmails.has(emNorm)) return false;
      } else {
        // Perfil sem e-mail não pertence ao escritório
        return false;
      }

      const cliente = isDirectoryCliente(p, portalClienteEmailsNorm);
      return wantClientes ? cliente : !cliente;
    });
    if (searchTerms.length === 0) return list.slice(0, 40);
    return list.filter((p) => {
      const label = profileLabel(p, p.uid).toLowerCase();
      const email = String(p.email || "").toLowerCase();
      return searchTerms.some((term) => label.includes(term) || email.includes(term) || p.uid.toLowerCase().includes(term));
    });
  }, [profiles, uid, user?.email, searchTerms, directoryTab, portalClienteEmailsNorm, officeEmails]);

  useEffect(() => {
    if (selectedThreadId && uid) {
      dbClient.entities.DirectChatThread.markReadForUser(selectedThreadId, uid).catch(() => {});
    }
  }, [selectedThreadId, uid]);

  const quotaBlocked = threadsError?.message === "CHAT_QUOTA" || messagesError?.message === "CHAT_QUOTA";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedThreadId]);

  useEffect(() => {
    const t = searchParams.get("thread");
    if (!t || !uid || threadsLoading) return;
    const exists = filteredThreads.some((th) => th.id === t);
    if (!exists) return;
    setSelectedThreadId(t);
    const next = new URLSearchParams(searchParams);
    next.delete("thread");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, filteredThreads, threadsLoading, uid]);

  const ensureAndOpenMutation = useMutation({
    mutationFn: async (targetUid) => {
      const tid = await dbClient.entities.DirectChatThread.ensure(uid, targetUid);
      return { tid, targetUid };
    },
    onSuccess: ({ tid, targetUid }) => {
      setSelectedThreadId(tid);
      setUserSearch(profileLabel(profileByUid.get(targetUid), targetUid));
    },
    onError: (err) => {
      console.error(err);
      const msg = String(err?.message || "").toLowerCase();
      if (msg.includes("quota") || msg.includes("resource-exhausted")) {
        window.alert(
          "Limite diário de leituras do Firebase atingido. O chat volta quando a cota for reposta (meia-noite PT) ou com plano Blaze ativo no projeto.",
        );
        return;
      }
      window.alert(err?.message || "Não foi possível abrir a conversa. Verifique as regras do Firestore e sua conexão.");
    },
  });

  const sendMutation = useMutation({
    mutationFn: async ({ text }) => {
      if (!selectedThreadId || !uid) throw new Error("Selecione uma conversa.");
      await dbClient.entities.DirectChatMessage.send({
        threadId: selectedThreadId,
        senderUid: uid,
        text,
      });
    },
    onSuccess: () => {
      setDraft("");
    },
    onError: (err) => {
      console.error(err);
      const msg = String(err?.message || "").toLowerCase();
      if (msg.includes("quota") || msg.includes("resource-exhausted")) {
        window.alert(
          "Limite diário de leituras/gravações do Firebase atingido. Tente novamente após a reposição da cota.",
        );
        return;
      }
      window.alert(
        err?.message ||
          "Não foi possível enviar a mensagem. Verifique a conexão e as regras do Firestore (deploy de rules).",
      );
    },
  });

  const editMessageMutation = useMutation({
    mutationFn: async ({ messageId, text }) => {
      await dbClient.entities.DirectChatMessage.editForAll({
        messageId,
        senderUid: uid,
        text,
      });
    },
    onSuccess: () => {
      setEditingMessageId("");
      setEditingText("");
    },
    onError: (err) => {
      console.error(err);
      window.alert(err?.message || "Não foi possível editar a mensagem.");
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async ({ messageId }) => {
      await dbClient.entities.DirectChatMessage.deleteForAll({
        messageId,
        senderUid: uid,
      });
    },
    onSuccess: () => {},
    onError: (err) => {
      console.error(err);
      window.alert(err?.message || "Não foi possível excluir a mensagem.");
    },
  });

  const handleSend = () => {
    const t = draft.trim();
    if (!t || sendMutation.isPending) return;
    sendMutation.mutate({ text: t });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const beginEditMessage = (msg) => {
    if (!msg || msg.sender_uid !== uid) return;
    setEditingMessageId(msg.id);
    setEditingText(String(msg.text || ""));
  };

  const cancelEditMessage = () => {
    setEditingMessageId("");
    setEditingText("");
  };

  const saveEditMessage = () => {
    const txt = String(editingText || "").trim();
    if (!editingMessageId || !txt) return;
    editMessageMutation.mutate({ messageId: editingMessageId, text: txt });
  };

  const handleGenerateClientLink = async (e) => {
    e.preventDefault();
    const nameTrim = String(newClientName || "").trim();
    if (!nameTrim) return;
    setIsGeneratingLink(true);
    try {
      const myCompanyToken = clientEntry?.assigned_company_token || localStorage.getItem("gc_company_access_token") || "";
      if (!myCompanyToken) {
        throw new Error("Não foi possível identificar o token da sua empresa. Por favor, reentre na sua conta.");
      }
      
      const newPortalToken = dbClient.entities.CloudAccessControl.generateToken("CL");
      const email = generatePortalPlaceholderEmail(nameTrim);
      
      const portal_staff = [];
      const portal_staff_uids = [];
      try {
        const myTokenTrim = String(myCompanyToken || "").trim();
        const map = cloudAccessConfig?.clients && typeof cloudAccessConfig.clients === "object" ? cloudAccessConfig.clients : {};
        const staffEmails = Object.values(map)
          .filter((c) => c && typeof c === "object" && String(c.account_type || "").toLowerCase() !== "client" && String(c.assigned_company_token || "").trim() === myTokenTrim)
          .map((c) => String(c.email || "").trim().toLowerCase())
          .filter(Boolean);
        const emailsSet = new Set(staffEmails);
        profiles.forEach((p) => {
          const em = String(p?.email || "").trim().toLowerCase();
          const pUid = String(p?.uid || "").trim();
          if (pUid && em && emailsSet.has(em)) {
            portal_staff.push({ uid: pUid, sector: "", company_ids: [] });
            portal_staff_uids.push(pUid);
          }
        });
      } catch (err) {
        console.warn("Could not auto-populate portal_staff", err);
      }

      if (portal_staff.length === 0 && uid) {
        portal_staff.push({ uid, sector: "", company_ids: [] });
        portal_staff_uids.push(uid);
      }
      
      await dbClient.entities.CloudAccessControl.upsertClient({
        adminUid: uid,
        email,
        patch: {
          account_type: "client",
          is_master: false,
          client_display_name: nameTrim,
          notes: "Cliente gerado pelo painel de chat",
          is_paid: true,
          is_active: true,
          assigned_company_token: myCompanyToken,
          portal_enabled: true,
          portal_token: newPortalToken,
          portal_mode: "chat_only",
          portal_only_chat: true,
          portal_staff,
          portal_staff_uids,
          gc_chat_only_client: true,
        }
      });
      
      const chatLink = `${window.location.origin}/ClientPortal?token=${encodeURIComponent(newPortalToken)}&v=${encodeURIComponent(APP_VERSION)}`;
      
      setGeneratedLinkInfo({
        name: nameTrim,
        token: newPortalToken,
        link: chatLink,
      });
      
      queryClient.invalidateQueries({ queryKey: ["userProfilesDirectory"] });
      queryClient.invalidateQueries({ queryKey: ["cloudAccessControlConfig"] });
    } catch (err) {
      console.error(err);
      window.alert(err?.message || "Erro ao gerar o link de chat.");
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const unreadTotal = filteredThreads.reduce((s, t) => s + Number(t.unread?.[uid] || 0), 0);

  return (
    <div className="space-y-4">
      <GestaoPageHeader
        title="Chat"
        subtitle={
          unreadTotal > 0
            ? `Conversas internas e portal · ${unreadTotal} não lida(s)`
            : "Conversas internas e portal — vírgula na pesquisa separa vários termos"
        }
      />

      {quotaBlocked ? (
        <GestaoPanel className="border-amber-500/80 bg-amber-50/90">
          <p className={gestaoNativeMuted}>
            Limite diário de leituras do Firebase (plano gratuito) atingido. O chat deixou de consultar a nuvem em
            loop — aguarde a reposição da cota (meia-noite PT) ou ative faturamento Blaze no projeto Google Cloud.
          </p>
        </GestaoPanel>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[min(70vh,640px)]">
        <Card className={cn("lg:col-span-4 flex flex-col overflow-hidden border", theme === "dark" ? "bg-gray-900/80 border-gray-800" : "bg-white")}>
          <div className="p-3 border-b border-gray-200 dark:border-gray-800 space-y-2">
            <div
              role="tablist"
              aria-label="Tipo de contacto no chat"
              className={cn(
                "flex rounded-lg border p-0.5 gap-0.5",
                theme === "dark" ? "border-gray-700 bg-gray-950/80" : "border-gray-200 bg-gray-50"
              )}
            >
              <button
                role="tab"
                type="button"
                aria-selected={directoryTab === "usuarios"}
                onClick={() => setDirectoryTab("usuarios")}
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5",
                  directoryTab === "usuarios"
                    ? theme === "dark"
                      ? "bg-indigo-900/80 text-white shadow-sm"
                      : "bg-white text-indigo-700 shadow-sm"
                    : theme === "dark"
                      ? "text-gray-400 hover:text-gray-200"
                      : "text-gray-600 hover:text-gray-900"
                )}
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                Usuários
              </button>
              <button
                role="tab"
                type="button"
                aria-selected={directoryTab === "clientes"}
                onClick={() => setDirectoryTab("clientes")}
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5",
                  directoryTab === "clientes"
                    ? theme === "dark"
                      ? "bg-indigo-900/80 text-white shadow-sm"
                      : "bg-white text-indigo-700 shadow-sm"
                    : theme === "dark"
                      ? "text-gray-400 hover:text-gray-200"
                      : "text-gray-600 hover:text-gray-900"
                )}
              >
                <Briefcase className="w-3.5 h-3.5 shrink-0" />
                Clientes
              </button>
            </div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1 pt-1">
              <Search className="w-3.5 h-3.5" />
              {directoryTab === "usuarios" ? "Pesquisar usuários" : "Pesquisar clientes"}
            </label>
            <Input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Nome, e-mail ou trecho do ID… (vírgula = vários)"
              className="text-sm"
            />
            <p className="text-[11px] text-gray-500">
              Clique para abrir ou criar conversa.
              {directoryTab === "clientes" &&
                " Clientes são contas ligadas ao portal / convites (não aparece equipe nesta lista)."}
            </p>
            {directoryTab === "clientes" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full text-xs gap-1.5 h-8 border-dashed border-indigo-500/30 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
                onClick={() => {
                  setNewClientName("");
                  setGeneratedLinkInfo(null);
                  setCopiedLink(false);
                  setCopiedToken(false);
                  setCreateClientPortalLinkOpen(true);
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                Gerar link de chat para cliente
              </Button>
            )}
          </div>
          <ScrollArea className="flex-1 min-h-[200px] max-h-[32vh] lg:max-h-none lg:h-[220px]">
            <div className="p-2 space-y-1">
              {ensureAndOpenMutation.isPending && (
                <div className="flex items-center gap-2 text-xs text-gray-500 p-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Abrindo conversa…
                </div>
              )}
              {filteredDirectoryRows.map((p) => (
                <button
                  key={p.uid}
                  type="button"
                  onClick={() => ensureAndOpenMutation.mutate(p.uid)}
                  className={cn(
                    "w-full text-left rounded-lg px-3 py-2 text-sm transition-colors flex items-start gap-2",
                    theme === "dark" ? "hover:bg-gray-800" : "hover:bg-gray-100"
                  )}
                >
                  <User className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" />
                  <span className="min-w-0">
                    <span className="font-medium block truncate">{profileLabel(p, p.uid)}</span>
                    <span className="text-xs text-gray-500 truncate block">{p.email || p.uid}</span>
                  </span>
                </button>
              ))}
              {filteredDirectoryRows.length === 0 && (
                <p className="text-xs text-gray-500 p-3">
                  {directoryTab === "usuarios"
                    ? "Nenhum usuário interno encontrado. Ajuste a pesquisa."
                    : "Nenhum cliente de portal encontrado. A lista inclui Gmail do portal (@portal.gc.local ou convites) e contas marcadas como cliente na Gestão."}
                </p>
              )}
            </div>
          </ScrollArea>

          <div className="p-3 border-t border-gray-200 dark:border-gray-800">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Conversas</h3>
            <ScrollArea className="h-[min(28vh,240px)] lg:h-[calc(70vh-320px)] min-h-[120px]">
              <div className="space-y-1 pr-2">
                {threadsLoading && (
                  <p className="text-xs text-gray-500 p-2 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
                  </p>
                )}
                {!threadsLoading &&
                  filteredThreads.map((t) => {
                    const ou = otherParticipant(t, uid);
                    const prof = ou ? profileByUid.get(ou) : null;
                    const label = ou ? profileLabel(prof, ou) : "Usuário";
                    const unread = Number(t.unread?.[uid] || 0);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedThreadId(t.id)}
                        className={cn(
                          "w-full text-left rounded-lg px-3 py-2 border text-sm transition-colors",
                          selectedThreadId === t.id
                            ? "border-indigo-500 bg-indigo-500/10"
                            : theme === "dark"
                              ? "border-gray-800 hover:bg-gray-800/80"
                              : "border-gray-200 hover:bg-gray-50"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{label}</span>
                          {unread > 0 && (
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white">
                              {unread}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{t.last_message_text || "Sem mensagens ainda"}</p>
                      </button>
                    );
                  })}
                {!threadsLoading && filteredThreads.length === 0 && (
                  <p className="text-xs text-gray-500 p-2">Nenhuma conversa. Pesquise em Usuários ou Clientes acima.</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </Card>

        <Card className={cn("lg:col-span-8 flex flex-col min-h-[min(50vh,480px)] border", theme === "dark" ? "bg-gray-900/80 border-gray-800" : "bg-white")}>
          {!selectedThreadId || !uid ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
              <MessagesSquare className="w-12 h-12 mb-3 opacity-40" />
              <p className="text-sm font-medium">Selecione uma conversa ou um usuário na lista</p>
              <p className="text-xs mt-2 max-w-sm">
                As mensagens são privadas entre você e o outro participante. Os dados ficam no Firestore do projeto.
              </p>
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold truncate">
                    {otherUid ? profileLabel(profileByUid.get(otherUid), otherUid) : "Conversa"}
                  </h2>
                  <p className="text-xs text-gray-500 truncate">
                    {otherUid ? profileByUid.get(otherUid)?.email || otherUid : selectedThreadId || ""}
                  </p>
                </div>
              </div>
              <ScrollArea className="flex-1 min-h-[200px] p-3">
                <div className="space-y-3 pr-2">
                  {messagesLoading && (
                    <p className="text-xs text-gray-500 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando mensagens…
                    </p>
                  )}
                  {messages.map((m) => {
                    const mine = !!uid && !!m.sender_uid && m.sender_uid === uid;
                    const isEditingThis = editingMessageId === m.id;
                    return (
                      <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                            mine
                              ? "bg-indigo-600 text-white rounded-br-md"
                              : theme === "dark"
                                ? "bg-gray-800 text-gray-100 rounded-bl-md"
                                : "bg-gray-100 text-gray-900 rounded-bl-md"
                          )}
                        >
                          {mine && !isEditingThis && (
                            <div className="flex justify-end -mt-1 mb-1">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className={cn(
                                      "inline-flex items-center justify-center h-5 w-5 rounded hover:bg-black/20",
                                      mine ? "text-indigo-100" : "text-gray-500"
                                    )}
                                    aria-label="Opções da mensagem"
                                  >
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    onSelect={() => beginEditMessage(m)}
                                  >
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Editar mensagem
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="cursor-pointer text-red-600 focus:text-red-600"
                                    onSelect={() => {
                                      if (window.confirm("Excluir esta mensagem para todos?")) {
                                        deleteMessageMutation.mutate({ messageId: m.id });
                                      }
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir para todos
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                          {isEditingThis ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                rows={2}
                                className={cn(
                                  "resize-none text-sm",
                                  mine
                                    ? "bg-indigo-500/30 border-indigo-200/40 text-white placeholder:text-indigo-100/80"
                                    : ""
                                )}
                              />
                              <div className="flex justify-end gap-2">
                                <Button type="button" variant="secondary" size="sm" onClick={cancelEditMessage}>
                                  Cancelar
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="bg-indigo-800 hover:bg-indigo-900"
                                  disabled={editMessageMutation.isPending || !editingText.trim()}
                                  onClick={saveEditMessage}
                                >
                                  Salvar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap break-words">{m.text}</p>
                          )}
                          <p
                            className={cn(
                              "text-[10px] mt-1 opacity-80",
                              mine ? "text-indigo-100" : "text-gray-500"
                            )}
                          >
                            {m.created_at ? new Date(m.created_at).toLocaleString("pt-BR") : ""}
                            {m.edited_at ? " · editada" : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                  {!messagesLoading && messages.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-6">Nenhuma mensagem ainda. Envie a primeira.</p>
                  )}
                </div>
              </ScrollArea>
              <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escreva uma mensagem… (Enter envia, Shift+Enter nova linha)"
                  rows={3}
                  className="resize-none text-sm"
                  disabled={sendMutation.isPending}
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleSend}
                    disabled={!draft.trim() || sendMutation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Enviar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
      </Card>
      </div>

      <Dialog open={createClientPortalLinkOpen} onOpenChange={setCreateClientPortalLinkOpen}>
        <DialogContent className={cn("sm:max-w-md", theme === "dark" ? "bg-gray-900 border-gray-800 text-gray-100" : "bg-white")}>
          <DialogHeader>
            <DialogTitle>Gerar Link de Chat para Cliente</DialogTitle>
          </DialogHeader>
          
          {!generatedLinkInfo ? (
            <form onSubmit={handleGenerateClientLink} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Nome do Cliente
                </label>
                <Input
                  required
                  placeholder="Ex: Auto Mecânica Silva"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full text-sm"
                />
                <p className="text-[11px] text-gray-500">
                  Este nome identificará o seu cliente no ecrã de chat e no diretório.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCreateClientPortalLinkOpen(false)}
                  disabled={isGeneratingLink}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isGeneratingLink || !newClientName.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-2"
                >
                  {isGeneratingLink ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      A Gerar…
                    </>
                  ) : (
                    "Gerar Link e Token"
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30 rounded-lg text-emerald-800 dark:text-emerald-300 text-xs leading-relaxed">
                Link de chat gerado com sucesso! Envie a ligação ou o token abaixo para o cliente final.
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-gray-500">Token do Cliente</label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={generatedLinkInfo.token}
                    className="text-xs font-mono"
                    onFocus={(e) => e.target.select()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5 text-xs"
                    onClick={() => {
                      copyTextToClipboard(generatedLinkInfo.token);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2000);
                    }}
                  >
                    {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedToken ? "Copiado" : "Copiar"}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-gray-500">Link Direto do Chat</label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={generatedLinkInfo.link}
                    className="text-xs font-mono"
                    onFocus={(e) => e.target.select()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5 text-xs"
                    onClick={() => {
                      copyTextToClipboard(generatedLinkInfo.link);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLink ? "Copiado" : "Copiar Link"}
                  </Button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                  onClick={() => setCreateClientPortalLinkOpen(false)}
                >
                  Concluir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
