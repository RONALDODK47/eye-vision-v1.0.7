import React, { useEffect, useState, useMemo } from "react";
import { dbClient } from "@/api/dbClient";
import { auth } from "@/lib/firebase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import CsvImportActions from "@/components/CsvImportActions";
import { Input } from "@/components/ui/input";
import { Plus, Search, Check, ChevronsUpDown, SlidersHorizontal } from "lucide-react";
import { getRowValue, normalizeDateInput } from "@/lib/csvUtils";
import MonthPicker from "../components/MonthPicker";
import { useTheme } from "../components/ThemeProvider";
import ImplantationCard, { DEFAULT_IMPLANTATION_STEPS } from "../components/onboarding/ImplantationCard";
import CompanyForm from "../components/company/CompanyForm";
import { cn } from "@/lib/utils";
import { observationPeriodKey } from "@/lib/companyObservations";
import {
  FILTER_RESPONSIBLE_NONE,
  companyMatchesResponsibleFilter,
} from "@/lib/responsibleFilter";
import {
  uniqueResponsibleLabelsFromCompanies,
  companyResponsibleFieldsMatchSearch,
} from "@/lib/companySectorResponsibles";
import { deleteField } from "firebase/firestore";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const ONBOARD_VIEW_PREFS_KEY = "gc_onboarding_view_prefs_v1";

function loadOnboardingViewPrefs() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(ONBOARD_VIEW_PREFS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    return {
      compactCards: p.compactCards === true,
      showCnpj: p.showCnpj !== false,
      showResponsible: p.showResponsible !== false,
      showDates: p.showDates !== false,
    };
  } catch {
    return null;
  }
}

function getTaskKey(task) {
  return [
    String(task?.name || "").trim().toLowerCase(),
    task?.frequency || "",
    task?.category || "",
    task?.month_start || "",
    task?.month_end || "",
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

export default function Onboarding() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [filterResponsible, setFilterResponsible] = useState("all");
  const [openResponsible, setOpenResponsible] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [viewPrefs, setViewPrefs] = useState(
    () =>
      loadOnboardingViewPrefs() || {
        compactCards: false,
        showCnpj: true,
        showResponsible: true,
        showDates: true,
      }
  );
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [filterYear, setFilterYear] = useState(now.getFullYear());

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(ONBOARD_VIEW_PREFS_KEY, JSON.stringify(viewPrefs));
  }, [viewPrefs]);

  const { data: companies = [] } = useQuery({
    queryKey: ["companies", auth.currentUser?.uid],
    queryFn: () => auth.currentUser ? dbClient.entities.Company.list(auth.currentUser.uid) : [],
    enabled: !!auth.currentUser,
    retry: false,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["companyTasks", auth.currentUser?.uid],
    queryFn: () => auth.currentUser ? dbClient.entities.CompanyTask.list(auth.currentUser.uid) : [],
    enabled: !!auth.currentUser,
    retry: false,
  });

  const buildTaskFromTemplate = (template, companyId, uid) => ({
    uid,
    company_id: companyId,
    name: template.name || "",
    frequency: template.frequency || "mensal",
    category: template.category || "contabil",
    responsible_uid: uid || "",
    responsible_name:
      String(auth.currentUser?.displayName || "").trim() ||
      String(auth.currentUser?.email || "").trim() ||
      "Responsável",
    completed: false,
    month: null,
    year: null,
    completed_months: {},
    month_start: template.frequency === "anual" ? Number(template.month_start || 1) : null,
    month_end: template.frequency === "anual" ? Number(template.month_end || 12) : null,
  });

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
              active: true,
            })
          )
        );
      }

      const refreshed = await dbClient.entities.TaskTemplate.list(uid);
      const activeRefreshed = (refreshed || []).filter((t) => t.active !== false);
      return activeRefreshed;
    } catch (error) {
      console.warn("Nao foi possivel persistir task_templates na implantacao, usando fallback.", error);
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
      console.warn("Sem acesso a task_templates na implantacao, inferindo padrao.", error);
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
    const activeTemplates = templatesCache || await loadDefaultTaskTemplates(uid);
    if (activeTemplates.length === 0) return;
    const allTasksByUser = await dbClient.entities.CompanyTask.list(uid);
    const existingTasks = (allTasksByUser || []).filter((task) => task.company_id === companyId);
    const existingKeys = new Set((existingTasks || []).map((task) => getTaskKey(task)));
    const missingTemplates = activeTemplates.filter((template) => !existingKeys.has(getTaskKey(template)));
    if (missingTemplates.length === 0) return;
    await Promise.all(
      missingTemplates.map((template) =>
        dbClient.entities.CompanyTask.create(buildTaskFromTemplate(template, companyId, uid))
      )
    );
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data, uid: auth.currentUser?.uid };
      const createdCompany = await dbClient.entities.Company.create(payload);
      const uid = payload.uid || createdCompany?.uid || auth.currentUser?.uid;
      if (createdCompany?.id && uid) {
        try {
          await applyDefaultTasksToCompany(createdCompany.id, uid);
        } catch (error) {
          console.error("Erro ao herdar tarefas para nova implantacao:", error);
        }
      }
      return createdCompany;
    },
    onSuccess: (createdCompany) => {
      const uid = createdCompany?.uid || auth.currentUser?.uid;
      if (uid) queryClient.invalidateQueries({ queryKey: ["companyTasks", uid] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setShowForm(false);
      setEditingCompany(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => dbClient.entities.Company.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["companies"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => dbClient.entities.Company.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["companies"] }),
  });

  const responsibles = useMemo(() => uniqueResponsibleLabelsFromCompanies(companies), [companies]);
  const onboardingScope = companies.filter(
    (c) => c.created_via === "onboarding" || c.status === "implantacao" || !!c.implantation_start_date
  );

  // Companies in implantation process — filtered by month/year of implantation_start_date
  const inProgress = onboardingScope.filter((c) => {
    if (c.status !== "implantacao") return false;
    
    if (!companyMatchesResponsibleFilter(filterResponsible, c)) return false;

    if (!c.implantation_start_date) return true;
    const d = new Date(c.implantation_start_date);
    return d.getMonth() === filterMonth && d.getFullYear() === filterYear;
  });

  // Companies already completed implantation
  const completed = onboardingScope.filter((c) => {
    if (!(c.status !== "implantacao" && c.implantation_completed_date)) return false;
    
    if (!companyMatchesResponsibleFilter(filterResponsible, c)) return false;

    return true;
  });

  const searchTerm = search.toLowerCase();
  const filteredInProgress = inProgress.filter((c) => {
    if (!searchTerm) return true;
    const code = (c.code || "").toString().toLowerCase();
    const name = (c.name || "").toLowerCase();
    return (
      code.includes(searchTerm) ||
      name.includes(searchTerm) ||
      companyResponsibleFieldsMatchSearch(c, searchTerm)
    );
  });
  const filteredCompleted = completed.filter((c) => {
    if (!searchTerm) return true;
    const code = (c.code || "").toString().toLowerCase();
    const name = (c.name || "").toLowerCase();
    return (
      code.includes(searchTerm) ||
      name.includes(searchTerm) ||
      companyResponsibleFieldsMatchSearch(c, searchTerm)
    );
  });

  const showInProgressSection = filterStatus === "all" || filterStatus === "open";
  const showCompletedSection = filterStatus === "all" || filterStatus === "completed";

  const buildProgressState = (company, patch = {}) => {
    const steps = patch.implantation_steps ?? company.implantation_steps ?? {};
    const removedKeys = patch.implantation_removed_steps ?? company.implantation_removed_steps ?? [];
    const customSteps = patch.implantation_custom_steps ?? company.implantation_custom_steps ?? [];

    const defaultVisible = DEFAULT_IMPLANTATION_STEPS.filter((s) => !removedKeys.includes(s.key));
    const customEtapas = customSteps.filter((s) => s.startsWith("etapas:"));
    const customParametros = customSteps.filter((s) => s.startsWith("parametros:"));
    const customKeys = [
      ...customEtapas.map((_, i) => `custom_etapas_${i}`),
      ...customParametros.map((_, i) => `custom_parametros_${i}`),
    ];

    const allKeys = [...defaultVisible.map((s) => s.key), ...customKeys];
    const doneCount = allKeys.filter((key) => !!steps[key]).length;
    return { allDone: allKeys.length > 0 && doneCount === allKeys.length };
  };

  const handleCreate = (data) => {
    const today = new Date().toISOString().split("T")[0];
    const { _stripLegacyMonthly: _s, ...rest } = data;
    void _s;
    createMutation.mutate({
      ...rest,
      created_via: "onboarding",
      status: "implantacao",
      implantation_start_date: today,
      implantation_steps: {},
      implantation_removed_steps: [],
      implantation_custom_steps: [],
    });
  };

  const handleStepToggle = (company, stepKey, value) => {
    const steps = { ...(company.implantation_steps || {}) };
    if (value === null || value === false) {
      delete steps[stepKey];
    } else {
      steps[stepKey] = value;
    }
    const patch = { implantation_steps: steps };
    const { allDone } = buildProgressState(company, patch);
    const today = new Date().toISOString().split("T")[0];
    updateMutation.mutate({
      id: company.id,
      data: allDone
        ? {
            ...patch,
            status: "active",
            tasks_start_date: company.tasks_start_date || today,
            implantation_completed_date: today,
          }
        : patch,
    });
  };

  const handleUpdateSteps = (company, data) => {
    const { allDone } = buildProgressState(company, data);
    const today = new Date().toISOString().split("T")[0];
    updateMutation.mutate({
      id: company.id,
      data: allDone
        ? {
            ...data,
            status: "active",
            tasks_start_date: company.tasks_start_date || today,
            implantation_completed_date: today,
          }
        : data,
    });
  };

  const handleDelete = (company) => {
    if (window.confirm(`Excluir "${company.name}"? Esta ação não pode ser desfeita.`)) {
      deleteMutation.mutate(company.id);
    }
  };

  const handleImportOnboarding = async (rows) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error("Você precisa estar logado para importar.");
    }

    const byCode = new Map(
      companies
        .filter((c) => c.code)
        .map((c) => [String(c.code).trim().toLowerCase(), c])
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
      if (!name) {
        skipped += 1;
        continue;
      }

      const startDate =
        normalizeDateInput(getRowValue(row, ["data_inicio_implantacao", "implantation_start_date"])) ||
        new Date().toISOString().split("T")[0];

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
        cnpj: getRowValue(row, ["cnpj"]),
        contact_name: getRowValue(row, ["contato", "contact_name"]),
        contact_phone: getRowValue(row, ["telefone", "contact_phone"]),
        contact_email: getRowValue(row, ["email", "contact_email"]),
        accounting_responsible: getRowValue(row, ["responsavel_contabil", "responsavel", "accounting_responsible"]),
        fiscal_responsible: getRowValue(row, ["responsavel_fiscal", "fiscal_responsible"]),
        payroll_responsible: getRowValue(row, ["responsavel_dp", "departamento_pessoal", "payroll_responsible"]),
        other_responsible: getRowValue(row, ["responsavel_outros", "outros_responsible", "other_responsible"]),
        notes: getRowValue(row, [
          "observacao_geral",
          "observacoes_geral",
          "observacoes",
          "notes",
        ]),
        regime: getRowValue(row, ["regime"]),
        difficulty_level: getRowValue(row, ["nivel_dificuldade", "dificuldade"], "facil").toLowerCase().includes("dif")
          ? "dificil"
          : "facil",
        status: "implantacao",
        created_via: "onboarding",
        implantation_start_date: startDate,
      };

      const existing = code ? byCode.get(String(code).trim().toLowerCase()) : null;

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
          implantation_steps: {},
          implantation_removed_steps: [],
          implantation_custom_steps: [],
        });
        await applyDefaultTasksToCompany(createdCompany.id, uid, defaultTemplates);
        created += 1;
      }
    }

    await queryClient.invalidateQueries({ queryKey: ["companies"] });
    await queryClient.invalidateQueries({ queryKey: ["companyTasks", uid] });
    return {
      message: `Importação concluída: ${created} criadas, ${updated} atualizadas, ${skipped} ignoradas.`,
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Implantação de Empresa</h1>
          <p className={`text-sm ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}>
            {inProgress.length} empresa{inProgress.length !== 1 ? "s" : ""} em processo de implantação
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setShowForm(true)} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> Nova Implantação
          </Button>
          <CsvImportActions
            templateFileName="modelo_implantacao.csv"
            templateHeaders={[
              "codigo",
              "nome",
              "cnpj",
              "contato",
              "telefone",
              "email",
              "responsavel_contabil",
              "responsavel_fiscal",
              "responsavel_dp",
              "responsavel_outros",
              "data_inicio_implantacao",
              "regime",
              "nivel_dificuldade",
              "observacao_mensal",
              "observacao_anual",
              "observacao_geral",
            ]}
            templateRows={[
              [
                "202",
                "Empresa Implantacao",
                "11.111.111/0001-11",
                "Marcos",
                "(62) 98888-1111",
                "contato@implantacao.com",
                "Patricia",
                "Rita",
                "Paulo",
                "Luiz",
                "2026-03-10",
                "Lucro Presumido",
                "dificil",
                "Coletar documentos março",
                "Planejamento 2026",
                "Iniciando projeto",
              ],
            ]}
            onImportRows={handleImportOnboarding}
          />
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, código ou nome de um responsável (qualquer setor)..."
            className="pl-11 h-11 text-base w-full"
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
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
                className="w-[180px] justify-between font-normal"
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

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <SlidersHorizontal className="w-4 h-4" />
                Visualização
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-3" align="end">
              <div className="space-y-2">
                <p className="text-sm font-semibold">Padrão da aba Implantação</p>
                <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
                  <Label htmlFor="onb-compact" className="text-xs cursor-pointer">Cards compactos</Label>
                  <Checkbox
                    id="onb-compact"
                    checked={viewPrefs.compactCards}
                    onCheckedChange={(v) => setViewPrefs((p) => ({ ...p, compactCards: v === true }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
                  <Label htmlFor="onb-cnpj" className="text-xs cursor-pointer">Mostrar CNPJ</Label>
                  <Checkbox
                    id="onb-cnpj"
                    checked={viewPrefs.showCnpj}
                    onCheckedChange={(v) => setViewPrefs((p) => ({ ...p, showCnpj: v === true }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
                  <Label htmlFor="onb-resp" className="text-xs cursor-pointer">Mostrar responsável</Label>
                  <Checkbox
                    id="onb-resp"
                    checked={viewPrefs.showResponsible}
                    onCheckedChange={(v) => setViewPrefs((p) => ({ ...p, showResponsible: v === true }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
                  <Label htmlFor="onb-dates" className="text-xs cursor-pointer">Mostrar datas</Label>
                  <Checkbox
                    id="onb-dates"
                    checked={viewPrefs.showDates}
                    onCheckedChange={(v) => setViewPrefs((p) => ({ ...p, showDates: v === true }))}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    setViewPrefs({
                      compactCards: false,
                      showCnpj: true,
                      showResponsible: true,
                      showDates: true,
                    })
                  }
                >
                  Resetar visualização
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {(filterStatus !== "all" || filterResponsible !== "all" || search) && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setSearch("");
                setFilterStatus("all");
                setFilterResponsible("all");
              }}
              className="text-xs text-gray-500"
            >
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Em andamento */}
      {showInProgressSection && (
        <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-indigo-600">
            Em andamento ({filteredInProgress.length})
          </h2>
          <div className="flex items-center gap-2">
            <MonthPicker 
              date={new Date(filterYear, filterMonth)} 
              onChange={(newDate) => {
                setFilterMonth(newDate.getMonth());
                setFilterYear(newDate.getFullYear());
              }} 
            />
          </div>
        </div>
        {filteredInProgress.length === 0 && (
          <p className={`text-center py-8 ${theme === "dark" ? "text-gray-600" : "text-gray-400"}`}>
            Nenhuma empresa em implantação
          </p>
        )}
        {filteredInProgress.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 items-start">
            {filteredInProgress.map((company) => (
              <ImplantationCard
                key={company.id}
                company={company}
                onStepToggle={handleStepToggle}
                onUpdateSteps={handleUpdateSteps}
                onDelete={handleDelete}
                isCompleted={false}
                viewPrefs={viewPrefs}
              />
            ))}
          </div>
        )}
        </div>
      )}

      {/* Histórico de implantadas */}
      {showCompletedSection && filteredCompleted.length > 0 && (
        <div className="space-y-4">
          <button
            className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wider text-emerald-600 hover:opacity-80"
            onClick={() => setShowCompleted(!showCompleted)}
          >
            Implantações Concluídas ({filteredCompleted.length})
            <span className="text-xs normal-case">{showCompleted ? "▲ ocultar" : "▼ mostrar"}</span>
          </button>
          {showCompleted && (
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 items-start">
              {filteredCompleted.map((company) => (
                <ImplantationCard
                  key={company.id}
                  company={company}
                  onStepToggle={() => {}}
                  onUpdateSteps={() => {}}
                  isCompleted={true}
                  viewPrefs={viewPrefs}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dialog nova implantação */}
      <CompanyForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditingCompany(null); }}
        onSubmit={handleCreate}
        company={editingCompany}
      />
    </div>
  );
}