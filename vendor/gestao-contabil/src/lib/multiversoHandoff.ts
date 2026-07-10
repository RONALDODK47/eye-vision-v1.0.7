const HANDOFF_PARAM = "mv_auth";

/**
 * Parâmetro legado de handoff Firebase — apenas limpa a URL para não exibir código na barra de endereços.
 * O login faz-se sempre no próprio domínio (Gestão) com utilizador/palavra-passe.
 */
export async function consumeMultiversoHandoffIfPresent(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const handoffId = String(params.get(HANDOFF_PARAM) || "").trim();
  if (!handoffId) return false;
  params.delete(HANDOFF_PARAM);
  const qs = params.toString();
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
  );
  return false;
}

export function hasMultiversoHandoffInUrl(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(String(new URLSearchParams(window.location.search).get(HANDOFF_PARAM) || "").trim());
}
