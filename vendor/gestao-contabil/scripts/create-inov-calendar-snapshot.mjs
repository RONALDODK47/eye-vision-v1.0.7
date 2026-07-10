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

async function createInovSnapshot() {
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

  console.log("=== Lendo snapshot global ===\n");
  const liveRef = doc(db, "inov_calendar_data", "live");
  const liveSnap = await getDoc(liveRef);
  
  if (!liveSnap.exists()) {
    console.log("Snapshot global não existe. Criando snapshot vazio para INOV.");
    const emptySnapshot = {
      owner_uid: adminUid,
      updated_at: new Date().toISOString(),
      updated_by: adminUid,
      deadlines: [],
      custom_entries: {},
      occurrence_overrides: {},
      template_overrides: {},
      reference_table_overrides: {},
    };
    await setDoc(doc(db, "inov_calendar_data", INOV_COMPANY_ID), emptySnapshot);
    console.log("Snapshot vazio criado para INOV");
    return;
  }
  
  const liveData = liveSnap.data();
  console.log(`Snapshot global encontrado:`);
  console.log(`- Owner UID: ${liveData.owner_uid}`);
  console.log(`- Updated At: ${liveData.updated_at}`);
  console.log(`- Deadlines: ${liveData.deadlines?.length || 0}`);
  console.log(`- Custom Entries: ${Object.keys(liveData.custom_entries || {}).length}\n`);

  console.log("=== Criando snapshot para empresa INOV ===\n");
  const inovSnapshot = {
    ...liveData,
    owner_uid: adminUid,
    company_id: INOV_COMPANY_ID,
    updated_at: new Date().toISOString(),
    updated_by: adminUid,
  };
  
  await setDoc(doc(db, "inov_calendar_data", INOV_COMPANY_ID), inovSnapshot);
  
  console.log("Snapshot para empresa INOV criado com sucesso!");
  console.log(`- Document ID: ${INOV_COMPANY_ID}`);
  console.log(`- Owner UID: ${inovSnapshot.owner_uid}`);
  console.log(`- Company ID: ${inovSnapshot.company_id}`);
  console.log(`- Updated At: ${inovSnapshot.updated_at}`);
  console.log(`- Deadlines: ${inovSnapshot.deadlines.length}`);
  console.log(`- Custom Entries: ${Object.keys(inovSnapshot.custom_entries).length}`);
}

createInovSnapshot().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
