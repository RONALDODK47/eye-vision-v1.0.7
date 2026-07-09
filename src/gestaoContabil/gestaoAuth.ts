/**
 * Ponto único de importação do auth da Gestão — evita duas instâncias do React Context.
 * Fallback local para o Eye Vision (sem dependência do pacote @gestao).
 */
export {
  AuthProvider,
  useAuth,
  COMPANY_ACCESS_TOKEN_KEY,
  SESSION_SECURITY_CACHE_KEY,
  LAST_GC_IDENTIFIER_KEY,
  EMPRESA_PORTAL_GUEST_KEY,
  EMPRESA_PORTAL_COMPANY_ID_KEY,
  EMPRESA_PORTAL_INVITE_TOKEN_KEY,
  EMPRESA_PORTAL_SLUG_KEY,
} from './authContextFallback';
