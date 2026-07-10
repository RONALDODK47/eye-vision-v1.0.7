import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { dbClient } from "@/api/dbClient";
import { auth } from "@/lib/firebase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Download, Plus, CheckSquare, Check, ChevronsUpDown } from "lucide-react";
import CsvImportActions from "@/components/CsvImportActions";
import { getRowValue, normalizeDateInput } from "@/lib/csvUtils";
import {
  getReferenceMonthAsDate,
  setReferenceMonthFromDate,
  REFERENCE_MONTH_YMD_KEY,
} from "@/lib/workspaceCalendarSettings";
import CompanyForm from "../components/company/CompanyForm";
import CompanyTable from "../components/company/CompanyTable";
import ExitDialog from "../components/company/ExitDialog";
import CompanyTasksModal from "../components/company/CompanyTasksModal";
import MonthPicker from "../components/MonthPicker";
import { useTheme } from "../components/ThemeProvider";
import { cn } from "@/lib/utils";
import { isMonthBeforeAccountingTasksStart, isMonthlyTaskInPeriodScope } from "@/lib/companyTaskPeriod";
import { observationPeriodKey } from "@/lib/companyObservations";
import {
  FILTER_RESPONSIBLE_NONE,
  companyMatchesResponsibleFilter,
} from "@/lib/responsibleFilter";
import {
  uniqueResponsibleLabelsFromCompanies,
  companyResponsibleFieldsMatchSearch,
} from "@/lib/companySectorResponsibles";
import { PORTAL_COMPANY_SECTOR_ROWS } from "@/lib/portalCompanySectors";
import { mergeIndexedDocs } from "@/lib/officeWorkspacePeers";
import { deleteField } from "firebase/firestore";
import { useCloudAccess } from "@/lib/useCloudAccess";
import { useWorkspacePeerUids } from "@/hooks/useWorkspacePeerUids";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  GestaoPageHeader,
  gestaoNativeBtnPrimary,
} from "@/components/GestaoEyeVisionChrome";

function parseTaskDate(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const localDate = new Date(year, month - 1, day);
    return Number.isNaN(localDate.getTime()) ? null : localDate;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getPeriodKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getTaskKey(task) {
  const freq = task?.frequency || "";
  const monthlyMode =
    freq === "mensal" ? String(task?.monthly_repeat_mode || "recurring").toLowerCase() : "";
  const only =
    freq === "mensal" && monthlyMode === "once" ? String(task?.only_in_period_key || "").trim() : "";
  const until =
    freq === "mensal" && monthlyMode === "until"
      ? String(task?.repeat_until_period_key || "").trim()
      : "";
  return [
    String(task?.name || "").trim().toLowerCase(),
    freq,
    task?.category || "",
    task?.month_start || "",
    task?.month_end || "",
    monthlyMode,
    only,
    until,
  ].join("||");
}

function inferSharedTemplatesFromTasks(allTasks, relevantCompanyIds) {
  const companyIds = Array.from(relevantCompanyIds || []);
  if (companyIds.length === 0) return [];

  const companySet = new Set(companyIds);
  const grouped = new Map();
  const byCompany = new Map();

  allTasks
    .filter((task) => companySet.has(task.company_id))
    .forEach((task) => {
      const key = getTaskKey(task);
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          name: task.name || "",
          frequency: task.frequency || "mensal",
          category: task.category || "contabil",
          month_start: task.month_start || null,
          month_end: task.month_end || null,
          monthly_repeat_mode: task.monthly_repeat_mode || null,
          only_in_period_key: task.only_in_period_key ?? null,
          repeat_until_period_key: task.repeat_until_period_key ?? null,
          companyIds: new Set(),
        });
      }
      grouped.get(key).companyIds.add(task.company_id);

      if (!byCompany.has(task.company_id)) {
        byCompany.set(task.company_id, new Map());
      }
      const companyTemplates = byCompany.get(task.company_id);
      if (!companyTemplates.has(key)) {
        companyTemplates.set(key, {
          name: task.name || "",
          frequency: task.frequency || "mensal",
          category: task.category || "contabil",
          month_start: task.month_start || null,
          month_end: task.month_end || null,
          monthly_repeat_mode: task.monthly_repeat_mode || null,
          only_in_period_key: task.only_in_period_key ?? null,
          repeat_until_period_key: task.repeat_until_period_key ?? null,
        });
      }
    });

  if (grouped.size === 0) return [];

  const minCompanies =
    companyIds.length <= 1 ? 1 : Math.max(2, Math.ceil(companyIds.length * 0.5));

  const sharedTemplates = Array.from(grouped.values())
    .filter((group) => group.companyIds.size >= minCompanies)
    .map((group) => ({
      name: group.name,
      frequency: group.frequency,
      category: group.category,
      month_start: group.month_start,
      month_end: group.month_end,
      monthly_repeat_mode: group.monthly_repeat_mode,
      only_in_period_key: group.only_in_period_key,
      repeat_until_period_key: group.repeat_until_period_key,
    }));
  if (sharedTemplates.length > 0) return sharedTemplates;

  // Fallback forte: usa as tarefas da empresa com mais tarefas como padrão.
  let sourceCompanyId = null;
  let maxCount = 0;
  byCompany.forEach((templates, companyId) => {
    if (templates.size > maxCount) {
      maxCount = templates.size;
      sourceCompanyId = companyId;
    }
  });

  if (!sourceCompanyId) return [];
  return Array.from(byCompany.get(sourceCompanyId).values());
}

function isMonthlyTaskCompletedInPeriod(task, year, month) {
  const periodKey = getPeriodKey(year, month);
  if (task?.completed_months?.[periodKey]) return true;
  const legacyDate = parseTaskDate(task?.completed_date);
  if (!legacyDate) return false;
  return legacyDate.getMonth() + 1 === month && legacyDate.getFullYear() === year;
}

async function resolvePortalSectorAssigneesForSave(rawUsernameBySector) {
  const out = [];
  for (const def of PORTAL_COMPANY_SECTOR_ROWS) {
    const raw = String(rawUsernameBySector?.[def.key] ?? "").trim();
    if (!raw) continue;
    const uid = await dbClient.entities.LoginUsername.lookupUid(raw);
    if (!uid) {
      throw new Error(
        `${def.label}: utilizador GC «${raw}» não encontrado. Use o mesmo nome registado no login (3–30 caracteres, letras, números, _).`
      );
    }
    out.push({
      sector: def.key,
      uid,
      gc_username_display: raw,
    });
  }
  return out;
}

export default function Companies() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const userUid = auth.currentUser?.uid;
  const currentUserName =
    String(auth.currentUser?.displayName || "").trim() || String(auth.currentUser?.email || "").trim();
  const { canEditCompanyTasks, canCreateCompanyTasks, canCreateCompanies, isAdminEmail, isMasterUser, clientEntry: _clientEntry, internalStaffFullAccess } =
    useCloudAccess();
  const compactCompaniesMode = false;
  const showCompanyCreationControls = !compactCompaniesMode;
  const { officePeerUids: officeUids, stableOfficeUidsKey, officeToken } = useWorkspacePeerUids();

  const officeWideListing = useMemo(
    () => Boolean(internalStaffFullAccess || isMasterUser),
    [internalStaffFullAccess, isMasterUser]
  );

  const companiesQueryKey = useMemo(
    () => ["companies", "workspace", userUid, officeToken, stableOfficeUidsKey, officeWideListing, isAdminEmail],
    [userUid, officeToken, stableOfficeUidsKey, officeWideListing, isAdminEmail]
  );

  const tasksQueryKey = useMemo(
    () => ["companyTasks", "workspace", userUid, officeToken, stableOfficeUidsKey, officeWideListing, isAdminEmail],
    [userUid, officeToken, stableOfficeUidsKey, officeWideListing, isAdminEmail]
  );

  const { data: companies = [] } = useQuery({
    queryKey: companiesQueryKey,
    queryFn: async () => {
      if (!auth.currentUser) return [];
      const currentUserUid = auth.currentUser.uid;
      
      let allCompanies;
      if (officeWideListing) {
        const all = await dbClient.entities.Company.listAll();
        if (!Array.isArray(all)) return [];
        allCompanies = [...all].sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" })
        );
      } else {
        const uidList = officeUids.length > 0 ? officeUids : [auth.currentUser.uid];
        allCompanies = await mergeIndexedDocs((u) => dbClient.entities.Company.list(u), uidList);
      }

      // Filter based on company token, admin status and ownership
      return allCompanies.filter((company) => {
        const companyToken = String(company.assigned_company_token || "").trim();
        const userOfficeToken = String(officeToken || "").trim();

        // If company has a token, only show to users with that same token
        if (companyToken) {
          return userOfficeToken === companyToken;
        }

        // Company without token: only visible to its creator
        return String(company.uid || "").trim() === String(currentUserUid).trim();
      });
    },
    enabled: Boolean(auth.currentUser),
    retry: false,
  });

  const { data: workspaceProfiles = [] } = useQuery({
    queryKey: ["workspacePeersProfiles"],
    queryFn: () => dbClient.entities.UserProfile.listAll(),
    enabled: Boolean(auth.currentUser),
    staleTime: 60_000,
  });





  useEffect(() => {
    const id = location.state?.openTasksForCompanyId;
    if (!id || companies.length === 0) return;
    const target = companies.find((c) => c.id === id);
    if (!target) return;
    setTasksCompany(target);
    navigate("/Companies", { replace: true, state: {} });
  }, [location.state?.openTasksForCompanyId, companies, navigate]);

  const { data: tasks = [] } = useQuery({
    queryKey: tasksQueryKey,
    queryFn: async () => {
      if (!auth.currentUser) return [];
      const currentUserUid = auth.currentUser.uid;
      
      let allTasks;
      if (officeWideListing) {
        const all = await dbClient.entities.CompanyTask.listAll();
        allTasks = Array.isArray(all) ? all : [];
      } else {
        const uidList = officeUids.length > 0 ? officeUids : [auth.currentUser.uid];
        allTasks = await mergeIndexedDocs((u) => dbClient.entities.CompanyTask.list(u), uidList);
      }

      // First get the visible companies to filter tasks
      let visibleCompanyIds;
      if (officeWideListing) {
        const allCompanies = await dbClient.entities.Company.listAll();
        visibleCompanyIds = new Set(
          allCompanies
            .filter((company) => {
              const companyToken = String(company.assigned_company_token || "").trim();
              const userOfficeToken = String(officeToken || "").trim();
              if (companyToken) return userOfficeToken === companyToken;
              return String(company.uid || "").trim() === String(currentUserUid).trim();
            })
            .map((c) => c.id)
        );
      } else {
        // For non-officeWideListing, we can assume the companies are already filtered, but let's still get them
        const uidList = officeUids.length > 0 ? officeUids : [auth.currentUser.uid];
        const companiesFromMerge = await mergeIndexedDocs((u) => dbClient.entities.Company.list(u), uidList);
        visibleCompanyIds = new Set(
          companiesFromMerge
            .filter((company) => {
              const companyToken = String(company.assigned_company_token || "").trim();
              const userOfficeToken = String(officeToken || "").trim();
              if (companyToken) return userOfficeToken === companyToken;
              return String(company.uid || "").trim() === String(currentUserUid).trim();
            })
            .map((c) => c.id)
        );
      }

      // Filter tasks to only those from visible companies
      return allTasks.filter((task) => visibleCompanyIds.has(task.company_id));
    },
    enabled: Boolean(auth.currentUser),
    retry: false,
  });

  const [editingCompany, setEditingCompany] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [exitCompany, setExitCompany] = useState(null);
  const [exitType, setExitType] = useState("saida");
  const [tasksCompany, setTasksCompany] = useState(null);
  const [showGlobalTasks, setShowGlobalTasks] = useState(false);
  const [filterDate, setFilterDate] = useState(() => getReferenceMonthAsDate());
  const [filterResponsible, setFilterResponsible] = useState("all");
  const [openResponsible, setOpenResponsible] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [search, setSearch] = useState("");
  const [openGroup, setOpenGroup] = useState(false);
  const showTrash = false;
  const autoSyncedCompaniesRef = useRef(new Set());
  const migratedUnassignedTasksRef = useRef(false);

  const commitFilterDate = (d) => {
    setFilterDate(d);
    setReferenceMonthFromDate(d);
  };

  const _handlePreviousMonth = () => {
    const base = filterDate || new Date();
    commitFilterDate(new Date(base.getFullYear(), base.getMonth() - 1, 1));
  };

  const _handleNextMonth = () => {
    const base = filterDate || new Date();
    commitFilterDate(new Date(base.getFullYear(), base.getMonth() + 1, 1));
  };

  useEffect(() => {
    const syncFromStorage = () => {
      const d = getReferenceMonthAsDate();
      if (d) setFilterDate(d);
    };
    window.addEventListener("gc-workspace-calendar", syncFromStorage);
    const onStorage = (e) => {
      if (e.key === REFERENCE_MONTH_YMD_KEY || e.key === null) syncFromStorage();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("gc-workspace-calendar", syncFromStorage);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const buildTaskFromTemplate = (template, companyId, uid, responsibleName) => {
    const freq = template.frequency || "mensal";
    return {
      uid,
      company_id: companyId,
      name: template.name || "",
      frequency: freq,
      category: template.category || "contabil",
      completed: false,
      month: null,
      year: null,
      completed_months: {},
      responsible_uid: uid || "",
      responsible_name: String(responsibleName || ""),
      month_start: freq === "anual" ? Number(template.month_start || 1) : null,
      month_end: freq === "anual" ? Number(template.month_end || 12) : null,
      monthly_repeat_mode: freq === "mensal" ? template.monthly_repeat_mode || "recurring" : null,
      only_in_period_key: freq === "mensal" ? template.only_in_period_key ?? null : null,
      repeat_until_period_key: freq === "mensal" ? template.repeat_until_period_key ?? null : null,
    };
  };

  const upsertTaskTemplates = async (uid, templates) => {
    if (!uid || !templates?.length) return [];
    try {
      const existingTemplates = await dbClient.entities.TaskTemplate.list(uid);
      const activeExisting = (existingTemplates || []).filter((t) => t.active !== false);
      const existingByKey = new Map(activeExisting.map((t) => [getTaskKey(t), t]));

      const toCreate = templates.filter((template) => !existingByKey.has(getTaskKey(template)));
      if (toCreate.length > 0) {
        await Promise.all(
          toCreate.map((template) =>
            dbClient.entities.TaskTemplate.create({
              uid,
              name: template.name || "",
              frequency: template.frequency || "mensal",
              category: template.category || "contabil",
              month_start: template.month_start || null,
              month_end: template.month_end || null,
              monthly_repeat_mode: template.monthly_repeat_mode ?? null,
              only_in_period_key: template.only_in_period_key ?? null,
              repeat_until_period_key: template.repeat_until_period_key ?? null,
              active: true,
            })
          )
        );
      }

      const refreshed = await dbClient.entities.TaskTemplate.list(uid);
      const activeRefreshed = (refreshed || []).filter((t) => t.active !== false);
      return activeRefreshed;
    } catch (error) {
      console.warn("Nao foi possivel persistir task_templates, usando fallback em memoria.", error);
      return templates;
    }
  };

  const getFallbackSharedTemplates = () => {
    const activeCompanyIds = new Set(
      companies.filter((c) => c.status === "active" || !c.status).map((c) => c.id)
    );
    return inferSharedTemplatesFromTasks(tasks, activeCompanyIds);
  };

  const loadDefaultTaskTemplates = async (uid) => {
    try {
      const templates = await dbClient.entities.TaskTemplate.list(uid);
      const activeTemplates = (templates || []).filter((t) => t.active !== false);
      if (activeTemplates.length > 0) return activeTemplates;
    } catch (error) {
      console.warn("Sem acesso a task_templates, inferindo padrao pelas tarefas existentes.", error);
    }

    const liveTasks = await dbClient.entities.CompanyTask.list(uid);
    const activeCompanyIds = new Set(
      companies.filter((c) => c.status === "active" || !c.status).map((c) => c.id)
    );
    const inferred = inferSharedTemplatesFromTasks(liveTasks, activeCompanyIds);
    if (inferred.length > 0) return upsertTaskTemplates(uid, inferred);

    const fallback = getFallbackSharedTemplates();
    if (fallback.length > 0) return upsertTaskTemplates(uid, fallback);

    return [];
  };

  const applyDefaultTasksToCompany = async (companyId, uid, templatesCache = null) => {
    if (!canCreateCompanyTasks && !canEditCompanyTasks) return;
    const activeTemplates = templatesCache || await loadDefaultTaskTemplates(uid);
    if (activeTemplates.length === 0) return;
    const allTasksByUser = await dbClient.entities.CompanyTask.list(uid);
    const existingTasks = (allTasksByUser || []).filter((task) => task.company_id === companyId);
    const existingKeys = new Set((existingTasks || []).map((task) => getTaskKey(task)));
    const missingTemplates = activeTemplates.filter((template) => !existingKeys.has(getTaskKey(template)));
    if (missingTemplates.length === 0) return;
    await Promise.all(
      missingTemplates.map((template) =>
        dbClient.entities.CompanyTask.create(buildTaskFromTemplate(template, companyId, uid, currentUserName))
      )
    );
  };

  useEffect(() => {
    if (!isAdminEmail || !userUid || migratedUnassignedTasksRef.current) return;
    const unassigned = tasks.filter((t) => !String(t?.responsible_uid || "").trim() && !String(t?.responsible_name || "").trim());
    if (unassigned.length === 0) {
      migratedUnassignedTasksRef.current = true;
      return;
    }
    migratedUnassignedTasksRef.current = true;
    const fallbackName = currentUserName || "Administrador";
    Promise.all(
      unassigned.map((t) =>
        dbClient.entities.CompanyTask.update(t.id, {
          responsible_uid: userUid,
          responsible_name: fallbackName,
        })
      )
    )
      .then(() => queryClient.invalidateQueries({ queryKey: ["companyTasks"] }))
      .catch((error) => {
        migratedUnassignedTasksRef.current = false;
        console.error("Falha ao vincular responsável padrão nas tarefas sem usuário:", error);
      });
  }, [isAdminEmail, userUid, tasks, currentUserName, queryClient]);

  useEffect(() => {
    if (!canCreateCompanyTasks && !canEditCompanyTasks) return;
    const uid = auth.currentUser?.uid;
    if (!uid || companies.length === 0) return;

    const activeCompaniesList = companies.filter((c) => c.status === "active" || !c.status);
    if (activeCompaniesList.length === 0) return;

    const taskCountByCompany = new Map();
    tasks.forEach((task) => {
      taskCountByCompany.set(task.company_id, (taskCountByCompany.get(task.company_id) || 0) + 1);
    });

    const missingCompanies = activeCompaniesList.filter(
      (company) =>
        (taskCountByCompany.get(company.id) || 0) === 0 &&
        !autoSyncedCompaniesRef.current.has(company.id)
    );
    if (missingCompanies.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const defaults = await loadDefaultTaskTemplates(uid);
        if (cancelled || defaults.length === 0) return;

        for (const company of missingCompanies) {
          autoSyncedCompaniesRef.current.add(company.id);
          try {
            await applyDefaultTasksToCompany(company.id, company.uid || uid, defaults);
          } catch (error) {
            autoSyncedCompaniesRef.current.delete(company.id);
            throw error;
          }
        }

        if (!cancelled) {
          queryClient.invalidateQueries({ queryKey: ["companyTasks"] });
        }
      } catch (error) {
        console.error("Erro ao sincronizar tarefas padrão nas empresas:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companies, tasks, queryClient, canEditCompanyTasks, canCreateCompanyTasks]);

  const responsibles = useMemo(() => uniqueResponsibleLabelsFromCompanies(companies), [companies]);

  const groupNames = useMemo(() => {
    const set = new Set();
    companies
      .filter((c) => c.status === "active" || !c.status)
      .forEach((c) => {
        const g = String(c.group_name || "").trim();
        if (g) set.add(g);
      });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [companies]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => {
      if (!canCreateCompanies) {
        throw new Error("Você não tem permissão para alterar empresas.");
      }
      return dbClient.entities.Company.update(id, data);
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: companiesQueryKey });
      const previousCompanies = queryClient.getQueryData(companiesQueryKey);
      queryClient.setQueryData(companiesQueryKey, (old = []) =>
        old.map((company) => (company.id === id ? { ...company, ...data } : company))
      );
      return { previousCompanies };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousCompanies) {
        queryClient.setQueryData(companiesQueryKey, context.previousCompanies);
      }
    },
    onSuccess: () => {
      setShowForm(false);
      setEditingCompany(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: companiesQueryKey });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      if (!canCreateCompanies) {
        throw new Error("Você não tem permissão para criar novas empresas.");
      }
      const createdCompany = await dbClient.entities.Company.create(data);
      const uid = data?.uid || createdCompany?.uid || auth.currentUser?.uid;
      if (createdCompany?.id && uid) {
        try {
          await applyDefaultTasksToCompany(createdCompany.id, uid);
        } catch (error) {
          console.error("Erro ao herdar tarefas para nova empresa:", error);
        }
      }
      return createdCompany;
    },
    onSuccess: (createdCompany) => {
      queryClient.setQueryData(companiesQueryKey, (old = []) => [...old, createdCompany]);
      const uid = createdCompany?.uid || auth.currentUser?.uid;
      if (uid) {
        queryClient.invalidateQueries({ queryKey: ["companyTasks"] });
      }
      setShowForm(false);
      setEditingCompany(null);
    },
    onError: (error) => {
      alert("Erro ao criar empresa: " + (error.message || "Erro desconhecido"));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: companiesQueryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => dbClient.entities.Company.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: companiesQueryKey });
      const previousCompanies = queryClient.getQueryData(companiesQueryKey);
      queryClient.setQueryData(companiesQueryKey, (old = []) =>
        old.filter((company) => company.id !== id)
      );
      return { previousCompanies };
    },
    onError: (error, _id, context) => {
      if (context?.previousCompanies) {
        queryClient.setQueryData(companiesQueryKey, context.previousCompanies);
      }
      alert("Erro ao excluir empresa: " + (error.message || "Erro desconhecido"));
    },
    onSuccess: () => {
      setShowForm(false);
      setEditingCompany(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: companiesQueryKey });
    },
  });

  const searchTerm = search.toLowerCase();

  const activeCompanies = companies
    .filter((c) => (c.status === "active" || !c.status) && !c.is_deleted)
    .filter((c) => {
      if (!searchTerm) return true;
      const code = (c.code || "").toString().toLowerCase();
      const name = (c.name || "").toLowerCase();
      const matchesCode = code.includes(searchTerm);
      const matchesName = name.includes(searchTerm);
      const matchesResponsible = companyResponsibleFieldsMatchSearch(c, searchTerm);
      return matchesCode || matchesName || matchesResponsible;
    })
    .filter((c) => companyMatchesResponsibleFilter(filterResponsible, c))
    .filter((c) => {
      if (filterStatus === "all") return true;
      const currentMonth = filterDate ? filterDate.getMonth() + 1 : new Date().getMonth() + 1;
      const currentYear = filterDate ? filterDate.getFullYear() : new Date().getFullYear();
      if (isMonthBeforeAccountingTasksStart(c, currentYear, currentMonth)) {
        return false;
      }
      const companyTasks = tasks.filter(
        (t) =>
          t.company_id === c.id &&
          t.frequency === "mensal" &&
          isMonthlyTaskInPeriodScope(t, refYear, refMonth)
      );
      const total = companyTasks.length;
      if (total === 0) return filterStatus === "open";
      const completedCount = companyTasks.filter((t) =>
        isMonthlyTaskCompletedInPeriod(t, currentYear, currentMonth)
      ).length;
      if (filterStatus === "completed") return completedCount === total && total > 0;
      if (filterStatus === "open") return completedCount < total || total === 0;
      return true;
    })
    .filter((c) => {
      if (filterGroup === "all") return true;
      const g = String(c.group_name || "").trim();
      if (filterGroup === "__sem_grupo__") return !g;
      return g === filterGroup;
    })
    .sort((a, b) => {
      const ga = String(a.group_name || "").trim();
      const gb = String(b.group_name || "").trim();
      const sa = ga || "\uFFFF";
      const sb = gb || "\uFFFF";
      if (sa !== sb) return sa.localeCompare(sb, "pt-BR");
      return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
    });

  const trashCompanies = companies
    .filter((c) => c.is_deleted)
    .filter((c) => {
      if (!searchTerm) return true;
      const code = (c.code || "").toString().toLowerCase();
      const name = (c.name || "").toLowerCase();
      const matchesCode = code.includes(searchTerm);
      const matchesName = name.includes(searchTerm);
      const matchesResponsible = companyResponsibleFieldsMatchSearch(c, searchTerm);
      return matchesCode || matchesName || matchesResponsible;
    });

  const displayedCompanies = showTrash ? trashCompanies : activeCompanies;

  const handleEdit = (company) => {
    setEditingCompany(company);
    setShowForm(true);
  };

  const handleExit = (company, type) => {
    setExitCompany(company);
    setExitType(type);
  };

  const handleDelete = (company) => {
    if (!company?.id) return;
    const confirmed = window.confirm(`Deseja mover a empresa "${company.name}" para a lixeira?`);
    if (!confirmed) return;
    updateMutation.mutate({ 
      id: company.id, 
      data: { 
        is_deleted: true, 
        deleted_at: new Date().toISOString() 
      } 
    });
  };

  const handleRestore = (company) => {
    if (!company?.id) return;
    const confirmed = window.confirm(`Deseja restaurar a empresa "${company.name}"?`);
    if (!confirmed) return;
    updateMutation.mutate({ 
      id: company.id, 
      data: { 
        is_deleted: false, 
        deleted_at: null 
      } 
    });
  };

  const handlePermanentlyDelete = (company) => {
    if (!company?.id) return;
    const confirmed = window.confirm(`Deseja EXCLUIR PERMANENTEMENTE a empresa "${company.name}"? Esta ação NÃO pode ser desfeita!`);
    if (!confirmed) return;
    deleteMutation.mutate(company.id);
  };

  const handleUpdateCompanyPatch = async (companyId, patch) => {
    if (!companyId || !patch || typeof patch !== "object") return;
    updateMutation.mutate({ id: companyId, data: patch });
  };

  const confirmExit = (exitDate, reason) => {
    updateMutation.mutate({
      id: exitCompany.id,
      data: {
        status: exitType,
        exit_date: exitDate,
        exit_reason: reason,
        exit_tasks_start_date: exitDate,
      },
    });
    setExitCompany(null);
  };

  const handleExportCSV = () => {
    const headers = [
      "Código",
      "Nome",
      "Grupo",
      "CNPJ",
      "Início tarefas",
      "Contato",
      "Resp. contábil",
      "Resp. fiscal",
      "Dep. pessoal",
      "Outros",
    ];
    const rows = activeCompanies.map((c) => [
      c.code || "",
      c.name,
      c.group_name || "",
      c.cnpj || "",
      c.tasks_start_date || "",
      c.contact_name || "",
      c.accounting_responsible || "",
      c.fiscal_responsible || "",
      c.payroll_responsible || "",
      c.other_responsible || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "empresas.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCompanies = async (rows) => {
    if (!canCreateCompanies) {
      throw new Error("Você não tem permissão para importar/criar empresas.");
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error("Você precisa estar logado para importar.");
    }

    const today = new Date().toISOString().split("T")[0];
    const byCode = new Map(
      companies
        .filter((c) => c.code)
        .map((c) => [String(c.code).trim().toLowerCase(), c])
    );
    const byCnpj = new Map(
      companies
        .filter((c) => c.cnpj)
        .map((c) => [String(c.cnpj).replace(/\D/g, ""), c])
    );
    const defaultTemplates = await loadDefaultTaskTemplates(uid);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    const impNow = new Date();
    const impPeriodKey = observationPeriodKey(impNow.getFullYear(), impNow.getMonth() + 1);
    const impYear = String(impNow.getFullYear());

    for (const row of rows) {
      const code = getRowValue(row, ["codigo", "código", "code"]);
      const name = getRowValue(row, ["nome", "empresa", "name"]);
      const cnpj = getRowValue(row, ["cnpj"]);
      if (!name) {
        skipped += 1;
        continue;
      }

      const difficultyRaw = getRowValue(row, ["nivel_dificuldade", "dificuldade"], "facil").toLowerCase();
      const difficultyLevel = difficultyRaw.includes("dif") ? "dificil" : "facil";
      const tasksStart =
        normalizeDateInput(
          getRowValue(row, [
            "inicio_tarefas",
            "tasks_start_date",
            "data_tarefas",
            "data_entrada",
            "entry_date",
          ])
        ) || today;
      const existing =
        (code && byCode.get(String(code).trim().toLowerCase())) ||
        (cnpj && byCnpj.get(String(cnpj).replace(/\D/g, "")));

      const monthlyLine = String(
        getRowValue(row, [
          "observacao_mensal",
          "observacoes_mensal",
          "obs_mensal",
          "notes_monthly",
        ]) || ""
      ).trim();
      const annualLine = String(
        getRowValue(row, [
          "observacao_anual",
          "observacoes_anual",
          "obs_anual",
          "notes_annual",
        ]) || ""
      ).trim();

      const payload = {
        code,
        name,
        cnpj,
        contact_name: getRowValue(row, ["contato", "contact_name"]),
        contact_phone: getRowValue(row, ["telefone", "contact_phone"]),
        contact_email: getRowValue(row, ["email", "contact_email"]),
        accounting_responsible: getRowValue(row, ["responsavel_contabil", "responsavel", "accounting_responsible"]),
        fiscal_responsible: getRowValue(row, ["responsavel_fiscal", "fiscal_responsible"]),
        payroll_responsible: getRowValue(row, ["responsavel_dp", "departamento_pessoal", "payroll_responsible"]),
        other_responsible: getRowValue(row, ["responsavel_outros", "outros_responsible", "other_responsible"]),
        group_name: getRowValue(row, ["grupo", "group_name", "nome_grupo"]),
        notes: getRowValue(row, [
          "observacao_geral",
          "observacoes_geral",
          "observacoes",
          "observacao",
          "notes",
        ]),
        regime: getRowValue(row, ["regime"]),
        difficulty_level: difficultyLevel,
        tasks_start_date: tasksStart,
      };

      if (monthlyLine) {
        payload.monthly_notes = {
          ...(existing?.monthly_notes && typeof existing.monthly_notes === "object" ? existing.monthly_notes : {}),
          [impPeriodKey]: monthlyLine,
        };
        if (existing) {
          payload.notes_monthly = deleteField();
        }
      }
      if (annualLine) {
        payload.annual_notes = {
          ...(existing?.annual_notes && typeof existing.annual_notes === "object" ? existing.annual_notes : {}),
          [impYear]: annualLine,
        };
      }

      if (existing) {
        await dbClient.entities.Company.update(existing.id, payload);
        updated += 1;
      } else {
        const createdCompany = await dbClient.entities.Company.create({
          ...payload,
          uid,
          created_via: "companies",
          status: "active",
        });
        await applyDefaultTasksToCompany(createdCompany.id, uid, defaultTemplates);
        created += 1;
      }
    }

    await queryClient.invalidateQueries({ queryKey: companiesQueryKey });
    await queryClient.invalidateQueries({ queryKey: ["companyTasks"] });
    return {
      message: `Importação concluída: ${created} criadas, ${updated} atualizadas, ${skipped} ignoradas.`,
    };
  };

  return (
    <div className="space-y-6">
      <GestaoPageHeader
        title="Empresas"
        subtitle={`${activeCompanies.length} empresas ativas`}
        actions={
          <>
          <Button variant="outline" onClick={() => setShowGlobalTasks(true)} className="gap-2 border-brand-border rounded-none text-[10px] font-bold uppercase tracking-wide">
            <CheckSquare className="w-4 h-4" /> Tarefas Contábeis
          </Button>
          {showCompanyCreationControls ? (
            <>
              <Button
                onClick={() => { setEditingCompany(null); setShowForm(true); }}
                disabled={!canCreateCompanies}
                className={gestaoNativeBtnPrimary}
              >
                <Plus className="w-4 h-4" /> Nova Empresa
              </Button>
              <Button variant="outline" onClick={handleExportCSV} className="gap-2">
                <Download className="w-4 h-4" /> Exportar CSV
              </Button>
              <CsvImportActions
                templateFileName="modelo_empresas.csv"
                templateHeaders={[
                  "codigo",
                  "nome",
                  "grupo",
                  "cnpj",
                  "contato",
                  "telefone",
                  "email",
                  "data_entrada",
                  "responsavel_contabil",
                  "responsavel_fiscal",
                  "responsavel_dp",
                  "responsavel_outros",
                  "regime",
                  "nivel_dificuldade",
                  "observacao_mensal",
                  "observacao_anual",
                  "observacao_geral",
                ]}
                templateRows={[
                  [
                    "101",
                    "Empresa Exemplo",
                    "Grupo Demo",
                    "00.000.000/0001-00",
                    "Ana",
                    "(62) 99999-0000",
                    "financeiro@empresa.com",
                    "2026-03-10",
                    "Maria",
                    "João",
                    "Ana",
                    "Carlos",
                    "Simples Nacional",
                    "facil",
                    "Pendências do mês",
                    "Meta fiscal 2026",
                    "Cliente ativo há 2 anos",
                  ],
                ]}
                onImportRows={handleImportCompanies}
              />
            </>
          ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, código ou nome de um responsável (qualquer setor)..."
            className="pl-11 h-11 text-base w-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Popover open={openGroup} onOpenChange={setOpenGroup}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openGroup}
                className="w-[220px] justify-between font-normal"
              >
                <span className="truncate">
                  {filterGroup === "all"
                    ? "Todos os grupos"
                    : filterGroup === "__sem_grupo__"
                      ? "Sem grupo"
                      : filterGroup}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Pesquisar grupo..." />
                <CommandList>
                  <CommandEmpty>Nenhum grupo encontrado.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__all_grupos__"
                      onSelect={() => {
                        setFilterGroup("all");
                        setOpenGroup(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          filterGroup === "all" ? "opacity-100" : "opacity-0"
                        )}
                      />
                      Todos os grupos
                    </CommandItem>
                    <CommandItem
                      value="__sem_grupo__"
                      onSelect={() => {
                        setFilterGroup("__sem_grupo__");
                        setOpenGroup(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          filterGroup === "__sem_grupo__" ? "opacity-100" : "opacity-0"
                        )}
                      />
                      Sem grupo
                    </CommandItem>
                    {groupNames.map((g) => (
                      <CommandItem
                        key={g}
                        value={g}
                        onSelect={() => {
                          setFilterGroup(g);
                          setOpenGroup(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            filterGroup === g ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {g}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="open">Em Aberto</SelectItem>
              <SelectItem value="completed">Concluídas</SelectItem>
            </SelectContent>
          </Select>


          <Popover open={openResponsible} onOpenChange={setOpenResponsible}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openResponsible}
                className="w-[200px] justify-between font-normal"
              >
                <span className="truncate">
                  {filterResponsible === "all"
                    ? "Todos Responsáveis"
                    : filterResponsible === FILTER_RESPONSIBLE_NONE
                      ? "Sem responsáveis"
                      : responsibles.find((r) => r === filterResponsible)}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
              <Command>
                <CommandInput placeholder="Pesquisar responsável..." />
                <CommandList>
                  <CommandEmpty>Nenhum responsável encontrado.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="all todos"
                      onSelect={() => {
                        setFilterResponsible("all");
                        setOpenResponsible(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          filterResponsible === "all" ? "opacity-100" : "opacity-0"
                        )}
                      />
                      Todos Responsáveis
                    </CommandItem>
                    <CommandItem
                      value={`${FILTER_RESPONSIBLE_NONE} sem responsaveis sem responsável`}
                      onSelect={() => {
                        setFilterResponsible(FILTER_RESPONSIBLE_NONE);
                        setOpenResponsible(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          filterResponsible === FILTER_RESPONSIBLE_NONE ? "opacity-100" : "opacity-0"
                        )}
                      />
                      Sem responsáveis
                    </CommandItem>
                    {responsibles.map((r) => (
                      <CommandItem
                        key={r}
                        value={r}
                        onSelect={() => {
                          setFilterResponsible(r);
                          setOpenResponsible(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            filterResponsible === r ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {r}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <div className="flex gap-1 items-center">
            <MonthPicker
              date={filterDate || new Date()}
              onChange={commitFilterDate}
              restrictToWorkspaceYearWindow
            />
          </div>
          
          
          {(search || filterResponsible !== "all" || filterStatus !== "all" || filterGroup !== "all") && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setSearch("");
                setFilterResponsible("all");
                setFilterStatus("all");
                setFilterGroup("all");
              }}
              className="text-xs text-gray-500"
            >
              Limpar
            </Button>
          )}
        </div>
      </div>

      <Card className={`overflow-x-auto ${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
        <CompanyTable
          companies={displayedCompanies}
          tasks={tasks}
          onEdit={handleEdit}
          onExit={handleExit}
          onDelete={handleDelete}
          onRestore={handleRestore}
          onPermanentlyDelete={handlePermanentlyDelete}
          onOpenTasks={setTasksCompany}
          onUpdateCompany={handleUpdateCompanyPatch}
          filterDate={filterDate}
          showEditMenu={!compactCompaniesMode}
          showColumnConfigurator={!compactCompaniesMode}
          compactMode={compactCompaniesMode}
          isTrashMode={showTrash}
        />
      </Card>

      <CompanyForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditingCompany(null); }}
        onDelete={handleDelete}
        onSubmit={async (data) => {
          if (!auth.currentUser) {
            alert("Você precisa estar logado para criar uma empresa.");
            return;
          }

          const {
            _stripLegacyMonthly,
            _portal_sector_usernames = {},
            _owner_gc_username = "",
            ...payload
          } = data;

          let portal_sector_assignees = [];
          try {
            portal_sector_assignees = await resolvePortalSectorAssigneesForSave(_portal_sector_usernames);
          } catch (e) {
            alert(e?.message || "Verifique os nomes de utilizador dos setores.");
            return;
          }
          payload.portal_sector_assignees = portal_sector_assignees;

          if (payload.exit_tasks_start_date === "" || payload.exit_tasks_start_date == null) {
            delete payload.exit_tasks_start_date;
          }
          const clientSince = String(payload.client_since_date || "").trim();
          if (clientSince) {
            payload.client_since_date = clientSince;
          } else {
            delete payload.client_since_date;
            if (editingCompany) {
              payload.client_since_date = deleteField();
            }
          }
          if (editingCompany && _stripLegacyMonthly) {
            payload.notes_monthly = deleteField();
          }

          if (editingCompany) {
            updateMutation.mutate({ id: editingCompany.id, data: payload });
          } else {
            if (!canCreateCompanies) {
              alert("Você não tem permissão para criar novas empresas.");
              return;
            }

            let ownerUid = auth.currentUser.uid;
            const ownerCandidate = String(_owner_gc_username || "").trim();
            if (ownerCandidate) {
              const resolvedOwner = await dbClient.entities.LoginUsername.lookupUid(ownerCandidate);
              if (!resolvedOwner) {
                alert(
                  `Titular: utilizador GC «${ownerCandidate}» não encontrado. Confira o nome (mesmo formato do login) ou deixe vazio para criar na sua conta.`
                );
                return;
              }
              ownerUid = resolvedOwner;
            }

            const newData = { ...payload, status: "active", created_via: "companies", uid: ownerUid };
            createMutation.mutate(newData);
          }
        }}
        company={editingCompany}
      />

      <ExitDialog
        open={!!exitCompany}
        onClose={() => setExitCompany(null)}
        onConfirm={confirmExit}
        company={exitCompany}
        exitType={exitType}
      />

      <CompanyTasksModal
        open={!!tasksCompany || showGlobalTasks}
        onClose={() => { setTasksCompany(null); setShowGlobalTasks(false); }}
        company={tasksCompany}
        companies={companies}
        filterDate={filterDate}
        canEditTasks={canEditCompanyTasks}
        canCreateTasks={canCreateCompanyTasks || canEditCompanyTasks}
        workspaceWideTaskRead={officeWideListing}
      />
    </div>
  );
}