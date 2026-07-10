import React, { useMemo, useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { dbClient } from "@/api/dbClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

/**
 * Ecrã do link `/ClientPortal?token=…` ou `/ClienteEmpresa/:slug?token=…`:
 * cliente identifica‑se só com Gmail e palavra‑passe; o escritório garante URLs de convite inequívocos (um par token↔portal).
 *
 * @param {{ pathEmpresaSlug?: string }} props
 */
export default function PortalClienteInviteAuth({ pathEmpresaSlug = "" }) {
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const slugFromPath = String(pathEmpresaSlug || "").trim();
  const portalToken = String(params.get("token") || "").trim();
  const companyFirestoreIdQuery = String(params.get("company") || "").trim();
  const isEmpresaTipoLegacy = String(params.get("tipo") || "").trim().toLowerCase() === "empresa";

  const {
    data: aliasRow,
    isLoading: aliasLoading,
    isError: aliasError,
  } = useQuery({
    queryKey: ["portalPublicAliasLanding", slugFromPath],
    queryFn: () => dbClient.entities.CloudAccessControl.getPortalPublicAliasBySlug(slugFromPath),
    enabled: Boolean(slugFromPath),
    staleTime: 60_000,
    retry: false,
  });

  const companyFirestoreId = slugFromPath
    ? String(aliasRow?.company_id || "").trim()
    : companyFirestoreIdQuery;
  const empresaInviteLabelPreAuth = slugFromPath ? String(aliasRow?.label || "").trim() : "";

  const isEmpresaInvite =
    Boolean(portalToken) &&
    Boolean(companyFirestoreId) &&
    (Boolean(slugFromPath) || isEmpresaTipoLegacy);

  const {
    isLoggingIn,
    authError,
    signupPortalClienteWithInvite,
    loginPortalClienteWithInvite,
    signupEmpresaPortalWithInvite,
    loginEmpresaPortalWithInvite,
    requestPasswordReset,
  } = useAuth();

  const [mode, setMode] = useState("simple");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [companyToken, setCompanyToken] = useState(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      return String(sp.get("token") || "").trim();
    } catch {
      return "";
    }
  });
  const [resetEmail, setResetEmail] = useState("");
  const [clientName, setClientName] = useState("");

  const authErrorMessage = authError?.message || "";
  const isSuccessState = authError?.code === "auth/reset-sent" || authError?.code === "auth/registration-success";

  const handleSimpleLogin = async (e) => {
    e.preventDefault();
    const name = String(clientName || "").trim();
    const tok = String(portalToken || "").trim();
    const compId = String(companyFirestoreId || "").trim();

    if (!name) {
      alert("Por favor, informe seu nome.");
      return;
    }
    if (!tok || !compId) {
      alert("Token ou empresa inválidos. Por favor, use o link completo enviado pelo escritório.");
      return;
    }

    let empresaBlock = null;
    try {
      empresaBlock = await dbClient.entities.CloudAccessControl.confirmLoggedInEmpresaPortalInvite({
        firebaseEmail: "",
        portalToken: tok,
        companyFirestoreId: compId,
      });
    } catch (error) {
      alert(error?.message || "Token inválido. Verifique o link ou contate o escritório.");
      return;
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("gc_empresa_portal_simple_login", "1");
      localStorage.setItem("gc_empresa_portal_guest", "1");
      localStorage.setItem("gc_empresa_portal_company_id", compId);
      localStorage.setItem("gc_empresa_portal_invite_token", tok);
      localStorage.setItem("gc_empresa_portal_client_name", name);
      if (slugFromPath) {
        localStorage.setItem("gc_empresa_portal_public_slug", slugFromPath);
      }
      const officeTok = String(empresaBlock?.office_access_token || "").trim();
      if (officeTok) {
        localStorage.setItem("gc_company_access_token", officeTok);
      }
      window.dispatchEvent(new Event("gc-company-token-changed"));
      window.location.reload();
    }
  };

  const subtitle = useMemo(
    () =>
      isEmpresaInvite
        ? "Convite apenas para um contacto da empresa ver o histórico com o escritório. " +
          "Você pode entrar rapidamente com seu nome e o token, ou criar uma conta com seu Gmail para acessar novamente futuramente."
        : "Para enviar mensagens no portal é necessária uma sessão Firebase com o seu Gmail e palavra‑passe. " +
          "O token no endereço apenas ativa o modo portal depois de estar autenticado e com pagamento ativo.",
    [isEmpresaInvite]
  );

  const title = isEmpresaInvite ? "Portal — chat da empresa" : "Portal do cliente";

  const publicSlugForSession = slugFromPath;

  const onSignup = async (e) => {
    e.preventDefault();
    const p1 = String(password || "").trim();
    const p2 = String(password2 || "").trim();
    if (p1 !== p2) return;
    if (isEmpresaInvite) {
      await signupEmpresaPortalWithInvite({
        signupEmailRaw: email.trim(),
        password: password,
        portalTokenRaw: portalToken,
        companyFirestoreId,
        publicSlug: publicSlugForSession,
      });
      await queryClient.invalidateQueries({ queryKey: ["cloudAccessControlConfig"] });
      return;
    }
    await signupPortalClienteWithInvite({
      signupEmailRaw: email.trim(),
      password: password,
      portalTokenRaw: portalToken,
      companyTokenInput: "",
    });
    await queryClient.invalidateQueries({ queryKey: ["cloudAccessControlConfig"] });
  };

  const onLogin = async (e) => {
    e.preventDefault();
    // Guardar o token da empresa no localStorage para que o utilizador possa aceder ao software
    const enteredToken = companyToken.trim();
    if (enteredToken && typeof window !== "undefined") {
      localStorage.setItem("gc_company_access_token", enteredToken);
    }
    if (isEmpresaInvite) {
      await loginEmpresaPortalWithInvite({
        emailRaw: email.trim(),
        password,
        portalTokenRaw: portalToken,
        companyFirestoreId,
        publicSlug: publicSlugForSession,
      });
      await queryClient.invalidateQueries({ queryKey: ["cloudAccessControlConfig"] });
      return;
    }
    await loginPortalClienteWithInvite({
      emailRaw: email.trim(),
      password,
      portalTokenRaw: portalToken,
      companyTokenInput: enteredToken,
    });
    await queryClient.invalidateQueries({ queryKey: ["cloudAccessControlConfig"] });
  };

  const onRecover = async (e) => {
    e.preventDefault();
    await requestPasswordReset(resetEmail.trim());
  };

  if (slugFromPath && !portalToken) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md p-6 space-y-4 my-6 shadow-md">
          <h1 className="text-xl font-bold text-center">Convite incompleto</h1>
          <p className="text-sm text-muted-foreground leading-relaxed text-center">
            Este endereço personalizado precisa do token na consulta (?token=…). Peça o link completo ao escritório.
          </p>
        </Card>
      </div>
    );
  }

  if (slugFromPath && aliasLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-50 p-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
        <p className="text-sm text-muted-foreground">A carregar convite da empresa…</p>
      </div>
    );
  }

  if (slugFromPath && (aliasError || !aliasRow || !companyFirestoreId)) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md p-6 space-y-4 my-6 shadow-md">
          <h1 className="text-xl font-bold text-center">Empresa não encontrada</h1>
          <p className="text-sm text-muted-foreground leading-relaxed text-center">
            Este link personalizado não está activo ou foi alterado. Peça ao escritório o endereço actualizado ou regenere o
            convite em Configurações.
          </p>
        </Card>
      </div>
    );
  }

  if (isEmpresaTipoLegacy && (!companyFirestoreIdQuery || !portalToken)) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md p-6 space-y-4 my-6 shadow-md">
          <h1 className="text-xl font-bold text-center">Convite incompleto</h1>
          <p className="text-sm text-muted-foreground leading-relaxed text-center">
            O convite por empresa neste formato antigo deve incluir empresa e token na consulta. Peça ao escritório o
            endereço actualizado ou use o link com o nome da empresa no endereço.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-md p-6 space-y-4 my-6 shadow-md">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-xs text-muted-foreground leading-relaxed">{subtitle}</p>
          {empresaInviteLabelPreAuth ? (
            <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 pt-2">
              Empresa convidante:{" "}
              <span className="font-bold text-indigo-950 dark:text-indigo-50">{empresaInviteLabelPreAuth}</span>
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {isEmpresaInvite && (
            <Button
              type="button"
              size="sm"
              variant={mode === "simple" ? "default" : "outline"}
              className={mode === "simple" ? "bg-indigo-600 hover:bg-indigo-700 text-xs h-9" : "text-xs h-9"}
              onClick={() => setMode("simple")}
            >
              Rápido
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant={mode === "signup" ? "default" : "outline"}
            className={mode === "signup" ? "bg-indigo-600 hover:bg-indigo-700 text-xs h-9" : "text-xs h-9"}
            onClick={() => setMode("signup")}
          >
            Criar conta
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "login" ? "default" : "outline"}
            className={mode === "login" ? "bg-indigo-600 hover:bg-indigo-700 text-xs h-9" : "text-xs h-9"}
            onClick={() => setMode("login")}
          >
            Entrar
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "recover" ? "default" : "outline"}
            className={mode === "recover" ? "bg-indigo-600 hover:bg-indigo-700 text-xs h-9" : "text-xs h-9"}
            onClick={() => setMode("recover")}
          >
            Recuperar
          </Button>
        </div>

        <div
          className={`rounded-md p-3 text-sm min-h-[2.75rem] ${
            authErrorMessage
              ? isSuccessState
                ? "bg-emerald-100 text-emerald-900"
                : "bg-red-100 text-red-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {authErrorMessage ||
            (isEmpresaInvite
              ? "Informe primeiro o Gmail da conta Firebase — o nome de utilizador para login na app será o passo seguinte."
              : "Use o link completo enviado pelo escritório (?token=…). Não é pedido ID de empresa neste ecrã.")}
        </div>

        {mode === "simple" && isEmpresaInvite ? (
          <form className="space-y-3" onSubmit={handleSimpleLogin}>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Entre rapidamente com seu nome para acessar o chat da empresa.
            </p>
            <div className="space-y-1">
              <Label htmlFor="portal-client-name">Seu nome</Label>
              <Input
                id="portal-client-name"
                type="text"
                autoComplete="name"
                value={clientName}
                onChange={(ev) => setClientName(ev.target.value)}
                placeholder="Digite seu nome"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={isLoggingIn || !clientName.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {isLoggingIn ? (
                <span className="inline-flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" />
                  A entrar…
                </span>
              ) : (
                "Entrar no portal"
              )}
            </Button>
          </form>
        ) : mode === "recover" ? (
          <form className="space-y-3" onSubmit={onRecover}>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Enviamos um Gmail com link seguro para definir nova senha nesta conta Firebase.
            </p>
            <div className="space-y-1">
              <Label htmlFor="portal-rec-email">Gmail registado nesta conta</Label>
              <Input
                id="portal-rec-email"
                type="email"
                autoComplete="email"
                value={resetEmail}
                onChange={(ev) => setResetEmail(ev.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={isLoggingIn || !resetEmail.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {isLoggingIn ? (
                <span className="inline-flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" />
                  A enviar…
                </span>
              ) : (
                "Enviar e‑mail"
              )}
            </Button>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={mode === "signup" ? onSignup : onLogin}>
            <div className="space-y-1">
              <Label htmlFor="portal-email">
                Gmail <span className="text-muted-foreground font-normal">(conta Firebase)</span>
              </Label>
              <Input
                id="portal-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="portal-pw">Palavra‑passe</Label>
              <Input
                id="portal-pw"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                required
              />
            </div>
            {mode === "login" && (
              <div className="space-y-1">
                <Label htmlFor="portal-company">ID da empresa / token de cliente *</Label>
                <Input
                  id="portal-company"
                  type="text"
                  autoComplete="off"
                  value={companyToken}
                  onChange={(ev) => setCompanyToken(ev.target.value)}
                  placeholder="Ex: CL-FN14-AZ4ZV81Y"
                  required
                />
              </div>
            )}
            {mode === "signup" ? (
              <div className="space-y-1">
                <Label htmlFor="portal-pw2">Confirmar palavra‑passe</Label>
                <Input
                  id="portal-pw2"
                  type="password"
                  autoComplete="new-password"
                  value={password2}
                  onChange={(ev) => setPassword2(ev.target.value)}
                  required
                />
                {String(password || "") !== String(password2 || "") && password2 ? (
                  <p className="text-xs text-red-600">As palavras‑passe não coincidem.</p>
                ) : null}
              </div>
            ) : null}
            <Button
              type="submit"
              disabled={
                isLoggingIn ||
                !email.trim() ||
                !password ||
                (mode === "signup"
                  ? String(password) !== String(password2)
                  : !companyToken.trim())
              }
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {isLoggingIn ? (
                <span className="inline-flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" />
                  A processar…
                </span>
              ) : mode === "signup" ? (
                "Criar conta e entrar no portal"
              ) : (
                "Entrar no portal"
              )}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
