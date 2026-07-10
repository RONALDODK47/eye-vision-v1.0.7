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
  updateDoc,
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";

async function linkNotices() {
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

  console.log("=== Vinculando TODAS as novidades SEM company_id à INOV ===\n");
  console.log(`Empresa INOV ID: ${INOV_COMPANY_ID}\n`);

  const noticesRef = collection(db, "notices");
  const noticesSnap = await getDocs(noticesRef);
  console.log(`Total de novidades: ${noticesSnap.size}\n`);
  
  let linked = 0;
  let skipped = 0;
  
  for (const docSnap of noticesSnap.docs) {
    const data = docSnap.data();
    // Se já tem company_id, pular
    if (data.company_id) {
      skipped++;
      continue;
    }
    // Vincular à empresa INOV
    await updateDoc(docSnap.ref, {
      company_id: INOV_COMPANY_ID,
    });
    linked++;
    console.log(`  - Vinculado: ${data.title || "Sem título"} (UID: ${data.uid})`);
  }
  
  console.log(`\n=== Concluído ===`);
  console.log(`Novidades vinculadas: ${linked}`);
  console.log(`Novidades puladas (já tinham company_id): ${skipped}`);
}

linkNotices().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
