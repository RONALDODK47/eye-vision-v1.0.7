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
} from "firebase/firestore";

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

async function transfer() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminUid = String(authResult?.user?.uid || "").trim();
  if (!adminUid) throw new Error("Não foi possível autenticar como admin.");
  console.log(`UID do admin: ${adminUid}`);

  const targetUid = await getUidByEmail(db, TARGET_EMAIL);
  if (!targetUid) {
    throw new Error(`Conta de destino não encontrada: ${TARGET_EMAIL}`);
  }
  console.log(`UID de destino: ${targetUid}`);

  console.log("\n=== Iniciando transferência de recados do admin ===\n");

  // Transferir recados do admin
  console.log("Transferindo recados do admin...");
  const noticesRef = collection(db, "notices");
  const noticesQuery = query(noticesRef, where("uid", "==", adminUid));
  const noticesSnap = await getDocs(noticesQuery);
  
  let noticesTransferred = 0;
  for (const doc of noticesSnap.docs) {
    const data = doc.data();
    const { id, ...noticeData } = data;
    await addDoc(noticesRef, {
      ...noticeData,
      uid: targetUid,
      transferred_from: adminUid,
      transferred_at: new Date().toISOString(),
    });
    noticesTransferred++;
    console.log(`  - ${noticeData.title} (${noticeData.urgency})`);
  }
  console.log(`  Recados transferidos: ${noticesTransferred}`);

  console.log("\n=== Transferência concluída ===");
  console.log(`Resumo:`);
  console.log(`  De: ${ADMIN_EMAIL} (${adminUid})`);
  console.log(`  Para: ${TARGET_EMAIL} (${targetUid})`);
  console.log(`  Recados: ${noticesTransferred}`);
  console.log("\nOs dados originais foram mantidos na conta de admin.");
}

transfer().catch((err) => {
  console.error("TRANSFERÊNCIA FALHOU:", err?.message || err);
  process.exit(1);
});
