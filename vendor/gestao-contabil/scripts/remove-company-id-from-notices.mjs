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
  doc,
  updateDoc,
  deleteField,
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";

async function removeCompanyIdFromNotices() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminUid = authResult?.user?.uid;
  console.log(`UID do admin: ${adminUid}\n`);

  console.log("=== Removendo company_id dos notices ===\n");
  const noticesRef = collection(db, "notices");
  const noticesSnap = await getDocs(noticesRef);
  console.log(`Total de notices: ${noticesSnap.size}\n`);
  
  let updatedCount = 0;
  
  for (const docSnap of noticesSnap.docs) {
    const data = docSnap.data();
    const noticeId = docSnap.id;
    const companyId = data.company_id;
    
    if (companyId === INOV_COMPANY_ID) {
      console.log(`Removendo company_id do notice ${noticeId}`);
      await updateDoc(doc(db, "notices", noticeId), {
        company_id: deleteField(),
      });
      updatedCount++;
    }
  }
  
  console.log(`\nTotal de notices atualizados: ${updatedCount}`);
  console.log("company_id removido com sucesso!");
}

removeCompanyIdFromNotices().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
