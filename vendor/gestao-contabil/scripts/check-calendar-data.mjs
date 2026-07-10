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
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";

async function checkCalendarData() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`UID do admin: ${authResult?.user?.uid}\n`);

  console.log("=== Verificando dados de calendário ===\n");
  const calendarRef = collection(db, "calendar_inov_completions");
  const calendarSnap = await getDocs(calendarRef);
  console.log(`Total de documentos de calendário: ${calendarSnap.size}\n`);
  
  calendarSnap.forEach(docSnap => {
    const data = docSnap.data();
    console.log(`- Deadline ID: ${data.deadline_id}`);
    console.log(`  UID: ${data.uid}`);
    console.log(`  Company ID: ${data.company_id}`);
    console.log(`  Completed On: ${data.completed_on}`);
    console.log();
  });
}

checkCalendarData().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
