/** Horário padrão do envio automático (24h), usado no worker no fuso FOLLOWUP_TIMEZONE (Brasília). */
export const DEFAULT_FOLLOWUP_SEND_TIME = "09:00";

export function normalizeFollowupSendTime(value) {
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return DEFAULT_FOLLOWUP_SEND_TIME;
  let hh = parseInt(m[1], 10);
  let mm = parseInt(m[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return DEFAULT_FOLLOWUP_SEND_TIME;
  hh = Math.min(23, Math.max(0, hh));
  mm = Math.min(59, Math.max(0, mm));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
