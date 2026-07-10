/** Deteta cota diária do Firestore (plano Spark / free tier). */
export function isFirestoreQuotaError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("resource-exhausted") ||
    msg.includes("quota limit exceeded") ||
    msg.includes("quota exceeded for quota metric") ||
    msg.includes("free daily read units")
  );
}

export const FIRESTORE_QUOTA_USER_MESSAGE =
  "Limite diário de leituras do Firebase (plano gratuito) atingido. Os dados em cache do navegador continuam visíveis. A cota repõe à meia-noite (horário do Pacífico) ou ative faturamento Blaze no projeto Google Cloud.";

export function toFirestoreQuotaError() {
  return new Error("FIRESTORE_QUOTA");
}
