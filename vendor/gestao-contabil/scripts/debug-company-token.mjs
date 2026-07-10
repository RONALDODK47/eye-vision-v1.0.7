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
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_TOKEN = "CL-FN14-AZ4ZV81Y";
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";

async function debugCompanyToken() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`UID do admin: ${authResult?.user?.uid}\n`);

  console.log("=== Verificando configuração ===\n");
  const configRef = doc(db, "cloud_access_control", "config");
  const configSnap = await getDoc(configRef);
  const config = configSnap.data();
  
  const companyPortals = config?.company_portals || {};
  console.log(`Total de company_portals: ${Object.keys(companyPortals).length}\n`);
  
  console.log("Verificando token da INOV:");
  for (const [companyId, portalData] of Object.entries(companyPortals)) {
    const token = portalData.portal_token || portalData.token || "";
    console.log(`  Company ID: ${companyId}`);
    console.log(`  Token: ${token}`);
    if (token === INOV_TOKEN) {
      console.log(`  -> TOKEN DA INOV ENCONTRADO!`);
    }
    console.log();
  }

  console.log(`\n=== Verificando snapshot da empresa INOV ===\n`);
  const inovSnapshotRef = doc(db, "inov_calendar_data", INOV_COMPANY_ID);
  const inovSnapshotSnap = await getDoc(inovSnapshotRef);
  
  if (inovSnapshotSnap.exists()) {
    const data = inovSnapshotSnap.data();
    console.log("Snapshot da INOV encontrado:");
    console.log(`  Owner UID: ${data.owner_uid}`);
    console.log(`  Company ID: ${data.company_id}`);
    console.log(`  Updated At: ${data.updated_at}`);
    console.log(`  Deadlines: ${data.deadlines?.length || 0}`);
    console.log(`  Custom Entries: ${Object.keys(data.custom_entries || {}).length}`);
  } else {
    console.log("Snapshot da INOV NÃO encontrado!");
  }
}

debugCompanyToken().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
