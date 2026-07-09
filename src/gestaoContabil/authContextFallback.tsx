import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export const COMPANY_ACCESS_TOKEN_KEY = 'gc_company_access_token';
export const SESSION_SECURITY_CACHE_KEY = 'gc_session_security_cache';
export const LAST_GC_IDENTIFIER_KEY = 'gc_last_identifier';
export const EMPRESA_PORTAL_GUEST_KEY = 'gc_empresa_portal_guest';
export const EMPRESA_PORTAL_COMPANY_ID_KEY = 'gc_empresa_portal_company_id';
export const EMPRESA_PORTAL_INVITE_TOKEN_KEY = 'gc_empresa_portal_invite_token';
export const EMPRESA_PORTAL_SLUG_KEY = 'gc_empresa_portal_slug';

const SESSION_KEY = 'gc_auth_session_v1';
const USERS_KEY = 'gc_auth_users_v1';

type AuthError = { message: string; code: string } | null;

type AuthUser = {
  uid: string;
  email: string;
  display_name?: string;
};

type StoredUser = {
  email: string;
  password: string;
  display_name?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  isLoggingIn: boolean;
  authError: AuthError;
  setAuthError: (error: AuthError) => void;
  loginWithEmailPassword: (identifier: string, password: string, companyToken: string) => Promise<void>;
  registerWithEmailPassword: (
    email: string,
    password: string,
    _companyToken: string,
    username?: string,
  ) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

const ADMIN_EMAILS = new Set([
  'ronaldojunior.gyn@gmail.com',
  'ronaldojunior.gyn@usuario.local',
  'ronaldojunior.gyn.emergencia@usuario.local',
]);

const AuthContext = createContext<AuthContextValue | null>(null);

function readUsers(): Record<string, StoredUser> {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, StoredUser>) : {};
  } catch {
    return {};
  }
}

function writeUsers(users: Record<string, StoredUser>): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function normalizeEmail(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function buildUid(email: string): string {
  return `uid_${email.replace(/[^a-z0-9]/gi, '_')}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<AuthError>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.email) {
          setUser({
            uid: String(parsed.uid || buildUid(String(parsed.email))),
            email: normalizeEmail(String(parsed.email)),
            display_name: String(parsed.display_name || ''),
          });
        }
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  const loginWithEmailPassword = async (
    identifier: string,
    password: string,
    companyToken: string,
  ): Promise<void> => {
    const email = normalizeEmail(identifier);
    const pass = String(password || '');
    const token = String(companyToken || '').trim();

    setIsLoggingIn(true);
    setAuthError(null);
    try {
      if (!email || !pass) {
        setAuthError({ message: 'Informe e-mail e palavra-passe.', code: 'auth/invalid-credentials' });
        return;
      }

      const isAdmin = ADMIN_EMAILS.has(email);
      const users = readUsers();
      const registered = users[email];

      if (!isAdmin) {
        if (!registered) {
          setAuthError({ message: 'Conta não encontrada. Faça o registo primeiro.', code: 'auth/user-not-found' });
          return;
        }
        if (registered.password !== pass) {
          setAuthError({ message: 'Palavra-passe inválida.', code: 'auth/wrong-password' });
          return;
        }
      }

      if (!isAdmin && !token) {
        setAuthError({ message: 'Informe o token da empresa.', code: 'auth/missing-company-token' });
        return;
      }

      const nextUser: AuthUser = {
        uid: buildUid(email),
        email,
        display_name: registered?.display_name || email.split('@')[0] || 'utilizador',
      };

      setUser(nextUser);
      localStorage.setItem(SESSION_KEY, JSON.stringify(nextUser));
      localStorage.setItem(LAST_GC_IDENTIFIER_KEY, email);
      if (token) {
        localStorage.setItem(COMPANY_ACCESS_TOKEN_KEY, token);
        window.dispatchEvent(new Event('gc-company-token-changed'));
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const registerWithEmailPassword = async (
    emailRaw: string,
    passwordRaw: string,
    _companyToken: string,
    username?: string,
  ): Promise<void> => {
    const email = normalizeEmail(emailRaw);
    const password = String(passwordRaw || '');
    const displayName = String(username || '').trim();

    setIsLoggingIn(true);
    setAuthError(null);
    try {
      if (!email || !password) {
        setAuthError({ message: 'Informe e-mail e palavra-passe.', code: 'auth/invalid-registration' });
        return;
      }

      const users = readUsers();
      if (users[email]) {
        setAuthError({ message: 'Este e-mail já está registado.', code: 'auth/email-already-in-use' });
        return;
      }

      users[email] = { email, password, display_name: displayName };
      writeUsers(users);
      setAuthError({
        message: 'Conta registada com sucesso. Entre com suas credenciais.',
        code: 'auth/registration-success',
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const requestPasswordReset = async (emailRaw: string): Promise<void> => {
    const email = normalizeEmail(emailRaw);
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      if (!email) {
        setAuthError({ message: 'Informe o e-mail da conta.', code: 'auth/invalid-email' });
        return;
      }
      setAuthError({
        message: 'Pedido registado. No fallback local, redefina a senha pelo registo da conta.',
        code: 'auth/reset-sent',
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async (): Promise<void> => {
    setUser(null);
    setAuthError(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoadingAuth,
      isLoggingIn,
      authError,
      setAuthError,
      loginWithEmailPassword,
      registerWithEmailPassword,
      requestPasswordReset,
      logout,
    }),
    [authError, isLoadingAuth, isLoggingIn, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
