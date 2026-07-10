import { mergeIndexedDocs, filterCompaniesForOfficeScope } from "@/lib/officeWorkspacePeers";
import { dbClient } from "@/api/dbClient";

/**
 * Mesma regra da aba Empresas: listAll com token de escritório ou master/staff interno;
 * senão merge por UIDs do escritório; filtro por token ou dono.
 */
export async function fetchWorkspaceCompanies({
  userUid,
  officePeerUids,
  officeToken,
  officeWideListing = false,
}) {
  if (!userUid) return [];

  const userOfficeToken = String(officeToken || "").trim();
  const useListAll = Boolean(officeWideListing || userOfficeToken);
  const uidList = officePeerUids?.length ? officePeerUids : [userUid];

  let merged;
  if (useListAll) {
    const all = await dbClient.entities.Company.listAll();
    merged = Array.isArray(all) ? all : [];
  } else {
    merged = await mergeIndexedDocs((u) => dbClient.entities.Company.list(u), uidList);
  }

  return filterCompaniesForOfficeScope(merged, { userUid, officeToken }).filter(
    (c) => c?.is_deleted !== true
  );
}

export async function fetchWorkspaceCompanyTasks({
  userUid,
  officePeerUids,
  officeToken,
  officeWideListing = false,
  visibleCompanyIds,
}) {
  if (!userUid) return [];

  const userOfficeToken = String(officeToken || "").trim();
  const useListAll = Boolean(officeWideListing || userOfficeToken);
  const uidList = officePeerUids?.length ? officePeerUids : [userUid];
  const companyIds =
    visibleCompanyIds instanceof Set
      ? visibleCompanyIds
      : new Set(Array.isArray(visibleCompanyIds) ? visibleCompanyIds : []);

  let mergedTasks;
  if (useListAll) {
    const all = await dbClient.entities.CompanyTask.listAll();
    mergedTasks = Array.isArray(all) ? all : [];
  } else {
    mergedTasks = await mergeIndexedDocs((u) => dbClient.entities.CompanyTask.list(u), uidList);
  }

  if (companyIds.size === 0) return [];
  return mergedTasks.filter((t) => companyIds.has(t.company_id));
}
