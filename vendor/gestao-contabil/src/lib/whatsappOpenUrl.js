/** Como abrir o WhatsApp quando o fluxo é manual (sem Cloud API). */
export const WHATSAPP_OPEN_WEB = "web";
export const WHATSAPP_OPEN_WA_ME = "wa_me";
export const WHATSAPP_OPEN_APP = "app";
/** URL montada a partir de um modelo (Digisak, Onvio, etc.) — ver localStorage `whatsapp_open_custom_url`. */
export const WHATSAPP_OPEN_CUSTOM = "custom";

const CUSTOM_URL_KEY = "whatsapp_open_custom_url";

export function getWhatsAppOpenTarget() {
  if (typeof window === "undefined") return WHATSAPP_OPEN_WEB;
  return localStorage.getItem("whatsapp_open_target") || WHATSAPP_OPEN_WEB;
}

export function getWhatsAppOpenCustomTemplate() {
  if (typeof window === "undefined") return "";
  return String(localStorage.getItem(CUSTOM_URL_KEY) || "").trim();
}

/**
 * Substitui placeholders no link que você colou.
 * - {phone} — só dígitos com DDI (ex.: 5564999497911)
 * - {text} ou {text_url} — mensagem com encodeURIComponent (uso em query string)
 * - {text_raw} — texto sem codificar (cuidado com & e ? na mensagem)
 */
export function applyCustomWhatsAppUrlTemplate(template, phoneDigits, message) {
  const text = message != null ? String(message) : "";
  const enc = encodeURIComponent(text);
  return String(template || "")
    .replace(/\{phone\}/g, phoneDigits)
    .replace(/\{text_url\}/g, enc)
    .replace(/\{text\}/g, enc)
    .replace(/\{text_raw\}/g, text);
}

/**
 * @param {string} phoneDigits - só dígitos, com DDI (ex.: 5564999497911)
 * @param {string} [message]
 * @returns {string} URL ou "" se inválido
 */
export function buildWhatsAppOpenUrl(phoneDigits, message) {
  const digits = String(phoneDigits || "").replace(/\D/g, "");
  if (!digits) return "";
  const text = message != null ? String(message) : "";
  const target = getWhatsAppOpenTarget();

  if (target === WHATSAPP_OPEN_CUSTOM) {
    const tpl = getWhatsAppOpenCustomTemplate();
    if (!tpl) {
      const q = new URLSearchParams();
      q.set("phone", digits);
      if (text) q.set("text", text);
      return `https://web.whatsapp.com/send?${q.toString()}`;
    }
    return applyCustomWhatsAppUrlTemplate(tpl, digits, text);
  }

  if (target === WHATSAPP_OPEN_APP) {
    const q = new URLSearchParams();
    q.set("phone", digits);
    if (text) q.set("text", text);
    return `whatsapp://send?${q.toString()}`;
  }

  if (target === WHATSAPP_OPEN_WA_ME) {
    const base = `https://wa.me/${digits}`;
    return text ? `${base}?text=${encodeURIComponent(text)}` : base;
  }

  const q = new URLSearchParams();
  q.set("phone", digits);
  if (text) q.set("text", text);
  return `https://web.whatsapp.com/send?${q.toString()}`;
}

export function openWhatsAppChat(phoneDigits, message) {
  const url = buildWhatsAppOpenUrl(phoneDigits, message);
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}
