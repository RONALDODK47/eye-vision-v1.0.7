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
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";

async function checkCalendarDates() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`UID do admin: ${authResult?.user?.uid}\n`);

  console.log("=== Verificando datas das tarefas no snapshot da INOV ===\n");
  const inovSnapshotRef = doc(db, "inov_calendar_data", INOV_COMPANY_ID);
  const inovSnapshotSnap = await getDoc(inovSnapshotRef);
  
  if (!inovSnapshotSnap.exists()) {
    console.log("Snapshot da INOV NÃO encontrado!");
    return;
  }
  
  const data = inovSnapshotSnap.data();
  const customEntries = data.custom_entries || {};
  
  console.log(`Total de custom_entries: ${Object.keys(customEntries).length}\n`);
  
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  console.log(`Data atual: ${today.toISOString().slice(0, 10)}\n`);
  
  let pastCount = 0;
  let futureCount = 0;
  let todayCount = 0;
  
  Object.entries(customEntries).forEach(([id, entry]) => {
    const dueDate = entry.due_date;
    const entryDate = new Date(dueDate);
    entryDate.setHours(12, 0, 0, 0);
    
    const diffDays = Math.floor((entryDate.getTime() - today.getTime()) / 86400000);
    
    if (diffDays < 0) {
      pastCount++;
    } else if (diffDays > 0) {
      futureCount++;
    } else {
      todayCount++;
    }
    
    console.log(`- ${id}: ${dueDate} (${diffDays} dias) - ${entry.raw.slice(0, 50)}...`);
  });
  
  console.log(`\nResumo:`);
  console.log(`- Tarefas passadas: ${pastCount}`);
  console.log(`- Tarefas futuras: ${futureCount}`);
  console.log(`- Tarefas de hoje: ${todayCount}`);
}

checkCalendarDates().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
