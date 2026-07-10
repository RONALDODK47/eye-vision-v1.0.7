/**
 * Garante que ronaldo.silva@inovssc.com.br não é admin nem master na cloud.
 */
import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";

const TARGET_EMAIL = "ronaldo.silva@inovssc.com.br";
const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";

async function main() {
  const cfg = JSON.parse(await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8"));
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);

  const ref = doc(db, "cloud_access_control", "config");
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("cloud_access_control/config não encontrado");

  const clients = { ...(snap.data().clients || {}) };
  if (!clients[TARGET_EMAIL]) throw new Error(`Cliente não encontrado: ${TARGET_EMAIL}`);

  clients[TARGET_EMAIL] = {
    ...clients[TARGET_EMAIL],
    is_master: false,
    allow_settings: false,
    updated_at: new Date().toISOString(),
  };

  await updateDoc(ref, { clients });

  console.log(`Atualizado ${TARGET_EMAIL}:`);
  console.log("  is_master: false");
  console.log("  allow_settings: false");
}

main().catch((err) => {
  console.error("ERRO:", err?.message || err);
  process.exit(1);
});
