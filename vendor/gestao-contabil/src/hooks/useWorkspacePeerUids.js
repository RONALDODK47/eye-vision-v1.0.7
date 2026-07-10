import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { auth } from "@/lib/firebase";
import { useCloudAccess } from "@/lib/useCloudAccess";
import { dbClient } from "@/api/dbClient";
import { collectOfficePeerFirebaseUids } from "@/lib/officeWorkspacePeers";
import { COMPANY_ACCESS_TOKEN_KEY } from "@/lib/AuthContext";

/**
 * UIDs Firebase com o mesmo `assigned_company_token` (CloudAccessControl + perfis),
 * para juntar empresas, tarefas, recados e links do escritório.
 * Enquanto `listAll` de perfis ainda não voltou ou falhou de forma tratada como vazio,
 * fica apenas o próprio utilizador → evita filtros por `uid` errados ou ecrãs vazios.
 */
export function useWorkspacePeerUids() {
  const userUid = auth.currentUser?.uid;
  const userEmail = auth.currentUser?.email;
  const { config, clientEntry, isAdminEmail } = useCloudAccess();
  const officeToken = useMemo(() => {
    const fromEntry = String(clientEntry?.assigned_company_token || "").trim();
    if (fromEntry) return fromEntry;
    // Fallback: admin/master users have no clientEntry, read from localStorage
    try {
      return String(localStorage.getItem(COMPANY_ACCESS_TOKEN_KEY) || "").trim();
    } catch {
      return "";
    }
  }, [clientEntry?.assigned_company_token]);
  const needProfiles = Boolean(officeToken);

  const {
    data: workspaceProfiles,
    isError: workspaceProfilesErr,
  } = useQuery({
    queryKey: ["workspacePeersProfiles"],
    queryFn: () => dbClient.entities.UserProfile.listAll(),
    enabled: Boolean(auth.currentUser && needProfiles),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => {
      const msg = String(err?.message || "").toLowerCase();
      if (msg.includes("quota") || msg.includes("resource-exhausted")) return false;
      return failureCount < 1;
    },
  });

  /** Erro ao listar perfis: não impedir uso — só próprio UID. Antes dos dados: idem (lista vazio). */
  const profileRows = workspaceProfilesErr ? [] : workspaceProfiles ?? [];

  const officePeerUids = useMemo(() => {
    if (!userUid || !auth.currentUser) return [];
    // Admin bootstrap: se houver officeToken (needProfiles), traz o escritório.
    // Senão, traz todos os UIDs do sistema para o Admin master ter acesso completo.
    if (isAdminEmail) {
      if (needProfiles) {
        return collectOfficePeerFirebaseUids({
          config,
          profiles: profileRows,
          userUid,
          userEmail,
          assignedCompanyToken: officeToken,
        });
      }
      const allUids = profileRows.map((p) => p.uid).filter(Boolean);
      if (!allUids.includes(userUid)) allUids.push(userUid);
      return allUids;
    }
    if (!needProfiles) return [auth.currentUser.uid];
    return collectOfficePeerFirebaseUids({
      config,
      profiles: profileRows,
      userUid,
      userEmail,
      assignedCompanyToken: officeToken,
    });
  }, [isAdminEmail, needProfiles, userUid, userEmail, officeToken, config, profileRows]);

  const stableOfficeUidsKey = useMemo(() => [...officePeerUids].sort().join(","), [officePeerUids]);

  return {
    officePeerUids,
    stableOfficeUidsKey,
    officeToken,
    needProfiles,
    workspaceProfilesErr,
  };
}
