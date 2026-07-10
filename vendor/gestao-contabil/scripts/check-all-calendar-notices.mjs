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

async function checkAll() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminUid = String(authResult?.user?.uid || "").trim();
  console.log(`UID do admin: ${adminUid}\n`);

  console.log("=== Verificando TODOS os dados de CALENDÁRIO ===\n");
  const calendarRef = collection(db, "calendar_inov_completions");
  const calendarSnap = await getDocs(calendarRef);
  console.log(`Total de documentos de calendário: ${calendarSnap.size}\n`);
  
  let withCompany = 0;
  let withoutCompany = 0;
  let withInov = 0;
  let withOtherCompany = 0;
  
  calendarSnap.forEach(doc => {
    const data = doc.data();
    if (data.company_id) {
      withCompany++;
      if (data.company_id === INOV_COMPANY_ID) {
        withInov++;
      } else {
        withOtherCompany++;
        console.log(`  - UID: ${data.uid}, Company ID: ${data.company_id}, Deadline ID: ${data.deadline_id}`);
      }
    } else {
      withoutCompany++;
      console.log(`  - SEM company_id - UID: ${data.uid}, Deadline ID: ${data.deadline_id}`);
    }
  });
  
  console.log(`\nResumo Calendário:`);
  console.log(`  Com company_id: ${withCompany}`);
  console.log(`  Sem company_id: ${withoutCompany}`);
  console.log(`  Com company_id INOV: ${withInov}`);
  console.log(`  Com outro company_id: ${withOtherCompany}`);

  console.log("\n=== Verificando TODAS as NOVIDADES ===\n");
  const noticesRef = collection(db, "notices");
  const noticesSnap = await getDocs(noticesRef);
  console.log(`Total de novidades: ${noticesSnap.size}\n`);
  
  withCompany = 0;
  withoutCompany = 0;
  withInov = 0;
  withOtherCompany = 0;
  
  noticesSnap.forEach(doc => {
    const data = doc.data();
    if (data.company_id) {
      withCompany++;
      if (data.company_id === INOV_COMPANY_ID) {
        withInov++;
      } else {
        withOtherCompany++;
        console.log(`  - UID: ${data.uid}, Company ID: ${data.company_id}, Título: ${data.title}`);
      }
    } else {
      withoutCompany++;
      console.log(`  - SEM company_id - UID: ${data.uid}, Título: ${data.title}`);
    }
  });
  
  console.log(`\nResumo Novidades:`);
  console.log(`  Com company_id: ${withCompany}`);
  console.log(`  Sem company_id: ${withoutCompany}`);
  console.log(`  Com company_id INOV: ${withInov}`);
  console.log(`  Com outro company_id: ${withOtherCompany}`);
}

checkAll().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
