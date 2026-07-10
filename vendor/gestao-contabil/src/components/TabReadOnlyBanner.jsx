import React from "react";
import { useCloudAccess } from "@/lib/useCloudAccess";

/**
 * Aviso quando o utilizador só pode visualizar a aba (sem `tab_edit_access` configurado na cloud).
 */
export default function TabReadOnlyBanner({ pageKey, className = "" }) {
  const { canEditTab, isAdminEmail } = useCloudAccess();
  if (isAdminEmail || canEditTab(pageKey)) return null;
  return (
    <div
      className={`rounded-lg border p-3 text-sm mb-4 ${
        className ||
        "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
      }`}
    >
      <strong>Modo somente leitura nesta aba.</strong> Peça ao administrador permissão na página{" "}
      <strong>Gestão Contábil → Administrador cloud</strong> (marcar &quot;Pode editar&quot; para esta aba), ou na{" "}
      <strong>Consola Gestão Contábil</strong> se o escritório usar políticas centralizadas nessa consola.
    </div>
  );
}
