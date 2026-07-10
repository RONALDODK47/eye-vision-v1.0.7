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
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";

async function checkUsefulSites() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  console.log(`Autenticando como admin: ${ADMIN_EMAIL}`);
  const authResult = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`UID do admin: ${authResult?.user?.uid}\n`);

  console.log("=== Verificando UsefulSites ===\n");
  const sitesRef = collection(db, "useful_sites");
  const sitesSnap = await getDocs(sitesRef);
  console.log(`Total de useful_sites: ${sitesSnap.size}\n`);
  
  let withCompanyId = 0;
  
  sitesSnap.forEach(docSnap => {
    const data = docSnap.data();
    const companyId = data.company_id;
    if (companyId) {
      console.log(`- ${docSnap.id}: company_id=${companyId}, uid=${data.uid}`);
      if (companyId === INOV_COMPANY_ID) {
        withCompanyId++;
      }
    }
  });
  
  console.log(`\nUseful sites com company_id da INOV: ${withCompanyId}`);
}

checkUsefulSites().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
