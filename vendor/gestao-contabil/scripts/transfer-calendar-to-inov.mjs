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
  updateDoc,
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";

async function transferCalendar() {
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

  console.log("=== Transferindo CALENDÁRIO para INOV ===\n");
  console.log(`Empresa INOV ID: ${INOV_COMPANY_ID}\n`);

  console.log("Buscando dados de calendário...");
  const calendarRef = collection(db, "calendar_inov_completions");
  const calendarQuery = query(calendarRef, where("uid", "==", adminUid));
  const calendarSnap = await getDocs(calendarQuery);
  console.log(`Encontrados ${calendarSnap.size} documentos de calendário\n`);
  
  let calendarTransferred = 0;
  let calendarSkipped = 0;
  
  for (const docSnap of calendarSnap.docs) {
    const data = docSnap.data();
    // Se já tem company_id da INOV, pular
    if (data.company_id === INOV_COMPANY_ID) {
      calendarSkipped++;
      continue;
    }
    // Atualizar documento existente com company_id da INOV
    await updateDoc(docSnap.ref, {
      company_id: INOV_COMPANY_ID,
    });
    calendarTransferred++;
    if (calendarTransferred % 5 === 0) {
      console.log(`Progresso: ${calendarTransferred}/${calendarSnap.size} atualizados...`);
    }
  }
  
  console.log(`\n=== Concluído ===`);
  console.log(`Calendário: ${calendarTransferred} atualizados, ${calendarSkipped} já tinham company_id da INOV`);
}

transferCalendar().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
