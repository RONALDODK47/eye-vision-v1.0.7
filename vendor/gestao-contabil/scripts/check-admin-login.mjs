import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { readFile } from "node:fs/promises";

const cfg = JSON.parse(
  await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
);

const app = initializeApp(cfg);
const auth = getAuth(app);

async function run() {
  const attempts = [
    { email: "ronaldojunior.gyn@gmail.com", password: "RONALDO@2024" },
    { email: "ronaldojunior.gyn@usuario.local", password: "RONALDO@2024" },
  ];

  for (const attempt of attempts) {
    try {
      const result = await signInWithEmailAndPassword(auth, attempt.email, attempt.password);
      console.log("LOGIN_OK", attempt.email, result.user.uid);
    } catch (error) {
      console.log("LOGIN_FAIL", attempt.email, error?.code || error?.message || "unknown");
    }
  }
}

run();
