import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { pagesConfig } from "./pages.config";
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from "react-router-dom";
import PageNotFound from "./lib/PageNotFound";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import React, { useMemo, useState, Suspense } from "react";
import { useCloudAccess } from "@/lib/useCloudAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UsernameMandatoryGate from "@/components/UsernameMandatoryGate";
import PortalClienteInviteAuth from "@/components/PortalClienteInviteAuth";
import GestaoStaffLogin from "@/components/GestaoStaffLogin";
import { APP_VERSION } from "@/config/appRelease";

const { Pages, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;


/** Interface nativa Eye Vision — sem sidebar legado (`Layout.jsx`). */
const LayoutWrapper = ({ children }) => <>{children}</>;

export const AuthenticatedApp = () => {
  const location = useLocation();
  const { isAuthenticated, isLoadingAuth, logout } = useAuth();
  const {
    isLoading: isLoadingCloudAccess,
    canUseSystem,
    isPortalClient,
    allowClientPortalRoutesUnpaid,
    clientEntry,
    billingClientEntry,
    companyTokenOk,
    empresaPortalSession,
    requiredCompanyTokens,
    config,
    tabAccess,
    isAdminEmail,
    isMasterUser,
    internalStaffFullAccess,
  } = useCloudAccess();

  const [newTokenInput, setNewTokenInput] = useState("");
  const [tokenError, setTokenError] = useState("");

  const handleUpdateToken = (e) => {
    e.preventDefault();
    const tok = String(newTokenInput || "").trim();
    if (!tok) {
      setTokenError("Por favor, introduza o token.");
      return;
    }
    const tokenList = (requiredCompanyTokens || []).map((t) => String(t || "").trim()).filter(Boolean);
    
    let isPortalTokenValid = false;
    if (tok.startsWith("CL-")) {
      const map = config?.clients && typeof config.clients === "object" ? config.clients : {};
      const foundClient = Object.values(map).find(
        (entry) => entry && String(entry.portal_token || "").trim() === tok
      );
      if (foundClient) {
        isPortalTokenValid = true;
      }
    }

    if (!isPortalTokenValid && tokenList.length > 0 && !tokenList.includes(tok)) {
      setTokenError("Token inválido. Confirme com o administrador.");
      return;
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("gc_company_access_token", tok);
    }
    setTokenError("");
    window.location.reload();
  };

  const empresaSlugFromLocation = useMemo(() => {
    if (!location.pathname.startsWith("/ClienteEmpresa/")) return "";
    const seg = location.pathname.slice("/ClienteEmpresa/".length).split("/")[0] || "";
    return decodeURIComponent(String(seg || "").trim());
  }, [location.pathname]);

  /** Link canónico do convite empresa (persiste após login; redireccionamentos preservam empresa). */
  const empresaClientePortalHref = useMemo(() => {
    const tok = String(empresaPortalSession?.inviteToken || "").trim();
    const comp = String(empresaPortalSession?.companyId || "").trim();
    if (!tok || !comp) return "";
    const slug = String(
      empresaPortalSession?.publicSlug ||
        empresaPortalSession?.block?.portal_public_slug ||
        "",
    ).trim();
    if (slug) {
      const q = new URLSearchParams({ token: tok, v: APP_VERSION });
      return `/ClienteEmpresa/${encodeURIComponent(slug)}?${q.toString()}`;
    }
    const q = new URLSearchParams({
      token: tok,
      company: comp,
      tipo: "empresa",
      v: APP_VERSION,
    });
    return `/ClientPortal?${q.toString()}`;
  }, [
    empresaPortalSession?.block?.portal_public_slug,
    empresaPortalSession?.companyId,
    empresaPortalSession?.inviteToken,
    empresaPortalSession?.publicSlug,
    APP_VERSION,
  ]);

  /** `/ClientPortal?token=…&company=…` a partir dos dados gravados na cloud (staff). */
  const defaultClientPortalHref = useMemo(() => {
    const token = String(clientEntry?.portal_token || "").trim();
    if (!token) return "/ClientPortal";
    const q = new URLSearchParams({ token });
    const comp = String(clientEntry?.portal_default_company_id || "").trim();
    if (comp) q.set("company", comp);
    const ids = Array.isArray(clientEntry?.portal_staff_uids)
      ? clientEntry.portal_staff_uids.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const uidFromObjs = Array.isArray(clientEntry?.portal_staff)
      ? String(clientEntry.portal_staff[0]?.uid || "").trim()
      : "";
    const preferStaff = ids[0] || uidFromObjs;
    if (preferStaff) q.set("staff", preferStaff);
    q.set("v", APP_VERSION);
    return `/ClientPortal?${q.toString()}`;
  }, [
    clientEntry?.portal_default_company_id,
    clientEntry?.portal_token,
    clientEntry?.portal_staff_uids,
    clientEntry?.portal_staff,
    APP_VERSION,
  ]);

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const spInvite = new URLSearchParams(location.search);
    const portalTkInvite = String(spInvite.get("token") || "").trim();
    const openPortalClienteInvite =
      (location.pathname === "/ClientPortal" && portalTkInvite) ||
      (Boolean(empresaSlugFromLocation) && portalTkInvite);
    if (openPortalClienteInvite) {
      return <PortalClienteInviteAuth pathEmpresaSlug={empresaSlugFromLocation} />;
    }
    return <GestaoStaffLogin />;
  }

  if (!companyTokenOk && isAuthenticated && !isLoadingCloudAccess) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-md border border-gray-100">
          <h1 className="mb-2 text-2xl font-bold text-slate-900">Token Alterado</h1>
          <p className="mb-6 text-sm text-slate-600 leading-relaxed">
            O token foi alterado na cloud ou está incorreto.
            Para continuar a utilizar a aplicação, por favor introduza o novo token fornecido pelo seu administrador.
          </p>
          <form onSubmit={handleUpdateToken} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="app-new-token" className="text-xs font-semibold text-slate-700">
                Novo token
              </label>
              <Input
                id="app-new-token"
                type="text"
                autoComplete="off"
                placeholder="Ex: CGE-XXXX-YYYY"
                value={newTokenInput}
                onChange={(e) => {
                  setNewTokenInput(e.target.value);
                  setTokenError("");
                }}
                className="w-full"
                required
              />
              {tokenError && (
                <p className="text-xs text-red-600 font-medium">{tokenError}</p>
              )}
            </div>
            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
              Confirmar e Aceder
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={logout}
              className="w-full border-gray-200 text-slate-600 hover:bg-slate-50"
            >
              Voltar ao Login / Sair
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const loadingSpinnerEl = (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
    </div>
  );

  const ClientPortalPageUnpaidComp = Pages.ClientPortal;
  const unpaidPortalTarget =
    (location.pathname === "/ClientPortal" || location.pathname.startsWith("/ClienteEmpresa/")) &&
    location.search
      ? `${location.pathname}${location.search}`
      : empresaClientePortalHref || defaultClientPortalHref;
  const unpaidPortalRoutesEl = (
    <Routes>
      <Route path="/ClientPortal" element={<ClientPortalPageUnpaidComp />} />
      <Route path="/ClienteEmpresa/:slug" element={<ClientPortalPageUnpaidComp />} />
      <Route path="*" element={<Navigate to={unpaidPortalTarget} replace />} />
    </Routes>
  );

  const isPortalAcctBlock = String(clientEntry?.account_type || "").toLowerCase() === "client";
  const billingUnpaidStaffBlock = !isPortalAcctBlock && billingClientEntry && !billingClientEntry.is_paid;
  const selfInactiveBlock = Boolean(clientEntry && clientEntry.is_active === false);
  const missingCloudEntry = !clientEntry;
  const blockedAccessEl = (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow-md">
        <h1 className="mb-2 text-2xl font-bold">Acesso bloqueado</h1>
        {missingCloudEntry ? (
          <p className="mb-3 text-gray-700">
            Esta sessão Firebase não aparece registada neste escritório. Use o link correto enviado pela equipa ou o token de acesso.
          </p>
        ) : selfInactiveBlock ? (
          <p className="mb-3 text-gray-700">
            Esta conta foi desativada. Peça ao administrador para remover o bloqueio na Gestão Contábil.
          </p>
        ) : isPortalAcctBlock && !companyTokenOk ? (
          <p className="mb-3 text-gray-700">
            O vínculo portal / escritório não coincide com a sessão actual. Utilize de novo o link do portal ou contacte o escritório.
          </p>
        ) : isPortalAcctBlock ? (
          <p className="mb-3 text-gray-700">
            O portal pode estar temporariamente indisponível para esta conta. Solicite um link novo ao escritório.
          </p>
        ) : billingUnpaidStaffBlock ? (
          <p className="mb-3 text-gray-700">
            O escritório cliente associado ao seu token está com pagamento pendente para esta licença.
          </p>
        ) : (
          <p className="mb-3 text-gray-700">
            Seu acesso está pausado. Verifique o vínculo com o cliente pagador ou fale com o administrador.
          </p>
        )}
        <p className="text-sm text-gray-600">
          Conta própria: pagamento{" "}
          {String(clientEntry?.account_type || "").toLowerCase() === "client"
            ? clientEntry?.is_paid
              ? "confirmado"
              : "pendente"
            : billingClientEntry?.is_paid
              ? "confirmado pelo cliente vínculo"
              : clientEntry?.is_paid
                ? "flag legada ativa"
                : "ligado ao cliente vínculo"}{" "}
          | conta{" "}
          {!clientEntry
            ? "sem registo na cloud nesta sessão"
            : clientEntry.is_active === false
              ? "suspensa (Gestão)"
              : "ativa operacional"}
          {billingClientEntry && !isPortalAcctBlock ? (
            <>
              {" "}
              | cliente referência ({billingClientEntry.email}){" "}
              {billingClientEntry.is_active ? "" : "(inativo)"}{" "}
              {billingClientEntry.is_paid ? "" : "(pendente financeiro)"}
            </>
          ) : null}
          .
        </p>
      </div>
    </div>
  );

  const ClientPortalPagePaidComp = Pages.ClientPortal;
  const portalPaidHomeHref = empresaClientePortalHref || defaultClientPortalHref;

  const paidPortalRoutesEl = (
    <Routes>
      <Route path="/ClientPortal" element={<ClientPortalPagePaidComp />} />
      <Route path="/ClienteEmpresa/:slug" element={<ClientPortalPagePaidComp />} />
      <Route path="*" element={<Navigate to={portalPaidHomeHref} replace />} />
    </Routes>
  );

  const mainAppRoutesEl = (
    <Routes>
      <Route
        path="/"
        element={
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        }
      />
      {Object.entries(Pages).map(([path, Page]) => {
        if (path === "administrator" && !isAdminEmail) return null;
        if (path === "Users" && !isAdminEmail && !isMasterUser && !internalStaffFullAccess) return null;
        const hasAccess = path in tabAccess ? tabAccess[path] : true;
        if (!hasAccess) {
          return null;
        }
        return (
          <Route
            key={path}
            path={`/${path}`}
            element={
              <LayoutWrapper currentPageName={path}>
                <Page />
              </LayoutWrapper>
            }
          />
        );
      })}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );

  const isPortalRoute =
    location.pathname === "/ClientPortal" || location.pathname.startsWith("/ClienteEmpresa/");

  return (
    <UsernameMandatoryGate>
      <Suspense fallback={loadingSpinnerEl}>
        {isLoadingCloudAccess
          ? loadingSpinnerEl
          : !canUseSystem
            ? (allowClientPortalRoutesUnpaid && isPortalRoute)
              ? unpaidPortalRoutesEl
              : blockedAccessEl
            : (isPortalClient && isPortalRoute)
              ? paidPortalRoutesEl
              : mainAppRoutesEl}
      </Suspense>
    </UsernameMandatoryGate>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
