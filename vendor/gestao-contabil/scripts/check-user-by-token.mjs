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
  doc,
  getDoc,
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_TOKEN = "CL-FN14-AZ4ZV81Y";

async function checkUsers() {
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

  console.log("=== Buscando usuários com token da INOV ===\n");
  const configRef = doc(db, "cloud_access_control", "config");
  const configSnap = await getDoc(configRef);
  const config = configSnap.data();
  
  const clientsMap = config?.clients || {};
  const usersWithInovToken = [];
  
  for (const [email, client] of Object.entries(clientsMap)) {
    if (client.assigned_company_token === INOV_TOKEN) {
      usersWithInovToken.push({
        email,
        uid: client.uid,
        account_type: client.account_type,
      });
    }
  }
  
  console.log(`Usuários com token INOV (${INOV_TOKEN}): ${usersWithInovToken.length}\n`);
  usersWithInovToken.forEach(u => {
    console.log(`  - Email: ${u.email}`);
    console.log(`    UID: ${u.uid}`);
    console.log(`    Tipo: ${u.account_type}`);
  });
  
  console.log("\n=== Buscando profiles para obter UIDs ===\n");
  const profilesRef = collection(db, "user_profiles");
  const profilesSnap = await getDocs(profilesRef);
  console.log(`Total de profiles: ${profilesSnap.size}\n`);
  
  profilesSnap.forEach(docSnap => {
    const data = docSnap.data();
    console.log(`  - Email: ${data.email}`);
    console.log(`    UID: ${data.uid}`);
  });
}

checkUsers().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
