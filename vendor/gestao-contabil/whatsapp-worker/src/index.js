const WHATSAPP_API_VERSION = "v21.0";
const textEncoder = new TextEncoder();
let tokenCache = {
  accessToken: "",
  expiresAtMs: 0,
};

/** Necessário para o app no Firebase Hosting chamar /api/* no worker (POST + JSON). */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key, X-Api-Key",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
    },
  });
}

function base64Url(inputBytes) {
  const binary = Array.from(inputBytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

function phonesMatch(a, b) {
  const p1 = normalizePhone(a);
  const p2 = normalizePhone(b);
  if (!p1 || !p2) return false;
  return p1 === p2 || p1.endsWith(p2) || p2.endsWith(p1);
}

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return nowIso().split("T")[0];
}

function addDaysIso(baseIso, days) {
  const d = new Date(baseIso || todayIso());
  d.setDate(d.getDate() + Number(days || 1));
  return d.toISOString().split("T")[0];
}

const DEFAULT_FOLLOWUP_TZ = "America/Sao_Paulo";

function getFollowupTimeZone(env) {
  const z = String(env?.FOLLOWUP_TIMEZONE || "").trim();
  return z || DEFAULT_FOLLOWUP_TZ;
}

/** Data e hora local no fuso configurado (para comparar com next_followup_date + followup_send_time). */
function zonedYmdHm(ms, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ms));
  const pick = (t) => parts.find((p) => p.type === t)?.value || "";
  const y = pick("year");
  const mo = pick("month");
  const d = pick("day");
  let h = String(pick("hour") || "0");
  let min = String(pick("minute") || "0");
  h = h.padStart(2, "0");
  min = min.padStart(2, "0");
  return { date: `${y}-${mo}-${d}`, time: `${h}:${min}` };
}

function normalizeFollowupHm(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "09:00";
  let hh = parseInt(m[1], 10);
  let mm = parseInt(m[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return "09:00";
  hh = Math.min(23, Math.max(0, hh));
  mm = Math.min(59, Math.max(0, mm));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function compareHm(a, b) {
  return normalizeFollowupHm(a).localeCompare(normalizeFollowupHm(b));
}

/** Soma dias a um YYYY-MM-DD (calendário, sem DST). */
function addDaysToYmd(ymd, days) {
  const parts = String(ymd || "").split("-").map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return todayIso();
  const [y, mo, d] = parts;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * @param {{ next_followup_date?: string, followup_send_time?: string }} thread
 * @param {string} zDate YYYY-MM-DD no fuso do envio
 * @param {string} zTime HH:mm no fuso do envio
 * @param {{ ignoreTime?: boolean }} opts — run-now ignora horário
 */
function followupCalendarDue(thread, zDate, zTime, opts = {}) {
  const due = String(thread.next_followup_date || "").trim();
  if (!due) return false;
  if (opts.ignoreTime) {
    return due <= zDate;
  }
  if (zDate > due) return true;
  if (zDate < due) return false;
  return compareHm(zTime, normalizeFollowupHm(thread.followup_send_time)) >= 0;
}

function assertRequiredEnv(env, keys) {
  for (const key of keys) {
    if (!String(env[key] || "").trim()) {
      throw new Error(`Variavel de ambiente obrigatoria ausente: ${key}`);
    }
  }
}

function whatsAppAccessToken(env) {
  return String(env?.WHATSAPP_ACCESS_TOKEN || "").trim();
}

function whatsAppPhoneNumberId(env) {
  return String(env?.WHATSAPP_PHONE_NUMBER_ID || "").trim();
}

function getApiKeyFromRequest(request) {
  return String(request.headers.get("x-api-key") || "").trim();
}

function requireInternalApiKey(request, env) {
  const configured = String(env.INTERNAL_API_KEY || "").trim();
  const incoming = getApiKeyFromRequest(request);
  return !!configured && incoming === configured;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in value) {
    const out = {};
    const fields = value.mapValue.fields || {};
    for (const [k, v] of Object.entries(fields)) out[k] = fromFirestoreValue(v);
    return out;
  }
  return null;
}

function decodeFirestoreDocument(doc) {
  const name = String(doc?.name || "");
  const id = name.split("/").pop();
  const fields = doc?.fields || {};
  const out = { id };
  for (const [k, v] of Object.entries(fields)) {
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

function encodeFirestoreFields(data) {
  const fields = {};
  for (const [k, v] of Object.entries(data || {})) {
    fields[k] = toFirestoreValue(v);
  }
  return { fields };
}

function firestoreBaseUrl(env) {
  const projectId = String(env.FIREBASE_PROJECT_ID || "").trim();
  const databaseId = String(env.FIREBASE_DATABASE_ID || "(default)").trim();
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
}

async function importPrivateKey(privateKeyPem) {
  const cleaned = String(privateKeyPem || "").replace(/\\n/g, "\n");
  const body = cleaned
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binary.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
}

async function getGoogleAccessToken(env) {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAtMs - 60_000) {
    return tokenCache.accessToken;
  }

  assertRequiredEnv(env, ["FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]);

  const header = { alg: "RS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const payload = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/devstorage.read_write",
    iat,
    exp,
  };

  const encodedHeader = base64Url(textEncoder.encode(JSON.stringify(header)));
  const encodedPayload = base64Url(textEncoder.encode(JSON.stringify(payload)));
  const unsignedJwt = `${encodedHeader}.${encodedPayload}`;
  const key = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, textEncoder.encode(unsignedJwt));
  const encodedSignature = base64Url(new Uint8Array(signature));
  const assertion = `${unsignedJwt}.${encodedSignature}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Falha ao obter token Google (${tokenResponse.status})`);
  }
  const tokenJson = await tokenResponse.json();
  tokenCache = {
    accessToken: tokenJson.access_token,
    expiresAtMs: Date.now() + Number(tokenJson.expires_in || 3600) * 1000,
  };
  return tokenCache.accessToken;
}

async function firestoreListDocuments(env, accessToken, collectionId, pageSize = 1000) {
  const url = `${firestoreBaseUrl(env)}/${collectionId}?pageSize=${pageSize}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return [];
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Falha listando ${collectionId}: ${response.status} ${details}`);
  }
  const body = await response.json();
  const documents = body.documents || [];
  return documents.map(decodeFirestoreDocument);
}

async function firestoreGetDocument(env, accessToken, collectionId, docId) {
  const url = `${firestoreBaseUrl(env)}/${collectionId}/${docId}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Falha buscando ${collectionId}/${docId}: ${response.status} ${details}`);
  }
  const body = await response.json();
  return decodeFirestoreDocument(body);
}

async function firestoreCreateDocument(env, accessToken, collectionId, data) {
  const url = `${firestoreBaseUrl(env)}/${collectionId}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(encodeFirestoreFields(data)),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Falha criando documento em ${collectionId}: ${response.status} ${details}`);
  }
  const body = await response.json();
  return decodeFirestoreDocument(body);
}

async function firestoreUpdateDocument(env, accessToken, collectionId, docId, data) {
  const url = new URL(`${firestoreBaseUrl(env)}/${collectionId}/${docId}`);
  Object.keys(data || {}).forEach((field) => url.searchParams.append("updateMask.fieldPaths", field));
  const response = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(encodeFirestoreFields(data)),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Falha atualizando ${collectionId}/${docId}: ${response.status} ${details}`);
  }
  const body = await response.json();
  return decodeFirestoreDocument(body);
}

function formatWhatsAppGraphError(status, rawBody) {
  let hint = "";
  try {
    const j = JSON.parse(rawBody);
    const err = j?.error;
    if (err) {
      const code = err.code;
      const sub = err.error_subcode;
      const msg = String(err.message || err.type || "");
      if (code === 131047 || sub === 2494010) {
        hint =
          " A Meta bloqueia mensagem de texto fora da janela de 24h: o cliente precisa ter respondido recentemente ou use um modelo (template) aprovado no painel.";
      } else if (code === 100 && /phone/i.test(msg)) {
        hint = " Verifique se o telefone do cliente esta com DDI (ex.: 55) e so digitos, no cadastro da empresa/conversa.";
      } else if (
        code === 190 ||
        code === 102 ||
        /invalid oauth access token|cannot parse access token|session has expired/i.test(msg)
      ) {
        hint =
          " Token da Meta expirado ou incorreto: em developers.facebook.com abra seu app > WhatsApp > API do WhatsApp > gere token permanente (ou token de usuario do sistema com permissao whatsapp_business_messaging). No Cloudflare: wrangler secret put WHATSAPP_ACCESS_TOKEN e cole o token inteiro, sem aspas nem espacos.";
      } else if (status === 401 || status === 403) {
        hint = " Token da Meta invalido ou sem permissao: confira WHATSAPP_ACCESS_TOKEN e o app no Meta Developers.";
      }
      return `Falha no envio WhatsApp (${status}) [${code || "?"}]: ${msg || rawBody.slice(0, 400)}${hint}`;
    }
  } catch (_e) {
    /* rawBody nao e JSON */
  }
  return `Falha no envio WhatsApp (${status}): ${rawBody ? rawBody.slice(0, 500) : "sem detalhes"}`;
}

async function sendWhatsAppText(env, to, message) {
  const token = whatsAppAccessToken(env);
  const phoneId = whatsAppPhoneNumberId(env);
  if (!token) {
    throw new Error("WHATSAPP_ACCESS_TOKEN vazio no worker. Configure o secret no Cloudflare.");
  }
  if (!phoneId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID vazio no worker. Configure o secret no Cloudflare.");
  }
  const phone = normalizePhone(to);
  if (!phone) {
    throw new Error(
      "Telefone de destino invalido ou vazio na conversa. Cadastre o WhatsApp do cliente (so digitos, com DDI 55) em Empresas ou na conversa."
    );
  }
  const endpoint = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneId}/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: String(message || "") },
    }),
  });
  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(formatWhatsAppGraphError(response.status, rawBody));
  }
  try {
    return rawBody ? JSON.parse(rawBody) : {};
  } catch (_e) {
    return {};
  }
}

function incomingTextFromMessage(message) {
  return (
    message?.text?.body ||
    message?.button?.text ||
    message?.interactive?.button_reply?.title ||
    message?.interactive?.list_reply?.title ||
    ""
  );
}

function incomingMediaNode(message) {
  const type = String(message?.type || "");
  if (!type) return null;
  const node = message?.[type];
  if (!node?.id) return null;
  return {
    type,
    id: node.id,
    filename: node.filename || `${type}_${Date.now()}`,
  };
}

function inferExtension(mimeType) {
  const v = String(mimeType || "").toLowerCase();
  if (v.includes("pdf")) return "pdf";
  if (v.includes("png")) return "png";
  if (v.includes("jpeg") || v.includes("jpg")) return "jpg";
  if (v.includes("webp")) return "webp";
  if (v.includes("gif")) return "gif";
  if (v.includes("mp4")) return "mp4";
  if (v.includes("plain")) return "txt";
  return "bin";
}

async function uploadToFirebaseStorage(env, accessToken, objectPath, bytes, mimeType) {
  const bucket = String(env.FIREBASE_STORAGE_BUCKET || "").trim();
  if (!bucket) return "";

  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`;
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": mimeType || "application/octet-stream",
    },
    body: bytes,
  });
  if (!uploadResponse.ok) {
    const details = await uploadResponse.text();
    throw new Error(`Falha upload storage (${uploadResponse.status}): ${details}`);
  }

  const downloadToken = crypto.randomUUID();
  const patchUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectPath)}`;
  const patchResponse = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    }),
  });
  if (!patchResponse.ok) {
    const details = await patchResponse.text();
    throw new Error(`Falha atualizando metadata storage (${patchResponse.status}): ${details}`);
  }

  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
}

async function downloadIncomingMediaAndStore(env, accessToken, mediaInfo, thread) {
  const token = whatsAppAccessToken(env);
  if (!token) {
    throw new Error("WHATSAPP_ACCESS_TOKEN ausente para download de midia.");
  }
  const metaResponse = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${mediaInfo.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaResponse.ok) {
    throw new Error(`Falha lendo metadata do arquivo WhatsApp (${metaResponse.status})`);
  }
  const meta = await metaResponse.json();
  const mediaUrl = meta?.url;
  if (!mediaUrl) throw new Error("URL do arquivo WhatsApp nao encontrada.");

  const mediaResponse = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!mediaResponse.ok) {
    throw new Error(`Falha no download do arquivo WhatsApp (${mediaResponse.status})`);
  }

  const contentType = String(meta?.mime_type || mediaResponse.headers.get("content-type") || "application/octet-stream");
  const ext = inferExtension(contentType);
  const filenameBase = String(mediaInfo.filename || `arquivo_${Date.now()}`).replace(/[^\w.-]+/g, "_").replace(/\.[a-zA-Z0-9]+$/, "");
  const filename = `${filenameBase}.${ext}`;
  const objectPath = `whatsapp-files/${thread.uid}/${thread.company_id || "sem_empresa"}/${Date.now()}_${filename}`;
  const bytes = await mediaResponse.arrayBuffer();
  const fileUrl = await uploadToFirebaseStorage(env, accessToken, objectPath, bytes, contentType);

  return {
    fileName: filename,
    fileUrl,
    contentType,
  };
}

async function appendIncomingMessage(env, accessToken, thread, content, mediaData = null) {
  await firestoreCreateDocument(env, accessToken, "conversation_messages", {
    uid: thread.uid,
    thread_id: thread.id,
    company_id: thread.company_id || "",
    direction: "incoming",
    message_type: mediaData ? "file" : "text",
    content: String(content || ""),
    file_name: mediaData?.fileName || "",
    file_url: mediaData?.fileUrl || "",
    channel: "whatsapp",
    created_at: nowIso(),
  });

  if (mediaData?.fileUrl) {
    await firestoreCreateDocument(env, accessToken, "company_files", {
      uid: thread.uid,
      company_id: thread.company_id || "",
      name: mediaData.fileName,
      file_url: mediaData.fileUrl,
      source: "whatsapp",
      created_at: nowIso(),
    });
  }

  const unread = Number(thread.unread_count || 0) + 1;
  await firestoreUpdateDocument(env, accessToken, "conversation_threads", thread.id, {
    waiting_reply: false,
    unread_count: unread,
    last_message: String(content || mediaData?.fileName || "Mensagem recebida"),
    last_message_at: nowIso(),
    updated_at: nowIso(),
  });
  thread.unread_count = unread;
  thread.waiting_reply = false;
}

async function runDueFollowups(env, opts = {}) {
  const accessToken = await getGoogleAccessToken(env);
  const threads = await firestoreListDocuments(env, accessToken, "conversation_threads", 1000);
  const tz = getFollowupTimeZone(env);
  const { date: zDate, time: zTime } = zonedYmdHm(Date.now(), tz);
  const result = { processed: 0, sent: 0, failed: 0 };

  for (const thread of threads) {
    const shouldSend =
      thread.channel === "whatsapp" &&
      !!thread.followup_enabled &&
      !!thread.waiting_reply &&
      followupCalendarDue(thread, zDate, zTime, opts) &&
      String(thread.template_message || "").trim();
    if (!shouldSend) continue;

    result.processed += 1;
    try {
      const message = String(thread.template_message || "").trim();
      await sendWhatsAppText(env, thread.contact, message);
      await firestoreCreateDocument(env, accessToken, "conversation_messages", {
        uid: thread.uid,
        thread_id: thread.id,
        company_id: thread.company_id || "",
        direction: "outgoing",
        message_type: "text",
        content: message,
        sender_phone: String(thread.sender_phone || ""),
        channel: "whatsapp",
        created_at: nowIso(),
      });
      await firestoreUpdateDocument(env, accessToken, "conversation_threads", thread.id, {
        waiting_reply: true,
        last_message: message,
        last_message_at: nowIso(),
        next_followup_date: addDaysToYmd(zDate, Number(thread.followup_interval_days || 1)),
        last_followup_error: "",
        updated_at: nowIso(),
      });
      result.sent += 1;
    } catch (error) {
      await firestoreUpdateDocument(env, accessToken, "conversation_threads", thread.id, {
        last_followup_error: String(error?.message || "erro desconhecido"),
        updated_at: nowIso(),
      });
      result.failed += 1;
    }
  }

  return result;
}

async function handleSendNow(request, env) {
  if (!requireInternalApiKey(request, env)) {
    return json({ error: "Nao autorizado." }, 401);
  }
  const payload = await request.json().catch(() => ({}));
  const threadId = String(payload?.threadId || "").trim();
  const messageOverride = String(payload?.message || "").trim();
  const senderPhone = String(payload?.senderPhone || "").trim();
  if (!threadId) return json({ error: "threadId obrigatorio." }, 400);

  try {
    const accessToken = await getGoogleAccessToken(env);
    const thread = await firestoreGetDocument(env, accessToken, "conversation_threads", threadId);
    if (!thread) return json({ error: "Conversa nao encontrada." }, 404);
    if (thread.channel !== "whatsapp") return json({ error: "Conversa nao e do canal WhatsApp." }, 400);

    const message = messageOverride || String(thread.template_message || "").trim();
    if (!message) return json({ error: "Mensagem vazia." }, 400);

    const dest = normalizePhone(thread.contact);
    if (!dest) {
      return json(
        {
          error:
            "Telefone da conversa invalido. Edite a conversa em Configuracoes e use apenas digitos com DDI (ex.: 5564999999999).",
        },
        400
      );
    }

    await sendWhatsAppText(env, thread.contact, message);
    await firestoreCreateDocument(env, accessToken, "conversation_messages", {
      uid: thread.uid,
      thread_id: thread.id,
      company_id: thread.company_id || "",
      direction: "outgoing",
      message_type: "text",
      content: message,
      sender_phone: senderPhone || String(thread.sender_phone || ""),
      channel: "whatsapp",
      created_at: nowIso(),
    });
    const tz = getFollowupTimeZone(env);
    const { date: zDate } = zonedYmdHm(Date.now(), tz);
    const updatePayload = {
      waiting_reply: true,
      last_message: message,
      last_message_at: nowIso(),
      next_followup_date: addDaysToYmd(zDate, Number(thread.followup_interval_days || 1)),
      last_followup_error: "",
      updated_at: nowIso(),
    };
    if (senderPhone) {
      updatePayload.sender_phone = senderPhone;
    }
    await firestoreUpdateDocument(env, accessToken, "conversation_threads", thread.id, updatePayload);
    return json({ success: true });
  } catch (error) {
    return json({ error: String(error?.message || "Falha ao enviar mensagem.") }, 500);
  }
}

async function handleRunFollowupsNow(request, env) {
  if (!requireInternalApiKey(request, env)) {
    return json({ error: "Nao autorizado." }, 401);
  }
  try {
    const result = await runDueFollowups(env, { ignoreTime: true });
    return json({ success: true, ...result });
  } catch (error) {
    return json({ error: String(error?.message || "Falha ao processar follow-ups.") }, 500);
  }
}

async function handleWebhookGet(request, env) {
  const url = new URL(request.url);
  const mode = String(url.searchParams.get("hub.mode") || "");
  const token = String(url.searchParams.get("hub.verify_token") || "");
  const challenge = String(url.searchParams.get("hub.challenge") || "");
  if (mode === "subscribe" && token === String(env.WHATSAPP_VERIFY_TOKEN || "")) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

async function handleWebhookPost(request, env) {
  try {
    const body = await request.json().catch(() => ({}));
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    if (entries.length === 0) return new Response("EVENT_RECEIVED", { status: 200 });

    const accessToken = await getGoogleAccessToken(env);
    const threads = await firestoreListDocuments(env, accessToken, "conversation_threads", 1000);
    const whatsappThreads = threads.filter((t) => t.channel === "whatsapp");

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const message of messages) {
          const from = normalizePhone(message?.from || value?.contacts?.[0]?.wa_id || "");
          if (!from) continue;
          const thread = whatsappThreads.find((t) => phonesMatch(t.contact, from));
          if (!thread) continue;

          let content = String(incomingTextFromMessage(message) || "").trim();
          let mediaData = null;
          const media = incomingMediaNode(message);
          if (media?.id && String(env.FIREBASE_STORAGE_BUCKET || "").trim()) {
            try {
              mediaData = await downloadIncomingMediaAndStore(env, accessToken, media, thread);
              if (!content) content = `Arquivo recebido via WhatsApp (${media.type}).`;
            } catch (_error) {
              if (!content) content = "Arquivo recebido via WhatsApp.";
            }
          }
          if (!content) content = "Mensagem recebida via WhatsApp.";
          await appendIncomingMessage(env, accessToken, thread, content, mediaData);
        }
      }
    }
    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    return new Response(`Webhook error: ${String(error?.message || "erro desconhecido")}`, { status: 500 });
  }
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: new Headers(corsHeaders()) });
      }

      const url = new URL(request.url);
      const pathname = url.pathname;

      if (request.method === "GET" && pathname === "/health") {
        return json({ ok: true, service: "whatsapp-automation-worker" });
      }

      if (pathname === "/webhook/whatsapp") {
        if (request.method === "GET") return handleWebhookGet(request, env);
        if (request.method === "POST") return handleWebhookPost(request, env);
        return new Response("Method Not Allowed", { status: 405 });
      }

      if (request.method === "POST" && pathname === "/api/send-now") {
        return handleSendNow(request, env);
      }
      if (request.method === "POST" && pathname === "/api/followups/run-now") {
        return handleRunFollowupsNow(request, env);
      }

      return json({ error: "Rota nao encontrada." }, 404);
    } catch (error) {
      return json({ error: String(error?.message || "erro interno") }, 500);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runDueFollowups(env));
  },
};
