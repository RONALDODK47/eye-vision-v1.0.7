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
  console.log(`UID do admin: ${adminUid}\n`);

  // Buscar empresas do admin
  console.log("=== Empresas do admin ===");
  const companiesRef = collection(db, "companies");
  const companiesQuery = query(companiesRef, where("uid", "==", adminUid));
  const companiesSnap = await getDocs(companiesQuery);
  console.log(`Empresas encontradas: ${companiesSnap.size}`);
  companiesSnap.forEach(doc => {
    const data = doc.data();
    console.log(`  - ${data.name} (token: ${data.assigned_company_token || data.portal_token || data.id})`);
  });

  // Buscar todas as empresas
  console.log("\n=== TODAS as empresas ===");
  const allCompaniesSnap = await getDocs(collection(db, "companies"));
  console.log(`Total de empresas: ${allCompaniesSnap.size}`);
  allCompaniesSnap.forEach(doc => {
    const data = doc.data();
    const token = data.assigned_company_token || data.portal_token || data.id;
    const name = data.name || "Sem nome";
    console.log(`  [${token}] ${name} (uid: ${data.uid})`);
  });

  // Buscar dados de calendário
  console.log("\n=== Dados de calendário ===");
  const calendarRef = collection(db, "calendar_inov_completions");
  const calendarSnap = await getDocs(calendarRef);
  console.log(`Total de completions: ${calendarSnap.size}`);
  calendarSnap.forEach(doc => {
    const data = doc.data();
    console.log(`  [${data.uid}] company_id: ${data.company_id}, deadline_id: ${data.deadline_id}`);
  });

  // Buscar novidades
  console.log("\n=== Novidades (notices) ===");
  const noticesRef = collection(db, "notices");
  const noticesSnap = await getDocs(noticesRef);
  console.log(`Total de novidades: ${noticesSnap.size}`);
  noticesSnap.forEach(doc => {
    const data = doc.data();
    console.log(`  [${data.uid}] ${data.title}`);
  });
}

check().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
