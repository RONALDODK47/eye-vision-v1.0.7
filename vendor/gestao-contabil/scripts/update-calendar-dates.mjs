import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";

async function updateCalendarDates() {
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

  console.log("=== Lendo snapshot da empresa INOV ===\n");
  const inovSnapshotRef = doc(db, "inov_calendar_data", INOV_COMPANY_ID);
  const inovSnapshotSnap = await getDoc(inovSnapshotRef);
  
  if (!inovSnapshotSnap.exists()) {
    console.log("Snapshot da INOV NÃO encontrado!");
    return;
  }
  
  const data = inovSnapshotSnap.data();
  const customEntries = data.custom_entries || {};
  
  console.log(`Total de custom_entries: ${Object.keys(customEntries).length}\n`);

  // Atualizar datas para Maio e Junho 2026 (próximos 2 meses)
  const today = new Date();
  const mayDates = [
    "2026-05-01", "2026-05-02", "2026-05-05", "2026-05-06", "2026-05-07",
    "2026-05-08", "2026-05-09", "2026-05-12", "2026-05-13", "2026-05-14",
    "2026-05-15", "2026-05-16", "2026-05-19", "2026-05-20", "2026-05-21",
    "2026-05-22", "2026-05-23", "2026-05-26", "2026-05-27", "2026-05-28",
    "2026-05-29", "2026-05-30"
  ];
  const juneDates = [
    "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06",
    "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13",
    "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19", "2026-06-20",
    "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26", "2026-06-27",
    "2026-06-30"
  ];

  let dateIndex = 0;
  const updatedEntries = {};
  
  Object.entries(customEntries).forEach(([id, entry]) => {
    // Distribuir entre Maio e Junho
    if (dateIndex < mayDates.length) {
      updatedEntries[id] = {
        ...entry,
        due_date: mayDates[dateIndex],
      };
      console.log(`Atualizando ${id}: ${entry.due_date} -> ${mayDates[dateIndex]}`);
    } else {
      const newIndex = dateIndex - mayDates.length;
      if (newIndex < juneDates.length) {
        updatedEntries[id] = {
          ...entry,
          due_date: juneDates[newIndex],
        };
        console.log(`Atualizando ${id}: ${entry.due_date} -> ${juneDates[newIndex]}`);
      }
    }
    dateIndex++;
  });

  console.log(`\n=== Atualizando snapshot ===\n`);
  await updateDoc(inovSnapshotRef, {
    custom_entries: updatedEntries,
    updated_at: new Date().toISOString(),
    updated_by: adminUid,
  });
  
  console.log("Snapshot atualizado com sucesso!");
}

updateCalendarDates().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
