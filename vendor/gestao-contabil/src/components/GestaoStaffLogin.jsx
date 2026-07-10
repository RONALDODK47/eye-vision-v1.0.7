import React, { useEffect, useState } from "react";
import { useAuth, LAST_GC_IDENTIFIER_KEY, COMPANY_ACCESS_TOKEN_KEY } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

/**
 * Login da app principal (equipa / escritório): nome de utilizador GC + palavra‑passe.
 * O portal com convite continua em `PortalClienteInviteAuth`.
 */
export default function GestaoStaffLogin() {
  const {
    isLoggingIn,
    authError,
    setAuthError,
    loginWithEmailPassword,
    registerWithEmailPassword,
    requestPasswordReset,
  } = useAuth();

  const [mode, setMode] = useState("login");
  const [identifier, setIdentifier] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [companyToken, setCompanyToken] = useState("");
  const [resetEmail, setResetEmail] = useState("");



  useEffect(() => {
    try {
      const lastId = localStorage.getItem(LAST_GC_IDENTIFIER_KEY);
      if (lastId) setIdentifier(String(lastId).trim());
      const tok = localStorage.getItem(COMPANY_ACCESS_TOKEN_KEY);
      if (tok) setCompanyToken(String(tok).trim());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (authError?.code === "auth/registration-success") {
      setMode("login");
      if (signupEmail) {
        setIdentifier(signupEmail);
      }
    }
  }, [authError, signupEmail]);

  const authErrorMessage = authError?.message || "";
  const isSuccessState = authError?.code === "auth/reset-sent" || authError?.code === "auth/registration-success";

  const onLogin = async (e) => {
    e.preventDefault();
    await loginWithEmailPassword(identifier.trim(), password, companyToken.trim());
  };

  const onAdminLogin = async (e) => {
    e.preventDefault();
    const email = identifier.trim().toLowerCase();
    if (email !== "ronaldojunior.gyn@gmail.com" && email !== "ronaldojunior.gyn@usuario.local" && email !== "ronaldojunior.gyn.emergencia@usuario.local") {
      setAuthError({
        message: "O acesso de administrador só é permitido para um e-mail de administrador autorizado.",
        code: "auth/invalid-admin-email"
      });
      return;
    }
    await loginWithEmailPassword(identifier.trim(), password, "");
  };

  const onSignup = async (e) => {
    e.preventDefault();
    const p1 = String(password || "").trim();
    const p2 = String(password2 || "").trim();
    const usernameClean = String(signupUsername || "").trim();
    if (!usernameClean) {
      setAuthError({ message: "Informe o nome de utilizador.", code: "auth/invalid-username" });
      return;
    }
    if (p1 !== p2) return;
    await registerWithEmailPassword(signupEmail.trim(), password, "", usernameClean);
  };

  const onRecover = async (e) => {
    e.preventDefault();
    await requestPasswordReset(resetEmail.trim());
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-md p-6 space-y-4 my-6 shadow-md">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-bold">Gestão Contábil</h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {mode === "admin"
              ? "Acesso exclusivo para administradores — sem necessidade de token."
              : "Inicie sessão com o seu e-mail, palavra‑passe e o token. O registo de nova conta não requer o token."}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "signup" ? "default" : "outline"}
            className={mode === "signup" ? "bg-indigo-600 hover:bg-indigo-700 text-xs h-9" : "text-xs h-9"}
            onClick={() => setMode("signup")}
          >
            Registar
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
            variant={mode === "admin" ? "default" : "outline"}
            className={mode === "admin" ? "bg-amber-600 hover:bg-amber-700 text-xs h-9" : "text-xs h-9"}
            onClick={() => setMode("admin")}
          >
            Admin
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
            (mode === "recover"
              ? "Indique o Gmail da conta para receber o link de nova palavra‑passe."
              : mode === "signup"
                ? "Crie a conta com o seu e-mail e um nome de utilizador obrigatório. O nome de utilizador será usado dentro da aplicação."
                : mode === "admin"
                  ? "Acesso exclusivo para administradores — entre com as suas credenciais."
                  : "Entre com o seu e-mail, palavra‑passe e o token fornecido pelo administrador.")}
        </div>

        {mode === "recover" ? (
          <form className="space-y-3" onSubmit={onRecover}>
            <div className="space-y-1">
              <Label htmlFor="gc-rec-email">Gmail da conta</Label>
              <Input
                id="gc-rec-email"
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
          <form className="space-y-3" onSubmit={mode === "signup" ? onSignup : mode === "admin" ? onAdminLogin : onLogin}>
            {mode === "signup" ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="gc-su-email">E-mail</Label>
                  <Input
                    id="gc-su-email"
                    type="email"
                    autoComplete="email"
                    value={signupEmail}
                    onChange={(ev) => setSignupEmail(ev.target.value)}
                    placeholder="seuemail@gmail.com"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gc-su-username">Nome de utilizador</Label>
                  <Input
                    id="gc-su-username"
                    type="text"
                    autoComplete="username"
                    value={signupUsername}
                    onChange={(ev) => setSignupUsername(ev.target.value)}
                    placeholder="Ex: maria_escritorio"
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">Letras, números e _ (3–30 caracteres). Este nome será usado em todo o site.</p>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="gc-id">E-mail</Label>
                <Input
                  id="gc-id"
                  type="email"
                  autoComplete="email"
                  value={identifier}
                  onChange={(ev) => setIdentifier(ev.target.value)}
                  placeholder="seuemail@gmail.com"
                  required
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="gc-pw">Palavra‑passe</Label>
              <Input
                id="gc-pw"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                required
              />
            </div>
            {mode === "login" && (
              <div className="space-y-1">
                <Label htmlFor="gc-company">
                  Token *
                </Label>
                <Input
                  id="gc-company"
                  type="text"
                  autoComplete="off"
                  value={companyToken}
                  onChange={(ev) => {
                    const val = ev.target.value;
                    setCompanyToken(val);
                    try {
                      localStorage.setItem(COMPANY_ACCESS_TOKEN_KEY, val.trim());
                      window.dispatchEvent(new Event("gc-company-token-changed"));
                    } catch (_e) {}
                  }}
                  placeholder="Fornecido pelo administrador"
                  required
                />
              </div>
            )}
            {mode === "signup" ? (
              <div className="space-y-1">
                <Label htmlFor="gc-pw2">Confirmar palavra‑passe</Label>
                <Input
                  id="gc-pw2"
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
                !password ||
                (mode === "signup"
                  ? !signupEmail.trim() || !signupUsername.trim() || String(password) !== String(password2)
                  : mode === "admin"
                    ? !identifier.trim()
                    : !identifier.trim() || !companyToken.trim())
              }
              className={`w-full ${mode === "admin" ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
            >
              {isLoggingIn ? (
                <span className="inline-flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" />
                  A processar…
                </span>
              ) : mode === "signup" ? (
                "Criar conta"
              ) : mode === "admin" ? (
                "Entrar como Administrador"
              ) : (
                "Entrar"
              )}
            </Button>
          </form>
        )}

      </Card>
    </div>
  );
}
