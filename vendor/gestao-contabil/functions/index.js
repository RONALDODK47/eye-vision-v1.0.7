const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_PORT = defineSecret("SMTP_PORT");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const SMTP_FROM = defineSecret("SMTP_FROM");
const SMTP_SECURE = defineSecret("SMTP_SECURE");

const WHATSAPP_ACCESS_TOKEN = defineSecret("WHATSAPP_ACCESS_TOKEN");
const WHATSAPP_PHONE_NUMBER_ID = defineSecret("WHATSAPP_PHONE_NUMBER_ID");
const WHATSAPP_VERIFY_TOKEN = defineSecret("WHATSAPP_VERIFY_TOKEN");
const WHATSAPP_API_VERSION = "v21.0";

function isTruthy(value) {
  return String(value || "").toLowerCase() === "true";
}

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function addDaysIso(baseIso, days) {
  const d = new Date(baseIso || todayIso());
  d.setDate(d.getDate() + Number(days || 1));
  return d.toISOString().split("T")[0];
}

const FOLLOWUP_TIMEZONE = "America/Sao_Paulo";

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

function addDaysToYmd(ymd, days) {
  const parts = String(ymd || "").split("-").map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return zonedYmdHm(Date.now(), FOLLOWUP_TIMEZONE).date;
  }
  const [y, mo, d] = parts;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

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

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

function phonesMatch(phoneA, phoneB) {
  const a = normalizePhone(phoneA);
  const b = normalizePhone(phoneB);
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
}

function sanitizeFileName(value) {
  const raw = String(value || "arquivo_whatsapp").trim();
  return raw.replace(/[^\w.-]+/g, "_");
}

function inferExtensionFromMime(mime) {
  const v = String(mime || "").toLowerCase();
  if (v.includes("pdf")) return "pdf";
  if (v.includes("png")) return "png";
  if (v.includes("jpeg") || v.includes("jpg")) return "jpg";
  if (v.includes("webp")) return "webp";
  if (v.includes("gif")) return "gif";
  if (v.includes("mp4")) return "mp4";
  if (v.includes("mpeg")) return "mpeg";
  if (v.includes("ogg")) return "ogg";
  if (v.includes("aac")) return "aac";
  if (v.includes("plain")) return "txt";
  if (v.includes("csv")) return "csv";
  if (v.includes("sheet")) return "xlsx";
  if (v.includes("word")) return "docx";
  return "bin";
}

async function sendWhatsAppTextMessage({ to, message }) {
  const phone = normalizePhone(to);
  if (!phone) {
    throw new Error("Telefone de destino invalido para WhatsApp.");
  }
  const body = String(message || "").trim();
  if (!body) {
    throw new Error("Mensagem de WhatsApp vazia.");
  }

  const endpoint = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID.value()}/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN.value()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body },
    }),
  });

  const rawBody = await response.text();
  if (!response.ok) {
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
            " A Meta bloqueia texto fora da janela de 24h: use template aprovado ou aguarde resposta do cliente.";
        } else if (code === 100 && /phone/i.test(msg)) {
          hint = " Confira DDI e digitos no cadastro.";
        }
        throw new Error(`Falha no envio WhatsApp (${response.status}) [${code || "?"}]: ${msg || rawBody.slice(0, 400)}${hint}`);
      }
    } catch (e) {
      if (e?.message && String(e.message).includes("Falha no envio")) throw e;
    }
    throw new Error(`Falha no envio WhatsApp (${response.status}): ${rawBody ? rawBody.slice(0, 500) : "erro desconhecido"}`);
  }

  try {
    return rawBody ? JSON.parse(rawBody) : {};
  } catch (_e) {
    return {};
  }
}

async function appendConversationMessage(data) {
  const payload = { ...data, created_at: new Date().toISOString() };
  await db.collection("conversation_messages").add(payload);
}

async function updateThread(threadId, data) {
  await db
    .collection("conversation_threads")
    .doc(threadId)
    .update({ ...data, updated_at: new Date().toISOString() });
}

async function processDueFollowups(opts = {}) {
  const snapshot = await db.collection("conversation_threads").where("channel", "==", "whatsapp").get();
  const { date: zDate, time: zTime } = zonedYmdHm(Date.now(), FOLLOWUP_TIMEZONE);
  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const docSnap of snapshot.docs) {
    const thread = { id: docSnap.id, ...docSnap.data() };
    const isDue =
      !!thread.followup_enabled &&
      !!thread.waiting_reply &&
      followupCalendarDue(thread, zDate, zTime, opts) &&
      String(thread.template_message || "").trim() &&
      String(thread.contact || "").trim();

    if (!isDue) continue;

    processed += 1;
    try {
      const message = String(thread.template_message || "").trim();
      await sendWhatsAppTextMessage({ to: thread.contact, message });

      await appendConversationMessage({
        uid: thread.uid,
        thread_id: thread.id,
        company_id: thread.company_id || "",
        direction: "outgoing",
        message_type: "text",
        content: message,
        channel: "whatsapp",
      });

      await updateThread(thread.id, {
        waiting_reply: true,
        last_message: message,
        last_message_at: new Date().toISOString(),
        next_followup_date: addDaysToYmd(zDate, Number(thread.followup_interval_days || 1)),
        last_followup_error: "",
      });
      sent += 1;
    } catch (error) {
      logger.error(`Erro no follow-up da thread ${thread.id}`, error);
      await updateThread(thread.id, {
        last_followup_error: String(error?.message || "erro desconhecido"),
      });
      failed += 1;
    }
  }

  return { processed, sent, failed };
}

function getIncomingText(message) {
  if (message?.text?.body) return String(message.text.body);
  if (message?.button?.text) return String(message.button.text);
  if (message?.interactive?.button_reply?.title) return String(message.interactive.button_reply.title);
  if (message?.interactive?.list_reply?.title) return String(message.interactive.list_reply.title);
  return "";
}

function getMediaInfo(message) {
  const type = String(message?.type || "");
  if (!type) return null;
  const mediaNode = message[type];
  const mediaId = mediaNode?.id;
  if (!mediaId) return null;

  const preferredName =
    mediaNode?.filename ||
    mediaNode?.caption ||
    `whatsapp_${type}_${Date.now()}`;

  return { type, mediaId, preferredName };
}

async function downloadAndStoreMedia({ mediaId, uid, companyId, preferredName }) {
  const mediaMetaResponse = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${mediaId}`, {
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN.value()}`,
    },
  });
  if (!mediaMetaResponse.ok) {
    const details = await mediaMetaResponse.text();
    throw new Error(`Nao foi possivel obter metadados do arquivo (${mediaMetaResponse.status}): ${details || ""}`);
  }
  const mediaMeta = await mediaMetaResponse.json();
  const mediaUrl = mediaMeta?.url;
  if (!mediaUrl) {
    throw new Error("URL do arquivo do WhatsApp nao encontrada.");
  }

  const downloadResponse = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN.value()}`,
    },
  });
  if (!downloadResponse.ok) {
    const details = await downloadResponse.text();
    throw new Error(`Falha ao baixar arquivo do WhatsApp (${downloadResponse.status}): ${details || ""}`);
  }

  const arrayBuffer = await downloadResponse.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);
  const extension = inferExtensionFromMime(mediaMeta?.mime_type);
  const baseName = sanitizeFileName(preferredName).replace(/\.[a-zA-Z0-9]+$/, "");
  const fileName = `${baseName}.${extension}`;
  const filePath = `whatsapp-files/${uid}/${companyId || "sem_empresa"}/${Date.now()}_${fileName}`;

  const bucket = admin.storage().bucket();
  const file = bucket.file(filePath);
  await file.save(fileBuffer, {
    resumable: false,
    contentType: mediaMeta?.mime_type || "application/octet-stream",
    metadata: {
      cacheControl: "private, max-age=3600",
    },
  });

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: "2500-01-01",
  });

  return {
    fileName,
    fileUrl: signedUrl,
    mimeType: mediaMeta?.mime_type || "",
  };
}

exports.sendAppEmail = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 30,
    memory: "256MiB",
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Voce precisa estar autenticado para enviar e-mail.");
    }

    const to = String(request.data?.to || "").trim();
    const subject = String(request.data?.subject || "").trim();
    const body = String(request.data?.body || "").trim();

    if (!to || !subject || !body) {
      throw new HttpsError("invalid-argument", "Os campos to, subject e body sao obrigatorios.");
    }

    const port = Number(SMTP_PORT.value() || "587");
    const secure = isTruthy(SMTP_SECURE.value());

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST.value(),
      port,
      secure,
      auth: {
        user: SMTP_USER.value(),
        pass: SMTP_PASS.value(),
      },
    });

    try {
      await transporter.sendMail({
        from: SMTP_FROM.value() || SMTP_USER.value(),
        to,
        subject,
        text: body,
      });
      return { success: true };
    } catch (error) {
      logger.error("Erro ao enviar e-mail", error);
      throw new HttpsError("internal", "Falha ao enviar e-mail. Verifique as credenciais SMTP.");
    }
  }
);

exports.sendWhatsAppNow = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Voce precisa estar autenticado para enviar WhatsApp.");
    }

    const threadId = String(request.data?.threadId || "").trim();
    const overrideMessage = String(request.data?.message || "").trim();
    if (!threadId) {
      throw new HttpsError("invalid-argument", "threadId e obrigatorio.");
    }

    const threadRef = db.collection("conversation_threads").doc(threadId);
    const threadSnap = await threadRef.get();
    if (!threadSnap.exists) {
      throw new HttpsError("not-found", "Conversa nao encontrada.");
    }

    const thread = { id: threadSnap.id, ...threadSnap.data() };
    if (thread.uid !== request.auth.uid) {
      throw new HttpsError("permission-denied", "Voce nao tem permissao para esta conversa.");
    }
    if (thread.channel !== "whatsapp") {
      throw new HttpsError("failed-precondition", "A conversa selecionada nao e do canal WhatsApp.");
    }

    const message = overrideMessage || String(thread.template_message || "").trim();
    if (!message) {
      throw new HttpsError("invalid-argument", "Mensagem vazia.");
    }

    try {
      await sendWhatsAppTextMessage({ to: thread.contact, message });

      await appendConversationMessage({
        uid: thread.uid,
        thread_id: thread.id,
        company_id: thread.company_id || "",
        direction: "outgoing",
        message_type: "text",
        content: message,
        channel: "whatsapp",
      });

      const { date: zDate } = zonedYmdHm(Date.now(), FOLLOWUP_TIMEZONE);
      await updateThread(thread.id, {
        waiting_reply: true,
        last_message: message,
        last_message_at: new Date().toISOString(),
        next_followup_date: addDaysToYmd(zDate, Number(thread.followup_interval_days || 1)),
        last_followup_error: "",
      });

      return { success: true };
    } catch (error) {
      logger.error("Erro ao enviar WhatsApp manual", error);
      throw new HttpsError("internal", String(error?.message || "Falha ao enviar WhatsApp."));
    }
  }
);

exports.runWhatsAppFollowupsNow = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Autenticacao obrigatoria.");
    }
    try {
      const result = await processDueFollowups({ ignoreTime: true });
      return { success: true, ...result };
    } catch (error) {
      logger.error("Erro ao executar follow-ups manualmente", error);
      throw new HttpsError("internal", String(error?.message || "Erro ao executar follow-ups."));
    }
  }
);

exports.sendWhatsAppFollowups = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "512MiB",
    secrets: [WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID],
  },
  async () => {
    const result = await processDueFollowups();
    logger.info("Follow-ups WhatsApp processados", result);
  }
);

exports.whatsappWebhook = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "512MiB",
    secrets: [WHATSAPP_VERIFY_TOKEN, WHATSAPP_ACCESS_TOKEN],
  },
  async (req, res) => {
    try {
      if (req.method === "GET") {
        const mode = String(req.query["hub.mode"] || "");
        const verifyToken = String(req.query["hub.verify_token"] || "");
        const challenge = String(req.query["hub.challenge"] || "");
        if (mode === "subscribe" && verifyToken === WHATSAPP_VERIFY_TOKEN.value()) {
          res.status(200).send(challenge);
          return;
        }
        res.status(403).send("Forbidden");
        return;
      }

      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
      if (entries.length === 0) {
        res.status(200).send("EVENT_RECEIVED");
        return;
      }

      const threadsSnap = await db.collection("conversation_threads").where("channel", "==", "whatsapp").get();
      const threads = threadsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

      const findThreadByPhone = (phone) => {
        const candidates = threads.filter((t) => phonesMatch(t.contact, phone));
        if (candidates.length === 0) return null;
        const waiting = candidates.find((t) => !!t.waiting_reply);
        return waiting || candidates[0];
      };

      for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value || {};
          const messages = Array.isArray(value?.messages) ? value.messages : [];
          for (const message of messages) {
            const fromPhone = normalizePhone(message?.from || value?.contacts?.[0]?.wa_id || "");
            if (!fromPhone) continue;

            const thread = findThreadByPhone(fromPhone);
            if (!thread) {
              logger.warn(`Mensagem recebida sem thread correspondente. Telefone: ${fromPhone}`);
              continue;
            }

            let content = getIncomingText(message);
            let messageType = "text";
            let fileName = "";
            let fileUrl = "";

            const mediaInfo = getMediaInfo(message);
            if (mediaInfo?.mediaId) {
              try {
                const stored = await downloadAndStoreMedia({
                  mediaId: mediaInfo.mediaId,
                  uid: thread.uid,
                  companyId: thread.company_id || "sem_empresa",
                  preferredName: mediaInfo.preferredName,
                });
                fileName = stored.fileName;
                fileUrl = stored.fileUrl;
                messageType = "file";
                if (!content) {
                  content = `Arquivo recebido via WhatsApp (${mediaInfo.type}).`;
                }

                await db.collection("company_files").add({
                  uid: thread.uid,
                  company_id: thread.company_id || "",
                  name: fileName,
                  file_url: fileUrl,
                  source: "whatsapp",
                  created_at: new Date().toISOString(),
                });
              } catch (error) {
                logger.error("Falha ao processar arquivo recebido no WhatsApp", error);
                messageType = "text";
                if (!content) content = "Arquivo recebido via WhatsApp (falha ao salvar arquivo).";
              }
            }

            if (!content) {
              content = "Mensagem recebida via WhatsApp.";
            }

            await appendConversationMessage({
              uid: thread.uid,
              thread_id: thread.id,
              company_id: thread.company_id || "",
              direction: "incoming",
              message_type: messageType,
              content,
              file_name: fileName,
              file_url: fileUrl,
              channel: "whatsapp",
            });

            await updateThread(thread.id, {
              waiting_reply: false,
              unread_count: Number(thread.unread_count || 0) + 1,
              last_message: content,
              last_message_at: new Date().toISOString(),
            });
          }
        }
      }

      res.status(200).send("EVENT_RECEIVED");
    } catch (error) {
      logger.error("Erro no webhook do WhatsApp", error);
      res.status(500).send("Webhook error");
    }
  }
);
