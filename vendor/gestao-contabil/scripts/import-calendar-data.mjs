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

async function importCalendarData() {
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

  console.log("=== Lendo dados do calendário extraído ===\n");
  const calendarData = JSON.parse(
    await readFile(new URL("../src/data/inovCalendarExtracted.json", import.meta.url), "utf8")
  );
  
  console.log(`Meses encontrados: ${calendarData.months.length}\n`);

  // Converter tarefas para custom_entries
  const customEntries = {};
  let entryId = 1;
  
  calendarData.months.forEach(month => {
    month.tasks.forEach(task => {
      const id = `inov_${String(entryId).padStart(3, '0')}`;
      customEntries[id] = {
        due_date: task.date,
        raw: task.raw,
        recurrence_preset: "none",
        origin_row_id: null,
      };
      entryId++;
    });
  });

  console.log(`Total de custom_entries criadas: ${Object.keys(customEntries).length}\n`);

  // Criar snapshot do calendário
  const snapshot = {
    owner_uid: adminUid,
    updated_at: new Date().toISOString(),
    updated_by: adminUid,
    deadlines: [],
    custom_entries: customEntries,
    occurrence_overrides: {},
    template_overrides: {},
    reference_table_overrides: {},
  };

  console.log("=== Salvando snapshot no Firebase ===\n");
  const liveRef = doc(db, "inov_calendar_data", "live");
  await setDoc(liveRef, snapshot);
  
  console.log("Snapshot salvo com sucesso!");
  console.log(`- Owner UID: ${snapshot.owner_uid}`);
  console.log(`- Updated At: ${snapshot.updated_at}`);
  console.log(`- Deadlines: ${snapshot.deadlines.length}`);
  console.log(`- Custom Entries: ${Object.keys(snapshot.custom_entries).length}`);
}

importCalendarData().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
