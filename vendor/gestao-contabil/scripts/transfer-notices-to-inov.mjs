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

async function transferNotices() {
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

  console.log("=== Transferindo NOVIDADES para INOV ===\n");
  console.log(`Empresa INOV ID: ${INOV_COMPANY_ID}\n`);

  console.log("Buscando novidades do admin...");
  const noticesRef = collection(db, "notices");
  const noticesQuery = query(noticesRef, where("uid", "==", adminUid));
  const noticesSnap = await getDocs(noticesQuery);
  console.log(`Encontradas ${noticesSnap.size} novidades\n`);
  
  let noticesTransferred = 0;
  let noticesSkipped = 0;
  
  for (const docSnap of noticesSnap.docs) {
    const data = docSnap.data();
    // Se já tem company_id da INOV, pular
    if (data.company_id === INOV_COMPANY_ID) {
      noticesSkipped++;
      console.log(`  - PULADO (já tem company_id INOV): ${data.title || "Sem título"}`);
      continue;
    }
    // Atualizar documento existente com company_id da INOV
    await updateDoc(docSnap.ref, {
      company_id: INOV_COMPANY_ID,
    });
    noticesTransferred++;
    console.log(`  - Atualizado: ${data.title || "Sem título"}`);
  }
  
  console.log(`\n=== Concluído ===`);
  console.log(`Novidades: ${noticesTransferred} atualizadas, ${noticesSkipped} já tinham company_id da INOV`);
}

transferNotices().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
