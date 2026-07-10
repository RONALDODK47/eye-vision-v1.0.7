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
} from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";

async function checkAllCollections() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`UID do admin: ${authResult?.user?.uid}\n`);

  console.log("=== Verificando coleções que podem ter dados de calendário ===\n");
  
  // Verificar inov_calendar_acl
  console.log("Coleção: inov_calendar_acl");
  const aclRef = collection(db, "inov_calendar_acl");
  const aclSnap = await getDocs(aclRef);
  console.log(`  Documentos: ${aclSnap.size}`);
  aclSnap.forEach(doc => {
    const data = doc.data();
    console.log(`    - ${doc.id}: owner_uid=${data.owner_uid}, editor_uids=${data.editor_uids?.length || 0}`);
  });
  
  console.log("\nColeção: inov_calendar_data");
  const calendarDataRef = collection(db, "inov_calendar_data");
  const calendarDataSnap = await getDocs(calendarDataRef);
  console.log(`  Documentos: ${calendarDataSnap.size}`);
  calendarDataSnap.forEach(doc => {
    const data = doc.data();
    console.log(`    - ${doc.id}: updated_at=${data.updated_at}, deadlines=${data.deadlines?.length || 0}, custom_entries=${data.custom_entries?.length || 0}`);
  });
  
  console.log();
}

checkAllCollections().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
