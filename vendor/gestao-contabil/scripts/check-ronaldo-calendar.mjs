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
  query,
  where,
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const RONALDO_EMAIL = "ronaldojunior.gyn@gmail.com";

async function checkRonaldoCalendar() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`UID do admin: ${authResult?.user?.uid}\n`);

  // Buscar UID do ronaldojunior.gyn@gmail.com
  console.log(`Buscando UID de ${RONALDO_EMAIL}...`);
  const profilesRef = collection(db, "user_profiles");
  const profileQuery = query(profilesRef, where("email", "==", RONALDO_EMAIL));
  const profileSnap = await getDocs(profileQuery);
  
  if (profileSnap.empty) {
    console.log(`Perfil não encontrado para ${RONALDO_EMAIL}`);
    return;
  }
  
  const ronaldoUid = profileSnap.docs[0].data().uid;
  console.log(`UID encontrado: ${ronaldoUid}\n`);

  console.log("=== Verificando dados de calendário do ronaldojunior.gyn@gmail.com ===\n");
  const calendarRef = collection(db, "calendar_inov_completions");
  const calendarQuery = query(calendarRef, where("uid", "==", ronaldoUid));
  const calendarSnap = await getDocs(calendarQuery);
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

checkRonaldoCalendar().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
