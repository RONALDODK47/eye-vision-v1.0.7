import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey, sanitizeGeminiModel } from "../gemini-client.mjs";

/** Modelo padrão alinhado ao free tier do projeto */
export const DEFAULT_GEMINI_MODEL = sanitizeGeminiModel("gemini-2.5-flash");

/** @type {Map<string, GoogleGenAI>} */
const clientCache = new Map();

/**
 * @param {string} [apiKey]
 * @returns {GoogleGenAI}
 */
export function getGeminiClient(apiKey) {
  const resolvedKey = apiKey?.trim() || getGeminiApiKey();
  if (!resolvedKey) {
    throw new Error(
      "A chave GEMINI_API_KEY não foi encontrada nas configurações. Por favor, adicione-a em Settings > Secrets no AI Studio.",
    );
  }

  if (!clientCache.has(resolvedKey)) {
    clientCache.set(
      resolvedKey,
      new GoogleGenAI({
        apiKey: resolvedKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      }),
    );
  }

  return clientCache.get(resolvedKey);
}

/**
 * @param {unknown} error
 * @returns {string}
 */
export function formatGeminiErrorMessage(error) {
  const errorStr =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : JSON.stringify(error);

  const isQuota =
    /429|RESOURCE_EXHAUSTED|quota|Quota|rate limit|exhausted/i.test(errorStr);

  let parsedMessage = "";
  try {
    const parsed = JSON.parse(errorStr);
    parsedMessage = String(parsed?.error?.message ?? parsed?.message ?? "").trim();
  } catch {
    parsedMessage = errorStr;
  }

  if (isQuota || /429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(parsedMessage)) {
    const modelMatch = parsedMessage.match(/model[s]?:\s*([^\s,]+)/i);
    const modelHint = modelMatch?.[1] ? ` (${modelMatch[1]})` : "";
    return (
      `Limite de uso do Gemini atingido${modelHint}. ` +
      "Aguarde cerca de 1 minuto e tente novamente. " +
      "Se persistir, use gemini-2.5-flash nas configurações de IA (Contábil → IA)."
    );
  }

  const msg = parsedMessage || errorStr;
  return msg.length > 320 ? `${msg.slice(0, 320)}…` : msg;
}

/**
 * @param {string} errorStr
 * @param {number} fallbackMs
 * @returns {number}
 */
function parseRetryDelayMs(errorStr, fallbackMs) {
  const match = errorStr.match(/retry(?:Delay|In)?["']?\s*[:=]\s*"?(\d+(?:\.\d+)?)s"?/i);
  if (match) {
    return Math.ceil(Number(match[1]) * 1000) + 500;
  }
  return fallbackMs;
}

/**
 * @param {GoogleGenAI} ai
 * @param {string} model
 * @param {unknown[]} contents
 * @param {Record<string, unknown>} config
 * @param {number} [retries=5]
 * @param {number} [delay=3000]
 * @returns {Promise<{ text?: string, [key: string]: unknown }>}
 */
export async function generateContentWithRetry(ai, model, contents, config, retries = 5, delay = 3000) {
  let lastError = null;
  let currentModel = sanitizeGeminiModel(model);

  const fallbackModels = [
    "gemini-2.5-flash",
    "gemini-3-flash-preview",
    "gemini-2.5-flash-lite",
    "gemini-3.1-flash-lite-preview",
  ].map(sanitizeGeminiModel);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Gemini API] Chamando modelo: ${currentModel} (Tentativa ${attempt} de ${retries})`);
      const response = await ai.models.generateContent({
        model: currentModel,
        contents,
        config,
      });
      return response;
    } catch (error) {
      lastError = error;
      const status = error.status || error.statusCode || 0;
      const errorStr = typeof error === "string" ? error : error.message || JSON.stringify(error);
      console.warn(
        `[Gemini API] Tentativa ${attempt} de ${retries} falhou para o modelo ${currentModel} com erro: ${errorStr.slice(0, 500)}`,
      );

      const isTransient =
        status === 503 ||
        status === 429 ||
        errorStr.includes("UNAVAILABLE") ||
        errorStr.includes("high demand") ||
        errorStr.includes("503") ||
        errorStr.includes("429") ||
        errorStr.includes("quota") ||
        errorStr.includes("Quota") ||
        errorStr.includes("exhausted") ||
        errorStr.includes("RESOURCE_EXHAUSTED") ||
        errorStr.includes("rate limit");

      if (!isTransient) {
        throw new Error(formatGeminiErrorMessage(error));
      }

      if (attempt < retries) {
        const currentIndex = fallbackModels.indexOf(currentModel);
        const nextIndex = (currentIndex !== -1 ? currentIndex + 1 : 0) % fallbackModels.length;
        const nextFallback = fallbackModels[nextIndex];
        if (nextFallback && nextFallback !== currentModel) {
          console.log(`[Gemini API] Rotacionando modelo. Próxima tentativa: ${nextFallback}`);
          currentModel = nextFallback;
        }

        const waitMs = parseRetryDelayMs(errorStr, delay * attempt);
        console.log(`[Gemini API] Aguardando ${waitMs}ms antes de retry…`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      } else {
        throw new Error(formatGeminiErrorMessage(error));
      }
    }
  }

  throw new Error(formatGeminiErrorMessage(lastError));
}
