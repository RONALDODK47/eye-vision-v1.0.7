/**
 * Restaura o escritório INOV na aba Administrador (cloud_access_control/config.clients).
 *
 * Uso: node scripts/restore-inov-cloud-client.mjs
 *      node scripts/restore-inov-cloud-client.mjs --dry-run
 */
import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_EMAIL = "inov-b561bde9fd08@portal.gc.local";
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";
const INOV_TOKEN = "CL-FN14-AZ4ZV81Y";
const DRY_RUN = process.argv.includes("--dry-run");

function trimBranding(client) {
  if (!client || typeof client !== "object") return client;
  const out = { ...client };
  if (out.branding && typeof out.branding === "object") {
    const b = { ...out.branding };
    if (typeof b.logo_url === "string" && b.logo_url.length > 400) {
      b.logo_url = "";
    }
    out.branding = b;
  }
  out.is_deleted = false;
  out.gc_chat_only_client = false;
  out.account_type = "client";
  out.client_display_name = String(out.client_display_name || "INOV").trim() || "INOV";
  out.assigned_company_token = INOV_TOKEN;
  out.portal_enabled = true;
  out.is_active = true;
  if (!String(out.portal_token || "").trim()) {
    out.portal_token = INOV_TOKEN;
  }
  return out;
}

async function main() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const dump = JSON.parse(
    await readFile(new URL("../scratch/firestore_full_dump.json", import.meta.url), "utf8")
  );

  const dumpConfig = (dump.cloud_access_control || []).find((r) => r.id === "config")?.data || {};
  const dumpClient = dumpConfig.clients?.[INOV_EMAIL];
  if (!dumpClient) {
    throw new Error(`Cliente INOV (${INOV_EMAIL}) não encontrado no dump local.`);
  }

  const inovClient = trimBranding(dumpClient);
  const inovPortal =
    dumpConfig.company_portals?.[INOV_COMPANY_ID] || {
      portal_token: INOV_TOKEN,
      portal_enabled: true,
      name: "INOV",
    };

  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(DRY_RUN ? "=== DRY-RUN restaurar INOV na cloud ===\n" : "=== Restaurando INOV na cloud ===\n");
  const session = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`Autenticado: ${session.user.email}\n`);

  const configRef = doc(db, "cloud_access_control", "config");
  const snap = await getDoc(configRef);
  if (!snap.exists()) {
    throw new Error("Documento cloud_access_control/config não existe no Firestore.");
  }

  const current = snap.data() || {};
  const clients = { ...(current.clients || {}), [INOV_EMAIL]: inovClient };
  const companyPortals = {
    ...(current.company_portals || {}),
    [INOV_COMPANY_ID]: {
      ...inovPortal,
      portal_token: INOV_TOKEN,
      portal_enabled: true,
      name: "INOV",
    },
  };

  const tokens = new Set(
    [
      ...(Array.isArray(current.company_access_tokens) ? current.company_access_tokens : []),
      String(current.company_access_token || "").trim(),
      INOV_TOKEN,
    ].filter(Boolean)
  );

  console.log("Cliente INOV:");
  console.log(`  email: ${INOV_EMAIL}`);
  console.log(`  nome: ${inovClient.client_display_name}`);
  console.log(`  token escritório: ${inovClient.assigned_company_token}`);
  console.log(`  portal_token: ${inovClient.portal_token}`);
  console.log(`  is_deleted: ${inovClient.is_deleted}`);
  console.log(`\nTotal clients após merge: ${Object.keys(clients).length}`);

  if (!DRY_RUN) {
    await updateDoc(configRef, {
      clients,
      company_portals: companyPortals,
      company_access_tokens: Array.from(tokens),
      updated_at: new Date().toISOString(),
      updated_by: String(session.user.uid || ""),
    });
    console.log("\nINOV restaurado com sucesso na aba Administrador.");
  } else {
    console.log("\nExecute sem --dry-run para gravar no Firestore.");
  }
}

main().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
