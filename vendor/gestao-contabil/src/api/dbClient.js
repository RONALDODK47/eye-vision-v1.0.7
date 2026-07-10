import { auth, db } from '@/lib/firebase';
import {
  normalizeTabEditAccess,
  inferTabEditAccessFromLegacy,
  syncLegacyAllowFlagsFromTabEdit,
} from "@/lib/tabEditAccess";
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  increment,
  writeBatch,
  runTransaction,
  arrayUnion,
  deleteField,
  onSnapshot,
} from 'firebase/firestore';
import {
  chunkManagerRows,
  mergeManagerCloudDocuments,
} from '@/lib/eyeVisionManagerShard.js';

const PORTAL_PUBLIC_ALIASES = 'portal_public_aliases';

const GC_USERNAME_REGISTRY = 'gc_username_registry';

function normalizeEmailStr(value) {
  return String(value || '').trim().toLowerCase();
}

/** Chave estável (minúscula, só letras/número/underscore) para unicidade entre utilizadores */
export function gcNormalizeUsernameKey(raw) {
  const s = String(raw || '')
    .trim()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');
  const spaced = s.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  return spaced.toLowerCase().replace(/^_+/, '');
}

/** Nome gravado ao perfil: mesmos caracteres ASCII permitidos mas preserva maiúsculas/minúsculas */
export function gcSanitizeUsernameDisplay(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, '_');
  const cleaned = s.replace(/[^a-zA-Z0-9_]/g, '').replace(/^_+/, '');
  return cleaned.slice(0, 30);
}

export function gcValidateUsernameKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (key.length < 3 || key.length > 30) return false;
  return /^[a-z][a-z0-9_]+$/.test(key);
}

function getStoredEmailJsConfig() {
  if (typeof window === "undefined") {
    return {};
  }

  return {
    serviceId: localStorage.getItem("emailjs_service_id") || "",
    templateId: localStorage.getItem("emailjs_template_id") || "",
    publicKey: localStorage.getItem("emailjs_public_key") || "",
  };
}

/** WhatsApp no app é só abertura manual (Web / wa.me / link personalizado). */
export function isWhatsAppManualSendOpenChatOnly() {
  return true;
}

export const dbClient = {
  entities: {
    Company: {
      list: async (uid) => {
        const q = query(collection(db, 'companies'), where('uid', '==', uid));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      listAll: async () => {
        const snapshot = await getDocs(collection(db, 'companies'));
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      create: async (data) => {
        const now = new Date().toISOString();
        const payload = { ...data, created_at: data.created_at || now, updated_at: data.updated_at || now };
        const docRef = await addDoc(collection(db, 'companies'), payload);
        return { id: docRef.id, ...payload };
      },
      update: async (id, data) => {
        await updateDoc(doc(db, 'companies', id), data);
        return { id, ...data };
      },
      delete: async (id) => {
        await deleteDoc(doc(db, 'companies', id));
      }
    },
    CustomColumn: {
      list: async (uid) => {
        const q = query(collection(db, 'custom_columns'), where('uid', '==', uid));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      create: async (data) => {
        const docRef = await addDoc(collection(db, 'custom_columns'), data);
        return { id: docRef.id, ...data };
      },
      update: async (id, data) => {
        await updateDoc(doc(db, 'custom_columns', id), data);
        return { id, ...data };
      },
      delete: async (id) => {
        await deleteDoc(doc(db, 'custom_columns', id));
      }
    },
    UserProfile: {
      touch: async (firebaseUser) => {
        if (!firebaseUser?.uid) return null;
        const now = new Date().toISOString();
        const payload = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          display_name: firebaseUser.displayName || '',
          photo_url: firebaseUser.photoURL || '',
          last_seen_at: now,
          updated_at: now,
        };
        await setDoc(doc(db, 'user_profiles', firebaseUser.uid), payload, { merge: true });
        return payload;
      },
      listAll: async () => {
        const snapshot = await getDocs(collection(db, 'user_profiles'));
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      /** Leituras pontuais por e-mail (1 doc por e-mail) — evita `listAll` no chat. */
      async listByEmails(emails) {
        const unique = [
          ...new Set(
            (Array.isArray(emails) ? emails : [])
              .map((e) => normalizeEmailStr(e))
              .filter(Boolean),
          ),
        ];
        if (unique.length === 0) return [];
        const rows = await Promise.all(
          unique.map(async (email) => {
            const q = query(collection(db, 'user_profiles'), where('email', '==', email), limit(1));
            const snap = await getDocs(q);
            if (snap.empty) return null;
            const d = snap.docs[0];
            return { id: d.id, ...d.data() };
          }),
        );
        return rows.filter(Boolean);
      },
      async listByUids(uids) {
        const unique = [...new Set((Array.isArray(uids) ? uids : []).map((u) => String(u || '').trim()).filter(Boolean))];
        if (unique.length === 0) return [];
        const rows = await Promise.all(
          unique.map(async (id) => {
            const snap = await getDoc(doc(db, 'user_profiles', id));
            if (!snap.exists()) return null;
            return { id: snap.id, ...snap.data() };
          }),
        );
        return rows.filter(Boolean);
      },
      /** Leitura do perfil por UID (flags como gc_portal_client) para hooks sem importar `db` em mais sítios. */
      async getByUid(uid) {
        const id = String(uid || "").trim();
        if (!id) return null;
        const snap = await getDoc(doc(db, "user_profiles", id));
        if (!snap.exists()) return {};
        return snap.data();
      },
      update: async (uid, data) => {
        if (!uid) throw new Error("UID do usuário em falta.");
        const payload = { uid, ...(data || {}), updated_at: new Date().toISOString() };
        await setDoc(doc(db, "user_profiles", uid), payload, { merge: true });
        return { id: uid, uid, ...payload };
      },
      /** Convites portal empresa: acumula empresas vinculadas ao utilizador (para mostrar no portal). */
      async appendEmpresaPortalCompanyId(uid, companyFirestoreId) {
        const id = String(uid || "").trim();
        const cid = String(companyFirestoreId || "").trim();
        if (!id || !cid) return;
        await updateDoc(doc(db, "user_profiles", id), {
          gc_empresa_portal_company_ids: arrayUnion(cid),
          updated_at: new Date().toISOString(),
        });
      },
    },
    LoginUsername: {
      collection: GC_USERNAME_REGISTRY,
      normalizeKey(usernameRaw) {
        const key = gcNormalizeUsernameKey(usernameRaw);
        return key;
      },
      validate(usernameRaw) {
        const key = this.normalizeKey(usernameRaw);
        const dispRaw = gcSanitizeUsernameDisplay(usernameRaw).slice(0, 30);
        const display = dispRaw || key;
        if (!gcValidateUsernameKey(key)) {
          throw new Error(
            'Use 3–30 caracteres: começar por letra; só letras, números e sublinhado (_) — sem espaços.'
          );
        }
        return { key, display };
      },
      /** Se o perfil perdeu os campos gc_login_* mas o registo existe, volta a gravar perfil/registry (evita novo pedido obrigatório). */
      async repairProfileFromRegistryIfMissing({ uid, email }) {
        const normalizedEmail = normalizeEmailStr(email);
        if (!uid || !normalizedEmail) return false;
        const profSnap = await getDoc(doc(db, 'user_profiles', uid));
        const has = String(profSnap.exists() ? profSnap.data()?.gc_login_username_normalized || '' : '').trim();
        if (has) return true;
        const regQ = query(collection(db, GC_USERNAME_REGISTRY), where('uid', '==', String(uid)), limit(1));
        const regs = await getDocs(regQ);
        if (regs.empty) return false;
        const d = regs.docs[0];
        const usernameRaw = String(d.data()?.gc_login_username_display || '').trim() || d.id;
        await this.claimForUid({ uid: String(uid), email: normalizedEmail, usernameRaw });
        return true;
      },
      async lookupEmail(identifier) {
        const raw = String(identifier || '').trim();
        const key = gcNormalizeUsernameKey(raw);
        if (!gcValidateUsernameKey(key)) return null;
        try {
          const snap = await getDoc(doc(db, GC_USERNAME_REGISTRY, key));
          if (!snap.exists()) return null;
          const em = normalizeEmailStr(snap.data()?.email || '');
          return em || null;
        } catch (err) {
          console.warn("LoginUsername.lookupEmail failed:", err);
          return null;
        }
      },
      /** Resolve nome de utilizador GC (registo gc_username_registry) → Firebase UID ou null */
      async lookupUid(identifier) {
        const raw = String(identifier || '').trim();
        const key = gcNormalizeUsernameKey(raw);
        if (!gcValidateUsernameKey(key)) return null;
        const snap = await getDoc(doc(db, GC_USERNAME_REGISTRY, key));
        if (!snap.exists()) return null;
        const uid = String(snap.data()?.uid || '').trim();
        return uid || null;
      },
      async isAvailable(usernameRaw, exceptUid = '') {
        const key = gcNormalizeUsernameKey(usernameRaw);
        if (!gcValidateUsernameKey(key)) return false;
        try {
          const snap = await getDoc(doc(db, GC_USERNAME_REGISTRY, key));
          if (!snap.exists()) return true;
          return String(snap.data()?.uid || '').trim() === String(exceptUid || '').trim();
        } catch (err) {
          console.warn("LoginUsername.isAvailable failed:", err);
          return true;
        }
      },
      /**
       * Garante registo `{ key -> uid/email }` e campos perfil gc_login_*.
       * Se `existingKey` igual ao novo, apenas refresca dados.
       */
      async claimForUid({ uid, email, usernameRaw }) {
        const normalizedEmail = normalizeEmailStr(email);
        if (!uid || !normalizedEmail) throw new Error('Dados do utilizador em falta.');
        const { key, display } = this.validate(usernameRaw);
        const regRef = doc(db, GC_USERNAME_REGISTRY, key);
        const profileRef = doc(db, 'user_profiles', uid);
        const now = new Date().toISOString();

        await runTransaction(db, async (t) => {
          const regSnap = await t.get(regRef);
          if (regSnap.exists()) {
            const owner = String(regSnap.data()?.uid || '').trim();
            if (owner && owner !== String(uid).trim()) {
              throw new Error('Este nome de usuário já está em uso.');
            }
          }

          const profSnap = await t.get(profileRef);
          const prevKey = profSnap.exists()
            ? String(profSnap.data()?.gc_login_username_normalized || '').trim()
            : '';

          if (prevKey && prevKey !== key) {
            const oldRef = doc(db, GC_USERNAME_REGISTRY, prevKey);
            const os = await t.get(oldRef);
            if (os.exists() && String(os.data()?.uid || '').trim() === String(uid).trim()) {
              t.delete(oldRef);
            }
          }

          t.set(regRef, {
            uid: String(uid),
            email: normalizedEmail,
            gc_login_username_display: display,
            updated_at: now,
          });
          t.set(
            profileRef,
            {
              uid: String(uid),
              email: normalizedEmail,
              gc_login_username: display,
              gc_login_username_normalized: key,
              gc_login_username_set_at: now,
              display_name:
                typeof profSnap.data()?.display_name === 'string'
                  ? profSnap.data()?.display_name
                  : display,
              updated_at: now,
            },
            { merge: true }
          );
        });

        return { key, display };
      },
    },
    CompanyTask: {
      list: async (uid) => {
        const q = query(collection(db, 'tasks'), where('uid', '==', uid));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      listAll: async () => {
        const snapshot = await getDocs(collection(db, 'tasks'));
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      filter: async (params) => {
        const conditions = [where('company_id', '==', params.company_id)];
        if (params.uid) conditions.push(where('uid', '==', params.uid));
        const q = query(collection(db, 'tasks'), ...conditions);
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      /** Todas as tarefas de uma empresa (leitura permitida a autenticados; ver regras Firestore). */
      listByCompany: async (companyId) => {
        const id = String(companyId || '').trim();
        if (!id) return [];
        const q = query(collection(db, 'tasks'), where('company_id', '==', id));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      create: async (data) => {
        const docRef = await addDoc(collection(db, 'tasks'), data);
        return { id: docRef.id, ...data };
      },
      update: async (id, data) => {
        await updateDoc(doc(db, 'tasks', id), data);
        return { id, ...data };
      },
      delete: async (id) => {
        await deleteDoc(doc(db, 'tasks', id));
      }
    },
    TaskTemplate: {
      list: async (uid) => {
        const q = query(collection(db, 'task_templates'), where('uid', '==', uid));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      create: async (data) => {
        const now = new Date().toISOString();
        const payload = { active: true, ...data, created_at: now, updated_at: now };
        const docRef = await addDoc(collection(db, 'task_templates'), payload);
        return { id: docRef.id, ...payload };
      },
      update: async (id, data) => {
        const payload = { ...data, updated_at: new Date().toISOString() };
        await updateDoc(doc(db, 'task_templates', id), payload);
        return { id, ...payload };
      },
      delete: async (id) => {
        await deleteDoc(doc(db, 'task_templates', id));
      }
    },
    AppSettings: {
      list: async (uid) => {
        const q = query(collection(db, 'app_settings'), where('uid', '==', uid));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      create: async (data) => {
        const docRef = await addDoc(collection(db, 'app_settings'), data);
        return { id: docRef.id, ...data };
      },
      update: async (id, data) => {
        await updateDoc(doc(db, 'app_settings', id), data);
        return { id, ...data };
      }
    },
    CloudAccessControl: {
      DOC_ID: "config",
      normalizeEmail(email) {
        return String(email || "").trim().toLowerCase();
      },
      normalizeClients(rawClients) {
        const raw = rawClients && typeof rawClients === "object" ? rawClients : {};
        const normalized = {};
        for (const [emailKey, row] of Object.entries(raw)) {
          if (!row || typeof row !== "object") continue;
          const normalizedKey = this.normalizeEmail(emailKey);
          if (!normalizedKey) continue;
          const candidate = { ...row };
          if (!String(candidate.email || "").trim()) {
            candidate.email = normalizedKey;
          }
          const existing = normalized[normalizedKey];
          if (!existing) {
            normalized[normalizedKey] = candidate;
            continue;
          }
          // Prefer non-deleted entries first
          if (!existing.is_deleted && candidate.is_deleted) {
            continue;
          }
          if (existing.is_deleted && !candidate.is_deleted) {
            normalized[normalizedKey] = candidate;
            continue;
          }
          // If both are same deleted status, pick the one with newer updated_at
          const existingUpdated = new Date(existing.updated_at || 0).getTime();
          const candidateUpdated = new Date(candidate.updated_at || 0).getTime();
          if (candidateUpdated > existingUpdated) {
            normalized[normalizedKey] = candidate;
          }
        }
        return normalized;
      },
      normalizeTabAccess(raw) {
        const defaults = {
          Dashboard: true,
          Onboarding: false,
          Companies: true,
          LoanControl: true,
          CalendarManagement: true,
          Exits: true,
          Chat: true,
          Excel: true,
          Notices: true,
          UsefulSites: true,
          AppSettings: true,
        };
        const source = raw && typeof raw === "object" ? raw : {};
        return Object.fromEntries(
          Object.entries(defaults).map(([key, fallback]) => [
            key,
            Object.hasOwn(source, key) ? Boolean(source[key]) : fallback,
          ])
        );
      },
      generateToken(prefix = "CGE") {
        const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
        const stamp = Date.now().toString(36).slice(-4).toUpperCase();
        return `${prefix}-${stamp}-${rand}`;
      },
      generateGestaoContabilToken() {
        return this.generateToken("CGE");
      },
      generateClientPortalToken() {
        return this.generateToken("CL");
      },
      generateEmpresaPortalToken() {
        return this.generateToken("EM");
      },

      /** Leitura para landing pública antes do login (doc `portal_public_aliases`). */
      async getPortalPublicAliasBySlug(slugRaw) {
        const slug = String(slugRaw || "").trim();
        if (!slug) return null;
        const snap = await getDoc(doc(db, PORTAL_PUBLIC_ALIASES, slug));
        if (!snap.exists()) return null;
        return { slug, ...snap.data() };
      },

      /** Garante slug único na coleção pública (outra empresa ⇒ sufixo numérico). */
      async ensureUniquePortalPublicSlug(preferredSlug, companyFirestoreId) {
        const cid = String(companyFirestoreId || "").trim();
        const baseRaw = String(preferredSlug || "").trim().toLowerCase() || "empresa";
        for (let i = 0; i < 40; i += 1) {
          const candidate = i === 0 ? baseRaw : `${baseRaw}-${i + 1}`;
          const snap = await getDoc(doc(db, PORTAL_PUBLIC_ALIASES, candidate));
          if (!snap.exists()) return candidate;
          const owner = String(snap.data()?.company_id || "").trim();
          if (owner && owner === cid) return candidate;
        }
        const tail = cid ? cid.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toLowerCase() : "x";
        return `${baseRaw}-${tail || "x"}`;
      },

      async getConfig() {
        try {
          const ref = doc(db, "cloud_access_control", this.DOC_ID);
          const snap = await getDoc(ref);
          if (!snap.exists()) return { id: this.DOC_ID, clients: {}, updated_at: "" };
          const data = snap.data();
          return { id: snap.id, ...data, clients: this.normalizeClients(data?.clients) };
        } catch {
          return { id: this.DOC_ID, clients: {}, updated_at: "" };
        }
      },

      /** ID da empresa exigido na configuração (mesmo critério do login da app principal). */
      assertCompanyAccessTokenInConfig(config, companyTokenInput) {
        const informed = String(companyTokenInput || "").trim();
        if (!informed) {
          throw new Error("Informe o ID da empresa enviado pelo escritório.");
        }
        const requiredTokens = Array.isArray(config?.company_access_tokens)
          ? config.company_access_tokens.map((x) => String(x || "").trim()).filter(Boolean)
          : [];
        const legacyToken = String(config?.company_access_token || "").trim();
        const allTokens = Array.from(new Set([...requiredTokens, legacyToken].filter(Boolean)));
        if (allTokens.length === 0) {
          throw new Error(
            "ID da empresa não configurado no sistema. Contacte o administrador do escritório."
          );
        }
        if (!allTokens.includes(informed)) {
          throw new Error("ID da empresa inválido.");
        }
        return informed;
      },

      /**
       * Encontra linha cliente do portal pelo token secreto no link (+ ID empresa opcional se o cenário for ambíguo).
       * @returns {{ fromKey: string, row: object }}
       */
      findPortalInviteMatch(config, portalTokenRaw, companyAccessTokenInput) {
        const pt = String(portalTokenRaw || "").trim();
        if (!pt) {
          throw new Error("Link incompleto: falta o token do portal.");
        }
        const informed = String(companyAccessTokenInput || "").trim();
        const clientsMap = config?.clients && typeof config.clients === "object" ? config.clients : {};
        const portalMatches = [];
        for (const [emailKey, rowRaw] of Object.entries(clientsMap)) {
          if (!rowRaw || typeof rowRaw !== "object") continue;
          if (String(rowRaw.account_type || "user").toLowerCase() !== "client") continue;
          if (!rowRaw.portal_enabled) continue;
          if (String(rowRaw.portal_token || "").trim() !== pt) continue;
          const nk = this.normalizeEmail(emailKey);
          if (!nk) continue;
          portalMatches.push({ fromKey: nk, row: { ...rowRaw } });
        }
        if (!portalMatches.length) {
          throw new Error(
            "Convite inválido ou expirado. Confirme o link ou peça novo acesso ao escritório."
          );
        }

        let narrowed = portalMatches;
        if (informed) {
          narrowed = portalMatches.filter(
            ({ row }) => String(row.assigned_company_token || "").trim() === informed
          );
          if (!narrowed.length) {
            throw new Error(
              "Token de cliente não encontrado. Verifique o token ou contacte o escritório."
            );
          }
        } else {
          const distinctAssigned = new Set(
            portalMatches.map(({ row }) => String(row.assigned_company_token || "").trim()).filter(Boolean)
          );
          if (distinctAssigned.size !== 1 || portalMatches.length !== 1) {
            throw new Error(
              "Este convite precisa que o escritório gere um URL único (ou contacto envia também o ID da empresa). Por agora esta app não solicita esse campo ao utilizador."
            );
          }
          narrowed = portalMatches;
        }

        if (narrowed.length > 1) {
          throw new Error(
            "Vários convites coincidentes. Peça ao escritório um link novo ou confirme o ID da empresa."
          );
        }

        const found = narrowed[0];
        return found;
      },

      /** Após primeiro registo Firebase: migra `@portal.gc.local` (ou atualiza vínculo) para o Gmail real. */
      async attachPortalSignupWithInvite({ firebaseEmail, portalToken, companyAccessToken }) {
        const me = auth.currentUser;
        if (!me?.uid || !me.email) throw new Error("Sessão em falta após registar conta.");
        const fb = this.normalizeEmail(firebaseEmail);
        const fbAuth = this.normalizeEmail(me.email);
        if (fbAuth !== fb) {
          throw new Error("A sessão atual não coincide com o e-mail indicado.");
        }
        const cfg = await this.getConfig();
        const { fromKey } = this.findPortalInviteMatch(cfg, portalToken, companyAccessToken);
        if (fromKey === fb) {
          return cfg.clients[fb];
        }
        await this.renameClientEmail({ adminUid: me.uid, fromEmail: fromKey, toEmail: fb });
        const next = await this.getConfig();
        return next.clients[fb];
      },

      /**
       * Valida convite do portal por empresa (`tipo=empresa` no URL): cliente final da empresa registada na cloud.
       * Dados ficam em `cloud_access_control/config.company_portals.{companyFirestoreId}`.
       */
      validateEmpresaPortalInviteSnapshot(config, companyFirestoreIdRaw, portalTokenRaw) {
        const cid = String(companyFirestoreIdRaw || "").trim();
        const pt = String(portalTokenRaw || "").trim();
        if (!cid) throw new Error("Link incompleto: falta o identificador da empresa.");
        if (!pt) throw new Error("Link incompleto: falta o token do portal.");
        const block =
          config?.company_portals && typeof config.company_portals === "object"
            ? config.company_portals[cid]
            : null;
        if (!block || typeof block !== "object") {
          throw new Error(
            "Convite desta empresa inválido ou removido. Peça novo link ao escritório."
          );
        }
        if (block.portal_enabled === false) {
          throw new Error("Portal por empresa desativado para esta empresa.");
        }
        if (block.is_active === false) {
          throw new Error("Acesso por empresa suspenso. Contacte o escritório.");
        }
        if (String(block.portal_token || "").trim() !== pt) {
          throw new Error(
            "Token do link não coincide. Confirme o convite atual ou solicite novo link."
          );
        }
        const officeTok = String(block.office_access_token || "").trim();
        if (!officeTok) {
          throw new Error("Convite incompleto: falta vínculo com o escritório. Peça link novo ao administrador.");
        }
        this.assertCompanyAccessTokenInConfig(config, officeTok);
        return { companyId: cid, block };
      },

      /** Registo inicial (convite empresa): apenas valida o link; não altera linha em `clients`. */
      async attachEmpresaPortalSignupWithInvite({
        firebaseEmail,
        portalToken,
        companyFirestoreId,
      }) {
        const me = auth.currentUser;
        if (!me?.uid || !me.email) throw new Error("Sessão em falta após registar conta.");
        const fb = this.normalizeEmail(firebaseEmail);
        const fbAuth = this.normalizeEmail(me.email);
        if (fbAuth !== fb) {
          throw new Error("A sessão atual não coincide com o e-mail indicado.");
        }
        const cfg = await this.getConfig();
        const { block } = this.validateEmpresaPortalInviteSnapshot(cfg, companyFirestoreId, portalToken);
        return block;
      },

      /** Login (convite empresa): apenas valida o link. */
      async confirmLoggedInEmpresaPortalInvite({ firebaseEmail, portalToken, companyFirestoreId }) {
        const me = auth.currentUser;
        if (!me?.uid || !me.email) throw new Error("Sessão em falta.");
        const fb = this.normalizeEmail(firebaseEmail);
        const fbAuth = this.normalizeEmail(me.email);
        if (fbAuth !== fb) {
          throw new Error("A sessão atual não coincide com o e-mail indicado.");
        }
        const cfg = await this.getConfig();
        const { block } = this.validateEmpresaPortalInviteSnapshot(cfg, companyFirestoreId, portalToken);
        return block;
      },

      /** Grava/atualiza portal por empresa (Gestão Contábil). */
      async upsertCompanyPortal({ adminUid, companyFirestoreId, patch = {} }) {
        const cid = String(companyFirestoreId || "").trim();
        if (!cid) throw new Error("Empresa sem identificador Firestore válido.");

        const ref = doc(db, "cloud_access_control", this.DOC_ID);
        const snap = await getDoc(ref);
        const prev = snap.exists() ? snap.data() : {};
        const companyPortals =
          prev.company_portals && typeof prev.company_portals === "object" ? prev.company_portals : {};
        const current =
          companyPortals[cid] && typeof companyPortals[cid] === "object" ? { ...companyPortals[cid] } : {};

        const now = new Date().toISOString();
        const next = {
          ...current,
          ...(patch || {}),
          updated_at: now,
        };

        const oldSlug = String(current.portal_public_slug || "").trim();
        const newSlug = String(next.portal_public_slug || "").trim();
        const displayLabel = String(next.portal_display_label || "").trim();
        const slugTouched = Object.prototype.hasOwnProperty.call(patch || {}, "portal_public_slug");
        const labelTouched = Object.prototype.hasOwnProperty.call(patch || {}, "portal_display_label");

        if (slugTouched) {
          if (oldSlug && oldSlug !== newSlug) {
            await deleteDoc(doc(db, PORTAL_PUBLIC_ALIASES, oldSlug)).catch(() => {});
          }
          if (newSlug) {
            await setDoc(
              doc(db, PORTAL_PUBLIC_ALIASES, newSlug),
              {
                company_id: cid,
                label: displayLabel,
                updated_at: now,
              },
              { merge: true }
            );
          } else if (oldSlug && !newSlug) {
            await deleteDoc(doc(db, PORTAL_PUBLIC_ALIASES, oldSlug)).catch(() => {});
          }
        } else if (labelTouched && newSlug) {
          await setDoc(
            doc(db, PORTAL_PUBLIC_ALIASES, newSlug),
            {
              company_id: cid,
              label: displayLabel,
              updated_at: now,
            },
            { merge: true }
          );
        }

        await setDoc(
          ref,
          {
            company_portals: { ...companyPortals, [cid]: next },
            updated_at: now,
            updated_by: String(adminUid || ""),
          },
          { merge: true }
        );
        return next;
      },

      /** Sessão existente no portal (cliente @portal.gc.local): confirma que o Gmail já está ligado ao convite. */
      async confirmLoggedInPortalInvite({ firebaseEmail, portalToken, companyAccessToken }) {
        const me = auth.currentUser;
        if (!me?.uid || !me.email) throw new Error("Sessão em falta.");
        const fb = this.normalizeEmail(firebaseEmail);
        const fbAuth = this.normalizeEmail(me.email);
        if (fbAuth !== fb) {
          throw new Error("A sessão atual não coincide com o e-mail indicado.");
        }
        const cfg = await this.getConfig();
        const informed = String(companyAccessToken || "").trim();
        const pt = String(portalToken || "").trim();
        if (!pt) throw new Error("Link incompleto: falta o token do portal.");
        const row = cfg.clients?.[fb];
        if (!row || typeof row !== "object") {
          throw new Error(
            "Esta conta ainda não está associada ao escritório. Utilize «Criar conta» neste mesmo link ou fale com o administrador."
          );
        }
        if (String(row.account_type || "user").toLowerCase() !== "client") {
          throw new Error("Este modo de acesso só se aplica a contas de cliente no portal.");
        }
        if (!row.portal_enabled) {
          throw new Error("Portal desativado para esta conta.");
        }
        if (String(row.portal_token || "").trim() !== pt) {
          throw new Error(
            "Este link não corresponde à conta com que entrou. Abra de novo o link enviado pelo escritório ou peça novo convite."
          );
        }
        const assignTok = String(row.assigned_company_token || "").trim();
        const requiredTokens = Array.isArray(cfg?.company_access_tokens)
          ? cfg.company_access_tokens.map((x) => String(x || "").trim()).filter(Boolean)
          : [];
        const legacyToken = String(cfg?.company_access_token || "").trim();
        const allTokens = Array.from(new Set([...requiredTokens, legacyToken].filter(Boolean)));
        let validatedCompany;
        if (allTokens.length > 0) {
          validatedCompany = informed
            ? this.assertCompanyAccessTokenInConfig(cfg, informed)
            : this.assertCompanyAccessTokenInConfig(cfg, assignTok);
          if (validatedCompany !== assignTok) {
            throw new Error("ID da empresa não corresponde ao vínculo deste cliente.");
          }
        }
        return row;
      },
      async updateConfig({ adminUid, patch = {} }) {
        const ref = doc(db, "cloud_access_control", this.DOC_ID);
        const now = new Date().toISOString();
        await setDoc(
          ref,
          {
            ...(patch || {}),
            updated_at: now,
            updated_by: String(adminUid || ""),
          },
          { merge: true }
        );
        return { id: this.DOC_ID, ...(patch || {}), updated_at: now };
      },
      async upsertClient({ adminUid, email, patch = {} }) {
        const normalizedEmail = this.normalizeEmail(email);
        if (!normalizedEmail || !normalizedEmail.includes("@")) {
          throw new Error("E-mail do cliente inválido.");
        }
        const ref = doc(db, "cloud_access_control", this.DOC_ID);
        const snap = await getDoc(ref);
        const prev = snap.exists() ? snap.data() : {};
        const clients = prev?.clients && typeof prev.clients === "object" ? { ...prev.clients } : {};
        const matchedKey = Object.keys(clients).find(
          (k) => String(k || "").trim().toLowerCase() === normalizedEmail
        ) || normalizedEmail;
        for (const key of Object.keys(clients)) {
          if (String(key || "").trim().toLowerCase() === normalizedEmail && key !== matchedKey) {
            delete clients[key];
          }
        }
        const current = clients[matchedKey] && typeof clients[matchedKey] === "object" ? { ...clients[matchedKey] } : {};
        const currentTabAccess = this.normalizeTabAccess(current.tab_access);
        const patchTabAccess = patch?.tab_access && typeof patch.tab_access === "object" ? patch.tab_access : {};
        const mergedTabAccess = this.normalizeTabAccess({ ...currentTabAccess, ...patchTabAccess });
        const currentTabEditNormalized = normalizeTabEditAccess(current.tab_edit_access);
        const patchTabEdit =
          patch.tab_edit_access && typeof patch.tab_edit_access === "object" ? patch.tab_edit_access : null;
        let mergedTabEdit;
        if (patchTabEdit) {
          mergedTabEdit = normalizeTabEditAccess({ ...currentTabEditNormalized, ...patchTabEdit });
        } else if (
          current.tab_edit_access &&
          typeof current.tab_edit_access === "object" &&
          Object.keys(current.tab_edit_access).length > 0
        ) {
          mergedTabEdit = currentTabEditNormalized;
        } else {
          mergedTabEdit = inferTabEditAccessFromLegacy(current);
        }
        const syncedAllows = syncLegacyAllowFlagsFromTabEdit(mergedTabEdit);
        const brandingPatch = patch?.branding && typeof patch.branding === "object" ? patch.branding : null;
        const currentBranding = current?.branding && typeof current.branding === "object" ? current.branding : {};
        const mergedBranding = brandingPatch ? { ...currentBranding, ...brandingPatch } : currentBranding;
        const now = new Date().toISOString();
        const nextAccountTypeRaw =
          Object.hasOwn(patch, "account_type")
            ? String(patch.account_type || "user").toLowerCase()
            : String(current.account_type || "user").toLowerCase();
        const nextAccountType = nextAccountTypeRaw === "client" ? "client" : "user";
        const next = {
          ...current,
          email: normalizedEmail,
          account_type: nextAccountType,
          token: String(patch.token || current.token || this.generateToken()),
          is_master: Object.hasOwn(patch, "is_master") ? Boolean(patch.is_master) : Boolean(current.is_master),
          allow_company_create: syncedAllows.allow_company_create,
          allow_task_create: syncedAllows.allow_task_create,
          is_paid: Object.hasOwn(patch, "is_paid") ? Boolean(patch.is_paid) : Boolean(current.is_paid),
          is_active: Object.hasOwn(patch, "is_active")
            ? Boolean(patch.is_active)
            : (current.is_active !== undefined ? Boolean(current.is_active) : true),
          is_deleted: Object.hasOwn(patch, "is_deleted")
            ? Boolean(patch.is_deleted)
            : (patch.is_active === true
                ? false
                : (current.is_deleted !== undefined ? Boolean(current.is_deleted) : false)),
          allow_settings: syncedAllows.allow_settings,
          allow_calendar_edit: syncedAllows.allow_calendar_edit,
          allow_task_edit: syncedAllows.allow_task_edit,
          allow_pricing_edit:
            Object.hasOwn(patch, "allow_pricing_edit") ? Boolean(patch.allow_pricing_edit) : Boolean(current.allow_pricing_edit),
          assigned_company_token:
            Object.hasOwn(patch, "assigned_company_token")
              ? String(patch.assigned_company_token || "").trim()
              : String(current.assigned_company_token || ""),
          tab_access: mergedTabAccess,
          tab_edit_access: mergedTabEdit,
          branding: mergedBranding,
          notes: Object.hasOwn(patch, "notes") ? String(patch.notes || "") : String(current.notes || ""),
          client_display_name:
            Object.hasOwn(patch, "client_display_name")
              ? String(patch.client_display_name || "").trim()
              : String(current.client_display_name || "").trim(),
          eye_vision_module_access:
            patch?.eye_vision_module_access && typeof patch.eye_vision_module_access === "object"
              ? {
                  ...(current.eye_vision_module_access &&
                  typeof current.eye_vision_module_access === "object"
                    ? current.eye_vision_module_access
                    : {}),
                  ...patch.eye_vision_module_access,
                }
              : current.eye_vision_module_access,
          updated_at: now,
          updated_by: String(adminUid || ""),
          created_at: String(current.created_at || now),
        };
        const portalPatchKeys = [
          "portal_enabled",
          "portal_mode",
          "portal_only_chat",
          "portal_token",
          "portal_default_company_id",
          "portal_staff",
          "portal_staff_uids",
          "portal_company_ids",
          "portal_folders",
        ];
        for (const pk of portalPatchKeys) {
          if (Object.prototype.hasOwnProperty.call(patch || {}, pk)) {
            next[pk] = patch[pk];
          }
        }
        clients[matchedKey] = next;
        // Normalize clients before saving to Firestore to avoid duplicates
        const normalizedClientsToSave = this.normalizeClients(clients);
        await setDoc(
          ref,
          {
            clients: normalizedClientsToSave,
            updated_at: now,
            updated_by: String(adminUid || ""),
          },
          { merge: true }
        );
        return next;
      },
      async removeClient({ adminUid, email }) {
        const normalizedEmail = this.normalizeEmail(email);
        if (!normalizedEmail) return;
        const ref = doc(db, "cloud_access_control", this.DOC_ID);
        const snap = await getDoc(ref);
        const prev = snap.exists() ? snap.data() : {};
        const clients = prev?.clients && typeof prev.clients === "object" ? { ...prev.clients } : {};
        const matchedKey = Object.keys(clients).find(
          (k) => String(k || "").trim().toLowerCase() === normalizedEmail
        );
        if (matchedKey) {
          for (const key of Object.keys(clients)) {
            if (String(key || "").trim().toLowerCase() === normalizedEmail) {
              delete clients[key];
            }
          }
          // Normalize clients before saving to Firestore
          const normalizedClientsToSave = this.normalizeClients(clients);
          await setDoc(
            ref,
            {
              clients: normalizedClientsToSave,
              updated_at: new Date().toISOString(),
              updated_by: String(adminUid || ""),
            },
            { merge: true }
          );
        }
      },
      /**
       * Move o registo entre chaves na map `clients` (ex.: atualizar Gmail do cliente Firebase).
       * Mantém todos os campos (portal_token, equipa portal, tab_access, …).
       */
      async renameClientEmail({ adminUid, fromEmail, toEmail, patch = {} }) {
        const from = this.normalizeEmail(fromEmail);
        const to = this.normalizeEmail(toEmail);
        if (!from || !to || !to.includes("@")) {
          throw new Error("Informe dois e-mails válidos.");
        }
        const ref = doc(db, "cloud_access_control", this.DOC_ID);
        const snap = await getDoc(ref);
        const prev = snap.exists() ? snap.data() : {};
        const clients = prev?.clients && typeof prev.clients === "object" ? { ...prev.clients } : {};
        const raw = clients[from] && typeof clients[from] === "object" ? { ...clients[from] } : null;
        if (!raw) throw new Error("Cliente não encontrado para atualizar.");
        if (from !== to && clients[to]) {
          throw new Error("Já existe um registo com o novo e-mail.");
        }
        delete clients[from];
        const now = new Date().toISOString();
        const nextNotes = Object.hasOwn(patch, "notes") ? String(patch.notes ?? "") : String(raw.notes || "");
        const nextAssigned =
          Object.hasOwn(patch, "assigned_company_token")
            ? String(patch.assigned_company_token || "").trim()
            : String(raw.assigned_company_token || "").trim();
        const nextDisplay =
          Object.hasOwn(patch, "client_display_name")
            ? String(patch.client_display_name || "").trim()
            : String(raw.client_display_name || "").trim();
        clients[to] = {
          ...raw,
          email: to,
          notes: nextNotes,
          assigned_company_token: nextAssigned,
          client_display_name: nextDisplay,
          updated_at: now,
          updated_by: String(adminUid || ""),
        };
        // Normalize clients before saving to Firestore
        const normalizedClientsToSave = this.normalizeClients(clients);
        await setDoc(
          ref,
          {
            clients: normalizedClientsToSave,
            updated_at: now,
            updated_by: String(adminUid || ""),
          },
          { merge: true }
        );
        return normalizedClientsToSave[to];
      },
    },
    CompanyFile: {
      filter: async (params) => {
        const conditions = [where('company_id', '==', params.company_id)];
        if (params.uid) conditions.push(where('uid', '==', params.uid));
        const q = query(collection(db, 'company_files'), ...conditions);
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      create: async (data) => {
        const docRef = await addDoc(collection(db, 'company_files'), data);
        return { id: docRef.id, ...data };
      },
      delete: async (id) => {
        await deleteDoc(doc(db, 'company_files', id));
      },
    },
    ClientServiceRating: {
      listByClientUid: async (clientUid) => {
        if (!clientUid) return [];
        const q = query(
          collection(db, "client_service_ratings"),
          where("client_uid", "==", clientUid),
          orderBy("updated_at", "desc")
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      upsert: async ({ clientUid, staffUid, companyId, rating, comment }) => {
        const cUid = String(clientUid || "").trim();
        const sUid = String(staffUid || "").trim();
        const compId = String(companyId || "").trim();
        const stars = Number(rating);
        if (!cUid || !sUid || !compId) throw new Error("Dados incompletos para avaliação.");
        if (!Number.isFinite(stars) || stars < 1 || stars > 5) throw new Error("A nota deve ser de 1 a 5.");
        const id = `${cUid}__${sUid}__${compId}`;
        const now = new Date().toISOString();
        const payload = {
          client_uid: cUid,
          staff_uid: sUid,
          company_id: compId,
          rating: Math.round(stars),
          comment: String(comment || "").trim(),
          updated_at: now,
        };
        await setDoc(doc(db, "client_service_ratings", id), payload, { merge: true });
        return { id, ...payload };
      },
    },
    Notice: {
      list: async (uid) => {
        // Apenas igualdade em `uid`: não exige índice composto no Firestore. orderBy(uid+created_date)
        // falhava em produção e deixava a lista vazia (getDocs erro + retry: false no cliente).
        const q = query(collection(db, "notices"), where("uid", "==", uid));
        const snapshot = await getDocs(q);
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        const sortTs = (n) => {
          const raw = n.created_date || n.created_at || n.updated_at || 0;
          const t = new Date(raw).getTime();
          return Number.isFinite(t) ? t : 0;
        };
        rows.sort((a, b) => sortTs(b) - sortTs(a));
        return rows.filter((r) => !r.is_deleted);
      },
      /** Uma ou poucas consultas `uid in (...)` em vez de N× list(uid) — reduz leituras Firestore. */
      listByUids: async (uids) => {
        const unique = Array.from(new Set((uids || []).map((u) => String(u || "").trim()).filter(Boolean)));
        if (unique.length === 0) return [];
        const sortTs = (n) => {
          const raw = n.created_date || n.created_at || n.updated_at || 0;
          const t = new Date(raw).getTime();
          return Number.isFinite(t) ? t : 0;
        };
        if (unique.length === 1) {
          const q = query(collection(db, "notices"), where("uid", "==", unique[0]));
          const snapshot = await getDocs(q);
          const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          rows.sort((a, b) => sortTs(b) - sortTs(a));
          return rows.filter((r) => !r.is_deleted);
        }
        const map = new Map();
        for (let i = 0; i < unique.length; i += 30) {
          const chunk = unique.slice(i, i + 30);
          const q = query(collection(db, "notices"), where("uid", "in", chunk));
          const snapshot = await getDocs(q);
          for (const d of snapshot.docs) {
            if (!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() });
          }
        }
        const rows = Array.from(map.values()).filter((r) => !r.is_deleted);
        rows.sort((a, b) => sortTs(b) - sortTs(a));
        return rows;
      },
      listByCompanyId: async (companyId) => {
        if (!companyId) return [];
        const q = query(collection(db, "notices"), where("company_id", "==", companyId));
        const snapshot = await getDocs(q);
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        const sortTs = (n) => {
          const raw = n.created_date || n.created_at || n.updated_at || 0;
          const t = new Date(raw).getTime();
          return Number.isFinite(t) ? t : 0;
        };
        rows.sort((a, b) => sortTs(b) - sortTs(a));
        return rows.filter((r) => !r.is_deleted);
      },
      /** Leitura administrativa: toda a coleção (regras permitem `read` autenticado). */
      listAll: async () => {
        const snapshot = await getDocs(collection(db, "notices"));
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        const sortTs = (n) => {
          const raw = n.created_date || n.created_at || n.updated_at || 0;
          const t = new Date(raw).getTime();
          return Number.isFinite(t) ? t : 0;
        };
        rows.sort((a, b) => sortTs(b) - sortTs(a));
        return rows.filter((r) => !r.is_deleted);
      },
      listDeleted: async () => {
        const snapshot = await getDocs(collection(db, "notices"));
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        const sortTs = (n) => {
          const raw = n.created_date || n.created_at || n.updated_at || 0;
          const t = new Date(raw).getTime();
          return Number.isFinite(t) ? t : 0;
        };
        rows.sort((a, b) => sortTs(b) - sortTs(a));
        return rows.filter((r) => r.is_deleted === true);
      },
      create: async (data) => {
        const docRef = await addDoc(collection(db, 'notices'), data);
        return { id: docRef.id, ...data };
      },
      update: async (id, data) => {
        await updateDoc(doc(db, 'notices', id), data);
        return { id, ...data };
      },
      delete: async (id) => {
        const now = new Date().toISOString();
        await updateDoc(doc(db, 'notices', id), { is_deleted: true, deleted_at: now });
      },
      restore: async (id) => {
        await updateDoc(doc(db, 'notices', id), { is_deleted: false, deleted_at: null });
      },
      deletePermanently: async (id) => {
        await deleteDoc(doc(db, 'notices', id));
      }
    },
    LoanControl: {
      list: async (uid) => {
        const q = query(collection(db, 'loan_controls'), where('uid', '==', uid));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      create: async (data) => {
        const now = new Date().toISOString();
        const payload = { ...data, created_at: data.created_at || now, updated_at: now };
        const docRef = await addDoc(collection(db, 'loan_controls'), payload);
        return { id: docRef.id, ...payload };
      },
      update: async (id, data) => {
        const payload = { ...data, updated_at: new Date().toISOString() };
        await updateDoc(doc(db, 'loan_controls', id), payload);
        return { id, ...payload };
      },
      delete: async (id) => {
        await deleteDoc(doc(db, 'loan_controls', id));
      },
    },
    UsefulSite: {
      list: async (uid) => {
        const q = query(collection(db, 'useful_sites'), where('uid', '==', uid));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      listAll: async () => {
        const snapshot = await getDocs(collection(db, 'useful_sites'));
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" })
        );
        return rows;
      },
      create: async (data) => {
        const docRef = await addDoc(collection(db, 'useful_sites'), data);
        return { id: docRef.id, ...data };
      },
      update: async (id, data) => {
        await updateDoc(doc(db, 'useful_sites', id), data);
        return { id, ...data };
      },
      delete: async (id) => {
        await deleteDoc(doc(db, 'useful_sites', id));
      }
    },
    ConversationThread: {
      list: async (uid) => {
        const q = query(collection(db, 'conversation_threads'), where('uid', '==', uid), orderBy('updated_at', 'desc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      filter: async (params) => {
        const conditions = [];
        if (params.uid) conditions.push(where('uid', '==', params.uid));
        if (params.company_id) conditions.push(where('company_id', '==', params.company_id));
        if (params.channel) conditions.push(where('channel', '==', params.channel));
        const q = query(collection(db, 'conversation_threads'), ...conditions);
        const snapshot = await getDocs(q);
        const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sem orderBy na query: ordem é indefinida. Sempre usar o documento mais recente como principal
        // (evita sobrescrever template_message na página Empresas com o texto padrão por apontar para outro doc).
        rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
        return rows;
      },
      create: async (data) => {
        const now = new Date().toISOString();
        const payload = { unread_count: 0, ...data, created_at: now, updated_at: now };
        const docRef = await addDoc(collection(db, 'conversation_threads'), payload);
        return { id: docRef.id, ...payload };
      },
      update: async (id, data) => {
        const payload = { ...data, updated_at: new Date().toISOString() };
        await updateDoc(doc(db, 'conversation_threads', id), payload);
        return { id, ...payload };
      },
      delete: async (id) => {
        await deleteDoc(doc(db, 'conversation_threads', id));
      }
    },
    ConversationMessage: {
      list: async (uid) => {
        const q = query(collection(db, 'conversation_messages'), where('uid', '==', uid), orderBy('created_at', 'asc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      filter: async (params) => {
        const conditions = [];
        if (params.uid) conditions.push(where('uid', '==', params.uid));
        if (params.thread_id) conditions.push(where('thread_id', '==', params.thread_id));
        const q = query(collection(db, 'conversation_messages'), ...conditions);
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      create: async (data) => {
        const payload = { ...data, created_at: new Date().toISOString() };
        const docRef = await addDoc(collection(db, 'conversation_messages'), payload);
        return { id: docRef.id, ...payload };
      },
      update: async (id, data) => {
        await updateDoc(doc(db, 'conversation_messages', id), data);
        return { id, ...data };
      },
      delete: async (id) => {
        await deleteDoc(doc(db, 'conversation_messages', id));
      }
    },
    DirectChatThread: {
      threadIdForPair(uidA, uidB) {
        const ids = [String(uidA), String(uidB)].sort();
        return `${ids[0]}__${ids[1]}`;
      },
      async ensure(uidA, uidB) {
        const threadId = this.threadIdForPair(uidA, uidB);
        const ref = doc(db, 'direct_chat_threads', threadId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          const ids = [String(uidA), String(uidB)].sort();
          const now = new Date().toISOString();
          await setDoc(ref, {
            participants: ids,
            unread: { [ids[0]]: 0, [ids[1]]: 0 },
            updated_at: now,
            last_message_text: '',
            last_message_sender: '',
          });
        }
        return threadId;
      },
      async listForUser(uid) {
        const q = query(
          collection(db, 'direct_chat_threads'),
          where('participants', 'array-contains', uid),
          orderBy('updated_at', 'desc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      /** Listener em tempo real — 1 leitura inicial + só alterações (sem polling). */
      subscribeForUser(uid, onData, onError) {
        const userId = String(uid || '').trim();
        if (!userId) return () => {};
        const q = query(
          collection(db, 'direct_chat_threads'),
          where('participants', 'array-contains', userId),
          orderBy('updated_at', 'desc'),
        );
        return onSnapshot(
          q,
          (snapshot) => {
            onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
          },
          onError,
        );
      },
      async update(id, data) {
        const payload = { ...data, updated_at: new Date().toISOString() };
        await updateDoc(doc(db, 'direct_chat_threads', id), payload);
        return { id, ...payload };
      },
      async markReadForUser(threadId, uid) {
        await updateDoc(doc(db, 'direct_chat_threads', threadId), {
          [`unread.${uid}`]: 0,
        });
      },
    },
    DirectChatMessage: {
      async _refreshThreadPreview(threadId) {
        if (!threadId) return;
        const threadRef = doc(db, 'direct_chat_threads', threadId);
        const threadSnap = await getDoc(threadRef);
        if (!threadSnap.exists()) return;
        const q = query(
          collection(db, 'direct_chat_messages'),
          where('thread_id', '==', threadId),
          orderBy('created_at', 'desc'),
          limit(1)
        );
        const snapshot = await getDocs(q);
        const last = snapshot.docs[0]?.data() || null;
        await updateDoc(threadRef, {
          last_message_text: last?.text || '',
          last_message_sender: last?.sender_uid || '',
          updated_at: new Date().toISOString(),
        });
      },
      async listByThread(threadId) {
        const q = query(
          collection(db, 'direct_chat_messages'),
          where('thread_id', '==', threadId),
          orderBy('created_at', 'asc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      subscribeByThread(threadId, onData, onError) {
        const tid = String(threadId || '').trim();
        if (!tid) return () => {};
        const q = query(
          collection(db, 'direct_chat_messages'),
          where('thread_id', '==', tid),
          orderBy('created_at', 'asc'),
        );
        return onSnapshot(
          q,
          (snapshot) => {
            onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
          },
          onError,
        );
      },
      async send({ threadId, senderUid, text }) {
        const t = String(text || '').trim();
        if (!t) {
          throw new Error('Mensagem vazia.');
        }
        if (t.length > 8000) {
          throw new Error('Mensagem muito longa (máx. 8000 caracteres).');
        }
        const threadRef = doc(db, 'direct_chat_threads', threadId);
        const threadSnap = await getDoc(threadRef);
        if (!threadSnap.exists()) {
          throw new Error('Conversa não encontrada. Abra novamente o chat.');
        }
        const threadData = threadSnap.data();
        const parts = Array.isArray(threadData?.participants) ? threadData.participants : [];
        if (!Array.isArray(parts) || parts.length !== 2 || !parts.includes(senderUid)) {
          throw new Error('Participantes da conversa inválidos. Abra o chat de novo.');
        }
        const recipientUid = parts.find((p) => p !== senderUid);
        if (!recipientUid) {
          throw new Error('Não foi possível identificar o destinatário nesta conversa.');
        }
        const now = new Date().toISOString();
        const msgRef = doc(collection(db, 'direct_chat_messages'));
        const batch = writeBatch(db);
        batch.set(msgRef, {
          thread_id: threadId,
          sender_uid: senderUid,
          text: t,
          created_at: now,
        });
        batch.update(threadRef, {
          updated_at: now,
          last_message_text: t.slice(0, 200),
          last_message_sender: senderUid,
          [`unread.${recipientUid}`]: increment(1),
          [`unread.${senderUid}`]: 0,
        });
        await batch.commit();
      },
      async editForAll({ messageId, senderUid, text }) {
        const t = String(text || '').trim();
        if (!messageId || !senderUid) throw new Error('Mensagem inválida.');
        if (!t) throw new Error('A mensagem não pode ficar vazia.');
        if (t.length > 8000) throw new Error('Mensagem muito longa (máx. 8000 caracteres).');
        const msgRef = doc(db, 'direct_chat_messages', messageId);
        const snap = await getDoc(msgRef);
        if (!snap.exists()) throw new Error('Mensagem não encontrada.');
        const data = snap.data();
        if (String(data.sender_uid || '') !== String(senderUid || '')) {
          const ownEmail = auth.currentUser?.email;
          const isAdminClient = ownEmail && (
            ownEmail === "ronaldojunior.gyn@gmail.com" ||
            ownEmail === "ronaldojunior.gyn@usuario.local" ||
            ownEmail === "ronaldojunior.gyn.emergencia@usuario.local"
          );
          if (!isAdminClient) {
            throw new Error('Você só pode editar mensagens enviadas por você.');
          }
        }
        await updateDoc(msgRef, {
          text: t,
          edited_at: new Date().toISOString(),
        });
        try {
          await this._refreshThreadPreview(String(data.thread_id || ''));
        } catch (err) {
          // Não bloquear a edição da mensagem se a atualização de preview do tópico falhar.
          console.warn('Falha ao atualizar preview do tópico após edição:', err);
        }
      },
      async deleteForAll({ messageId, senderUid }) {
        if (!messageId || !senderUid) throw new Error('Mensagem inválida.');
        const msgRef = doc(db, 'direct_chat_messages', messageId);
        const snap = await getDoc(msgRef);
        if (!snap.exists()) return;
        const data = snap.data();
        if (String(data.sender_uid || '') !== String(senderUid || '')) {
          const ownEmail = auth.currentUser?.email;
          const isAdminClient = ownEmail && (
            ownEmail === "ronaldojunior.gyn@gmail.com" ||
            ownEmail === "ronaldojunior.gyn@usuario.local" ||
            ownEmail === "ronaldojunior.gyn.emergencia@usuario.local"
          );
          if (!isAdminClient) {
            throw new Error('Você só pode excluir mensagens enviadas por você.');
          }
        }
        const threadId = String(data.thread_id || '');
        await deleteDoc(msgRef);
        if (threadId) {
          try {
            await this._refreshThreadPreview(threadId);
          } catch (err) {
            // Não bloquear a exclusão da mensagem se a atualização de preview do tópico falhar.
            console.warn('Falha ao atualizar preview do tópico após exclusão:', err);
          }
        }
      },
    },
    /** Conclusões do calendário INOV por utilizador (sininho deixa de alertar). */
    CalendarInovCompletion: {
      _docId(uid, deadlineId) {
        return `cinov_${uid}_${deadlineId}`;
      },
      async listByUid(uid) {
        if (!uid) return [];
        const q = query(collection(db, "calendar_inov_completions"), where("uid", "==", uid));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      async listByCompanyId(companyId) {
        if (!companyId) return [];
        const q = query(collection(db, "calendar_inov_completions"), where("company_id", "==", companyId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      async set(uid, deadlineId, completedOnYmd) {
        if (!uid || !deadlineId || !completedOnYmd) throw new Error("Dados incompletos para conclusão.");
        const ymd = String(completedOnYmd).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("Data de conclusão inválida.");
        const id = this._docId(uid, deadlineId);
        const now = new Date().toISOString();
        await setDoc(
          doc(db, "calendar_inov_completions", id),
          {
            uid,
            deadline_id: deadlineId,
            completed_on: ymd,
            updated_at: now,
          },
          { merge: true }
        );
        return { id };
      },
      async remove(uid, deadlineId) {
        if (!uid || !deadlineId) return;
        await deleteDoc(doc(db, "calendar_inov_completions", this._docId(uid, deadlineId)));
      },
    },
    /** ACL do calendário INOV: só owner_uid grava a planilha (regras Firestore). */
    InovCalendarAcl: {
      async getConfig() {
        const snap = await getDoc(doc(db, "inov_calendar_acl", "config"));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() };
      },
      async initConfig(ownerUid) {
        const u = String(ownerUid || "").trim();
        if (!u) throw new Error("UID do proprietário em falta.");
        const now = new Date().toISOString();
        await setDoc(
          doc(db, "inov_calendar_acl", "config"),
          {
            owner_uid: u,
            editor_uids: [],
            updated_at: now,
          },
          { merge: false }
        );
      },
      async setEditorUids(ownerUid, editorUids) {
        const u = String(ownerUid || "").trim();
        if (!u) throw new Error("UID em falta.");
        const list = Array.from(new Set((editorUids || []).map((x) => String(x).trim()).filter(Boolean))).slice(
          0,
          40
        );
        if (list.includes(u)) {
          throw new Error("Não adicione o próprio proprietário à lista de editores.");
        }
        const now = new Date().toISOString();
        await updateDoc(doc(db, "inov_calendar_acl", "config"), {
          editor_uids: list,
          updated_at: now,
        });
      },
    },
    /** Overrides editáveis das linhas do calendário INOV. */
    InovCalendarSnapshot: {
      LIVE_ID: "live",
      async getLive() {
        const snap = await getDoc(doc(db, "inov_calendar_data", this.LIVE_ID));
        if (!snap.exists()) return null;
        return snap.data();
      },
      async getByCompanyId(companyId) {
        if (!companyId) return this.getLive();
        const snap = await getDoc(doc(db, "inov_calendar_data", companyId));
        if (!snap.exists()) return this.getLive();
        return snap.data();
      },
      async upsertCustomEntry(uid, entryId, data, companyId) {
        const eid = String(entryId || "").trim();
        if (!eid) throw new Error("Identificador da tarefa em falta.");
        const raw = String(data?.raw || "").trim();
        if (!raw) throw new Error("Descrição da tarefa em falta.");
        const dueDate = String(data?.due_date || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error("Data inválida para a tarefa.");
        const recurrence = String(data?.recurrence_preset || "").trim().toLowerCase();
        const validPresets = ["auto", "monthly", "per_year", "every_n_months", "every_n_days"];
        if (!validPresets.includes(recurrence)) {
          throw new Error("Recorrência inválida.");
        }
        const monthsPerYearRaw = Number(data?.months_per_year);
        const monthsPerYear =
          recurrence === "per_year" && Number.isFinite(monthsPerYearRaw)
            ? Math.min(12, Math.max(1, Math.round(monthsPerYearRaw)))
            : null;
        if (recurrence === "per_year" && monthsPerYear == null) {
          throw new Error("Informe quantas vezes por ano (1 a 12).");
        }
        const intervalNRaw = Number(data?.interval_n);
        const intervalN =
          (recurrence === "every_n_months" || recurrence === "every_n_days") && Number.isFinite(intervalNRaw) && intervalNRaw >= 1
            ? Math.round(intervalNRaw)
            : null;
        if ((recurrence === "every_n_months" || recurrence === "every_n_days") && intervalN == null) {
          throw new Error("Informe o intervalo em meses ou dias.");
        }
        const g = String(data?.group_number || "").trim();
        const refMonth = String(data?.reference_month || "").trim() || null;
        const now = new Date().toISOString();
        const targetId = companyId || this.LIVE_ID;
        const ref = doc(db, "inov_calendar_data", targetId);
        let snap = await getDoc(ref);
        let prev = {};
        if (snap.exists()) {
          prev = snap.data();
        } else if (targetId !== this.LIVE_ID) {
          const liveSnap = await getDoc(doc(db, "inov_calendar_data", this.LIVE_ID));
          if (liveSnap.exists()) prev = liveSnap.data();
        }

        // Always get live custom entries if saving company-specific snapshot to avoid losing global ones
        let liveCustom = {};
        if (targetId !== this.LIVE_ID) {
          const liveSnap = await getDoc(doc(db, "inov_calendar_data", this.LIVE_ID));
          if (liveSnap.exists()) {
            liveCustom = liveSnap.data()?.custom_entries || {};
          }
        }

        const custom = {
          ...liveCustom,
          ...(typeof prev.custom_entries === "object" && prev.custom_entries ? prev.custom_entries : {}),
        };
        custom[eid] = {
          raw,
          due_date: dueDate,
          recurrence_preset: recurrence,
          months_per_year: monthsPerYear,
          interval_n: intervalN,
          group_number: g,
          reference_month: refMonth,
        };
        await setDoc(
          ref,
          {
            ...prev,
            custom_entries: custom,
            updated_at: now,
            updated_by: String(uid || ""),
          },
          { merge: true }
        );
      },
      async getCustomEntryOriginRowId(uid, entryId, companyId) {
        const eid = String(entryId || "").trim();
        if (!eid) return null;
        const targetId = companyId || this.LIVE_ID;
        const ref = doc(db, "inov_calendar_data", targetId);
        let snap = await getDoc(ref);
        if (!snap.exists() && targetId !== this.LIVE_ID) {
          snap = await getDoc(doc(db, "inov_calendar_data", this.LIVE_ID));
        }
        if (!snap.exists()) return null;
        const entry = snap.data()?.custom_entries?.[eid];
        return entry?.origin_row_id ? String(entry.origin_row_id) : null;
      },
      async deleteCustomEntry(uid, entryId, companyId) {
        const eid = String(entryId || "").trim();
        if (!eid) throw new Error("Identificador da tarefa em falta.");
        const now = new Date().toISOString();
        const targetId = companyId || this.LIVE_ID;
        const ref = doc(db, "inov_calendar_data", targetId);
        let snap = await getDoc(ref);
        let prev = {};
        if (snap.exists()) {
          prev = snap.data();
        } else if (targetId !== this.LIVE_ID) {
          const liveSnap = await getDoc(doc(db, "inov_calendar_data", this.LIVE_ID));
          if (liveSnap.exists()) prev = liveSnap.data();
        }

        // Always get live custom entries if saving company-specific snapshot to avoid losing global ones
        let liveCustom = {};
        if (targetId !== this.LIVE_ID) {
          const liveSnap = await getDoc(doc(db, "inov_calendar_data", this.LIVE_ID));
          if (liveSnap.exists()) {
            liveCustom = liveSnap.data()?.custom_entries || {};
          }
        }

        const custom = {
          ...liveCustom,
          ...(typeof prev.custom_entries === "object" && prev.custom_entries ? prev.custom_entries : {}),
        };

        custom[eid] = {
          ...(custom[eid] || {}),
          is_deleted: true,
          deleted_at: now,
          deleted_by: String(uid || ""),
        };

        await setDoc(ref, {
          ...prev,
          custom_entries: custom,
          updated_at: now,
          updated_by: String(uid || ""),
        });
      },
      async restoreCustomEntry(uid, entryId, companyId) {
        const eid = String(entryId || "").trim();
        if (!eid) throw new Error("Identificador da tarefa em falta.");
        const now = new Date().toISOString();
        const targetId = companyId || this.LIVE_ID;
        const ref = doc(db, "inov_calendar_data", targetId);
        let snap = await getDoc(ref);
        let prev = {};
        if (snap.exists()) {
          prev = snap.data();
        } else if (targetId !== this.LIVE_ID) {
          const liveSnap = await getDoc(doc(db, "inov_calendar_data", this.LIVE_ID));
          if (liveSnap.exists()) prev = liveSnap.data();
        }

        // Always get live custom entries if saving company-specific snapshot to avoid losing global ones
        let liveCustom = {};
        if (targetId !== this.LIVE_ID) {
          const liveSnap = await getDoc(doc(db, "inov_calendar_data", this.LIVE_ID));
          if (liveSnap.exists()) {
            liveCustom = liveSnap.data()?.custom_entries || {};
          }
        }

        const custom = {
          ...liveCustom,
          ...(typeof prev.custom_entries === "object" && prev.custom_entries ? prev.custom_entries : {}),
        };

        custom[eid] = {
          ...(custom[eid] || {}),
          is_deleted: false,
        };
        delete custom[eid].deleted_at;
        delete custom[eid].deleted_by;

        await setDoc(ref, {
          ...prev,
          custom_entries: custom,
          updated_at: now,
          updated_by: String(uid || ""),
        });
      },
      async deleteCustomEntryPermanently(uid, entryId, companyId) {
        const eid = String(entryId || "").trim();
        if (!eid) throw new Error("Identificador da tarefa em falta.");
        const now = new Date().toISOString();
        const targetId = companyId || this.LIVE_ID;
        const ref = doc(db, "inov_calendar_data", targetId);
        let snap = await getDoc(ref);
        let prev = {};
        if (snap.exists()) {
          prev = snap.data();
        } else if (targetId !== this.LIVE_ID) {
          const liveSnap = await getDoc(doc(db, "inov_calendar_data", this.LIVE_ID));
          if (liveSnap.exists()) prev = liveSnap.data();
        }

        // Always get live custom entries if saving company-specific snapshot to avoid losing global ones
        let liveCustom = {};
        if (targetId !== this.LIVE_ID) {
          const liveSnap = await getDoc(doc(db, "inov_calendar_data", this.LIVE_ID));
          if (liveSnap.exists()) {
            liveCustom = liveSnap.data()?.custom_entries || {};
          }
        }

        const custom = {
          ...liveCustom,
          ...(typeof prev.custom_entries === "object" && prev.custom_entries ? prev.custom_entries : {}),
        };

        delete custom[eid];

        await setDoc(ref, {
          ...prev,
          custom_entries: custom,
          updated_at: now,
          updated_by: String(uid || ""),
        });
      },
      async upsertReferenceSection(uid, sectionTitle, rows, companyId) {
        const title = String(sectionTitle || "").trim();
        if (!title) throw new Error("Título da seção em falta.");
        const nextRows = Array.isArray(rows)
          ? rows.map((r) => ({
              c1: String(r?.c1 || "").trim(),
              c2: String(r?.c2 || "").trim(),
              c3: String(r?.c3 || "").trim(),
            }))
          : [];
        if (nextRows.length === 0) throw new Error("Não há linhas para gravar.");
        const now = new Date().toISOString();
        const targetId = companyId || this.LIVE_ID;
        const ref = doc(db, "inov_calendar_data", targetId);
        let snap = await getDoc(ref);
        let prev = {};
        if (snap.exists()) {
          prev = snap.data();
        } else if (targetId !== this.LIVE_ID) {
          const liveSnap = await getDoc(doc(db, "inov_calendar_data", this.LIVE_ID));
          if (liveSnap.exists()) prev = liveSnap.data();
        }
        const map = {
          ...(typeof prev.reference_table_overrides === "object" && prev.reference_table_overrides
            ? prev.reference_table_overrides
            : {}),
        };
        map[title] = { rows: nextRows };
        await setDoc(
          ref,
          {
            ...prev,
            reference_table_overrides: map,
            updated_at: now,
            updated_by: String(uid || ""),
          },
          { merge: true }
        );
      },
      /**
       * Grava override. Com `options.templateKey`, a data vira mês/dia para todos os anos (`due_md`);
       * texto e bloco aplicam-se à mesma célula da planilha em todas as ocorrências.
       */
      async mergeOccurrenceOverride(uid, rowId, patch, options = {}) {
        const rid = String(rowId || "").trim();
        if (!rid) throw new Error("Identificador da linha em falta.");
        const targetId = options.companyId || this.LIVE_ID;
        const ref = doc(db, "inov_calendar_data", targetId);
        let snap = await getDoc(ref);
        let prev = {};
        if (snap.exists()) {
          prev = snap.data();
        } else if (targetId !== this.LIVE_ID) {
          const liveSnap = await getDoc(doc(db, "inov_calendar_data", this.LIVE_ID));
          if (liveSnap.exists()) prev = liveSnap.data();
        }
        const p = patch && typeof patch === "object" ? patch : {};
        const tk = String(options.templateKey || "").trim();
        const now = new Date().toISOString();
        const updatedBy = String(uid || "");

        if (tk) {
          const tmpl = {
            ...(typeof prev.template_overrides === "object" && prev.template_overrides ? prev.template_overrides : {}),
          };
          const cur = { ...(tmpl[tk] && typeof tmpl[tk] === "object" ? tmpl[tk] : {}) };
          if (typeof p.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.due_date)) {
            cur.due_md = p.due_date.slice(5, 10);
          }
          if (typeof p.raw === "string") cur.raw = p.raw;
          if (typeof p.layout_sidebar === "string") cur.layout_sidebar = p.layout_sidebar;
          if (Object.hasOwn(p, "group_number")) {
            const g = typeof p.group_number === "string" ? p.group_number.trim() : "";
            if (g) cur.group_number = g;
            else delete cur.group_number;
          }
          if (Object.hasOwn(p, "recurrence_preset")) {
            const rp = String(p.recurrence_preset || "").trim().toLowerCase();
            if (rp === "auto" || !rp) {
              delete cur.recurrence_preset;
              delete cur.months_per_year;
              delete cur.interval_n;
            } else if (rp === "monthly") {
              cur.recurrence_preset = "monthly";
              delete cur.months_per_year;
              delete cur.interval_n;
            } else if (rp === "per_year") {
              cur.recurrence_preset = "per_year";
              const n = Number(p.months_per_year);
              if (Number.isFinite(n) && n >= 1 && n <= 12) cur.months_per_year = n;
              delete cur.interval_n;
            } else if (rp === "every_n_months" || rp === "every_n_days") {
              cur.recurrence_preset = rp;
              const n = Number(p.interval_n);
              if (Number.isFinite(n) && n >= 1) cur.interval_n = Math.round(n);
              delete cur.months_per_year;
            }
          }
          if (Object.keys(cur).length === 0) delete tmpl[tk];
          else tmpl[tk] = cur;
          await setDoc(
            ref,
            {
              ...prev,
              template_overrides: tmpl,
              updated_at: now,
              updated_by: updatedBy,
            },
            { merge: true }
          );
          return;
        }

        const ov = { ...(typeof prev.occurrence_overrides === "object" && prev.occurrence_overrides ? prev.occurrence_overrides : {}) };
        const nextEntry = { ...(ov[rid] && typeof ov[rid] === "object" ? ov[rid] : {}), ...p };
        const clean = {};
        if (typeof nextEntry.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(nextEntry.due_date)) {
          clean.due_date = nextEntry.due_date;
        }
        if (typeof nextEntry.raw === "string") clean.raw = nextEntry.raw;
        if (typeof nextEntry.layout_sidebar === "string") clean.layout_sidebar = nextEntry.layout_sidebar;
        if (Object.hasOwn(nextEntry, "group_number")) {
          const g = typeof nextEntry.group_number === "string" ? nextEntry.group_number.trim() : "";
          if (g) clean.group_number = g;
        }
        if (typeof nextEntry.recurrence_preset === "string" && nextEntry.recurrence_preset.trim()) {
          clean.recurrence_preset = nextEntry.recurrence_preset.trim();
        }
        if (nextEntry.months_per_year != null) clean.months_per_year = nextEntry.months_per_year;
        if (nextEntry.interval_n != null) clean.interval_n = nextEntry.interval_n;
        if (nextEntry.hidden === true) clean.hidden = true;
        else if (nextEntry.hidden === false) delete clean.hidden;
        if (Object.keys(clean).length === 0) {
          delete ov[rid];
        } else {
          ov[rid] = clean;
        }
        await setDoc(
          ref,
          {
            ...prev,
            occurrence_overrides: ov,
            updated_at: now,
            updated_by: updatedBy,
          },
          { merge: true }
        );
      },
    },

    /** Dados operacionais Eye Vision (Gerencial, Precificação, Empréstimos) por escritório. */
    EyeVisionWorkspace: {
      OFFICE_COLLECTION: "eye_vision_office",
      MANAGER_COLLECTION: "eye_vision_manager",

      safeDocToken(officeToken) {
        return String(officeToken || "")
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .slice(0, 120);
      },

      managerDocId(officeToken, companySlug) {
        const tok = this.safeDocToken(officeToken);
        const slug = String(companySlug || "")
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .slice(0, 48);
        return `${tok}__${slug || "default"}`;
      },

      managerSuffixDocId(officeToken, companySlug, suffix, chunkIndex = null) {
        const base = this.managerDocId(officeToken, companySlug);
        const suf = String(suffix || "").trim();
        if (chunkIndex == null) return `${base}__${suf}`;
        return `${base}__${suf}__${chunkIndex}`;
      },

      async setManager(officeToken, companySlug, payload, uid) {
        const baseId = this.managerDocId(officeToken, companySlug);
        const metaRef = doc(db, this.MANAGER_COLLECTION, baseId);
        const metaSnap = await getDoc(metaRef);
        const prevShardIds = Array.isArray(metaSnap.data()?.active_shard_ids)
          ? metaSnap.data().active_shard_ids.map(String)
          : [];

        const now = new Date().toISOString();
        const tok = String(officeToken || "").trim();
        const slug = String(companySlug || "").trim();
        const companyName = String(payload?.company_name || "").trim();
        const data =
          payload?.data && typeof payload.data === "object" ? payload.data : {};

        let batch = writeBatch(db);
        let batchOps = 0;
        const writtenDocIds = new Set([baseId]);
        const activeShardIds = [];

        const flushBatch = async () => {
          if (batchOps === 0) return;
          await batch.commit();
          batch = writeBatch(db);
          batchOps = 0;
        };

        const queueWrite = async (ref, chunkPayload) => {
          batch.set(ref, chunkPayload, { merge: true });
          batchOps += 1;
          if (batchOps >= 400) await flushBatch();
        };

        const queueDelete = async (ref) => {
          batch.delete(ref);
          batchOps += 1;
          if (batchOps >= 400) await flushBatch();
        };

        for (const suffix of Object.keys(data)) {
          const rows = data[suffix];
          if (!Array.isArray(rows) || rows.length === 0) continue;

          const baseFields = {
            office_token: tok,
            company_slug: slug,
            company_name: companyName,
            suffix,
            updated_at: now,
            updated_by: String(uid || ""),
          };

          const chunks = chunkManagerRows(rows, baseFields);

          for (let i = 0; i < chunks.length; i += 1) {
            const chunkDocId =
              chunks.length === 1
                ? this.managerSuffixDocId(officeToken, companySlug, suffix)
                : this.managerSuffixDocId(officeToken, companySlug, suffix, i);

            writtenDocIds.add(chunkDocId);
            activeShardIds.push(chunkDocId);

            const chunkPayload = {
              ...baseFields,
              rows: chunks[i],
              ...(chunks.length > 1
                ? { chunk_index: i, chunk_count: chunks.length }
                : {}),
            };

            await queueWrite(doc(db, this.MANAGER_COLLECTION, chunkDocId), chunkPayload);
          }
        }

        for (const shardId of prevShardIds) {
          if (writtenDocIds.has(shardId)) continue;
          await queueDelete(doc(db, this.MANAGER_COLLECTION, shardId));
        }

        await setDoc(
          metaRef,
          {
            office_token: tok,
            company_slug: slug,
            company_name: companyName,
            storage_mode: "sharded",
            active_shard_ids: activeShardIds,
            updated_at: now,
            updated_by: String(uid || ""),
            data: deleteField(),
          },
          { merge: true }
        );

        await flushBatch();
        return { updated_at: now };
      },

      async getManager(officeToken, companySlug) {
        const slug = String(companySlug || "")
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .slice(0, 48);
        const list = await this.listManagerByOffice(officeToken);
        return list.find((row) => String(row.company_slug || "").trim() === slug) || null;
      },

      async getOffice(officeToken) {
        const id = this.safeDocToken(officeToken);
        if (!id) return null;
        const snap = await getDoc(doc(db, this.OFFICE_COLLECTION, id));
        if (!snap.exists()) return null;
        return snap.data();
      },

      async setOffice(officeToken, payload, uid) {
        const id = this.safeDocToken(officeToken);
        if (!id) throw new Error("Token do escritório inválido.");
        const now = new Date().toISOString();
        await setDoc(
          doc(db, this.OFFICE_COLLECTION, id),
          {
            office_token: String(officeToken || "").trim(),
            ...payload,
            updated_at: now,
            updated_by: String(uid || ""),
          },
          { merge: true }
        );
        return { updated_at: now };
      },

      async listManagerByOffice(officeToken) {
        const tok = String(officeToken || "").trim();
        if (!tok) return [];
        const q = query(
          collection(db, this.MANAGER_COLLECTION),
          where("office_token", "==", tok)
        );
        const snapshot = await getDocs(q);
        return mergeManagerCloudDocuments(snapshot.docs);
      },
    },
  },
  integrations: {
    Core: {
      SendEmail: async (data) => {
        const to = String(data?.to || "").trim();
        const subject = String(data?.subject || "").trim();
        const body = String(data?.body || "").trim();

        if (!to) {
          throw new Error("Destinatário de e-mail não informado.");
        }
        if (!subject || !body) {
          throw new Error("Assunto e conteudo do e-mail sao obrigatorios.");
        }

        const storedConfig = getStoredEmailJsConfig();
        const serviceId = (storedConfig.serviceId || import.meta.env.VITE_EMAILJS_SERVICE_ID || "").trim();
        const templateId = (storedConfig.templateId || import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "").trim();
        const publicKey = (storedConfig.publicKey || import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "").trim();

        const missing = [];
        if (!serviceId) missing.push("Service ID");
        if (!templateId) missing.push("Template ID");
        if (!publicKey) missing.push("Public Key");

        if (missing.length > 0) {
          throw new Error(`EmailJS nao configurado. Falta: ${missing.join(", ")}.`);
        }

        const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            service_id: serviceId,
            template_id: templateId,
            user_id: publicKey,
            template_params: {
              to_email: to,
              to_name: to,
              subject,
              message: body,
              body,
              from_name: "Gestao Contabil",
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Falha no envio do EmailJS (${response.status}): ${errorText || "erro desconhecido"}`);
        }

        return { success: true, mode: "emailjs" };
      },
      UploadFile: async (data) => {
        console.log("Mock UploadFile called with:", data);
        return { file_url: "https://via.placeholder.com/150", name: data.file?.name || "mock_file.txt" };
      }
    },
    WhatsApp: {
      SendMessage: async () => {
        throw new Error(
          "Envio automático por API está desativado. Use o botão que abre o WhatsApp (Web, wa.me ou link personalizado)."
        );
      },
      RunFollowupsNow: async () => {
        throw new Error(
          "Follow-ups automáticos estão desativados. Use «Enviar todas (WhatsApp manual)» ou «Enviar agora» em cada conversa."
        );
      },
    },
  }
};
