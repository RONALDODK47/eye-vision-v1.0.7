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
  addDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_TOKEN = "CL-FN14-AZ4ZV81Y";
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";

async function transferToInov() {
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

  console.log("=== Iniciando transferência para INOV ===\n");

  // Transferir calendário (calendar_inov_completions)
  console.log("Transferindo dados de calendário...");
  const calendarRef = collection(db, "calendar_inov_completions");
  const calendarQuery = query(calendarRef, where("uid", "==", adminUid));
  const calendarSnap = await getDocs(calendarQuery);
  
  let calendarTransferred = 0;
  let calendarDeleted = 0;
  for (const doc of calendarSnap.docs) {
    const data = doc.data();
    // Criar novo com company_id da INOV
    await addDoc(calendarRef, {
      ...data,
      uid: adminUid,
      company_id: INOV_COMPANY_ID,
    });
    calendarTransferred++;
    // Deletar original
    await deleteDoc(doc.ref);
    calendarDeleted++;
  }
  console.log(`  Calendário: ${calendarTransferred} transferidos, ${calendarDeleted} deletados da origem`);

  // Transferir novidades (notices) do admin
  console.log("\nTransferindo novidades do admin...");
  const noticesRef = collection(db, "notices");
  const noticesQuery = query(noticesRef, where("uid", "==", adminUid));
  const noticesSnap = await getDocs(noticesQuery);
  
  let noticesTransferred = 0;
  let noticesDeleted = 0;
  for (const doc of noticesSnap.docs) {
    const data = doc.data();
    // Criar novo com company_id da INOV
    await addDoc(noticesRef, {
      ...data,
      uid: adminUid,
      company_id: INOV_COMPANY_ID,
    });
    noticesTransferred++;
    // Deletar original
    await deleteDoc(doc.ref);
    noticesDeleted++;
  }
  console.log(`  Novidades: ${noticesTransferred} transferidas, ${noticesDeleted} deletadas da origem`);

  console.log("\n=== Transferência concluída ===");
  console.log(`Resumo:`);
  console.log(`  Empresa INOV (ID: ${INOV_COMPANY_ID})`);
  console.log(`  Calendário: ${calendarTransferred}`);
  console.log(`  Novidades: ${noticesTransferred}`);
  console.log("\nDados da origem foram REMOVIDOS (não copiados).");
}

transferToInov().catch((err) => {
  console.error("TRANSFERÊNCIA FALHOU:", err?.message || err);
  process.exit(1);
});
