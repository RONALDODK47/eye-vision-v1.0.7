/** Versão de release injetada no build (vite.config.js — `package.json`). */
export const APP_VERSION =
  typeof import.meta.env.VITE_APP_VERSION === "string" && String(import.meta.env.VITE_APP_VERSION).trim()
    ? String(import.meta.env.VITE_APP_VERSION).trim()
    : "dev";
