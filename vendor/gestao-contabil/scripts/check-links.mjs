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

const SOURCE_EMAIL = "ronaldojunior.gyn@gmail.com";
const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";

async function getUidByEmail(db, email) {
  const profilesRef = collection(db, "user_profiles");
  const q = query(profilesRef, where("email", "==", email));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    return snapshot.docs[0].data().uid;
  }
  return null;
}

async function check() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminUid = String(authResult?.user?.uid || "").trim();
  console.log(`UID do admin: ${adminUid}`);

  const sourceUid = await getUidByEmail(db, SOURCE_EMAIL);
  if (!sourceUid) {
    throw new Error(`Conta não encontrada: ${SOURCE_EMAIL}`);
  }
  console.log(`UID de origem: ${sourceUid}`);

  console.log("\n=== Buscando links úteis ===");
  
  // Buscar por uid
  const sitesRef = collection(db, "useful_sites");
  const sitesQuery = query(sitesRef, where("uid", "==", sourceUid));
  const sitesSnap = await getDocs(sitesQuery);
  console.log(`Links úteis encontrados (por uid): ${sitesSnap.size}`);
  
  sitesSnap.forEach(doc => {
    console.log(`  - ${doc.data().name}: ${doc.data().url}`);
  });

  // Buscar todos para verificar se existem outros
  console.log("\n=== Buscando TODOS os links úteis ===");
  const allSitesSnap = await getDocs(collection(db, "useful_sites"));
  console.log(`Total de links úteis no sistema: ${allSitesSnap.size}`);
  
  allSitesSnap.forEach(doc => {
    const data = doc.data();
    console.log(`  [${data.uid}] ${data.name}: ${data.url}`);
  });
}

check().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
