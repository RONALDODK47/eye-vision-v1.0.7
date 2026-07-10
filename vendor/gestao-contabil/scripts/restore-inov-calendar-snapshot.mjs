import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";

async function restoreInovCalendarSnapshot() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminUid = authResult?.user?.uid;
  console.log(`UID do admin: ${adminUid}\n`);

  console.log("=== Lendo dados do JSON ===\n");
  const calendarData = JSON.parse(
    await readFile(new URL("../src/data/inovCalendarExtracted.json", import.meta.url), "utf8")
  );
  
  const customEntries = {};
  let seq = 1;
  calendarData.months.forEach((month) => {
    month.tasks.forEach((task) => {
      const entryId = `inov_${String(seq).padStart(3, '0')}`;
      customEntries[entryId] = {
        due_date: task.date,
        raw: task.raw,
        recurrence_preset: "auto",
      };
      seq++;
    });
  });
  
  console.log(`Total de custom_entries: ${Object.keys(customEntries).length}\n`);
  
  console.log("=== Restaurando snapshot da empresa INOV ===\n");
  const inovSnapshotRef = doc(db, "inov_calendar_data", INOV_COMPANY_ID);
  
  await setDoc(inovSnapshotRef, {
    owner_uid: adminUid,
    updated_at: new Date().toISOString(),
    updated_by: adminUid,
    custom_entries: customEntries,
    occurrence_overrides: {},
    template_overrides: {},
    reference_table_overrides: {},
  });
  
  console.log("Snapshot da empresa INOV restaurado com sucesso!");
  console.log(`\nResumo:`);
  console.log(`- Custom_entries restaurados: ${Object.keys(customEntries).length}`);
}

restoreInovCalendarSnapshot().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
