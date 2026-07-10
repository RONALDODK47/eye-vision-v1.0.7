/**
 * Restaura dados do escritório INOV (token CL-FN14-AZ4ZV81Y) a partir do dump local.
 * Não restaura dados pessoais do admin fora do escopo INOV.
 *
 * Uso: node scripts/restore-inov-office-from-dump.mjs
 *      node scripts/restore-inov-office-from-dump.mjs --dry-run
 */
import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_TOKEN = "CL-FN14-AZ4ZV81Y";
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";
const DRY_RUN = process.argv.includes("--dry-run");

async function setDocSafe(db, col, id, data, stats, key) {
  stats[key] = (stats[key] || 0) + 1;
  if (DRY_RUN) return;
  await setDoc(doc(db, col, id), data, { merge: false });
}

async function main() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const dump = JSON.parse(
    await readFile(new URL("../scratch/firestore_full_dump.json", import.meta.url), "utf8")
  );
  const calendarBackup = JSON.parse(
    await readFile(new URL("../scratch/all_calendar_data.json", import.meta.url), "utf8")
  );

  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(DRY_RUN ? "=== DRY-RUN restauração INOV ===\n" : "=== Restaurando escritório INOV ===\n");
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);

  const stats = {};
  const inovCompanyIds = new Set([INOV_COMPANY_ID]);

  const companies = dump.companies || [];
  for (const row of companies) {
    const token = String(row.data?.assigned_company_token || "").trim();
    if (token !== INOV_TOKEN && row.id !== INOV_COMPANY_ID) continue;
    inovCompanyIds.add(row.id);
    await setDocSafe(db, "companies", row.id, row.data, stats, "companies");
  }
  console.log(`Empresas INOV: ${stats.companies || 0}`);

  const tasks = dump.tasks || [];
  for (const row of tasks) {
    const cid = String(row.data?.company_id || "").trim();
    if (!cid || !inovCompanyIds.has(cid)) continue;
    await setDocSafe(db, "tasks", row.id, row.data, stats, "tasks");
  }
  console.log(`Tarefas (tasks): ${stats.tasks || 0}`);

  const sites = dump.useful_sites || [];
  for (const row of sites) {
    await setDocSafe(db, "useful_sites", row.id, row.data, stats, "useful_sites");
  }
  console.log(`Links úteis: ${stats.useful_sites || 0}`);

  const templates = dump.task_templates || [];
  for (const row of templates) {
    const token = String(row.data?.assigned_company_token || row.data?.office_token || "").trim();
    if (token && token !== INOV_TOKEN) continue;
    await setDocSafe(db, "task_templates", row.id, row.data, stats, "task_templates");
  }
  console.log(`Modelos de tarefa: ${stats.task_templates || 0}`);

  const columns = dump.custom_columns || [];
  for (const row of columns) {
    await setDocSafe(db, "custom_columns", row.id, row.data, stats, "custom_columns");
  }
  console.log(`Colunas custom: ${stats.custom_columns || 0}`);

  for (const docId of ["live", INOV_COMPANY_ID]) {
    const payload = calendarBackup[docId];
    if (!payload || typeof payload !== "object") {
      console.warn(`Calendário '${docId}' ausente no backup JSON.`);
      continue;
    }
    stats[`calendar_${docId}`] = 1;
    if (!DRY_RUN) {
      await setDoc(doc(db, "inov_calendar_data", docId), payload, { merge: false });
    }
  }
  console.log(`Calendário live + INOV: restaurados do all_calendar_data.json`);

  console.log("\n--- Resumo ---");
  Object.entries(stats)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(DRY_RUN ? "\nExecute sem --dry-run para gravar." : "\nRestauração concluída.");
}

main().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
