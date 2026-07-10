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

const SOURCE_EMAIL = "ronaldojunior.gyn@gmail.com";
const TARGET_EMAIL = "ronaldo.silva@inovssc.com.br";

// Usando credenciais de emergência que têm privilégios de admin
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

  // Autenticar como admin de emergência
  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminUid = String(authResult?.user?.uid || "").trim();
  if (!adminUid) throw new Error("Não foi possível autenticar como admin.");
  console.log(`UID do admin: ${adminUid}`);

  // Obter UID da conta de origem
  console.log(`Buscando UID da conta de origem: ${SOURCE_EMAIL}`);
  const sourceUid = await getUidByEmail(db, SOURCE_EMAIL);
  if (!sourceUid) {
    throw new Error(`Conta de origem não encontrada: ${SOURCE_EMAIL}`);
  }
  console.log(`UID de origem: ${sourceUid}`);

  // Obter UID da conta de destino
  console.log(`Buscando UID da conta de destino: ${TARGET_EMAIL}`);
  const targetUid = await getUidByEmail(db, TARGET_EMAIL);
  if (!targetUid) {
    throw new Error(`Conta de destino não encontrada: ${TARGET_EMAIL}`);
  }
  console.log(`UID de destino: ${targetUid}`);

  console.log("\n=== Iniciando transferência ===\n");

  // Transferir recados (notices)
  console.log("Transferindo recados (notices)...");
  const noticesRef = collection(db, "notices");
  const noticesQuery = query(noticesRef, where("uid", "==", sourceUid));
  const noticesSnap = await getDocs(noticesQuery);
  
  let noticesTransferred = 0;
  for (const doc of noticesSnap.docs) {
    const data = doc.data();
    const { id, ...noticeData } = data;
    await addDoc(noticesRef, {
      ...noticeData,
      uid: targetUid,
      transferred_from: sourceUid,
      transferred_at: new Date().toISOString(),
    });
    noticesTransferred++;
  }
  console.log(`  Recados transferidos: ${noticesTransferred}`);

  // Transferir links úteis (useful_sites)
  console.log("Transferindo links úteis...");
  const sitesRef = collection(db, "useful_sites");
  const sitesQuery = query(sitesRef, where("uid", "==", sourceUid));
  const sitesSnap = await getDocs(sitesQuery);
  
  let sitesTransferred = 0;
  for (const doc of sitesSnap.docs) {
    const data = doc.data();
    const { id, ...siteData } = data;
    await addDoc(sitesRef, {
      ...siteData,
      uid: targetUid,
      transferred_from: sourceUid,
      transferred_at: new Date().toISOString(),
    });
    sitesTransferred++;
  }
  console.log(`  Links úteis transferidos: ${sitesTransferred}`);

  console.log("\n=== Transferência concluída ===");
  console.log(`Resumo:`);
  console.log(`  De: ${SOURCE_EMAIL} (${sourceUid})`);
  console.log(`  Para: ${TARGET_EMAIL} (${targetUid})`);
  console.log(`  Recados: ${noticesTransferred}`);
  console.log(`  Links úteis: ${sitesTransferred}`);
  console.log("\nOs dados originais foram mantidos na conta de origem.");
}

transfer().catch((err) => {
  console.error("TRANSFERÊNCIA FALHOU:", err?.message || err);
  process.exit(1);
});
