import {
  fetchWorkspaceCompanies,
  fetchWorkspaceCompanyTasks,
} from "@/lib/workspaceCompanies";

/** Empresas + tarefas do escritório (mesma origem que a aba Empresas). */
export async function fetchOfficeScopedCompaniesAndTasks({
  userUid,
  officePeerUids,
  officeToken,
  officeWideListing = false,
}) {
  const companies = await fetchWorkspaceCompanies({
    userUid,
    officePeerUids,
    officeToken,
    officeWideListing,
  });

  const companyIds = new Set(companies.map((c) => c.id));
  const tasks = await fetchWorkspaceCompanyTasks({
    userUid,
    officePeerUids,
    officeToken,
    officeWideListing,
    visibleCompanyIds: companyIds,
  });

  return { companies, tasks };
}
