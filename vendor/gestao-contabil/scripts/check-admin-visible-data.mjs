import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

const ADMIN_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const ADMIN_PASSWORD = "RONALDO@2024";
const GMAIL = "ronaldojunior.gyn@gmail.com";

async function main() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);

  const profQ = query(collection(db, "user_profiles"), where("email", "==", GMAIL));
  const profSnap = await getDocs(profQ);
  const gmailUid = profSnap.docs[0]?.data()?.uid || profSnap.docs[0]?.id;
  console.log("Gmail admin UID:", gmailUid);

  for (const col of ["useful_sites", "notices", "companies"]) {
    const q = query(collection(db, col), where("uid", "==", gmailUid));
    const snap = await getDocs(q);
    console.log(`${col} (uid=${gmailUid}):`, snap.size);
  }

  const allLinks = await getDocs(collection(db, "useful_sites"));
  console.log("useful_sites total na base:", allLinks.size);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
