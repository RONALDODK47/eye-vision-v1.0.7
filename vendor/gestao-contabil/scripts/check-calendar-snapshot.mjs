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
  collection,
  getDocs,
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";

async function checkCalendarSnapshot() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`UID do admin: ${authResult?.user?.uid}\n`);

  console.log("=== Verificando snapshot do calendário ===\n");
  const liveSnapRef = doc(db, "inov_calendar_data", "live");
  const liveSnap = await getDoc(liveSnapRef);
  
  if (!liveSnap.exists()) {
    console.log("Snapshot do calendário não existe.");
    return;
  }
  
  const data = liveSnap.data();
  console.log("Snapshot encontrado:");
  console.log(`  Owner UID: ${data.owner_uid}`);
  console.log(`  Updated At: ${data.updated_at}`);
  console.log(`  Total deadlines: ${data.deadlines?.length || 0}`);
  console.log(`  Total custom_entries: ${data.custom_entries?.length || 0}`);
  
  if (data.deadlines && data.deadlines.length > 0) {
    console.log(`\nAmostra de deadlines (primeiros 3):`);
    data.deadlines.slice(0, 3).forEach(d => {
      console.log(`  - ID: ${d.id}, Effective Due Date: ${d.effectiveDueDate}`);
    });
  }
}

checkCalendarSnapshot().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
