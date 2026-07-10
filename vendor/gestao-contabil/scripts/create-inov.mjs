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
  doc,
  updateDoc,
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_TOKEN = "CL-FN14-AZ4ZV81Y";
const INOV_NAME = "INOV";

async function createInov() {
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

  // Verificar se empresa INOV já existe
  console.log(`Buscando empresa com token ${INOV_TOKEN}...`);
  const companiesRef = collection(db, "companies");
  const tokenQuery = query(companiesRef, where("assigned_company_token", "==", INOV_TOKEN));
  const tokenSnap = await getDocs(tokenQuery);

  if (!tokenSnap.empty) {
    console.log("Empresa INOV já existe:");
    tokenSnap.forEach(doc => {
      const data = doc.data();
      console.log(`  - ID: ${doc.id}`);
      console.log(`  - Nome: ${data.name}`);
      console.log(`  - Token: ${data.assigned_company_token}`);
      console.log(`  - UID: ${data.uid}`);
    });
    return tokenSnap.docs[0].id;
  }

  // Criar empresa INOV
  console.log("Criando empresa INOV...");
  const docRef = await addDoc(companiesRef, {
    uid: adminUid,
    name: INOV_NAME,
    assigned_company_token: INOV_TOKEN,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    protected: true, // Marca como protegida para não permitir exclusão
  });
  console.log(`Empresa INOV criada com ID: ${docRef.id}`);
  return docRef.id;
}

createInov().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
