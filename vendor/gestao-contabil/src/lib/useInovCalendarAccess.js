import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { dbClient } from "@/api/dbClient";
import { useCloudAccess } from "@/lib/useCloudAccess";

export function getEnvInovCalendarOwnerUid() {
  return String(import.meta.env.VITE_INOV_CALENDAR_OWNER_UID || "").trim();
}

export function isEnvInovCalendarOwnerUid(uid) {
  const o = getEnvInovCalendarOwnerUid();
  return Boolean(uid && o && uid === o);
}

/**
 * Calendário INOV na nuvem: só o proprietário (UID em .env e/ou owner_uid no Firestore) edita a planilha.
 */
export function useInovCalendarAccess() {
  const { user } = useAuth();
  const { canEditCalendar, canSeeAppSettings, isAdminEmail, isMasterUser, isCalendarOwnerUid } = useCloudAccess();
  const uid = user?.uid;

  const { data: config, isLoading: aclLoading } = useQuery({
    queryKey: ["inovCalendarAclConfig"],
    queryFn: () => dbClient.entities.InovCalendarAcl.getConfig(),
    staleTime: 30_000,
    retry: false,
  });

  const ownerUid = String(config?.owner_uid || "").trim();

  const envOwner = getEnvInovCalendarOwnerUid();
  const isOwner = Boolean(uid && ownerUid && uid === ownerUid);
  const isBootstrapOwner = isEnvInovCalendarOwnerUid(uid);
  /** Só o seu UID (em .env) ou o dono no Firestore vê a secção Calendário INOV em Configurações. */
  const baseCanManageEditors = Boolean(
    uid &&
      (isAdminEmail ||
        isCalendarOwnerUid ||
        (envOwner && uid === envOwner) ||
        (!!ownerUid && uid === ownerUid))
  );
  /**
   * Gravar linhas na planilha partilhada: apenas o proprietário (nunca outros utilizadores).
   * Sem ACL ainda: só o UID em VITE_INOV_CALENDAR_OWNER_UID; com ACL: só owner_uid no Firestore.
   */
  const baseCanEditCalendarRows = Boolean(
    uid &&
      (isAdminEmail ||
        isCalendarOwnerUid ||
        (!!ownerUid && uid === ownerUid) ||
        (!ownerUid && !!envOwner && uid === envOwner))
  );
  const canManageEditors = Boolean(
    baseCanManageEditors && (canSeeAppSettings || isAdminEmail || isCalendarOwnerUid)
  );
  const canEditCalendarRows = Boolean(
    (baseCanEditCalendarRows && (isAdminEmail || isCalendarOwnerUid)) ||
      (isMasterUser && canEditCalendar) ||
      (canEditCalendar && baseCanEditCalendarRows)
  );

  return {
    aclLoading,
    config,
    ownerUid,
    isOwner,
    isBootstrapOwner,
    canManageEditors,
    canEditCalendarRows,
  };
}
