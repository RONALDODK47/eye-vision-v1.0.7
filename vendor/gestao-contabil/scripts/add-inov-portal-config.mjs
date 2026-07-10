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
  updateDoc,
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";
const INOV_TOKEN = "CL-FN14-AZ4ZV81Y";

async function addInovPortalConfig() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`UID do admin: ${authResult?.user?.uid}\n`);

  console.log("=== Adicionando configuração do portal INOV ===\n");
  const configRef = doc(db, "cloud_access_control", "config");
  const configSnap = await getDoc(configRef);
  const config = configSnap.data();
  
  const companyPortals = config?.company_portals || {};
  console.log(`Total de company_portals antes: ${Object.keys(companyPortals).length}\n`);
  
  // Adicionar configuração da INOV
  companyPortals[INOV_COMPANY_ID] = {
    portal_token: INOV_TOKEN,
    name: "INOV",
    portal_enabled: true,
  };
  
  console.log(`Adicionando portal INOV:`);
  console.log(`  Company ID: ${INOV_COMPANY_ID}`);
  console.log(`  Token: ${INOV_TOKEN}`);
  console.log(`  Name: INOV`);
  console.log(`  Enabled: true\n`);
  
  await updateDoc(configRef, {
    company_portals: companyPortals,
  });
  
  console.log("=== Configuração atualizada com sucesso ===");
}

addInovPortalConfig().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
