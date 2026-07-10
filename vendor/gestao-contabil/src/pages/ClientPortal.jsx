import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dbClient } from "@/api/dbClient";
import { useAuth } from "@/lib/AuthContext";
import { useCloudAccess } from "@/lib/useCloudAccess";
import { useTheme } from "@/components/ThemeProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Send, Building2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDirectChatMessages } from "@/hooks/useDirectChatRealtime";

function profileLabel(profile, uid) {
  if (profile?.display_name?.trim()) return profile.display_name.trim();
  const em = String(profile?.email || "").trim();
  if (em) return em;
  return uid || "Usuário";
}

export default function ClientPortal() {
  const { slug: clienteEmpresaUrlSlug } = useParams();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const { clientEntry, empresaPortalSession, config } = useCloudAccess();
  const uid = user?.uid;
  const [params] = useSearchParams();

  const empresaSyntheticEntry = useMemo(() => {
    if (!empresaPortalSession?.block || !empresaPortalSession.companyId) return null;
    const sess = empresaPortalSession;
    const b = sess.block;
    const cid = String(sess.companyId || "").trim();
    const displayInvite = String(b.portal_display_label || "").trim();
    const fromBlockStaff = Array.isArray(b.portal_staff) ? b.portal_staff : [];
    const normalizedFromBlock = fromBlockStaff
      .map((s) => ({
        uid: String(s?.uid || "").trim(),
        sector: String(s?.sector || "").trim(),
        company_ids: Array.isArray(s?.company_ids)
          ? s.company_ids.map((x) => String(x || "").trim()).filter(Boolean)
          : [],
      }))
      .filter((s) => s.uid);
    const portal_staff =
      normalizedFromBlock.length > 0
        ? normalizedFromBlock.map((s) => ({
            ...s,
            company_ids: s.company_ids.length > 0 ? s.company_ids : [cid],
          }))
        : (Array.isArray(b.portal_staff_uids) ? b.portal_staff_uids : [])
            .map((id) => String(id || "").trim())
            .filter(Boolean)
            .map((id) => ({ uid: id, sector: "", company_ids: [cid] }));
    return {
      portal_enabled: true,
      portal_display_label_invite: displayInvite,
      portal_token: String(sess.inviteToken || "").trim(),
      portal_staff,
      portal_staff_uids: portal_staff.map((s) => s.uid),
      portal_company_ids: [cid],
      is_paid: Boolean(b.is_paid),
      is_active: b.is_active !== false,
      account_type: "empresa_guest",
      read_only_chat: b.read_only_chat !== false,
      portal_only_chat: true,
    };
  }, [empresaPortalSession]);

  const portalEntry = empresaSyntheticEntry || clientEntry;
  const effectiveInviteToken = empresaSyntheticEntry
    ? String(empresaPortalSession?.inviteToken || "").trim()
    : String(params.get("token") || "");
  const token = effectiveInviteToken;
  const requestedCompanyIdParam = String(params.get("company") || "").trim();
  const requestedCompanyId = empresaSyntheticEntry
    ? String(requestedCompanyIdParam || empresaPortalSession?.companyId || "").trim()
    : requestedCompanyIdParam;

  const tokenStructuralOk =
    Boolean(portalEntry?.portal_enabled !== false) &&
    Boolean(token) &&
    token === String(portalEntry?.portal_token || "");
  /** Utilizador do escritório a abrir de imediato (opcional — senão usa o primeiro contacto visível no filtro) */
  const staffUidFromLink = String(params.get("staff") || params.get("user") || "").trim();

  /** Suspensa explicitamente na Gestão — sem chat nem dados. */
  const portalAccountSuspended = portalEntry?.is_active === false;

  /** Chat e dados só com token válido, conta não suspensa e pagamento confirmado (`is_paid`). */
  const portalPaidActive = Boolean(portalEntry?.is_paid) && !portalAccountSuspended;
  const portalChatEnabled = tokenStructuralOk && portalPaidActive;
  const readOnlyChat = Boolean(empresaSyntheticEntry && portalEntry?.read_only_chat !== false);

  const [userFilter, setUserFilter] = useState("");
  const [companyFilterId, setCompanyFilterId] = useState(requestedCompanyId || "all");
  const [selectedStaffUid, setSelectedStaffUid] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef(null);
  /** Evita várias chamadas automáticas enquanto a mutação está a correr; repõe-se no erro ou com novo link. */
  const autoChatInFlightRef = useRef(false);
  const autoChatFailCountRef = useRef(0);

  useEffect(() => {
    autoChatInFlightRef.current = false;
    autoChatFailCountRef.current = 0;
  }, [token, requestedCompanyId, staffUidFromLink]);

  const portalStaff = useMemo(
    () => (Array.isArray(portalEntry?.portal_staff) ? portalEntry.portal_staff : []),
    [portalEntry]
  );
  const portalCompanyIds = useMemo(
    () => (Array.isArray(portalEntry?.portal_company_ids) ? portalEntry.portal_company_ids : []).map((id) => String(id || "")),
    [portalEntry]
  );
  const staffMetaByUid = useMemo(() => {
    const map = new Map();
    portalStaff.forEach((s) => {
      const suid = String(s?.uid || "").trim();
      if (!suid) return;
      map.set(suid, {
        sector: String(s?.sector || "").trim(),
        companyIds: Array.isArray(s?.company_ids) ? s.company_ids.map((x) => String(x || "").trim()) : [],
      });
    });
    return map;
  }, [portalStaff]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["clientPortalProfiles", uid],
    queryFn: () => dbClient.entities.UserProfile.listAll(),
    enabled: !!uid && portalChatEnabled,
    retry: false,
  });

  const staffFromSameToken = useMemo(() => {
    const localToken = typeof window !== "undefined" ? localStorage.getItem("gc_company_access_token") : "";
    const tokenToMatch = String(portalEntry?.assigned_company_token || localToken || "").trim();
    if (!tokenToMatch) return [];
    const map = config?.clients && typeof config.clients === "object" ? config.clients : {};
    
    const staffEmails = Object.entries(map)
      .filter(([email, entry]) => {
        if (!entry || typeof entry !== "object") return false;
        const isClient = String(entry.account_type || "").toLowerCase() === "client";
        const matchesToken = String(entry.assigned_company_token || "").trim() === tokenToMatch;
        return !isClient && matchesToken;
      })
      .map(([email]) => email.toLowerCase().trim());
      
    const emailsSet = new Set(staffEmails);
    const uids = profiles
      .filter((p) => p && p.email && emailsSet.has(p.email.toLowerCase().trim()))
      .map((p) => String(p.uid || "").trim())
      .filter(Boolean);
      
    return uids;
  }, [config, portalEntry, profiles]);

  const allowedStaffUids = useMemo(() => {
    const configuredUids = portalStaff.map((s) => String(s?.uid || "").trim()).filter(Boolean);
    const combined = new Set([...configuredUids, ...staffFromSameToken]);
    return Array.from(combined);
  }, [portalStaff, staffFromSameToken]);

  const { data: companies = [] } = useQuery({
    queryKey: ["clientPortalCompanies", uid],
    queryFn: () => dbClient.entities.Company.listAll(),
    enabled: !!uid && portalChatEnabled,
    retry: false,
  });

  const { messages } = useDirectChatMessages(
    selectedThreadId,
    Boolean(selectedThreadId && portalChatEnabled),
  );

  const profileByUid = useMemo(() => {
    const map = new Map();
    profiles.forEach((p) => {
      const suid = String(p?.uid || "");
      if (suid) map.set(suid, p);
    });
    return map;
  }, [profiles]);

  const selfPortalProfile = useMemo(
    () => profiles.find((p) => String(p?.uid || "") === String(uid)),
    [profiles, uid]
  );

  const empresaGuestLinkedLabels = useMemo(() => {
    const raw = selfPortalProfile?.gc_empresa_portal_company_ids;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const ids = [...new Set(raw.map((x) => String(x || "").trim()).filter(Boolean))];
    return ids
      .map((id) => companies.find((c) => String(c.id || "") === id))
      .filter(Boolean)
      .map((c) => String(c.group_name || "").trim() || String(c.name || "").trim())
      .filter(Boolean);
  }, [selfPortalProfile, companies]);

  const allowedCompanies = useMemo(() => {
    const sorted = [...companies].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "pt-BR")
    );
    const explicit = portalCompanyIds
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    if (explicit.length > 0) {
      const set = new Set(explicit);
      return sorted.filter((c) => set.has(String(c.id || "")));
    }
    /** Se `portal_company_ids` ficou vazio no Firestore, inferir empresas pelos UID da equipa do portal */
    const staffUidSet = new Set(allowedStaffUids.map((id) => String(id || "").trim()).filter(Boolean));
    const inferred = sorted.filter((c) => staffUidSet.has(String(c.uid || "").trim()));
    return inferred.length > 0 ? inferred : [];
  }, [companies, portalCompanyIds, allowedStaffUids]);

  useEffect(() => {
    if (!requestedCompanyId) return;
    const allowed = allowedCompanies.some((c) => String(c.id || "") === requestedCompanyId);
    setCompanyFilterId(allowed ? requestedCompanyId : "all");
  }, [requestedCompanyId, allowedCompanies]);

  const filteredStaff = useMemo(() => {
    const term = String(userFilter || "").trim().toLowerCase();
    return allowedStaffUids
      .filter((suid) => {
        if (!term) return true;
        const p = profileByUid.get(suid);
        const label = profileLabel(p, suid).toLowerCase();
        const sector = String(staffMetaByUid.get(suid)?.sector || "").toLowerCase();
        return label.includes(term) || sector.includes(term);
      })
      .filter((suid) => {
        if (companyFilterId === "all") return true;
        const cid = String(companyFilterId || "").trim();

        const co = allowedCompanies.find((c) => String(c.id || "") === cid) || null;
        const assigneeRows = Array.isArray(co?.portal_sector_assignees) ? co.portal_sector_assignees : [];
        const assigneeUids = assigneeRows
          .map((r) => String(r?.uid || "").trim())
          .filter(Boolean);

        const companyIds = staffMetaByUid.get(suid)?.companyIds || [];
        const passesPortalStaffCompanies = companyIds.length === 0 || companyIds.includes(cid);

        /** Se há responsáveis por setor configurados na empresa, o cliente só vê esse subconjunto. */
        if (assigneeUids.length > 0) {
          return passesPortalStaffCompanies && assigneeUids.includes(suid);
        }

        return passesPortalStaffCompanies;
      });
  }, [
    allowedStaffUids,
    userFilter,
    companyFilterId,
    profileByUid,
    staffMetaByUid,
    allowedCompanies,
  ]);

  const selectedStaffMeta = useMemo(
    () => staffMetaByUid.get(selectedStaffUid) || { sector: "", companyIds: [] },
    [staffMetaByUid, selectedStaffUid]
  );

  const selectedStaffCompanies = useMemo(() => {
    if (!selectedStaffUid) return [];
    const idsFromStaff = Array.isArray(selectedStaffMeta.companyIds) ? selectedStaffMeta.companyIds : [];
    let ids =
      idsFromStaff.length > 0
        ? idsFromStaff
        : portalCompanyIds.length > 0
          ? portalCompanyIds
          : [];
    ids = ids.map((id) => String(id || "").trim()).filter(Boolean);
    if (ids.length === 0) return allowedCompanies;
    const set = new Set(ids);
    return allowedCompanies.filter((c) => set.has(String(c.id || "")));
  }, [selectedStaffUid, selectedStaffMeta, portalCompanyIds, allowedCompanies]);

  useEffect(() => {
    if (!selectedThreadId || !uid) return;
    dbClient.entities.DirectChatThread.markReadForUser(selectedThreadId, uid).catch(() => {});
  }, [selectedThreadId, uid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const ensureThreadMutation = useMutation({
    mutationFn: async (staffUid) => {
      const tid = await dbClient.entities.DirectChatThread.ensure(uid, staffUid);
      return { tid, staffUid };
    },
    onSuccess: ({ tid, staffUid }) => {
      autoChatInFlightRef.current = false;
      setSelectedStaffUid(staffUid);
      setSelectedThreadId(tid);
    },
    onError: (err) => {
      autoChatInFlightRef.current = false;
      autoChatFailCountRef.current += 1;
      window.alert(err?.message || "Não foi possível abrir o chat com este contato.");
    },
  });

  /**
   * Com o link (?token=…), entra já na conversação com o primeiro contacto disponível (ou ?staff=FIREBASE_UID do escritório).
   * Para escrever ainda é necessária conta Firebase válida para o cliente portal.
   */
  useEffect(() => {
    if (!portalChatEnabled || !uid) return;
    if (selectedThreadId) return;
    if (autoChatFailCountRef.current >= 5) return;
    if (autoChatInFlightRef.current) return;
    if (ensureThreadMutation.isPending) return;
    const list = filteredStaff.filter(Boolean);
    if (list.length === 0) return;
    const pick =
      staffUidFromLink && list.includes(staffUidFromLink) ? staffUidFromLink : list[0];
    if (!pick) return;
    autoChatInFlightRef.current = true;
    ensureThreadMutation.mutate(pick);
    // mutate é estável; filteredStaff estabiliza após perfis/hydration
  }, [
    portalChatEnabled,
    uid,
    selectedThreadId,
    filteredStaff,
    staffUidFromLink,
    ensureThreadMutation.isPending,
    ensureThreadMutation.mutate,
  ]);

  const sendMutation = useMutation({
    mutationFn: async (text) => {
      await dbClient.entities.DirectChatMessage.send({
        threadId: selectedThreadId,
        senderUid: uid,
        text,
      });
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["clientPortalMessages", selectedThreadId] });
      queryClient.invalidateQueries({ queryKey: ["clientPortalThreads", uid] });
    },
    onError: (err) => window.alert(err?.message || "Falha ao enviar mensagem."),
  });

  if (!uid) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Portal do Cliente</h1>
        <Card className="p-6">Faça login para acessar o portal do cliente.</Card>
      </div>
    );
  }

  if (!tokenStructuralOk) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Portal do Cliente</h1>
        <Card className="p-6 border-amber-300/50 bg-amber-500/10">
          Link inválido ou não autorizado para este cliente. Solicite um novo link ao administrador.
        </Card>
      </div>
    );
  }

  if (portalAccountSuspended) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Portal do Cliente</h1>
        <Card className="p-6 border-rose-200/60 bg-rose-500/10">
          Esta conta de portal foi suspensa na Gestão Contábil. Peça ao escritório para reativar o acesso.
        </Card>
      </div>
    );
  }

  if (!portalEntry?.is_paid) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portal do Cliente</h1>
          <p className={cn("text-sm mt-1", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
            O link está correto, mas o escritório só libera o chat depois de marcar o pagamento{" "}
            {empresaSyntheticEntry ? (
              <>
                deste convite por empresa como <strong className="text-foreground">confirmado</strong> na área{" "}
                <strong className="text-foreground">Configurações → Portal cliente da empresa</strong> (pagamento do convite).
              </>
            ) : (
              <>
                desta conta como <strong className="text-foreground">confirmado</strong> na Gestão Contábil (botão «Registrar
                pagamento» no cliente do portal).
              </>
            )}
          </p>
        </div>
        <Card className="p-6 border-indigo-200/60 bg-indigo-500/10 space-y-2">
          <p className="font-semibold text-foreground">Chat indisponível — pagamento pendente</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Assim que o administrador registar que o cliente está em dia contratualmente, o mesmo link volta a funcionar para
            conversar com a equipa. O token do portal continua válido.
          </p>
        </Card>
      </div>
    );
  }

  const inviteBannerLabel =
    String(empresaSyntheticEntry?.portal_display_label_invite || "").trim() ||
    empresaGuestLinkedLabels[0] ||
    "";
  const slugBanner = String(clienteEmpresaUrlSlug || "").trim();

  return (
    <div className="space-y-4 px-1 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {readOnlyChat ? "Portal da empresa — chat (só leitura)" : "Portal do Cliente"}
          </h1>
          <p className={cn("text-sm mt-1", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
            {readOnlyChat
              ? "Pode seguir a conversa com o escritório para esta empresa em leitura. Este convite (token EM no link) é só para quem deve acompanhar o chat pela empresa — não substitui o portal nem o token (CL) do cliente do escritório."
              : "O chat abre automaticamente com o primeiro contacto do escritório (ou com o indicado no link). Use a barra à esquerda para mudar de interlocutor."}
            {readOnlyChat && slugBanner ? (
              <span className="block mt-1 text-xs opacity-90">
                Endereço do convite: <span className="font-mono">/ClienteEmpresa/{slugBanner}</span>
              </span>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (window.confirm("Deseja realmente terminar sessão e sair do portal?")) {
              logout();
            }
          }}
          className="shrink-0 border-gray-200 text-slate-600 hover:bg-slate-50 self-start sm:self-center"
        >
          Sair / Terminar Sessão
        </Button>
      </div>

      {readOnlyChat && (inviteBannerLabel || empresaGuestLinkedLabels.length > 0) ? (
        <Card
          className={cn(
            "p-4 border-indigo-200/70 flex flex-wrap items-start gap-2",
            theme === "dark" ? "bg-indigo-950/40 border-indigo-800" : "bg-indigo-50"
          )}
        >
          <Building2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" aria-hidden />
          <div className="space-y-1 min-w-0">
            {inviteBannerLabel ? (
              <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                Convite neste momento: {inviteBannerLabel}
              </p>
            ) : null}
            {empresaGuestLinkedLabels.length > 0 ? (
              <p className="text-sm text-indigo-900/90 dark:text-indigo-200/95 leading-snug">
                <span className="font-medium">Empresas associadas à sua conta neste modo:</span>{" "}
                {empresaGuestLinkedLabels.join(", ")}
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card className="p-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              placeholder="Filtrar por usuário ou setor"
            />
            <select
              value={companyFilterId}
              onChange={(e) => setCompanyFilterId(e.target.value)}
              className={cn(
                "h-10 rounded-md border px-3 text-sm",
                theme === "dark" ? "bg-gray-950 border-gray-800" : "bg-white border-gray-200"
              )}
            >
              <option value="all">Todas as empresas</option>
              {allowedCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="h-10 rounded-md border px-3 flex items-center text-sm text-muted-foreground">
              <Search className="w-4 h-4 mr-2" />
              {filteredStaff.length} contato(s) encontrado(s)
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[min(72vh,700px)]">
            <Card
              className={cn(
                "order-2 lg:order-1 lg:col-span-4 p-3 space-y-2 border",
                theme === "dark" ? "bg-gray-900/80 border-gray-800" : "bg-white"
              )}
            >
              <h2 className="text-sm font-semibold">Contactos do escritório</h2>
              <ScrollArea className="h-[220px] md:h-[260px] pr-2">
                <div className="space-y-2">
                  {filteredStaff.map((suid) => {
                    const p = profileByUid.get(suid);
                    const meta = staffMetaByUid.get(suid) || {};
                    const selected = selectedStaffUid === suid;
                    return (
                      <button
                        key={suid}
                        type="button"
                        onClick={() => setSelectedStaffUid(suid)}
                        className={cn(
                          "w-full rounded-md border px-3 py-2 text-left",
                          selected ? "border-indigo-500 bg-indigo-500/10" : "border-gray-200 dark:border-gray-800"
                        )}
                      >
                        <p className="font-medium text-sm truncate">{profileLabel(p, suid)}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          Setor: {meta.sector || "Não informado"}
                        </p>
                      </button>
                    );
                  })}
                  {filteredStaff.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum contato nesse filtro.</p>
                  )}
                </div>
              </ScrollArea>

              <Button
                type="button"
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                disabled={!selectedStaffUid || ensureThreadMutation.isPending}
                onClick={() => ensureThreadMutation.mutate(selectedStaffUid)}
              >
                {ensureThreadMutation.isPending ? "A abrir chat…" : "Mudar de contacto"}
              </Button>

              <div className="rounded-md border p-2 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" /> Empresas do contacto
                </p>
                <ScrollArea className="h-32 pr-2">
                  <div className="space-y-1">
                    {selectedStaffCompanies.map((c) => (
                      <div key={c.id} className="text-xs rounded bg-muted/50 px-2 py-1">
                        {c.name}
                      </div>
                    ))}
                    {selectedStaffCompanies.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Escolha um contacto na lista quando abrir esta secção primeiro.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </Card>

            <Card
              className={cn(
                "order-1 lg:order-2 lg:col-span-8 border flex flex-col min-h-[56vh] md:min-h-[62vh]",
                theme === "dark" ? "bg-gray-900/80 border-gray-800" : "bg-white"
              )}
            >
              <div className="p-3 border-b border-gray-200 dark:border-gray-800">
                <p className="text-sm font-semibold">Chat</p>
                <p className="text-xs text-muted-foreground">
                  {readOnlyChat && selectedThreadId
                    ? "Modo leitura: pode ver as mensagens; não é possível responder por este link."
                    : selectedThreadId
                    ? "Converse aqui — o link com o token já o abriu automaticamente sempre que há contactos."
                    : ensureThreadMutation.isPending
                      ? "A abrir conversa com o escritório…"
                      : filteredStaff.length === 0
                        ? "Configure contactos portal na Gestão Contábil (equipa)."
                        : "Se o chat não abrir, utilize «Mudar de contacto» ao lado."}
                </p>
              </div>
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-3 pr-2">
                  {messages.map((m) => {
                    const mine = m.sender_uid === uid;
                    return (
                      <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                            mine ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-800"
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.text}</p>
                          <p className={cn("text-[10px] mt-1", mine ? "text-indigo-100" : "text-gray-500")}>
                            {m.created_at ? new Date(m.created_at).toLocaleString("pt-BR") : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {selectedThreadId && messages.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Sem mensagens ainda.</p>
                  )}
                  {!selectedThreadId && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {ensureThreadMutation.isPending
                        ? "A preparar chat…"
                        : "À espera da abertura automática ou escolha outro contacto."}
                    </p>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
              <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  placeholder={
                    readOnlyChat ? "Só leitura — não é possível enviar mensagens por este convite." : "Digite sua mensagem…"
                  }
                  disabled={readOnlyChat || !selectedThreadId || sendMutation.isPending}
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="bg-indigo-600 hover:bg-indigo-700"
                    disabled={
                      readOnlyChat || !selectedThreadId || !draft.trim() || sendMutation.isPending
                    }
                    onClick={() => {
                      if (readOnlyChat) return;
                      sendMutation.mutate(draft.trim());
                    }}
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Enviar
                  </Button>
                </div>
              </div>
            </Card>
          </div>
    </div>
  );
}

