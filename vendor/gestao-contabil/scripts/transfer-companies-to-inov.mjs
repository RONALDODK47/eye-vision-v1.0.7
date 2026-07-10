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
const INOV_TOKEN = "CL-FN14-AZ4ZV81Y";

async function transferCompanies() {
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

  console.log("=== Transferindo EMPRESAS para INOV ===\n");
  console.log(`Empresa INOV Token: ${INOV_TOKEN}\n`);

  console.log("Buscando empresas do admin...");
  const companiesRef = collection(db, "companies");
  const companiesQuery = query(companiesRef, where("uid", "==", adminUid));
  const companiesSnap = await getDocs(companiesQuery);
  console.log(`Encontradas ${companiesSnap.size} empresas\n`);
  
  let companiesTransferred = 0;
  let companiesSkipped = 0;
  
  for (const docSnap of companiesSnap.docs) {
    const data = docSnap.data();
    // Se já tem assigned_company_token da INOV, pular
    if (data.assigned_company_token === INOV_TOKEN) {
      companiesSkipped++;
      console.log(`  - PULADO (já tem token INOV): ${data.name || "Sem nome"}`);
      continue;
    }
    // Atualizar empresa com assigned_company_token da INOV
    await updateDoc(docSnap.ref, {
      assigned_company_token: INOV_TOKEN,
    });
    companiesTransferred++;
    console.log(`  - Atualizado: ${data.name || "Sem nome"}`);
  }
  
  console.log(`\n=== Concluído ===`);
  console.log(`Empresas: ${companiesTransferred} atualizadas, ${companiesSkipped} já tinham token da INOV`);
}

transferCompanies().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
