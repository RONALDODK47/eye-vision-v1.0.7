/**
 * Remove apenas dados PESSOAIS do admin bootstrap — NUNCA o escritório INOV (token CL-FN14-AZ4ZV81Y).
 *
 * Uso: node scripts/purge-admin-data-only.mjs
 *      node scripts/purge-admin-data-only.mjs --dry-run
 */
import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_TOKEN = "CL-FN14-AZ4ZV81Y";
const INOV_CALENDAR_DOC_IDS = new Set(["live", "R1nrCcMtOoxwdBZ5LJvg"]);

const BOOTSTRAP_ADMIN_EMAILS = [
  "ronaldojunior.gyn@gmail.com",
  "ronaldojunior.gyn@usuario.local",
  "ronaldojunior.gyn.emergencia@usuario.local",
];

const DRY_RUN = process.argv.includes("--dry-run");

async function loadFirebase() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);
  return { auth, db };
}

async function resolveAdminUids(db, sessionUid) {
  const uids = new Set();
  if (sessionUid) uids.add(String(sessionUid).trim());

  for (const email of BOOTSTRAP_ADMIN_EMAILS) {
    const q = query(collection(db, "user_profiles"), where("email", "==", email));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const u = String(d.data()?.uid || d.id || "").trim();
      if (u) uids.add(u);
    });
  }

  return Array.from(uids).filter(Boolean);
}

async function deleteByUidField(db, colName, adminUids, stats) {
  for (const adminUid of adminUids) {
    const q = query(collection(db, colName), where("uid", "==", adminUid));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      stats[colName] = (stats[colName] || 0) + 1;
      if (!DRY_RUN) await deleteDoc(d.ref);
    }
  }
}

async function deleteByCompanyIds(db, colName, companyIds, stats) {
  for (const companyId of companyIds) {
    const q = query(collection(db, colName), where("company_id", "==", companyId));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      stats[colName] = (stats[colName] || 0) + 1;
      if (!DRY_RUN) await deleteDoc(d.ref);
    }
  }
}

async function main() {
  const { auth, db } = await loadFirebase();

  console.log(
    DRY_RUN
      ? "=== DRY-RUN — purga só dados pessoais do admin (INOV preservado) ===\n"
      : "=== Purga dados pessoais do admin (INOV preservado) ===\n"
  );
  console.log(`Autenticando: ${ADMIN_EMAIL}`);
  const { user } = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  const sessionUid = String(user?.uid || "").trim();
  console.log(`Sessão UID: ${sessionUid}\n`);

  const adminUids = await resolveAdminUids(db, sessionUid);
  console.log("UIDs admin:", adminUids.join(", ") || "(nenhum)");

  const stats = { companies_skipped_inov: 0 };
  const personalAdminCompanyIds = [];

  for (const adminUid of adminUids) {
    const q = query(collection(db, "companies"), where("uid", "==", adminUid));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const token = String(d.data()?.assigned_company_token || "").trim();
      if (token === INOV_TOKEN) {
        stats.companies_skipped_inov += 1;
        continue;
      }
      personalAdminCompanyIds.push(d.id);
      stats.companies = (stats.companies || 0) + 1;
      if (!DRY_RUN) await deleteDoc(d.ref);
    }
  }
  console.log(
    `Empresas pessoais do admin: ${stats.companies || 0} | preservadas INOV: ${stats.companies_skipped_inov}`
  );

  await deleteByCompanyIds(db, "tasks", personalAdminCompanyIds, stats);
  await deleteByCompanyIds(db, "company_files", personalAdminCompanyIds, stats);

  await deleteByUidField(db, "tasks", adminUids, stats);
  await deleteByUidField(db, "task_templates", adminUids, stats);
  await deleteByUidField(db, "custom_columns", adminUids, stats);
  await deleteByUidField(db, "notices", adminUids, stats);
  // Links do escritório ficam no uid admin — não apagar useful_sites
  stats.useful_sites_skipped = "preservados (escritório)";

  await deleteByUidField(db, "calendar_inov_completions", adminUids, stats);
  stats.inov_calendar_docs = "live/INOV não alterados";

  console.log("\n--- Resumo ---");
  for (const [k, v] of Object.entries(stats).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(DRY_RUN ? "\nExecute sem --dry-run para aplicar." : "\nConcluído.");
}

main().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
