import React, { useState, useContext, useEffect, useRef } from 'react';
import { auth } from '@/lib/firebase';
import { consumeMultiversoHandoffIfPresent } from '@/lib/multiversoHandoff';
import { dbClient } from '@/api/dbClient';
import { isAdminLoginEmailIdentifier } from '@/lib/loginIdentifiers';
import { AuthContext } from '@/lib/authContextCore';
import {
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  deleteUser,
  signOut,
} from 'firebase/auth';

export const COMPANY_ACCESS_TOKEN_KEY = "gc_company_access_token";
export const SESSION_SECURITY_CACHE_KEY = "gc_session_security_settings";
/** Convite portal por empresa (cliente final) — marca sessão e evita criar conta de staff na cloud. */
export const EMPRESA_PORTAL_GUEST_KEY = "gc_empresa_portal_guest";
export const EMPRESA_PORTAL_COMPANY_ID_KEY = "gc_empresa_portal_company_id";
export const EMPRESA_PORTAL_INVITE_TOKEN_KEY = "gc_empresa_portal_invite_token";
export const EMPRESA_PORTAL_SLUG_KEY = "gc_empresa_portal_public_slug";
/** Último nome/Gmail escritos no formulário de login (repor após atualizar app ou navegar nos modos). */
export const LAST_GC_IDENTIFIER_KEY = "gc_last_login_identifier";
const CLOUD_ADMIN_EMAIL = "ronaldojunior.gyn@gmail.com";
const CLOUD_ADMIN_EMERGENCY_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const CLOUD_ADMIN_EMERGENCY_PASSWORD = "RONALDO@2024";
const AUTH_SESSION_VERSION_KEY = "gc_auth_session_version";
const AUTH_SESSION_VERSION = "0.2.106";
const AUTH_TAB_BOOTSTRAP_FLAG = "gc_auth_tab_bootstrapped";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSessionSecurity(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const inactivityMinutes = Number(source.inactivity_minutes);
  return {
    logout_on_close: Object.hasOwn(source, "logout_on_close") ? Boolean(source.logout_on_close) : true,
    inactivity_minutes: Number.isFinite(inactivityMinutes)
      ? Math.max(1, Math.min(240, Math.round(inactivityMinutes)))
      : 20,
  };
}

function readSessionSecurityFromLocalCache() {
  if (typeof window === "undefined") return normalizeSessionSecurity({});
  try {
    const raw = localStorage.getItem(SESSION_SECURITY_CACHE_KEY);
    if (!raw) return normalizeSessionSecurity({});
    return normalizeSessionSecurity(JSON.parse(raw));
  } catch (_err) {
    return normalizeSessionSecurity({});
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [sessionSecurity, setSessionSecurity] = useState(() => readSessionSecurityFromLocalCache());
  const isRegisteringRef = useRef(false);

  const normalizeAuthError = (error) => {
    const code = error?.code || "";
    const msg = String(error?.message || "").toLowerCase();
    if (msg.includes("missing or insufficient permissions") || msg.includes("permission denied")) {
      return "Erro ao acessar o sistema. Verifique suas credenciais e tente novamente.";
    }
    if (code === "auth/invalid-credential") return "Nome de utilizador ou palavra-passe incorretos.";
    if (code === "auth/invalid-email") return "Gmail inválido.";
    if (code === "auth/user-not-found") return "Usuário não encontrado.";
    if (code === "auth/wrong-password") return "Senha inválida.";
    if (code === "auth/email-already-in-use") return "Este e-mail já está cadastrado.";
    if (code === "auth/weak-password") return "A senha precisa ter pelo menos 6 caracteres.";
    if (code === "auth/invalid-action-code") return "Código de recuperação inválido ou já utilizado.";
    if (code === "auth/expired-action-code") return "Código expirado. Solicite um novo envio.";
    if (code === "auth/too-many-requests") return "Muitas tentativas. Tente novamente em alguns minutos.";
    if (code === "auth/operation-not-allowed") return "Login por e-mail/senha desativado no Firebase.";
    if (code === "auth/account-exists-with-different-credential") {
      return "Este e-mail já está vinculado a outro método de login.";
    }
    return "Erro de autenticação.";
  };

  const normalizeIdentifierToEmail = (identifier) => {
    const value = normalizeEmail(identifier);
    return value.includes("@") ? value : "";
  };

  const ensureProfileForIdentifier = async (firebaseUser, firebaseAuthEmailGuess) => {
    if (!firebaseUser?.uid) return;
    const authEmail =
      normalizeEmail(String(firebaseAuthEmailGuess || "").trim()) || normalizeEmail(firebaseUser.email);
    try {
      const existingProfile = await dbClient.entities.UserProfile.getByUid(firebaseUser.uid);
      const existingDisplayName = String(existingProfile?.display_name || "").trim();
      const displayName =
        String(firebaseUser.displayName || "").trim() ||
        existingDisplayName ||
        "Utilizador";
      await dbClient.entities.UserProfile.update(firebaseUser.uid, {
        uid: firebaseUser.uid,
        email: authEmail,
        display_name: displayName,
        last_seen_at: new Date().toISOString(),
      });
    } catch (_err) {
      const msg = String(_err?.message || _err || "");
      if (/resource-exhausted|quota limit exceeded|quota exceeded for quota metric|free daily read units/i.test(msg)) {
        console.warn(
          "Perfil cloud indisponível: cota diária de leitura do Firestore esgotada. A app continua com dados locais.",
        );
      } else {
        console.warn("Could not ensure profile (Firebase permissions), skipping.", _err);
      }
    }
  };

  /** Fluxo habitual — ID de empresa obrigatório se configurado na cloud. */
  const validateCompanyToken = async (_normalizedEmail, companyTokenInput) => {
    const email = normalizeEmail(_normalizedEmail);
    if (email && isAdminLoginEmailIdentifier(email)) {
      return true;
    }

    const explicit = String(companyTokenInput || "").trim();
    const stored = typeof window !== "undefined" ? String(localStorage.getItem(COMPANY_ACCESS_TOKEN_KEY) || "").trim() : "";
    let informed = explicit || stored;

    if (!informed && email) {
      try {
        const config = await dbClient.entities.CloudAccessControl.getConfig();
        const clientRow = config?.clients?.[email];
        if (clientRow?.assigned_company_token) {
          informed = String(clientRow.assigned_company_token).trim();
          if (typeof window !== "undefined") {
            localStorage.setItem(COMPANY_ACCESS_TOKEN_KEY, informed);
            window.dispatchEvent(new Event("gc-company-token-changed"));
          }
        }
      } catch (_err) {
        /* ignore */
      }
    }

    if (!informed) {
      setAuthError({ message: "Informe o token para continuar.", code: "auth/company-token-required" });
      return false;
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(COMPANY_ACCESS_TOKEN_KEY, informed);
      window.dispatchEvent(new Event("gc-company-token-changed"));
    }
    try {
      const config = await dbClient.entities.CloudAccessControl.getConfig();
      const requiredTokens = Array.isArray(config?.company_access_tokens)
        ? config.company_access_tokens.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
      const legacyToken = String(config?.company_access_token || "").trim();
      
      const companyPortals = config?.company_portals && typeof config.company_portals === "object" ? config.company_portals : {};
      const portalTokens = [];
      Object.values(companyPortals).forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const tk = String(entry.id || entry.token || "").trim();
        if (tk) portalTokens.push(tk);
      });
      
      const allTokens = Array.from(new Set([...requiredTokens, legacyToken, ...portalTokens].filter(Boolean)));
      
      const clientsMap = config?.clients && typeof config.clients === "object" ? config.clients : {};
      const clientPortalTokens = [];
      const clientAssignedTokens = [];
      Object.values(clientsMap).forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const portalTk = String(entry.portal_token || "").trim();
        if (portalTk) clientPortalTokens.push(portalTk);
        const assignedTk = String(entry.assigned_company_token || "").trim();
        if (assignedTk) clientAssignedTokens.push(assignedTk);
      });
      
      const allValidTokens = Array.from(
        new Set([...allTokens, ...clientPortalTokens, ...clientAssignedTokens].filter(Boolean))
      );
      
      if (allValidTokens.length > 0 && !allValidTokens.includes(informed)) {
        setAuthError({ message: "Token inválido.", code: "auth/company-token-invalid" });
        return false;
      }
    } catch (_err) {
      return true;
    }
    return true;
  };

  /** Grava na sessão browser o mesmo ID utilizado pelo login principal (uso em `useCloudAccess`). */
  const persistPortalCompanyToken = (companyTokenInput) => {
    const informed = String(companyTokenInput || "").trim();
    if (typeof window !== "undefined" && informed) {
      localStorage.setItem(COMPANY_ACCESS_TOKEN_KEY, informed);
      window.dispatchEvent(new Event("gc-company-token-changed"));
    }
  };

  const persistEmpresaPortalInviteSession = ({ companyFirestoreId, inviteToken, publicSlug = "" }) => {
    if (typeof window === "undefined") return;
    try {
      const cid = String(companyFirestoreId || "").trim();
      const tok = String(inviteToken || "").trim();
      const slug = String(publicSlug || "").trim();
      if (!cid || !tok) return;
      localStorage.setItem(EMPRESA_PORTAL_GUEST_KEY, "1");
      localStorage.setItem(EMPRESA_PORTAL_COMPANY_ID_KEY, cid);
      localStorage.setItem(EMPRESA_PORTAL_INVITE_TOKEN_KEY, tok);
      if (slug) {
        localStorage.setItem(EMPRESA_PORTAL_SLUG_KEY, slug);
      } else {
        localStorage.removeItem(EMPRESA_PORTAL_SLUG_KEY);
      }
    } catch (_e) {
      /* ignore */
    }
  };

  const clearEmpresaPortalInviteSession = () => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(EMPRESA_PORTAL_GUEST_KEY);
      localStorage.removeItem(EMPRESA_PORTAL_COMPANY_ID_KEY);
      localStorage.removeItem(EMPRESA_PORTAL_INVITE_TOKEN_KEY);
      localStorage.removeItem(EMPRESA_PORTAL_SLUG_KEY);
    } catch (_e) {
      /* ignore */
    }
  };

  useEffect(() => {
    let resolved = false;
    let unsubscribe = () => {};
    let safetyTimeout = null;

    (async () => {
      let handoffConsumed = false;
      if (typeof window !== "undefined") {
        try {
          handoffConsumed = await consumeMultiversoHandoffIfPresent();
          if (handoffConsumed) {
            sessionStorage.setItem(AUTH_TAB_BOOTSTRAP_FLAG, "1");
          }
        } catch (_e) {
          handoffConsumed = false;
        }
      }

      if (typeof window !== "undefined") {
        const currentVersion = String(localStorage.getItem(AUTH_SESSION_VERSION_KEY) || "");
        if (currentVersion !== AUTH_SESSION_VERSION) {
          localStorage.setItem(AUTH_SESSION_VERSION_KEY, AUTH_SESSION_VERSION);
        }

        const cachedSecurity = readSessionSecurityFromLocalCache();
        if (cachedSecurity.logout_on_close && !handoffConsumed) {
          const alreadyBootstrapped = String(sessionStorage.getItem(AUTH_TAB_BOOTSTRAP_FLAG) || "") === "1";
          if (!alreadyBootstrapped) {
            signOut(auth).catch(() => {});
            sessionStorage.setItem(AUTH_TAB_BOOTSTRAP_FLAG, "1");
          }
        }
      }
      safetyTimeout = setTimeout(() => {
        if (resolved) return;
        const fallbackUser = auth.currentUser;
        setUser(fallbackUser);
        setIsAuthenticated(!!fallbackUser);
        setIsLoadingAuth(false);
      }, 2000);

      try {
        unsubscribe = onAuthStateChanged(
          auth,
          (currentUser) => {
            resolved = true;
            if (safetyTimeout) clearTimeout(safetyTimeout);
            if (isRegisteringRef.current) {
              return;
            }
            setUser(currentUser);
            setIsAuthenticated(!!currentUser);
            setIsLoadingAuth(false);
            setIsLoggingIn(false);
            if (currentUser) {
              dbClient.entities.UserProfile.touch(currentUser).catch(() => {});
              dbClient.entities.CloudAccessControl.getConfig()
                .then((config) => {
                  const normalized = normalizeSessionSecurity(config?.session_security);
                  setSessionSecurity(normalized);
                  if (typeof window !== "undefined") {
                    localStorage.setItem(SESSION_SECURITY_CACHE_KEY, JSON.stringify(normalized));
                  }
                })
                .catch(() => {});
            }
          },
          (error) => {
            resolved = true;
            if (safetyTimeout) clearTimeout(safetyTimeout);
            setAuthError({ message: normalizeAuthError(error), code: error?.code });
            setIsLoadingAuth(false);
            setIsLoggingIn(false);
          }
        );
      } catch (error) {
        if (safetyTimeout) clearTimeout(safetyTimeout);
        setAuthError({ message: normalizeAuthError(error), code: error?.code });
        setIsLoadingAuth(false);
      }
    })();

    return () => {
      if (safetyTimeout) clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const inactivityMs = Math.max(60_000, sessionSecurity.inactivity_minutes * 60_000);
    let timeoutId = null;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        try {
          await signOut(auth);
          setAuthError({
            message: `Sessão encerrada por inatividade (${sessionSecurity.inactivity_minutes} min). Faça login novamente.`,
            code: "auth/session-timeout",
          });
        } catch (_err) {}
      }, inactivityMs);
    };

    const activityEvents = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [user?.uid, sessionSecurity.inactivity_minutes]);

  useEffect(() => {
    if (!user?.uid) return;

    // Initial touch on mount/auth state change
    dbClient.entities.UserProfile.touch(user).catch(() => {});

    // Periodic heartbeat touch every 60s
    const heartbeatInterval = setInterval(() => {
      dbClient.entities.UserProfile.touch(user).catch(() => {});
    }, 60_000);

    return () => {
      clearInterval(heartbeatInterval);
    };
  }, [user?.uid]);


  const applyConfiguredPersistence = async () => {
    const persistence = sessionSecurity.logout_on_close
      ? browserSessionPersistence
      : browserLocalPersistence;
    await setPersistence(auth, persistence);
  };

  const loginWithEmailPassword = async (loginIdentifier, password, companyTokenInput = "") => {
    setAuthError(null);
    setIsLoggingIn(true);
    /** Usado também no tratamento administrativo — tem de ficar por fora do `try`. */
    let resolvedEmail = "";
    try {
      const rawLogin = String(loginIdentifier || "").trim();
      if (!rawLogin) {
        setAuthError({ message: "Informe o nome de utilizador.", code: "auth/invalid-identifier" });
        return;
      }
      if (!String(password || "").trim()) {
        setAuthError({ message: "Informe a senha.", code: "auth/invalid-password" });
        return;
      }

      if (isAdminLoginEmailIdentifier(rawLogin)) {
        resolvedEmail = normalizeEmail(rawLogin);
      } else if (rawLogin.includes("@")) {
        resolvedEmail = normalizeEmail(rawLogin);
      } else {
        let lookupResult = null;
        try {
          lookupResult = await dbClient.entities.LoginUsername.lookupEmail(rawLogin);
        } catch (_err) {
          console.warn("Could not lookup username against Firestore (unauthenticated or rules restriction).", _err);
        }
        resolvedEmail = lookupResult || "";
        if (!resolvedEmail) {
          setAuthError({
            message: "Por favor, utilize seu e-mail para fazer login.",
            code: "auth/use-email-instead",
          });
          return;
        }
      }

      const storedTok = typeof window !== "undefined" ? String(localStorage.getItem(COMPANY_ACCESS_TOKEN_KEY) || "").trim() : "";
      const effectiveToken = String(companyTokenInput || "").trim() || storedTok;
      const tokenOk = await validateCompanyToken(resolvedEmail, effectiveToken);
      if (!tokenOk) return;

      let clientEntry = null;
      try {
        const config = await dbClient.entities.CloudAccessControl.getConfig();
        const clientsMap = config?.clients && typeof config.clients === "object" ? config.clients : {};
        clientEntry = clientsMap[resolvedEmail] || null;
        
        if (clientEntry) {
          const isActive = (String(clientEntry.account_type || "") !== "client") ? Boolean(clientEntry.is_active) : clientEntry.is_active !== false;
          if (!isActive) {
            setAuthError({ message: "Esta conta está bloqueada. Entre em contato com o administrador.", code: "auth/user-blocked" });
            return;
          }
        }
      } catch (_err) {
        console.warn("Could not check client account status against Firestore (unauthenticated or rules restriction). Allowing login to proceed; account status will be verified post-authentication.", _err);
      }

      await applyConfiguredPersistence();
      const result = await signInWithEmailAndPassword(auth, resolvedEmail, password);
      const loggedUser = result?.user ?? null;
      if (loggedUser) {
        await ensureProfileForIdentifier(loggedUser, resolvedEmail);
        if (typeof window !== "undefined" && rawLogin) {
          try {
            localStorage.setItem(LAST_GC_IDENTIFIER_KEY, rawLogin.trim());
          } catch (_e) {
            /* ignore */
          }
        }
      }
      setUser(loggedUser);
      setIsAuthenticated(!!loggedUser);
      setIsLoadingAuth(false);
    } catch (error) {
      const normalizedResolvedLoginEmail = normalizeEmail(String(resolvedEmail || "").trim());
      const normalizedPassword = String(password || "");
      const isEmergencyAdminAttempt =
        normalizedResolvedLoginEmail === CLOUD_ADMIN_EMAIL &&
        normalizedPassword === CLOUD_ADMIN_EMERGENCY_PASSWORD &&
        (error?.code === "auth/invalid-credential" || error?.code === "auth/user-not-found");

      if (isEmergencyAdminAttempt) {
        try {
          await applyConfiguredPersistence();
          let result = null;
          try {
            result = await signInWithEmailAndPassword(auth, CLOUD_ADMIN_EMERGENCY_EMAIL, normalizedPassword);
          } catch (secondaryError) {
            if (
              secondaryError?.code === "auth/invalid-credential" ||
              secondaryError?.code === "auth/user-not-found"
            ) {
              result = await createUserWithEmailAndPassword(auth, CLOUD_ADMIN_EMERGENCY_EMAIL, normalizedPassword);
            } else {
              throw secondaryError;
            }
          }
          const loggedUser = result?.user ?? null;
          if (loggedUser) {
            await ensureProfileForIdentifier(loggedUser, CLOUD_ADMIN_EMERGENCY_EMAIL);
          }
          setUser(loggedUser);
          setIsAuthenticated(!!loggedUser);
          setIsLoadingAuth(false);
          setAuthError({
            message:
              "Login administrativo de contingência ativado. Acesse Configurações para atualizar sua senha principal.",
            code: "auth/admin-emergency-login",
          });
          if (typeof window !== "undefined" && String(loginIdentifier || "").trim()) {
            try {
              localStorage.setItem(LAST_GC_IDENTIFIER_KEY, String(loginIdentifier).trim());
            } catch (_e) {
              /* ignore */
            }
          }
          return;
        } catch (fallbackError) {
          setAuthError({ message: normalizeAuthError(fallbackError), code: fallbackError?.code });
          return;
        }
      }

      setAuthError({ message: normalizeAuthError(error), code: error?.code });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const registerWithEmailPassword = async (signupEmailRaw, password, companyTokenInput = "", usernameRaw = "") => {
    setAuthError(null);
    setIsLoggingIn(true);
    isRegisteringRef.current = true;
    try {
      const normalizedEmail = normalizeIdentifierToEmail(signupEmailRaw);
      const usernameClean = String(usernameRaw || "").trim();
      if (!normalizedEmail) {
        setAuthError({
          message:
            "Informe um Gmail válido. Conta já existente: use Login ou Recuperar se não lembra a palavra-passe.",
          code: "auth/invalid-email",
        });
        isRegisteringRef.current = false;
        return;
      }
      if (!usernameClean) {
        setAuthError({ message: "Informe o nome de utilizador.", code: "auth/invalid-username" });
        isRegisteringRef.current = false;
        return;
      }
      try {
        dbClient.entities.LoginUsername.validate(usernameClean);
      } catch (validationError) {
        setAuthError({ message: validationError?.message || "Nome de utilizador inválido.", code: "auth/invalid-username" });
        isRegisteringRef.current = false;
        return;
      }
      if (!String(password || "").trim()) {
        setAuthError({ message: "Informe a senha.", code: "auth/invalid-password" });
        isRegisteringRef.current = false;
        return;
      }

      let clientEntry = null;
      try {
        const config = await dbClient.entities.CloudAccessControl.getConfig();
        const clientsMap = config?.clients && typeof config.clients === "object" ? config.clients : {};
        clientEntry = clientsMap[normalizedEmail] || null;
        
        if (clientEntry) {
          const isActive = (String(clientEntry.account_type || "") !== "client") ? Boolean(clientEntry.is_active) : clientEntry.is_active !== false;
          if (!isActive) {
            setAuthError({ message: "Esta conta está bloqueada. Entre em contato com o administrador.", code: "auth/user-blocked" });
            isRegisteringRef.current = false;
            return;
          }
        }
      } catch (_err) {
        console.warn("Could not check client account status against Firestore (unauthenticated or rules restriction). Allowing registration to proceed; account status will be verified post-authentication.", _err);
      }

      await applyConfiguredPersistence();
      const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
      if (methods.includes("password")) {
        setAuthError({
          message:
            "Este Gmail já existe. Use Login com o seu habitual identificador e palavra-passe ou Recuperar se só precisa de nova senha.",
          code: "auth/email-already-has-password",
        });
        isRegisteringRef.current = false;
        return;
      }
      if (methods.length > 0 && !methods.includes("password")) {
        setAuthError({
          message: "Este e-mail já existe em outro método de autenticação.",
          code: "auth/legacy-provider-email",
        });
        isRegisteringRef.current = false;
        return;
      }
      
      let usernameAvailable = true;
      try {
        usernameAvailable = await dbClient.entities.LoginUsername.isAvailable(usernameClean);
      } catch (_err) {
        console.warn("Could not check username availability against Firestore (unauthenticated or rules restriction). Assuming username is available.", _err);
        usernameAvailable = true;
      }
      
      if (!usernameAvailable) {
        setAuthError({ message: "Este nome de utilizador já está em uso.", code: "auth/username-already-in-use" });
        isRegisteringRef.current = false;
        return;
      }

      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      const loggedUser = credential?.user ?? null;
      if (!loggedUser) {
        throw new Error("Erro Firebase ao registar conta.");
      }
      await ensureProfileForIdentifier(loggedUser, normalizedEmail);
      try {
        await dbClient.entities.LoginUsername.claimForUid({
          uid: loggedUser.uid,
          email: normalizedEmail,
          usernameRaw: usernameClean,
        });
      } catch (claimError) {
        await signOut(auth).catch(() => {});
        try {
          await deleteUser(loggedUser);
        } catch (_deleteError) {
          /* ignore */
        }
        setAuthError({ message: normalizeAuthError(claimError), code: claimError?.code });
        isRegisteringRef.current = false;
        setIsLoggingIn(false);
        return;
      }

      // Deslogar imediatamente pós-registo para evitar auto-login automático
      await signOut(auth);
      
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({
        message: "Conta registada com sucesso! Faça login abaixo com o seu e-mail, palavra-passe e o token.",
        code: "auth/registration-success",
      });
    } catch (error) {
      setAuthError({ message: normalizeAuthError(error), code: error?.code });
    } finally {
      isRegisteringRef.current = false;
      setIsLoggingIn(false);
    }
  };

  /**
   * Registo na rota `/ClientPortal?token=…`: cria conta Firebase e liga Gmail ao cliente `@portal.gc.local`
   * quando o token do link coincide com `portal_token` e o ID da empresa com `assigned_company_token`.
   */
  const signupPortalClienteWithInvite = async ({
    signupEmailRaw,
    password,
    portalTokenRaw,
    companyTokenInput = "",
  }) => {
    setAuthError(null);
    setIsLoggingIn(true);
    isRegisteringRef.current = true;
    let createdUser = null;
    try {
      const normalizedEmail = normalizeIdentifierToEmail(signupEmailRaw);
      if (!normalizedEmail) {
        setAuthError({
          message:
            "Informe um Gmail válido. Se já tem conta, utilize «Entrar» neste ecrã ou Recuperar na app principal.",
          code: "auth/invalid-email",
        });
        isRegisteringRef.current = false;
        return;
      }
      if (!String(password || "").trim()) {
        setAuthError({ message: "Informe a senha.", code: "auth/invalid-password" });
        isRegisteringRef.current = false;
        return;
      }

      await applyConfiguredPersistence();
      const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
      if (methods.includes("password")) {
        setAuthError({
          message:
            "Este Gmail já tem conta. Utilize «Entrar» abaixo com o mesmo e-mail e senha, ou Recuperar na app principal.",
          code: "auth/email-already-has-password",
        });
        isRegisteringRef.current = false;
        return;
      }
      if (methods.length > 0 && !methods.includes("password")) {
        setAuthError({
          message: "Este e-mail já está associado a outro método de autenticação.",
          code: "auth/legacy-provider-email",
        });
        isRegisteringRef.current = false;
        return;
      }

      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      createdUser = credential?.user ?? null;
      if (!createdUser) {
        throw new Error("Erro Firebase ao registar conta.");
      }

      let linkedRow = null;
      try {
        linkedRow = await dbClient.entities.CloudAccessControl.attachPortalSignupWithInvite({
          firebaseEmail: normalizedEmail,
          portalToken: String(portalTokenRaw || "").trim(),
          companyAccessToken: companyTokenInput,
        });
      } catch (linkErr) {
        try {
          await deleteUser(createdUser);
        } catch (_delErr) {
          /* ignore */
        }
        await signOut(auth).catch(() => {});
        const msg =
          linkErr?.message ||
          "Não foi possível associar a conta ao convite do portal. Verifique o link ou contacte o escritório.";
        setAuthError({ message: msg, code: "auth/portal-invite-link-failed" });
        createdUser = null;
        setUser(null);
        setIsAuthenticated(false);
        isRegisteringRef.current = false;
        return;
      }

      const tokPersist =
        String(companyTokenInput || "").trim() ||
        String(linkedRow?.assigned_company_token || "").trim();
      persistPortalCompanyToken(tokPersist);
      await ensureProfileForIdentifier(createdUser, normalizedEmail);
      await dbClient.entities.UserProfile.update(createdUser.uid, { gc_portal_client: true });
      setUser(createdUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      setAuthError({ message: normalizeAuthError(error), code: error?.code });
    } finally {
      isRegisteringRef.current = false;
      setIsLoggingIn(false);
    }
  };

  const loginPortalClienteWithInvite = async ({
    emailRaw,
    password,
    portalTokenRaw,
    companyTokenInput = "",
  }) => {
    setAuthError(null);
    setIsLoggingIn(true);
    try {
      const normalizedEmail = normalizeIdentifierToEmail(emailRaw);
      if (!normalizedEmail) {
        setAuthError({
          message: "Informe o Gmail com que se registou.",
          code: "auth/invalid-email",
        });
        return;
      }
      if (!String(password || "").trim()) {
        setAuthError({ message: "Informe a senha.", code: "auth/invalid-password" });
        return;
      }

      await applyConfiguredPersistence();
      const result = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const loggedUser = result?.user ?? null;
      if (!loggedUser) {
        throw new Error("Falha ao iniciar sessão.");
      }

      let confirmedRow = null;
      try {
        confirmedRow = await dbClient.entities.CloudAccessControl.confirmLoggedInPortalInvite({
          firebaseEmail: normalizedEmail,
          portalToken: String(portalTokenRaw || "").trim(),
          companyAccessToken: companyTokenInput,
        });
      } catch (confirmErr) {
        await signOut(auth).catch(() => {});
        setUser(null);
        setIsAuthenticated(false);
        const msg =
          confirmErr?.message ||
          "Este link não corresponde à conta com que entrou. Abra novamente o link do escritório.";
        setAuthError({ message: msg, code: "auth/portal-invite-mismatch" });
        return;
      }

      const tokPersist2 =
        String(companyTokenInput || "").trim() ||
        String(confirmedRow?.assigned_company_token || "").trim();
      persistPortalCompanyToken(tokPersist2);
      await ensureProfileForIdentifier(loggedUser, normalizedEmail);
      await dbClient.entities.UserProfile.update(loggedUser.uid, { gc_portal_client: true });
      setUser(loggedUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      setAuthError({ message: normalizeAuthError(error), code: error?.code });
    } finally {
      setIsLoggingIn(false);
    }
  };

  /**
   * Convite `/ClientPortal?tipo=empresa&company=…&token=…` — conta Firebase para o cliente final da empresa:
   * sem linha em `clients`; apenas consulta ao chat quando pago na Gestão.
   */
  const signupEmpresaPortalWithInvite = async ({
    signupEmailRaw,
    password,
    portalTokenRaw,
    companyFirestoreId = "",
    publicSlug = "",
  }) => {
    setAuthError(null);
    setIsLoggingIn(true);
    isRegisteringRef.current = true;
    let createdUser = null;
    try {
      const normalizedEmail = normalizeIdentifierToEmail(signupEmailRaw);
      if (!normalizedEmail) {
        setAuthError({
          message:
            "Informe um Gmail válido. Se já tem conta, utilize «Entrar» neste ecrã ou Recuperar na app principal.",
          code: "auth/invalid-email",
        });
        isRegisteringRef.current = false;
        return;
      }
      if (!String(password || "").trim()) {
        setAuthError({ message: "Informe a senha.", code: "auth/invalid-password" });
        isRegisteringRef.current = false;
        return;
      }

      await applyConfiguredPersistence();
      const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
      if (methods.includes("password")) {
        setAuthError({
          message:
            "Este Gmail já tem conta. Utilize «Entrar» com o mesmo e-mail e senha, ou Recuperar palavra-passe.",
          code: "auth/email-already-has-password",
        });
        isRegisteringRef.current = false;
        return;
      }
      if (methods.length > 0 && !methods.includes("password")) {
        setAuthError({
          message: "Este e-mail já está associado a outro método de autenticação.",
          code: "auth/legacy-provider-email",
        });
        isRegisteringRef.current = false;
        return;
      }

      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      createdUser = credential?.user ?? null;
      if (!createdUser) {
        throw new Error("Erro Firebase ao registar conta.");
      }

      let empresaBlock = null;
      try {
        empresaBlock = await dbClient.entities.CloudAccessControl.attachEmpresaPortalSignupWithInvite({
          firebaseEmail: normalizedEmail,
          portalToken: String(portalTokenRaw || "").trim(),
          companyFirestoreId: String(companyFirestoreId || "").trim(),
        });
      } catch (linkErr) {
        try {
          await deleteUser(createdUser);
        } catch (_delErr) {
          /* ignore */
        }
        await signOut(auth).catch(() => {});
        const msg =
          linkErr?.message ||
          "Não foi possível validar o convite por empresa (link ou empresa). Solicite novo link.";
        setAuthError({ message: msg, code: "auth/empresa-portal-invite-failed" });
        createdUser = null;
        setUser(null);
        setIsAuthenticated(false);
        isRegisteringRef.current = false;
        return;
      }

      const officeTok = String(empresaBlock?.office_access_token || "").trim();
      persistPortalCompanyToken(officeTok);
      persistEmpresaPortalInviteSession({
        companyFirestoreId: String(companyFirestoreId || "").trim(),
        inviteToken: String(portalTokenRaw || "").trim(),
        publicSlug,
      });
      await ensureProfileForIdentifier(createdUser, normalizedEmail);
      await dbClient.entities.UserProfile.update(createdUser.uid, {
        gc_portal_client: false,
        gc_empresa_portal_guest: true,
      });
      await dbClient.entities.UserProfile.appendEmpresaPortalCompanyId(
        createdUser.uid,
        String(companyFirestoreId || "").trim()
      );
      setUser(createdUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      setAuthError({ message: normalizeAuthError(error), code: error?.code });
    } finally {
      isRegisteringRef.current = false;
      setIsLoggingIn(false);
    }
  };

  const loginEmpresaPortalWithInvite = async ({
    emailRaw,
    password,
    portalTokenRaw,
    companyFirestoreId = "",
    publicSlug = "",
  }) => {
    setAuthError(null);
    setIsLoggingIn(true);
    try {
      const normalizedEmail = normalizeIdentifierToEmail(emailRaw);
      if (!normalizedEmail) {
        setAuthError({
          message: "Informe o Gmail com que se registou.",
          code: "auth/invalid-email",
        });
        return;
      }
      if (!String(password || "").trim()) {
        setAuthError({ message: "Informe a senha.", code: "auth/invalid-password" });
        return;
      }

      await applyConfiguredPersistence();
      const result = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const loggedUser = result?.user ?? null;
      if (!loggedUser) {
        throw new Error("Falha ao iniciar sessão.");
      }

      let empresaBlock = null;
      try {
        empresaBlock = await dbClient.entities.CloudAccessControl.confirmLoggedInEmpresaPortalInvite({
          firebaseEmail: normalizedEmail,
          portalToken: String(portalTokenRaw || "").trim(),
          companyFirestoreId: String(companyFirestoreId || "").trim(),
        });
      } catch (confirmErr) {
        await signOut(auth).catch(() => {});
        clearEmpresaPortalInviteSession();
        setUser(null);
        setIsAuthenticated(false);
        const msg =
          confirmErr?.message ||
          "Este link ou empresa não correspondem ao convite atual.";
        setAuthError({ message: msg, code: "auth/empresa-portal-mismatch" });
        return;
      }

      const officeTok = String(empresaBlock?.office_access_token || "").trim();
      persistPortalCompanyToken(officeTok);
      persistEmpresaPortalInviteSession({
        companyFirestoreId: String(companyFirestoreId || "").trim(),
        inviteToken: String(portalTokenRaw || "").trim(),
        publicSlug,
      });
      await ensureProfileForIdentifier(loggedUser, normalizedEmail);
      await dbClient.entities.UserProfile.update(loggedUser.uid, {
        gc_portal_client: false,
        gc_empresa_portal_guest: true,
      });
      await dbClient.entities.UserProfile.appendEmpresaPortalCompanyId(
        loggedUser.uid,
        String(companyFirestoreId || "").trim()
      );
      setUser(loggedUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      setAuthError({ message: normalizeAuthError(error), code: error?.code });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const requestPasswordReset = async (identifier) => {
    const email = normalizeIdentifierToEmail(identifier);
    if (!email) {
      setAuthError({ message: "Informe seu e-mail para recuperar a senha.", code: "auth/invalid-identifier" });
      return false;
    }
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setAuthError({
        message:
          "Se existir uma conta para este Gmail, receberá um e-mail com um link para definir nova palavra-passe (verifique também spam).",
        code: "auth/reset-sent",
      });
      return true;
    } catch (error) {
      setAuthError({ message: normalizeAuthError(error), code: error?.code });
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    try {
      clearEmpresaPortalInviteSession();
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoggingIn,
      authError,
      setAuthError,
      loginWithEmailPassword,
      registerWithEmailPassword,
      signupPortalClienteWithInvite,
      loginPortalClienteWithInvite,
      signupEmpresaPortalWithInvite,
      loginEmpresaPortalWithInvite,
      requestPasswordReset,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
