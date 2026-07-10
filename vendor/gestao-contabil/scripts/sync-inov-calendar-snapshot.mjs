import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";

async function syncInovCalendarSnapshot() {
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

  console.log("=== Lendo snapshot live atual ===\n");
  const liveSnapshotRef = doc(db, "inov_calendar_data", "live");
  const liveSnapshotSnap = await getDoc(liveSnapshotRef);
  
  if (!liveSnapshotSnap.exists()) {
    console.log("Snapshot live NÃO encontrado!");
    return;
  }
  
  const liveData = liveSnapshotSnap.data();
  console.log(`Snapshot live encontrado:`);
  console.log(`- owner_uid: ${liveData.owner_uid}`);
  console.log(`- updated_at: ${liveData.updated_at}`);
  console.log(`- custom_entries: ${Object.keys(liveData.custom_entries || {}).length}`);
  console.log(`- deadlines: ${Object.keys(liveData.deadlines || {}).length}\n`);
  
  console.log("=== Atualizando snapshot da empresa INOV ===\n");
  const inovSnapshotRef = doc(db, "inov_calendar_data", INOV_COMPANY_ID);
  
  await setDoc(inovSnapshotRef, {
    ...liveData,
    updated_at: new Date().toISOString(),
    updated_by: adminUid,
  });
  
  console.log("Snapshot da empresa INOV atualizado com sucesso!");
  console.log(`\nResumo:`);
  console.log(`- Custom_entries copiados: ${Object.keys(liveData.custom_entries || {}).length}`);
  console.log(`- Deadlines copiados: ${Object.keys(liveData.deadlines || {}).length}`);
}

syncInovCalendarSnapshot().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
