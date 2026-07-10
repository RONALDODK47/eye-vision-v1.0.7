/**
 * Constantes partilhadas da cloud sem importar hooks (evita ciclos de módulo no bundle).
 * Mantido alinhado com firestore.rules `isBootstrapCloudAdmin` / Gestão.
 */
export const CLOUD_ADMIN_EMAIL = "ronaldojunior.gyn@gmail.com";
