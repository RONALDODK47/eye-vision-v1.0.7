import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";

async function checkAllCalendarData() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`UID do admin: ${authResult?.user?.uid}\n`);

  console.log("=== Verificando todos os documentos em inov_calendar_data ===\n");
  const calendarDataRef = collection(db, "inov_calendar_data");
  const calendarDataSnap = await getDocs(calendarDataRef);
  console.log(`Total de documentos: ${calendarDataSnap.size}\n`);
  
  calendarDataSnap.forEach(docSnap => {
    const data = docSnap.data();
    console.log(`- Document ID: ${docSnap.id}`);
    console.log(`  Owner UID: ${data.owner_uid}`);
    console.log(`  Updated At: ${data.updated_at}`);
    console.log(`  Total deadlines: ${data.deadlines?.length || 0}`);
    console.log(`  Total custom_entries: ${data.custom_entries?.length || 0}`);
    console.log();
  });
}

checkAllCalendarData().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
