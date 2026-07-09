import { FormEvent, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  CF_FIELD_COL,
  CF_FIELD_ROW,
  CF_FORM_FIELDS,
  CF_FORM_INPUT_LONG,
  CF_LABEL,
} from '../contabilfacil/lib/formFieldClasses';
import { cn } from '../lib/utils';
import {
  useAuth,
  LAST_GC_IDENTIFIER_KEY,
  COMPANY_ACCESS_TOKEN_KEY,
} from './gestaoAuth';

type LoginMode = 'login' | 'signup' | 'admin' | 'recover';

const MODE_LABELS: Record<LoginMode, string> = {
  signup: 'Registar',
  login: 'Entrar',
  admin: 'Admin',
  recover: 'Recuperar',
};

export default function EyeVisionStaffLogin() {
  const {
    isLoggingIn,
    authError,
    setAuthError,
    loginWithEmailPassword,
    registerWithEmailPassword,
    requestPasswordReset,
  } = useAuth();

  const [mode, setMode] = useState<LoginMode>('login');
  const [identifier, setIdentifier] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [companyToken, setCompanyToken] = useState('');
  const [resetEmail, setResetEmail] = useState('');

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
    if (authError?.code === 'auth/registration-success') {
      setMode('login');
      if (signupEmail) setIdentifier(signupEmail);
    }
  }, [authError, signupEmail]);

  const authErrorMessage = authError?.message || '';
  const isSuccessState =
    authError?.code === 'auth/reset-sent' || authError?.code === 'auth/registration-success';

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    await loginWithEmailPassword(identifier.trim(), password, companyToken.trim());
  };

  const onAdminLogin = async (e: FormEvent) => {
    e.preventDefault();
    const email = identifier.trim().toLowerCase();
    if (
      email !== 'ronaldojunior.gyn@gmail.com' &&
      email !== 'ronaldojunior.gyn@usuario.local' &&
      email !== 'ronaldojunior.gyn.emergencia@usuario.local'
    ) {
      setAuthError({
        message: 'O acesso de administrador só é permitido para um e-mail de administrador autorizado.',
        code: 'auth/invalid-admin-email',
      });
      return;
    }
    await loginWithEmailPassword(identifier.trim(), password, '');
  };

  const onSignup = async (e: FormEvent) => {
    e.preventDefault();
    const p1 = String(password || '').trim();
    const p2 = String(password2 || '').trim();
    const usernameClean = String(signupUsername || '').trim();
    if (!usernameClean) {
      setAuthError({ message: 'Informe o nome de utilizador.', code: 'auth/invalid-username' });
      return;
    }
    if (p1 !== p2) return;
    await registerWithEmailPassword(signupEmail.trim(), password, '', usernameClean);
  };

  const onRecover = async (e: FormEvent) => {
    e.preventDefault();
    await requestPasswordReset(resetEmail.trim());
  };

  const hintText =
    mode === 'recover'
      ? 'Indique o Gmail da conta para receber o link de nova palavra-passe.'
      : mode === 'signup'
        ? 'Crie a conta com e-mail e nome de utilizador. O token não é necessário no registo.'
        : mode === 'admin'
          ? 'Acesso exclusivo para administradores — sem token.'
          : 'Entre com e-mail, palavra-passe e token do escritório.';

  return (
    <div className="h-screen bg-brand-bg text-brand-text font-sans flex flex-col overflow-hidden">
      <header className="h-14 border-b border-brand-border px-6 flex items-center shrink-0">
        <div className="font-black text-xl tracking-tighter">EYE VISION</div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-10 flex items-center justify-center">
        <div className="w-full max-w-md technical-panel p-6 md:p-8 space-y-5">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-black tracking-tighter uppercase italic">Acesso</h1>
            <p className="text-[10px] font-bold uppercase opacity-50 tracking-widest">
              Gestão Contábil · equipa
            </p>
          </div>

          <div className="cf-scroll-tabs flex flex-wrap gap-1 border border-brand-border p-1 bg-brand-sidebar/20">
            {(Object.keys(MODE_LABELS) as LoginMode[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={cn(
                  'px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-transparent transition-colors',
                  mode === key
                    ? 'bg-brand-border text-brand-bg border-brand-border'
                    : 'hover:bg-brand-sidebar/40',
                )}
              >
                {MODE_LABELS[key]}
              </button>
            ))}
          </div>

          <div
            className={cn(
              'border border-brand-border p-3 text-xs min-h-[2.75rem]',
              authErrorMessage
                ? isSuccessState
                  ? 'bg-emerald-50 text-emerald-900'
                  : 'bg-red-50 text-red-800'
                : 'bg-brand-sidebar/30 opacity-70',
            )}
          >
            {authErrorMessage || hintText}
          </div>

          {mode === 'recover' ? (
            <form className={CF_FORM_FIELDS} onSubmit={onRecover} autoComplete="on">
              <div className={CF_FIELD_COL}>
                <label htmlFor="ev-rec-email" className={CF_LABEL}>
                  Gmail da conta
                </label>
                <input
                  id="ev-rec-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  className={CF_FORM_INPUT_LONG}
                  value={resetEmail}
                  onChange={(ev) => setResetEmail(ev.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoggingIn || !resetEmail.trim()}
                className="technical-button-primary w-full flex items-center justify-center gap-2"
              >
                {isLoggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Enviar e-mail
              </button>
            </form>
          ) : (
            <form
              className={CF_FORM_FIELDS}
              onSubmit={mode === 'signup' ? onSignup : mode === 'admin' ? onAdminLogin : onLogin}
              autoComplete="on"
            >
              {mode === 'signup' ? (
                <>
                  <div className={CF_FIELD_COL}>
                    <label htmlFor="ev-su-email" className={CF_LABEL}>
                      E-mail
                    </label>
                    <input
                      id="ev-su-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      className={CF_FORM_INPUT_LONG}
                      value={signupEmail}
                      onChange={(ev) => setSignupEmail(ev.target.value)}
                      placeholder="seuemail@gmail.com"
                      required
                    />
                  </div>
                  <div className={CF_FIELD_COL}>
                    <label htmlFor="ev-su-username" className={CF_LABEL}>
                      Nome de utilizador
                    </label>
                    <input
                      id="ev-su-username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      className={CF_FORM_INPUT_LONG}
                      value={signupUsername}
                      onChange={(ev) => setSignupUsername(ev.target.value)}
                      placeholder="Ex: maria_escritorio"
                      required
                    />
                  </div>
                </>
              ) : (
                <div className={CF_FIELD_COL}>
                  <label htmlFor="ev-id" className={CF_LABEL}>
                    E-mail
                  </label>
                  <input
                    id="ev-id"
                    name="username"
                    type="email"
                    autoComplete="username"
                    className={CF_FORM_INPUT_LONG}
                    value={identifier}
                    onChange={(ev) => setIdentifier(ev.target.value)}
                    placeholder="seuemail@gmail.com"
                    required
                  />
                </div>
              )}

              {mode === 'signup' ? (
                <div className={CF_FIELD_COL}>
                  <label htmlFor="ev-pw-new" className={CF_LABEL}>
                    Palavra-passe
                  </label>
                  <input
                    id="ev-pw-new"
                    name="new-password"
                    type="password"
                    autoComplete="new-password"
                    aria-label="Palavra-passe"
                    className={CF_FORM_INPUT_LONG}
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                    required
                  />
                </div>
              ) : (
                <div className={CF_FIELD_COL}>
                  <label htmlFor="ev-pw" className={CF_LABEL}>
                    Palavra-passe
                  </label>
                  <input
                    id="ev-pw"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    aria-label="Palavra-passe"
                    className={CF_FORM_INPUT_LONG}
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                    required
                  />
                </div>
              )}

              {mode === 'login' ? (
                <div className={CF_FIELD_COL}>
                  <label htmlFor="ev-company" className={CF_LABEL}>
                    Token *
                  </label>
                  <input
                    id="ev-company"
                    name="organization-token"
                    type="text"
                    autoComplete="one-time-code"
                    className={CF_FORM_INPUT_LONG}
                    value={companyToken}
                    onChange={(ev) => {
                      const val = ev.target.value;
                      setCompanyToken(val);
                      try {
                        localStorage.setItem(COMPANY_ACCESS_TOKEN_KEY, val.trim());
                        window.dispatchEvent(new Event('gc-company-token-changed'));
                      } catch {
                        /* ignore */
                      }
                    }}
                    placeholder="Fornecido pelo administrador"
                    required
                  />
                </div>
              ) : null}

              {mode === 'signup' ? (
                <div className={CF_FIELD_COL}>
                  <label htmlFor="ev-pw2" className={CF_LABEL}>
                    Confirmar palavra-passe
                  </label>
                  <input
                    id="ev-pw2"
                    name="new-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    className={CF_FORM_INPUT_LONG}
                    value={password2}
                    onChange={(ev) => setPassword2(ev.target.value)}
                    required
                  />
                  {String(password || '') !== String(password2 || '') && password2 ? (
                    <p className="text-[10px] text-red-700 font-mono">As palavras-passe não coincidem.</p>
                  ) : null}
                </div>
              ) : null}

              <div className={CF_FIELD_ROW}>
                <button
                  type="submit"
                  disabled={
                    isLoggingIn ||
                    !password ||
                    (mode === 'signup'
                      ? !signupEmail.trim() ||
                        !signupUsername.trim() ||
                        String(password) !== String(password2)
                      : mode === 'admin'
                        ? !identifier.trim()
                        : !identifier.trim() || !companyToken.trim())
                  }
                  className={cn(
                    'technical-button-primary w-full flex items-center justify-center gap-2',
                    mode === 'admin' && 'bg-amber-900 border-amber-900 hover:bg-amber-800',
                  )}
                >
                  {isLoggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {mode === 'signup'
                    ? 'Criar conta'
                    : mode === 'admin'
                      ? 'Entrar como Administrador'
                      : 'Entrar'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <footer className="h-7 border-t border-brand-border bg-brand-sidebar flex items-center justify-center px-6 text-[9px] font-mono opacity-60 shrink-0">
        <span className="uppercase">Sessão protegida · Firebase</span>
      </footer>
    </div>
  );
}
