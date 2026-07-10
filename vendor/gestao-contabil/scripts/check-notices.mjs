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
const TARGET_EMAIL = "ronaldo.silva@inovssc.com.br";
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
  const targetUid = await getUidByEmail(db, TARGET_EMAIL);
  console.log(`UID de origem: ${sourceUid}`);
  console.log(`UID de destino: ${targetUid}`);

  console.log("\n=== Buscando recados por UID ===");
  
  // Recados da conta de origem
  const noticesRef = collection(db, "notices");
  const sourceQuery = query(noticesRef, where("uid", "==", sourceUid));
  const sourceSnap = await getDocs(sourceQuery);
  console.log(`Recados na conta de origem (${SOURCE_EMAIL}): ${sourceSnap.size}`);
  sourceSnap.forEach(doc => {
    const data = doc.data();
    console.log(`  - ${data.title} (urgência: ${data.urgency})`);
  });

  // Recados da conta de destino
  const targetQuery = query(noticesRef, where("uid", "==", targetUid));
  const targetSnap = await getDocs(targetQuery);
  console.log(`\nRecados na conta de destino (${TARGET_EMAIL}): ${targetSnap.size}`);
  targetSnap.forEach(doc => {
    const data = doc.data();
    console.log(`  - ${data.title} (urgência: ${data.urgency})`);
  });

  // Recados do admin
  const adminQuery = query(noticesRef, where("uid", "==", adminUid));
  const adminSnap = await getDocs(adminQuery);
  console.log(`\nRecados na conta de admin (${ADMIN_EMAIL}): ${adminSnap.size}`);
  adminSnap.forEach(doc => {
    const data = doc.data();
    console.log(`  - ${data.title} (urgência: ${data.urgency})`);
  });

  // TODOS os recados
  console.log("\n=== TODOS os recados no sistema ===");
  const allSnap = await getDocs(collection(db, "notices"));
  console.log(`Total de recados: ${allSnap.size}`);
  allSnap.forEach(doc => {
    const data = doc.data();
    console.log(`  [${data.uid}] ${data.title} (urgência: ${data.urgency})`);
  });
}

check().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
