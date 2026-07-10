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

async function checkCompanyPortals() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`UID do admin: ${authResult?.user?.uid}\n`);

  console.log("=== Verificando configuração de company_portals ===\n");
  const configRef = doc(db, "cloud_access_control", "config");
  const configSnap = await getDoc(configRef);
  const config = configSnap.data();
  
  const companyPortals = config?.company_portals || {};
  console.log(`Total de company_portals: ${Object.keys(companyPortals).length}\n`);
  
  for (const [companyId, portalData] of Object.entries(companyPortals)) {
    console.log(`Company ID: ${companyId}`);
    console.log(`  Token: ${portalData.portal_token || portalData.token || "N/A"}`);
    console.log(`  Name: ${portalData.name || "N/A"}`);
    console.log(`  Enabled: ${portalData.portal_enabled !== false}`);
    console.log();
  }
}

checkCompanyPortals().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
