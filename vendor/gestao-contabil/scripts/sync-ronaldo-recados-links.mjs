/**
 * Copia recados e links úteis do admin de emergência para ronaldo.silva@inovssc.com.br
 * (apenas itens que ainda não existem na conta de destino).
 */
import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
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
  const snapshot = await getDocs(
    query(collection(db, "user_profiles"), where("email", "==", email))
  );
  if (snapshot.empty) return null;
  return snapshot.docs[0].data().uid;
}

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

async function main() {
  const cfg = JSON.parse(await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8"));
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminUid = auth.currentUser.uid;
  const targetUid = await getUidByEmail(db, TARGET_EMAIL);
  if (!targetUid) throw new Error(`Perfil não encontrado: ${TARGET_EMAIL}`);

  const targetNotices = await getDocs(query(collection(db, "notices"), where("uid", "==", targetUid)));
  const targetTitles = new Set(
    targetNotices.docs.map((d) => norm(d.data().title)).filter(Boolean)
  );

  const adminNotices = await getDocs(query(collection(db, "notices"), where("uid", "==", adminUid)));
  let noticesAdded = 0;
  for (const docSnap of adminNotices.docs) {
    const data = docSnap.data();
    const titleKey = norm(data.title);
    if (titleKey && targetTitles.has(titleKey)) continue;
    await addDoc(collection(db, "notices"), {
      ...data,
      uid: targetUid,
      transferred_from: adminUid,
      transferred_at: new Date().toISOString(),
    });
    noticesAdded++;
    console.log(`  + recado: ${data.title}`);
  }

  const targetSites = await getDocs(query(collection(db, "useful_sites"), where("uid", "==", targetUid)));
  const targetSiteKeys = new Set(
    targetSites.docs.map((d) => `${norm(d.data().name)}|${norm(d.data().url)}`)
  );

  const adminSites = await getDocs(query(collection(db, "useful_sites"), where("uid", "==", adminUid)));
  let sitesAdded = 0;
  for (const docSnap of adminSites.docs) {
    const data = docSnap.data();
    const key = `${norm(data.name)}|${norm(data.url)}`;
    if (targetSiteKeys.has(key)) continue;
    await addDoc(collection(db, "useful_sites"), {
      ...data,
      uid: targetUid,
      transferred_from: adminUid,
      transferred_at: new Date().toISOString(),
    });
    sitesAdded++;
    console.log(`  + link: ${data.name}`);
  }

  console.log("\nConcluído para", TARGET_EMAIL);
  console.log("Recados adicionados:", noticesAdded);
  console.log("Links adicionados:", sitesAdded);
}

main().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
