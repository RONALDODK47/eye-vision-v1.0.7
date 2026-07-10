import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

const SOURCE_UID = "qOdN8JvdkzRSnDdaql4xWeoWOvF3";
const SOURCE_EMAIL = "ronaldojunior.gyn@gmail.com";
const TARGET_EMAIL = "ronaldojunior.gyn.emergencia@usuario.local";
const TARGET_PASSWORD = "RONALDO@2024";

const COLLECTIONS_TO_SCAN = [
  "companies",
  "tasks",
  "task_templates",
  "custom_columns",
  "app_settings",
  "company_files",
  "conversation_threads",
  "conversation_messages",
  "notices",
  "useful_sites",
  "loan_controls",
  "direct_chat_threads",
  "direct_chat_messages",
  "calendar_inov_completions",
  "inov_calendar_acl",
  "inov_calendar_data",
  "cloud_access_control",
  "user_profiles",
];

function deepReplaceUid(value, sourceUid, targetUid) {
  if (typeof value === "string") {
    return value === sourceUid ? targetUid : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => deepReplaceUid(entry, sourceUid, targetUid));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    const nextKey = key === sourceUid ? targetUid : key;
    out[nextKey] = deepReplaceUid(val, sourceUid, targetUid);
  }
  return out;
}

async function signInOrCreate(auth, email, password) {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    if (error?.code === "auth/user-not-found" || error?.code === "auth/invalid-credential") {
      return await createUserWithEmailAndPassword(auth, email, password);
    }
    throw error;
  }
}

async function migrate() {
  const cfg = JSON.parse(
    await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
  );
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  const authResult = await signInOrCreate(auth, TARGET_EMAIL, TARGET_PASSWORD);
  const targetUid = String(authResult?.user?.uid || "").trim();
  if (!targetUid) throw new Error("Não foi possível obter UID da conta de destino.");

  let updatedDocs = 0;
  let scannedDocs = 0;

  for (const collName of COLLECTIONS_TO_SCAN) {
    const snapshot = await getDocs(collection(db, collName));
    for (const docSnap of snapshot.docs) {
      scannedDocs += 1;
      const before = docSnap.data();
      let after = deepReplaceUid(before, SOURCE_UID, targetUid);

      if (collName === "cloud_access_control" && docSnap.id === "config") {
        const clients =
          after?.clients && typeof after.clients === "object" ? { ...after.clients } : {};
        const sourceClient = clients[SOURCE_EMAIL];
        if (sourceClient && typeof sourceClient === "object") {
          clients[TARGET_EMAIL] = {
            ...sourceClient,
            email: TARGET_EMAIL,
            is_master: true,
            is_active: true,
            is_paid: true,
            updated_at: new Date().toISOString(),
            updated_by: targetUid,
          };
        }
        after = {
          ...after,
          clients,
          updated_at: new Date().toISOString(),
          updated_by: targetUid,
        };
      }

      const changed = JSON.stringify(before) !== JSON.stringify(after);
      if (!changed) continue;

      await setDoc(doc(db, collName, docSnap.id), after, { merge: false });
      updatedDocs += 1;
    }
  }

  // Garante perfil da nova conta com dados de dono.
  const sourceProfileRef = doc(db, "user_profiles", SOURCE_UID);
  const targetProfileRef = doc(db, "user_profiles", targetUid);
  const sourceProfileSnap = await getDoc(sourceProfileRef);
  const sourceProfile = sourceProfileSnap.exists() ? sourceProfileSnap.data() : {};
  await setDoc(
    targetProfileRef,
    {
      ...deepReplaceUid(sourceProfile, SOURCE_UID, targetUid),
      uid: targetUid,
      email: TARGET_EMAIL,
      display_name:
        String(sourceProfile?.display_name || "").trim() || "Administrador",
      updated_at: new Date().toISOString(),
    },
    { merge: true }
  );

  // Atualiza owner_uid da ACL do calendário.
  const aclRef = doc(db, "inov_calendar_acl", "config");
  const aclSnap = await getDoc(aclRef);
  if (aclSnap.exists()) {
    const acl = aclSnap.data();
    await setDoc(
      aclRef,
      {
        ...acl,
        owner_uid: targetUid,
        updated_at: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  console.log("MIGRATION_DONE");
  console.log("SOURCE_UID:", SOURCE_UID);
  console.log("TARGET_UID:", targetUid);
  console.log("TARGET_EMAIL:", TARGET_EMAIL);
  console.log("SCANNED_DOCS:", scannedDocs);
  console.log("UPDATED_DOCS:", updatedDocs);
}

migrate().catch((err) => {
  console.error("MIGRATION_FAILED", err?.message || err);
  process.exit(1);
});
