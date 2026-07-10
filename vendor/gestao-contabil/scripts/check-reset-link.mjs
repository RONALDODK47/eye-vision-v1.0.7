import { readFile } from "node:fs/promises";

const cfg = JSON.parse(
  await readFile(new URL("../firebase-applet-config.json", import.meta.url), "utf8")
);

const apiKey = String(cfg?.apiKey || "");
const email = "ronaldojunior.gyn@gmail.com";

const resp = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestType: "PASSWORD_RESET",
      email,
    }),
  }
);

const body = await resp.json();
console.log("status", resp.status);
console.log(body);
