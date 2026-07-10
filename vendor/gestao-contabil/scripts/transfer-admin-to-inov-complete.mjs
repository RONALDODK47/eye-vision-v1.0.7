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
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";

// Configurações
const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";
const INOV_TOKEN = "CL-FN14-AZ4ZV81Y"; // Token da empresa INOV

async function getUidByEmail(db, email) {
  const profilesRef = collection(db, "user_profiles");
  const q = query(profilesRef, where("email", "==", email));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    return snapshot.docs[0].data().uid;
  }
  return null;
}

async function transferComplete() {
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

  console.log("=== Iniciando transferência completa para INOV ===\n");
  console.log(`Empresa INOV ID: ${INOV_COMPANY_ID}`);
  console.log(`Empresa INOV Token: ${INOV_TOKEN}\n`);

  // 1. Transferir calendário (calendar_inov_completions)
  console.log("1. Transferindo dados de calendário...");
  const calendarRef = collection(db, "calendar_inov_completions");
  const calendarQuery = query(calendarRef, where("uid", "==", adminUid));
  const calendarSnap = await getDocs(calendarQuery);
  console.log(`  Encontrados ${calendarSnap.size} documentos de calendário`);
  
  let calendarTransferred = 0;
  let calendarSkipped = 0;
  for (const docSnap of calendarSnap.docs) {
    const data = docSnap.data();
    // Se já tem company_id da INOV, pular
    if (data.company_id === INOV_COMPANY_ID) {
      calendarSkipped++;
      continue;
    }
    // Atualizar documento existente com company_id da INOV
    await updateDoc(docSnap.ref, {
      company_id: INOV_COMPANY_ID,
    });
    calendarTransferred++;
    if (calendarTransferred % 10 === 0) {
      console.log(`  Progresso: ${calendarTransferred}/${calendarSnap.size} atualizados...`);
    }
  }
  console.log(`  Calendário: ${calendarTransferred} atualizados, ${calendarSkipped} já tinham company_id da INOV`);

  // 2. Transferir empresas (companies) - adicionar assigned_company_token
  console.log("\n2. Transferindo empresas do admin...");
  const companiesRef = collection(db, "companies");
  const companiesQuery = query(companiesRef, where("uid", "==", adminUid));
  const companiesSnap = await getDocs(companiesQuery);
  console.log(`  Encontradas ${companiesSnap.size} empresas`);
  
  let companiesTransferred = 0;
  let companiesSkipped = 0;
  for (const docSnap of companiesSnap.docs) {
    const data = docSnap.data();
    // Se já tem assigned_company_token da INOV, pular
    if (data.assigned_company_token === INOV_TOKEN) {
      companiesSkipped++;
      continue;
    }
    // Atualizar empresa com assigned_company_token da INOV
    await updateDoc(docSnap.ref, {
      assigned_company_token: INOV_TOKEN,
    });
    companiesTransferred++;
    console.log(`  - Empresa: ${data.name || "Sem nome"}`);
  }
  console.log(`  Empresas: ${companiesTransferred} atualizadas, ${companiesSkipped} já tinham token da INOV`);

  // 3. Transferir novidades (notices)
  console.log("\n3. Transferindo novidades do admin...");
  const noticesRef = collection(db, "notices");
  const noticesQuery = query(noticesRef, where("uid", "==", adminUid));
  const noticesSnap = await getDocs(noticesQuery);
  console.log(`  Encontradas ${noticesSnap.size} novidades`);
  
  let noticesTransferred = 0;
  let noticesSkipped = 0;
  for (const docSnap of noticesSnap.docs) {
    const data = docSnap.data();
    // Se já tem company_id da INOV, pular
    if (data.company_id === INOV_COMPANY_ID) {
      noticesSkipped++;
      continue;
    }
    // Atualizar documento existente com company_id da INOV
    await updateDoc(docSnap.ref, {
      company_id: INOV_COMPANY_ID,
    });
    noticesTransferred++;
    console.log(`  - Novidade: ${data.title || "Sem título"}`);
  }
  console.log(`  Novidades: ${noticesTransferred} atualizadas, ${noticesSkipped} já tinham company_id da INOV`);

  console.log("\n=== Transferência concluída ===");
  console.log(`Resumo:`);
  console.log(`  Empresa INOV (ID: ${INOV_COMPANY_ID}, Token: ${INOV_TOKEN})`);
  console.log(`  Calendário: ${calendarTransferred} atualizados`);
  console.log(`  Empresas: ${companiesTransferred} atualizadas`);
  console.log(`  Novidades: ${noticesTransferred} atualizadas`);
  console.log("\nOs dados originais foram MANTIDOS e atualizados com o vínculo da empresa INOV.");
  console.log("Agora, ao usar o token da empresa INOV, esses dados ficarão visíveis.");
}

transferComplete().catch((err) => {
  console.error("TRANSFERÊNCIA FALHOU:", err?.message || err);
  process.exit(1);
});
