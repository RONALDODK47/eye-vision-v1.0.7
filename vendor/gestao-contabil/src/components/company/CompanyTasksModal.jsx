import React, { useEffect, useState, useMemo } from "react";
import { dbClient } from "@/api/dbClient";
import { auth } from "@/lib/firebase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, MessageSquare, Pencil, Save, X } from "lucide-react";
import DatePicker from "../DatePicker";
import { useTheme } from "../ThemeProvider";
import TaskNotesEmailDialog from "./TaskNotesEmailDialog";
import { isMonthBeforeAccountingTasksStart, isMonthlyTaskInPeriodScope } from "@/lib/companyTaskPeriod";

function parseTaskDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const localDate = new Date(year, month - 1, day);
    return Number.isNaN(localDate.getTime()) ? null : localDate;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatLocalIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Data de conclusão sugerida para um mês/ano (hoje se mês atual; último dia se passado). */
function completionDateForYearMonth(year, month) {
  const now = new Date();
  if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) {
    return formatLocalIso(new Date(year, month - 1, 1));
  }
  if (year === now.getFullYear() && month === now.getMonth() + 1) {
    const idx = month - 1;
    const daysInTargetMonth = new Date(year, idx + 1, 0).getDate();
    const targetDay = Math.min(now.getDate(), daysInTargetMonth);
    return formatLocalIso(new Date(year, idx, targetDay));
  }
  const lastDay = new Date(year, month, 0).getDate();
  return formatLocalIso(new Date(year, month - 1, lastDay));
}

const BULK_MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function getPeriodKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getTaskTemplateKey(task) {
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

function monthlyRecurrenceHint(task) {
  if (!task || task.frequency !== "mensal") return null;
  const mode = String(task.monthly_repeat_mode || "recurring").toLowerCase();
  if (mode === "once" && task.only_in_period_key) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(task.only_in_period_key));
    if (m) return `Só em ${m[2]}/${m[1]}`;
  }
  if (mode === "until" && task.repeat_until_period_key) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(task.repeat_until_period_key));
    if (m) return `Até ${m[2]}/${m[1]} (inclusive)`;
  }
  return null;
}

function getMonthlyCompletionDate(task, year, month) {
  const periodKey = getPeriodKey(year, month);
  const byMap = task?.completed_months?.[periodKey];
  if (byMap) return byMap;

  const legacyDate = parseTaskDate(task?.completed_date);
  if (!legacyDate) return "";
  const sameMonth = legacyDate.getMonth() + 1 === month && legacyDate.getFullYear() === year;
  return sameMonth ? formatLocalIso(legacyDate) : "";
}

export default function CompanyTasksModal({
  open,
  onClose,
  company: initialCompany,
  companies = [],
  filterDate,
  canEditTasks = false,
  canCreateTasks = false,
  workspaceWideTaskRead = false,
}) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const userUid = auth.currentUser?.uid;
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialCompany?.id || "");
  const company = initialCompany || companies.find(c => c.id === selectedCompanyId);
  const isBatchMode = !initialCompany && selectedCompanyId === "all";

  useEffect(() => {
    if (!open) return;
    if (initialCompany?.id) {
      setSelectedCompanyId(initialCompany.id);
      return;
    }
    if (!selectedCompanyId) {
      setSelectedCompanyId("all");
    }
  }, [open, initialCompany?.id, selectedCompanyId]);
  const companyTasksQueryKey = ["companyTasks", company?.id, workspaceWideTaskRead ? "office" : userUid];
  const globalTasksQueryKey = ["companyTasks", "global", workspaceWideTaskRead ? "office" : userUid];
  const taskTemplatesQueryKey = ["taskTemplates", userUid];

  const [newTask, setNewTask] = useState("");
  const [selectedFreq, setSelectedFreq] = useState("mensal");
  const [selectedCat, setSelectedCat] = useState("contabil");
  const [filterTaskStatus, setFilterTaskStatus] = useState("all");
  const [filterResponsible, setFilterResponsible] = useState("all");
  const [monthStart, setMonthStart] = useState("1");
  const [monthEnd, setMonthEnd] = useState("12");
  const [monthlyRepeatMode, setMonthlyRepeatMode] = useState("recurring");
  const [onlyInYear, setOnlyInYear] = useState(() => String(new Date().getFullYear()));
  const [onlyInMonth, setOnlyInMonth] = useState(() => String(new Date().getMonth() + 1));
  const [repeatUntilYear, setRepeatUntilYear] = useState(() => String(new Date().getFullYear()));
  const [repeatUntilMonth, setRepeatUntilMonth] = useState(() => String(new Date().getMonth() + 1));
  const [responsibleUid, setResponsibleUid] = useState(() => String(auth.currentUser?.uid || ""));
  const [responsibleName, setResponsibleName] = useState(
    () =>
      String(auth.currentUser?.displayName || "").trim() ||
      String(auth.currentUser?.email || "").trim() ||
      "Responsável"
  );
  const [editingTask, setEditingTask] = useState(null);
  const [editingBatchTask, setEditingBatchTask] = useState(null);
  const [notesEmailOpen, setNotesEmailOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  const [bulkYear, setBulkYear] = useState(() => new Date().getFullYear());
  const [bulkMonthSet, setBulkMonthSet] = useState(() => new Set());
  const [bulkScope, setBulkScope] = useState("all");
  const [bulkPickTasks, setBulkPickTasks] = useState(() => new Set());
  const [bulkApplying, setBulkApplying] = useState(false);
  const [reassignScope, setReassignScope] = useState("pick");
  const [reassignPickTasks, setReassignPickTasks] = useState(() => new Set());
  const [reassignTargetUid, setReassignTargetUid] = useState(() => String(auth.currentUser?.uid || ""));
  const [reassignApplying, setReassignApplying] = useState(false);

  const currentMonth = filterDate ? filterDate.getMonth() + 1 : new Date().getMonth() + 1;
  const currentYear = filterDate ? filterDate.getFullYear() : new Date().getFullYear();
  const beforeTaskPeriod =
    !!company?.id && isMonthBeforeAccountingTasksStart(company, currentYear, currentMonth);

  useEffect(() => {
    if (!open || !company?.id) return;
    setBulkYear(currentYear);
    setBulkMonthSet(new Set());
    setBulkScope("all");
    setBulkPickTasks(new Set());
  }, [open, company?.id, currentYear]);

  useEffect(() => {
    if (!open) return;
    setReassignPickTasks(new Set());
  }, [open, selectedCompanyId, filterTaskStatus, filterResponsible]);

  const { data: tasks = [] } = useQuery({
    queryKey: companyTasksQueryKey,
    queryFn: async () => {
      if (!company?.id || !auth.currentUser) return [];
      if (workspaceWideTaskRead) {
        return dbClient.entities.CompanyTask.listByCompany(company.id);
      }
      return dbClient.entities.CompanyTask.filter({ company_id: company.id, uid: auth.currentUser.uid });
    },
    enabled: !!company?.id && !!auth.currentUser,
    retry: false,
  });

  const { data: allUserTasks = [] } = useQuery({
    queryKey: globalTasksQueryKey,
    queryFn: async () => {
      if (!auth.currentUser) return [];
      if (workspaceWideTaskRead) {
        const all = await dbClient.entities.CompanyTask.listAll();
        return Array.isArray(all) ? all : [];
      }
      return dbClient.entities.CompanyTask.list(auth.currentUser.uid);
    },
    enabled: isBatchMode && !!auth.currentUser,
    retry: false,
  });

  const { data: taskTemplates = [] } = useQuery({
    queryKey: taskTemplatesQueryKey,
    queryFn: () => auth.currentUser ? dbClient.entities.TaskTemplate.list(auth.currentUser.uid) : [],
    enabled: !!auth.currentUser,
    retry: false,
  });

  const { data: allProfiles = [] } = useQuery({
    queryKey: ["allUserProfilesForTaskResponsible"],
    queryFn: () => dbClient.entities.UserProfile.listAll(),
    enabled: open,
    retry: false,
    staleTime: 60_000,
  });

  const responsibleOptions = useMemo(() => {
    const map = new Map();
    allProfiles.forEach((profile) => {
      const uid = String(profile?.uid || "").trim();
      if (!uid) return;
      const label =
        String(profile?.display_name || "").trim() ||
        String(profile?.email || "").trim() ||
        uid;
      map.set(uid, label);
    });
    const currentUid = String(auth.currentUser?.uid || "").trim();
    const currentLabel =
      String(auth.currentUser?.displayName || "").trim() ||
      String(auth.currentUser?.email || "").trim() ||
      "";
    if (currentUid && currentLabel && !map.has(currentUid)) {
      map.set(currentUid, currentLabel);
    }
    return Array.from(map.entries()).map(([uid, label]) => ({ uid, label }));
  }, [allProfiles]);

  useEffect(() => {
    if (!reassignTargetUid && responsibleOptions.length > 0) {
      setReassignTargetUid(responsibleOptions[0].uid);
    }
  }, [reassignTargetUid, responsibleOptions]);

  const responsibleFilterOptions = useMemo(() => {
    const map = new Map();
    tasks.forEach((task) => {
      const uid = String(task?.responsible_uid || "").trim();
      const label = String(task?.responsible_name || "").trim();
      if (!uid) return;
      map.set(uid, label || uid);
    });
    responsibleOptions.forEach((opt) => {
      if (!map.has(opt.uid)) map.set(opt.uid, opt.label);
    });
    return Array.from(map.entries())
      .map(([uid, label]) => ({ uid, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [tasks, responsibleOptions]);

  const activeTaskTemplates = useMemo(
    () => (taskTemplates || []).filter((t) => t.active !== false),
    [taskTemplates]
  );
  const taskTemplateByKey = useMemo(() => {
    const map = new Map();
    activeTaskTemplates.forEach((template) => {
      map.set(getTaskTemplateKey(template), template);
    });
    return map;
  }, [activeTaskTemplates]);

  const createMutation = useMutation({
    mutationFn: (data) => dbClient.entities.CompanyTask.create({ ...data, uid: auth.currentUser?.uid }),
    onMutate: async (data) => {
      const tempId = `tmp-${Date.now()}`;
      await queryClient.cancelQueries({ queryKey: companyTasksQueryKey });
      await queryClient.cancelQueries({ queryKey: globalTasksQueryKey });

      const previousTasks = queryClient.getQueryData(companyTasksQueryKey);
      const previousGlobalTasks = queryClient.getQueryData(globalTasksQueryKey);
      const optimisticTask = { id: tempId, ...data };

      queryClient.setQueryData(companyTasksQueryKey, (old = []) => [...old, optimisticTask]);
      queryClient.setQueryData(globalTasksQueryKey, (old = []) => [...old, optimisticTask]);

      return { previousTasks, previousGlobalTasks, tempId };
    },
    onSuccess: (createdTask, _variables, context) => {
      if (!context?.tempId) return;
      queryClient.setQueryData(companyTasksQueryKey, (old = []) =>
        old.map((task) => (task.id === context.tempId ? createdTask : task))
      );
      queryClient.setQueryData(globalTasksQueryKey, (old = []) =>
        old.map((task) => (task.id === context.tempId ? createdTask : task))
      );
    },
    onError: (error, _variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(companyTasksQueryKey, context.previousTasks);
      }
      if (context?.previousGlobalTasks) {
        queryClient.setQueryData(globalTasksQueryKey, context.previousGlobalTasks);
      }
      console.error("Error creating task:", error);
      alert("Erro ao adicionar tarefa: " + error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["companyTasks"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => dbClient.entities.CompanyTask.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: companyTasksQueryKey });
      await queryClient.cancelQueries({ queryKey: globalTasksQueryKey });

      const previousTasks = queryClient.getQueryData(companyTasksQueryKey);
      const previousGlobalTasks = queryClient.getQueryData(globalTasksQueryKey);

      queryClient.setQueryData(companyTasksQueryKey, (old = []) =>
        old.map((t) => (t.id === id ? { ...t, ...data } : t))
      );

      queryClient.setQueryData(globalTasksQueryKey, (old = []) =>
        old.map((t) => (t.id === id ? { ...t, ...data } : t))
      );

      return { previousTasks, previousGlobalTasks };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousTasks) {
        queryClient.setQueryData(companyTasksQueryKey, context.previousTasks);
      }
      if (context?.previousGlobalTasks) {
        queryClient.setQueryData(globalTasksQueryKey, context.previousGlobalTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["companyTasks"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => dbClient.entities.CompanyTask.delete(id),
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: companyTasksQueryKey });
      await queryClient.cancelQueries({ queryKey: globalTasksQueryKey });

      const previousTasks = queryClient.getQueryData(companyTasksQueryKey);
      const previousGlobalTasks = queryClient.getQueryData(globalTasksQueryKey);

      queryClient.setQueryData(companyTasksQueryKey, (old = []) =>
        old.filter((task) => task.id !== taskId)
      );
      queryClient.setQueryData(globalTasksQueryKey, (old = []) =>
        old.filter((task) => task.id !== taskId)
      );

      return { previousTasks, previousGlobalTasks };
    },
    onError: (_error, _taskId, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(companyTasksQueryKey, context.previousTasks);
      }
      if (context?.previousGlobalTasks) {
        queryClient.setQueryData(globalTasksQueryKey, context.previousGlobalTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["companyTasks"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  const [isAddingBatch, setIsAddingBatch] = useState(false);
  const currentUserUid = String(auth.currentUser?.uid || "");

  const resetEditor = () => {
    setEditingTask(null);
    setEditingBatchTask(null);
    setNewTask("");
    setSelectedFreq("mensal");
    setSelectedCat("contabil");
    setMonthStart("1");
    setMonthEnd("12");
    setMonthlyRepeatMode("recurring");
    setOnlyInYear(String(currentYear));
    setOnlyInMonth(String(currentMonth));
    setRepeatUntilYear(String(currentYear));
    setRepeatUntilMonth(String(currentMonth));
    setResponsibleUid(String(auth.currentUser?.uid || ""));
    setResponsibleName(
      String(auth.currentUser?.displayName || "").trim() ||
        String(auth.currentUser?.email || "").trim() ||
        "Responsável"
    );
  };

  const buildTaskPayloadFromEditor = () => {
    const base = {
      name: newTask.trim(),
      frequency: selectedFreq,
      category: selectedCat,
      responsible_uid: responsibleUid || currentUserUid,
      responsible_name: String(responsibleName || "").trim(),
      month_start: selectedFreq === "anual" ? parseInt(monthStart, 10) : null,
      month_end: selectedFreq === "anual" ? parseInt(monthEnd, 10) : null,
    };
    if (selectedFreq !== "mensal") {
      return {
        ...base,
        monthly_repeat_mode: null,
        only_in_period_key: null,
        repeat_until_period_key: null,
      };
    }
    const mode = String(monthlyRepeatMode || "recurring").toLowerCase();
    if (mode === "once") {
      const y = parseInt(onlyInYear, 10);
      const m = parseInt(onlyInMonth, 10);
      const pk =
        !Number.isNaN(y) && !Number.isNaN(m) && m >= 1 && m <= 12 ? getPeriodKey(y, m) : "";
      return {
        ...base,
        monthly_repeat_mode: "once",
        only_in_period_key: pk || null,
        repeat_until_period_key: null,
      };
    }
    if (mode === "until") {
      const y = parseInt(repeatUntilYear, 10);
      const m = parseInt(repeatUntilMonth, 10);
      const pk =
        !Number.isNaN(y) && !Number.isNaN(m) && m >= 1 && m <= 12 ? getPeriodKey(y, m) : "";
      return {
        ...base,
        monthly_repeat_mode: "until",
        only_in_period_key: null,
        repeat_until_period_key: pk || null,
      };
    }
    return {
      ...base,
      monthly_repeat_mode: "recurring",
      only_in_period_key: null,
      repeat_until_period_key: null,
    };
  };

  const hydrateMonthlyEditorFromSource = (src) => {
    const mode = String(src?.monthly_repeat_mode || "recurring").toLowerCase();
    setMonthlyRepeatMode(mode === "once" ? "once" : mode === "until" ? "until" : "recurring");
    const only = String(src?.only_in_period_key || "").trim();
    const onlyParsed = /^(\d{4})-(\d{2})$/.exec(only);
    if (onlyParsed) {
      setOnlyInYear(onlyParsed[1]);
      setOnlyInMonth(String(Number(onlyParsed[2])));
    } else {
      setOnlyInYear(String(currentYear));
      setOnlyInMonth(String(currentMonth));
    }
    const until = String(src?.repeat_until_period_key || "").trim();
    const untilParsed = /^(\d{4})-(\d{2})$/.exec(until);
    if (untilParsed) {
      setRepeatUntilYear(untilParsed[1]);
      setRepeatUntilMonth(String(Number(untilParsed[2])));
    } else {
      setRepeatUntilYear(String(currentYear));
      setRepeatUntilMonth(String(currentMonth));
    }
  };

  const startEditTask = (task) => {
    setEditingBatchTask(null);
    setEditingTask(task);
    setNewTask(task.name || "");
    setSelectedFreq(task.frequency || "mensal");
    setSelectedCat(task.category || "contabil");
    setMonthStart(String(task.month_start || 1));
    setMonthEnd(String(task.month_end || 12));
    hydrateMonthlyEditorFromSource(task);
    setResponsibleUid(String(task.responsible_uid || auth.currentUser?.uid || ""));
    setResponsibleName(
      String(task.responsible_name || "").trim() ||
        String(auth.currentUser?.displayName || "").trim() ||
        String(auth.currentUser?.email || "").trim() ||
        "Responsável"
    );
  };

  const saveSingleTaskEdit = () => {
    if (!canEditTasks) {
      window.alert("Você não tem permissão para editar tarefas.");
      return;
    }
    if (!editingTask || !newTask.trim()) return;
    updateMutation.mutate({
      id: editingTask.id,
      data: buildTaskPayloadFromEditor(),
    });
    resetEditor();
  };

  const handleAddTask = async () => {
    if (!canCreateTasks) {
      window.alert("Você não tem permissão para criar tarefas.");
      return;
    }
    if (!newTask.trim()) return;

    const payload = buildTaskPayloadFromEditor();
    const taskData = {
      ...payload,
      completed: false,
      month: null,
      year: null,
      completed_months: {},
    };

    if (selectedCompanyId === "all") {
      setIsAddingBatch(true);
      try {
        await Promise.all(companies.map(c => 
          dbClient.entities.CompanyTask.create({ ...taskData, company_id: c.id, uid: auth.currentUser?.uid })
        ));
        const templatePayload = {
          uid: auth.currentUser?.uid,
          name: taskData.name,
          frequency: taskData.frequency,
          category: taskData.category,
          month_start: taskData.month_start,
          month_end: taskData.month_end,
          monthly_repeat_mode: taskData.monthly_repeat_mode,
          only_in_period_key: taskData.only_in_period_key,
          repeat_until_period_key: taskData.repeat_until_period_key,
          active: true,
        };
        const templateKey = getTaskTemplateKey(templatePayload);
        const existingTemplate = taskTemplateByKey.get(templateKey);
        if (existingTemplate) {
          await dbClient.entities.TaskTemplate.update(existingTemplate.id, templatePayload);
        } else {
          await dbClient.entities.TaskTemplate.create(templatePayload);
        }
        queryClient.invalidateQueries({ queryKey: ["companyTasks"] });
        queryClient.invalidateQueries({ queryKey: taskTemplatesQueryKey });
        resetEditor();
        alert("Tarefa adicionada para todas as empresas com sucesso!");
      } catch (error) {
        console.error("Error creating batch tasks:", error);
        alert("Erro ao adicionar tarefas em lote: " + error.message);
      } finally {
        setIsAddingBatch(false);
      }
    } else {
      createMutation.mutate({
        company_id: company.id,
        ...taskData
      });
      setNewTask("");
    }
  };

  const batchTaskGroups = useMemo(() => {
    if (!isBatchMode) return [];
    const companyIds = new Set(companies.map((c) => c.id));
    const grouped = new Map();

    allUserTasks
      .filter((task) => companyIds.has(task.company_id))
      .forEach((task) => {
        const key = getTaskTemplateKey(task);

        const taskCompany = companies.find((c) => c.id === task.company_id);
        if (
          task.frequency === "mensal" &&
          taskCompany &&
          isMonthBeforeAccountingTasksStart(taskCompany, currentYear, currentMonth)
        ) {
          return;
        }
        if (task.frequency === "mensal" && !isMonthlyTaskInPeriodScope(task, currentYear, currentMonth)) {
          return;
        }

        const isCompletedInPeriod =
          task.frequency === "mensal"
            ? !!getMonthlyCompletionDate(task, currentYear, currentMonth)
            : !!task.completed;

        if (!grouped.has(key)) {
          const matchedTemplate = taskTemplateByKey.get(key);
          grouped.set(key, {
            key,
            name: task.name || "",
            frequency: task.frequency || "mensal",
            category: task.category || "contabil",
            month_start: task.month_start || null,
            month_end: task.month_end || null,
            monthly_repeat_mode: task.monthly_repeat_mode || "recurring",
            only_in_period_key: task.only_in_period_key || null,
            repeat_until_period_key: task.repeat_until_period_key || null,
            templateId: matchedTemplate?.id || null,
            total: 0,
            completed: 0,
            taskIds: [],
          });
        }

        const group = grouped.get(key);
        group.total += 1;
        if (isCompletedInPeriod) group.completed += 1;
        group.taskIds.push(task.id);
      });

    return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [isBatchMode, allUserTasks, companies, currentYear, currentMonth, taskTemplateByKey]);

  const startEditBatchTask = (group) => {
    setEditingTask(null);
    setEditingBatchTask(group);
    setNewTask(group.name || "");
    setSelectedFreq(group.frequency || "mensal");
    setSelectedCat(group.category || "contabil");
    setMonthStart(String(group.month_start || 1));
    setMonthEnd(String(group.month_end || 12));
    hydrateMonthlyEditorFromSource(group);
    setResponsibleUid(String(auth.currentUser?.uid || ""));
    setResponsibleName(
      String(auth.currentUser?.displayName || "").trim() ||
        String(auth.currentUser?.email || "").trim() ||
        "Responsável"
    );
  };

  const saveBatchTaskEdit = async () => {
    if (!canEditTasks) {
      window.alert("Você não tem permissão para editar tarefas.");
      return;
    }
    if (!editingBatchTask || !newTask.trim()) return;
    setIsAddingBatch(true);
    try {
      const payload = buildTaskPayloadFromEditor();
      await Promise.all(
        editingBatchTask.taskIds.map((id) => dbClient.entities.CompanyTask.update(id, payload))
      );
      const templatePayload = {
        uid: auth.currentUser?.uid,
        name: payload.name,
        frequency: payload.frequency,
        category: payload.category,
        month_start: payload.month_start,
        month_end: payload.month_end,
        monthly_repeat_mode: payload.monthly_repeat_mode,
        only_in_period_key: payload.only_in_period_key,
        repeat_until_period_key: payload.repeat_until_period_key,
        active: true,
      };
      const newTemplateKey = getTaskTemplateKey(templatePayload);
      const matchedTemplate = taskTemplateByKey.get(newTemplateKey);
      if (editingBatchTask.templateId) {
        if (matchedTemplate && matchedTemplate.id !== editingBatchTask.templateId) {
          await dbClient.entities.TaskTemplate.delete(editingBatchTask.templateId);
        } else {
          await dbClient.entities.TaskTemplate.update(editingBatchTask.templateId, templatePayload);
        }
      } else if (matchedTemplate) {
        await dbClient.entities.TaskTemplate.update(matchedTemplate.id, templatePayload);
      } else {
        await dbClient.entities.TaskTemplate.create(templatePayload);
      }
      queryClient.invalidateQueries({ queryKey: ["companyTasks"] });
      queryClient.invalidateQueries({ queryKey: taskTemplatesQueryKey });
      resetEditor();
      alert("Tarefas em lote atualizadas com sucesso.");
    } catch (error) {
      alert("Erro ao editar tarefas em lote: " + error.message);
    } finally {
      setIsAddingBatch(false);
    }
  };

  const handleDeleteBatchTaskGroup = async (group) => {
    if (!canEditTasks) {
      window.alert("Você não tem permissão para excluir tarefas.");
      return;
    }
    const confirmed = window.confirm(`Excluir a tarefa "${group.name}" de todas as empresas aplicadas?`);
    if (!confirmed) return;

    setIsAddingBatch(true);
    try {
      await Promise.all(group.taskIds.map((id) => dbClient.entities.CompanyTask.delete(id)));
      if (group.templateId) {
        await dbClient.entities.TaskTemplate.delete(group.templateId);
      } else {
        const matchedTemplate = taskTemplateByKey.get(group.key);
        if (matchedTemplate?.id) {
          await dbClient.entities.TaskTemplate.delete(matchedTemplate.id);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["companyTasks"] });
      queryClient.invalidateQueries({ queryKey: taskTemplatesQueryKey });
    } catch (error) {
      alert("Erro ao excluir tarefas em lote: " + error.message);
    } finally {
      setIsAddingBatch(false);
    }
  };

  const isTaskResponsible = (task) => String(task?.responsible_uid || "") === currentUserUid;

  const handleToggleComplete = (task) => {
    if (!isTaskResponsible(task)) {
      window.alert("Você só pode concluir tarefas onde está como responsável.");
      return;
    }
    if (company && isMonthBeforeAccountingTasksStart(company, currentYear, currentMonth)) return;
    const now = new Date();
    const targetYear = currentYear;
    const targetMonthIndex = currentMonth - 1;
    const daysInTargetMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
    const targetDay = Math.min(now.getDate(), daysInTargetMonth);
    const completionDateForPeriod = formatLocalIso(new Date(targetYear, targetMonthIndex, targetDay));
    if (task.frequency === "mensal") {
      if (!isMonthlyTaskInPeriodScope(task, currentYear, currentMonth)) return;
      const periodKey = getPeriodKey(targetYear, currentMonth);
      const nextCompleted = !task.completed;
      const currentMap = { ...(task.completed_months || {}) };
      if (nextCompleted) {
        currentMap[periodKey] = completionDateForPeriod;
      } else {
        delete currentMap[periodKey];
      }

      const allDates = Object.values(currentMap).filter(Boolean);
      updateMutation.mutate({
        id: task.id,
        data: {
          completed_months: currentMap,
          completed: allDates.length > 0,
          completed_date: allDates.length > 0 ? allDates.sort().at(-1) : null,
        },
      });
      return;
    }

    updateMutation.mutate({
      id: task.id,
      data: {
        completed: !task.completed,
        completed_date: !task.completed ? completionDateForPeriod : null,
      },
    });
  };

  const handleDeleteTask = (taskId) => {
    if (!canEditTasks) {
      window.alert("Você não tem permissão para excluir tarefas.");
      return;
    }
    if (window.confirm("Excluir esta tarefa?")) {
      deleteMutation.mutate(taskId);
    }
  };

  const toggleBulkMonth = (m) => {
    setBulkMonthSet((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const toggleBulkTaskPick = (taskId) => {
    setBulkPickTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const isTaskUnassigned = (task) => !String(task?.responsible_uid || "").trim();
  const matchesResponsibleFilter = (task) => {
    if (filterResponsible === "all") return true;
    if (filterResponsible === "__unassigned__") return isTaskUnassigned(task);
    return String(task?.responsible_uid || "").trim() === filterResponsible;
  };

  const toggleReassignPickTask = (taskId) => {
    setReassignPickTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleBulkCompleteMonths = async () => {
    if (!canEditTasks) {
      window.alert("Conclusão em massa disponível apenas para usuários autorizados a editar tarefas.");
      return;
    }
    if (!company?.id) return;
    const months = [...bulkMonthSet].sort((a, b) => a - b);
    if (months.length === 0) {
      alert("Marque pelo menos um mês.");
      return;
    }
    const y = Number(bulkYear);
    if (Number.isNaN(y) || y < 2000 || y > 2100) {
      alert("Ano inválido.");
      return;
    }
    const monthlySource = tasks.filter(
      (t) =>
        t.frequency === "mensal" &&
        months.some((month) => isMonthlyTaskInPeriodScope(t, y, month))
    );
    const targets =
      bulkScope === "all"
        ? monthlySource
        : monthlySource.filter((t) => bulkPickTasks.has(t.id));
    if (targets.length === 0) {
      alert(
        bulkScope === "pick"
          ? "Marque pelo menos uma tarefa mensal na lista abaixo."
          : "Não há tarefas mensais aplicáveis aos meses selecionados nesta empresa."
      );
      return;
    }

    setBulkApplying(true);
    try {
      await Promise.all(
        targets.map(async (task) => {
          const currentMap = { ...(task.completed_months || {}) };
          for (const month of months) {
            if (isMonthBeforeAccountingTasksStart(company, y, month)) continue;
            if (!isMonthlyTaskInPeriodScope(task, y, month)) continue;
            const periodKey = getPeriodKey(y, month);
            currentMap[periodKey] = completionDateForYearMonth(y, month);
          }
          const allDates = Object.values(currentMap).filter(Boolean);
          await updateMutation.mutateAsync({
            id: task.id,
            data: {
              completed_months: currentMap,
              completed: allDates.length > 0,
              completed_date: allDates.length > 0 ? [...allDates].sort().at(-1) : null,
            },
          });
        })
      );
      await queryClient.invalidateQueries({ queryKey: ["companyTasks"] });
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      alert(`Concluído: ${targets.length} tarefa(s) atualizada(s) nos meses selecionados (quando aplicável ao início das tarefas).`);
    } catch (error) {
      alert("Erro na conclusão em massa: " + (error?.message || String(error)));
    } finally {
      setBulkApplying(false);
    }
  };

  const monthlyTasks = useMemo(() =>
    tasks
      .filter((t) => t.frequency === "mensal")
      .filter((t) => isMonthlyTaskInPeriodScope(t, currentYear, currentMonth))
      .map((t) => {
      if (beforeTaskPeriod) {
        return {
          ...t,
          completed: false,
          outOfScopeMonth: true,
          showCompletedDate: false,
          completed_date: null,
        };
      }
      const completionDate = getMonthlyCompletionDate(t, currentYear, currentMonth);
      const isCompletedMonth = !!completionDate;
      return {
        ...t,
        completed: isCompletedMonth,
        showCompletedDate: isCompletedMonth,
        completed_date: completionDate || null,
        outOfScopeMonth: false,
      };
    }).filter((t) => {
      if (t.outOfScopeMonth && (filterTaskStatus === "open" || filterTaskStatus === "completed")) {
        return false;
      }
      if (filterTaskStatus === "all") return true;
      if (filterTaskStatus === "completed") return t.completed;
      if (filterTaskStatus === "open") return !t.completed;
      return true;
    }).filter(matchesResponsibleFilter),
    [tasks, currentMonth, currentYear, filterTaskStatus, beforeTaskPeriod, filterResponsible]
  );
  const annualTasks = useMemo(() => 
    tasks.filter(t => t.frequency === "anual").filter(t => {
      if (filterTaskStatus === "all") return true;
      if (filterTaskStatus === "completed") return t.completed;
      if (filterTaskStatus === "open") return !t.completed;
      return true;
    }).filter(matchesResponsibleFilter), 
    [tasks, filterTaskStatus, filterResponsible]
  );

  const unassignedVisibleTasks = useMemo(
    () => [...monthlyTasks, ...annualTasks].filter((task) => isTaskUnassigned(task)),
    [monthlyTasks, annualTasks]
  );

  const handleReassignUnassignedTasks = async () => {
    if (!canEditTasks) {
      window.alert("Você não tem permissão para editar tarefas.");
      return;
    }
    const targetUid = String(reassignTargetUid || "").trim();
    if (!targetUid) {
      window.alert("Selecione o responsável de destino.");
      return;
    }
    const targetLabel =
      responsibleOptions.find((opt) => opt.uid === targetUid)?.label || targetUid;
    const targets =
      reassignScope === "all"
        ? unassignedVisibleTasks
        : unassignedVisibleTasks.filter((task) => reassignPickTasks.has(task.id));
    if (targets.length === 0) {
      window.alert(
        reassignScope === "all"
          ? "Não há tarefas sem usuário no filtro atual."
          : "Selecione uma ou mais tarefas sem usuário para atribuir."
      );
      return;
    }
    setReassignApplying(true);
    try {
      await Promise.all(
        targets.map((task) =>
          updateMutation.mutateAsync({
            id: task.id,
            data: {
              responsible_uid: targetUid,
              responsible_name: targetLabel,
            },
          })
        )
      );
      setReassignPickTasks(new Set());
      window.alert(`${targets.length} tarefa(s) atualizada(s) para ${targetLabel}.`);
    } catch (error) {
      window.alert(`Erro ao atualizar responsável em lote: ${error?.message || String(error)}`);
    } finally {
      setReassignApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent aria-describedby={undefined} className={`max-w-2xl max-h-[80vh] overflow-y-auto ${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
        <DialogHeader>
          <DialogTitle>
            Tarefas Contábeis {company ? `- ${company.name}` : selectedCompanyId === "all" ? "- Todas as Empresas" : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!initialCompany && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Selecione a Empresa</label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma empresa..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Empresas</SelectItem>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {company || selectedCompanyId === "all" ? (
            <>
              {/* Add new task */}
              {!initialCompany && (canEditTasks || canCreateTasks) && (
                <div className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-gray-50"}`}>
                  <h3 className="font-semibold mb-3 text-sm">
                    {editingBatchTask
                      ? `Editar Tarefa em Lote (${editingBatchTask.total} empresas)`
                      : editingTask
                      ? "Editar Tarefa"
                      : selectedCompanyId === "all"
                      ? "Adicionar Tarefa para TODAS as Empresas"
                      : "Adicionar Tarefa"}
                  </h3>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder="Nome da tarefa..."
                        value={newTask}
                        onChange={(e) => setNewTask(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && handleAddTask()}
                        className="flex-1"
                      />
                      <select
                        value={selectedFreq}
                        onChange={(e) => setSelectedFreq(e.target.value)}
                        className={`px-3 py-2 rounded border ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"} text-sm`}
                      >
                        <option value="mensal">Mensal</option>
                        <option value="anual">Anual</option>
                      </select>
                      <select
                        value={selectedCat}
                        onChange={(e) => setSelectedCat(e.target.value)}
                        className={`px-3 py-2 rounded border ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"} text-sm`}
                      >
                        <option value="ecd">ECD</option>
                        <option value="ecf">ECF</option>
                        <option value="folha">Folha</option>
                        <option value="fiscal">Fiscal</option>
                        <option value="contabil">Contábil</option>
                        <option value="outro">Outro</option>
                      </select>
                      {editingBatchTask || editingTask ? (
                        <Button
                          onClick={editingBatchTask ? saveBatchTaskEdit : saveSingleTaskEdit}
                          disabled={isAddingBatch || !newTask.trim()}
                          className="bg-indigo-600 hover:bg-indigo-700"
                        >
                          <Save className="w-4 h-4 mr-2" /> Salvar
                        </Button>
                      ) : (
                        <Button
                          onClick={handleAddTask}
                          disabled={isAddingBatch || !canCreateTasks}
                          size="icon"
                          className="bg-indigo-600 hover:bg-indigo-700"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      )}
                      {(editingBatchTask || editingTask) && (
                        <Button variant="outline" onClick={resetEditor}>
                          <X className="w-4 h-4 mr-2" /> Cancelar
                        </Button>
                      )}
                    </div>
                    {selectedFreq === "anual" && (
                      <div className="flex gap-2 items-center">
                        <label className="text-xs font-medium">Período:</label>
                        <select
                          value={monthStart}
                          onChange={(e) => setMonthStart(e.target.value)}
                          className={`px-2 py-1 rounded border text-xs ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"}`}
                        >
                          {[...Array(12)].map((_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][i]}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs">até</span>
                        <select
                          value={monthEnd}
                          onChange={(e) => setMonthEnd(e.target.value)}
                          className={`px-2 py-1 rounded border text-xs ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"}`}
                        >
                          {[...Array(12)].map((_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][i]}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {selectedFreq === "mensal" && (
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium">Recorrência mensal</label>
                          <select
                            value={monthlyRepeatMode}
                            onChange={(e) => setMonthlyRepeatMode(e.target.value)}
                            className={`px-2 py-1 rounded border text-xs ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"}`}
                          >
                            <option value="recurring">Todo mês</option>
                            <option value="once">Só em um mês</option>
                            <option value="until">Todo mês até (inclusive)</option>
                          </select>
                        </div>
                        {monthlyRepeatMode === "once" && (
                          <>
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-medium">Mês</label>
                              <select
                                value={onlyInMonth}
                                onChange={(e) => setOnlyInMonth(e.target.value)}
                                className={`px-2 py-1 rounded border text-xs ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"}`}
                              >
                                {[...Array(12)].map((_, i) => (
                                  <option key={i + 1} value={String(i + 1)}>
                                    {BULK_MONTH_LABELS[i]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-medium">Ano</label>
                              <Input
                                type="number"
                                min={2000}
                                max={2100}
                                value={onlyInYear}
                                onChange={(e) => setOnlyInYear(e.target.value)}
                                className="w-24 h-8 text-xs"
                              />
                            </div>
                          </>
                        )}
                        {monthlyRepeatMode === "until" && (
                          <>
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-medium">Até mês</label>
                              <select
                                value={repeatUntilMonth}
                                onChange={(e) => setRepeatUntilMonth(e.target.value)}
                                className={`px-2 py-1 rounded border text-xs ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"}`}
                              >
                                {[...Array(12)].map((_, i) => (
                                  <option key={i + 1} value={String(i + 1)}>
                                    {BULK_MONTH_LABELS[i]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-medium">Até ano</label>
                              <Input
                                type="number"
                                min={2000}
                                max={2100}
                                value={repeatUntilYear}
                                onChange={(e) => setRepeatUntilYear(e.target.value)}
                                className="w-24 h-8 text-xs"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={responsibleUid}
                        onChange={(e) => {
                          const uid = e.target.value;
                          setResponsibleUid(uid);
                          const option = responsibleOptions.find((opt) => opt.uid === uid);
                          if (option?.label) setResponsibleName(option.label);
                        }}
                        className={`px-3 py-2 rounded border ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"} text-sm`}
                      >
                        {responsibleOptions.map((opt) => (
                          <option key={opt.uid} value={opt.uid}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <Input
                        placeholder="Nome exibido do responsável"
                        value={responsibleName}
                        onChange={(e) => setResponsibleName(e.target.value)}
                        className="flex-1"
                      />
                    </div>
                  </div>
                  {tasks.length === 0 && (
                    <div className="mt-4 p-3 rounded text-sm text-gray-500">
                      💡 Clique em "+" para adicionar tarefas.
                    </div>
                  )}
                </div>
              )}
              {!canEditTasks && !canCreateTasks && (
                <div className={`p-3 rounded-lg text-sm ${theme === "dark" ? "bg-gray-800 text-gray-300" : "bg-gray-50 text-gray-600"}`}>
                  Você pode visualizar as tarefas. Criação, edição e exclusão estão bloqueadas para seu usuário.
                </div>
              )}

            {isBatchMode ? (
              <div className="space-y-3">
                <div className="text-center py-2 text-gray-500">
                  <p className="font-medium text-lg mb-2">Modo de Edição em Lote</p>
                  <p className="text-sm">As tarefas adicionadas acima serão aplicadas a <strong>todas as {companies.length} empresas</strong> ativas.</p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">📋 Tarefas em Lote ({batchTaskGroups.length})</h3>
                  {batchTaskGroups.length === 0 ? (
                    <div className={`p-3 rounded text-sm ${theme === "dark" ? "bg-gray-800 text-gray-400" : "bg-gray-50 text-gray-500"}`}>
                      Nenhuma tarefa em lote cadastrada.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {batchTaskGroups.map((group) => (
                        <div key={group.key} className={`flex items-center gap-3 p-3 rounded ${theme === "dark" ? "bg-gray-800" : "bg-gray-50"}`}>
                          <div className="flex-1">
                            <div className="font-medium">{group.name}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              Aplicada em {group.total} empresa(s) • Concluídas no período: {group.completed}
                            </div>
                          </div>
                          <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">{group.category}</span>
                          <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700">{group.frequency}</span>
                          <button
                            onClick={() => startEditBatchTask(group)}
                            title="Editar tarefa"
                            disabled={!canEditTasks}
                            className={`${canEditTasks ? "text-amber-500 hover:text-amber-700" : "text-gray-400 cursor-not-allowed"}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteBatchTaskGroup(group)}
                            title="Excluir tarefa em lote"
                            disabled={!canEditTasks}
                            className={`${canEditTasks ? "text-red-500 hover:text-red-700" : "text-gray-400 cursor-not-allowed"}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Filters for tasks */}
                <div className="flex items-center justify-between">
                  <div className="flex gap-2 flex-wrap">
                    <Button 
                      variant={filterTaskStatus === "all" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setFilterTaskStatus("all")}
                      className="text-xs h-8"
                    >
                      Todas
                    </Button>
                    <Button 
                      variant={filterTaskStatus === "open" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setFilterTaskStatus("open")}
                      className="text-xs h-8"
                    >
                      Em Aberto
                    </Button>
                    <Button 
                      variant={filterTaskStatus === "completed" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setFilterTaskStatus("completed")}
                      className="text-xs h-8"
                    >
                      Concluídas
                    </Button>
                    <Select value={filterResponsible} onValueChange={setFilterResponsible}>
                      <SelectTrigger className="w-[220px] h-8 text-xs">
                        <SelectValue placeholder="Responsável" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os responsáveis</SelectItem>
                        <SelectItem value="__unassigned__">Sem usuários</SelectItem>
                        {responsibleFilterOptions.map((opt) => (
                          <SelectItem key={opt.uid} value={opt.uid}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {canEditTasks && filterResponsible === "__unassigned__" && (
                  <div
                    className={`rounded-lg border p-3 space-y-3 ${
                      theme === "dark" ? "border-amber-800/40 bg-amber-950/20" : "border-amber-200 bg-amber-50/70"
                    }`}
                  >
                    <h4 className="font-semibold text-sm">Atribuir responsável para tarefas sem usuários</h4>
                    <p className="text-xs text-muted-foreground">
                      Selecione uma, várias ou todas as tarefas sem usuário e aplique um responsável em lote.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={reassignScope === "pick" ? "default" : "outline"}
                        className="h-8 text-xs"
                        onClick={() => setReassignScope("pick")}
                      >
                        Selecionar uma ou mais
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={reassignScope === "all" ? "default" : "outline"}
                        className="h-8 text-xs"
                        onClick={() => setReassignScope("all")}
                      >
                        Selecionar todas do filtro
                      </Button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Select value={reassignTargetUid} onValueChange={setReassignTargetUid}>
                        <SelectTrigger className="sm:w-[320px]">
                          <SelectValue placeholder="Escolha o responsável de destino" />
                        </SelectTrigger>
                        <SelectContent>
                          {responsibleOptions.map((opt) => (
                            <SelectItem key={opt.uid} value={opt.uid}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        className="bg-indigo-600 hover:bg-indigo-700"
                        onClick={handleReassignUnassignedTasks}
                        disabled={
                          reassignApplying ||
                          (reassignScope === "pick" && reassignPickTasks.size === 0) ||
                          !reassignTargetUid
                        }
                      >
                        {reassignApplying ? "Aplicando..." : "Atribuir responsável em lote"}
                      </Button>
                    </div>
                  </div>
                )}

                <div
                  className={`rounded-lg border p-4 space-y-3 ${
                    theme === "dark" ? "border-indigo-900/40 bg-indigo-950/20" : "border-indigo-100 bg-indigo-50/50"
                  }`}
                >
                  <h4 className="font-semibold text-sm">Conclusão em massa (tarefas mensais)</h4>
                  <p className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    Marque os meses e escolha se aplica a todas as tarefas mensais ou só às que você marcar. Meses anteriores ao
                    início das tarefas da empresa são ignorados.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium">Ano</span>
                    <Input
                      type="number"
                      className="w-24 h-8 text-sm"
                      value={bulkYear}
                      min={2000}
                      max={2100}
                      onChange={(e) => setBulkYear(parseInt(e.target.value, 10) || currentYear)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={!canEditTasks}
                      onClick={() => setBulkMonthSet(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))}
                    >
                      Todos os meses
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={!canEditTasks}
                      onClick={() => setBulkMonthSet(new Set())}
                    >
                      Limpar meses
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {BULK_MONTH_LABELS.map((label, i) => {
                      const m = i + 1;
                      const on = bulkMonthSet.has(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={!canEditTasks}
                          onClick={() => toggleBulkMonth(m)}
                          className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                            on
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : theme === "dark"
                                ? "border-gray-600 text-gray-300 hover:bg-gray-800"
                                : "border-gray-300 text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={bulkScope === "all" ? "default" : "outline"}
                      className="h-8 text-xs"
                      disabled={!canEditTasks}
                      onClick={() => setBulkScope("all")}
                    >
                      Todas as tarefas mensais
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={bulkScope === "pick" ? "default" : "outline"}
                      className="h-8 text-xs"
                      disabled={!canEditTasks}
                      onClick={() => setBulkScope("pick")}
                    >
                      Só tarefas marcadas
                    </Button>
                  </div>
                  {bulkScope === "pick" && (
                    <div
                      className={`max-h-36 overflow-y-auto rounded border p-2 space-y-1 ${
                        theme === "dark" ? "border-gray-700 bg-gray-800/50" : "border-gray-200 bg-white"
                      }`}
                    >
                      {tasks.filter((t) => {
                        if (t.frequency !== "mensal") return false;
                        for (let m = 1; m <= 12; m++) {
                          if (isMonthlyTaskInPeriodScope(t, bulkYear, m)) return true;
                        }
                        return false;
                      }).length === 0 ? (
                        <p className="text-xs text-gray-500">Nenhuma tarefa mensal neste ano.</p>
                      ) : (
                        tasks
                          .filter((t) => {
                            if (t.frequency !== "mensal") return false;
                            for (let m = 1; m <= 12; m++) {
                              if (isMonthlyTaskInPeriodScope(t, bulkYear, m)) return true;
                            }
                            return false;
                          })
                          .map((t) => (
                            <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={bulkPickTasks.has(t.id)}
                                disabled={!canEditTasks}
                                onCheckedChange={() => toggleBulkTaskPick(t.id)}
                              />
                              <span>{t.name}</span>
                            </label>
                          ))
                      )}
                    </div>
                  )}
                  <Button
                    type="button"
                    className="bg-indigo-600 hover:bg-indigo-700"
                    disabled={
                      bulkApplying ||
                      !canEditTasks ||
                      bulkMonthSet.size === 0 ||
                      (bulkScope === "pick" && bulkPickTasks.size === 0)
                    }
                    onClick={handleBulkCompleteMonths}
                  >
                    {bulkApplying ? "Aplicando…" : "Marcar como concluídas nos meses escolhidos"}
                  </Button>
                </div>

                {/* Monthly tasks */}
                <div className="space-y-2">
                  {beforeTaskPeriod && (
                    <div
                      className={`rounded-md border p-3 text-sm ${
                        theme === "dark"
                          ? "border-amber-900/50 bg-amber-950/30 text-amber-100"
                          : "border-amber-200 bg-amber-50 text-amber-900"
                      }`}
                    >
                      Este mês é anterior ao início das tarefas desta empresa: nada entra como em atraso. A data pode ser
                      ajustada em Empresas → Editar → Início das tarefas contábeis.
                    </div>
                  )}
                  <h3 className="font-semibold text-sm">📅 Tarefas Mensais ({monthlyTasks.length})</h3>
                  <p className="text-xs text-muted-foreground">
                    Todos os usuários podem ver esta aba, mas só concluem tarefas onde estão como responsável.
                  </p>
                  {monthlyTasks.length === 0 ? (
                    <div className={`p-3 rounded text-sm ${theme === "dark" ? "bg-gray-800 text-gray-400" : "bg-gray-50 text-gray-500"}`}>
                      Nenhuma tarefa mensal
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {monthlyTasks.map((task) => {
                        const recurrenceHint = monthlyRecurrenceHint(task);
                        return (
                        <div
                          key={task.id}
                          className={`flex items-center gap-3 p-3 rounded ${
                            theme === "dark" ? "bg-gray-800" : "bg-gray-50"
                          } ${task.outOfScopeMonth ? "opacity-70" : ""}`}
                        >
                          {canEditTasks && filterResponsible === "__unassigned__" && isTaskUnassigned(task) && (
                            <Checkbox
                              checked={reassignPickTasks.has(task.id)}
                              onCheckedChange={() => toggleReassignPickTask(task.id)}
                            />
                          )}
                          <Checkbox
                            checked={task.completed}
                            disabled={!!task.outOfScopeMonth || !isTaskResponsible(task)}
                            onCheckedChange={() => handleToggleComplete(task)}
                          />
                          <div className="flex-1">
                            <span className={task.completed ? "line-through text-gray-400" : ""}>{task.name}</span>
                            {recurrenceHint && (
                              <span className="text-xs text-muted-foreground ml-2">({recurrenceHint})</span>
                            )}
                            <div className="text-xs text-gray-500 mt-1">
                              Responsável: {task.responsible_name || task.responsible_uid || "Não definido"}
                            </div>
                            {task.outOfScopeMonth && (
                              <span className="text-xs text-muted-foreground ml-2">(antes do início das tarefas)</span>
                            )}
                            {task.showCompletedDate && task.completed_date && (
                              <div className="text-xs text-gray-500 mt-1">✓ {task.completed_date}</div>
                            )}
                          </div>
                          <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">{task.category}</span>
                          {task.completed && (
                            <div className="w-48">
                              <DatePicker
                                date={task.completed_date || ""}
                                disabled={!isTaskResponsible(task)}
                                onChange={(v) => {
                                  if (!isTaskResponsible(task)) return;
                                  const periodKey = getPeriodKey(currentYear, currentMonth);
                                  const currentMap = { ...(task.completed_months || {}) };
                                  currentMap[periodKey] = v;
                                  const allDates = Object.values(currentMap).filter(Boolean);
                                  updateMutation.mutate({
                                    id: task.id,
                                    data: {
                                      completed_months: currentMap,
                                      completed: allDates.length > 0,
                                      completed_date: allDates.length > 0 ? allDates.sort().at(-1) : null,
                                    }
                                  });
                                }}
                              />
                            </div>
                          )}
                          {!initialCompany && canEditTasks && (
                            <button
                              onClick={() => startEditTask(task)}
                              title="Editar tarefa"
                              className="text-amber-500 hover:text-amber-700"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          <button 
                            onClick={() => {
                              setSelectedTask(task);
                              setNotesEmailOpen(true);
                            }}
                            title="Observações e Email"
                            className="text-blue-500 hover:text-blue-700"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            disabled={!canEditTasks}
                            className={`${canEditTasks ? "text-red-500 hover:text-red-700" : "text-gray-400 cursor-not-allowed"}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                      })}
                    </div>
                  )}
                </div>

                {/* Annual tasks */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">📆 Tarefas Anuais ({annualTasks.length})</h3>
                  {annualTasks.length === 0 ? (
                    <div className={`p-3 rounded text-sm ${theme === "dark" ? "bg-gray-800 text-gray-400" : "bg-gray-50 text-gray-500"}`}>
                      Nenhuma tarefa anual
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {annualTasks.map((task) => {
                        const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                        const periodLabel = task.month_start && task.month_end ? `${months[task.month_start - 1]} - ${months[task.month_end - 1]}` : "Anual";
                        return (
                          <div key={task.id} className={`flex items-center gap-3 p-3 rounded ${theme === "dark" ? "bg-gray-800" : "bg-gray-50"}`}>
                            {canEditTasks && filterResponsible === "__unassigned__" && isTaskUnassigned(task) && (
                              <Checkbox
                                checked={reassignPickTasks.has(task.id)}
                                onCheckedChange={() => toggleReassignPickTask(task.id)}
                              />
                            )}
                            <Checkbox
                              checked={task.completed}
                              disabled={!isTaskResponsible(task)}
                              onCheckedChange={() => handleToggleComplete(task)}
                            />
                            <div className="flex-1">
                              <span className={task.completed ? "line-through text-gray-400" : ""}>{task.name}</span>
                              <div className="text-xs text-gray-500 mt-1">
                                Responsável: {task.responsible_name || task.responsible_uid || "Não definido"}
                              </div>
                              {task.completed_date && (
                                <div className="text-xs text-gray-500 mt-1">✓ {task.completed_date}</div>
                              )}
                            </div>
                            <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700">{task.category}</span>
                            <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">{periodLabel}</span>
                            {task.completed && (
                              <div className="w-48">
                                <DatePicker
                                  date={task.completed_date || ""}
                                  disabled={!isTaskResponsible(task)}
                                  onChange={(v) => {
                                    if (!isTaskResponsible(task)) return;
                                    updateMutation.mutate({
                                      id: task.id,
                                      data: { completed_date: v }
                                    });
                                  }}
                                />
                              </div>
                            )}
                            {!initialCompany && canEditTasks && (
                              <button
                                onClick={() => startEditTask(task)}
                                title="Editar tarefa"
                                className="text-amber-500 hover:text-amber-700"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            <button 
                              onClick={() => {
                                setSelectedTask(task);
                                setNotesEmailOpen(true);
                              }}
                              title="Observações e Email"
                              className="text-blue-500 hover:text-blue-700"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              disabled={!canEditTasks}
                              className={`${canEditTasks ? "text-red-500 hover:text-red-700" : "text-gray-400 cursor-not-allowed"}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

          <TaskNotesEmailDialog 
            open={notesEmailOpen}
            onClose={() => setNotesEmailOpen(false)}
            task={selectedTask}
            company={company}
            onSave={() => {
              queryClient.invalidateQueries({ queryKey: ["companyTasks"] });
              queryClient.invalidateQueries({ queryKey: ["companies"] });
            }}
          />
        </>
      ) : (
        !initialCompany && (
          <div className="text-center py-10 text-gray-500">
            Selecione uma empresa para visualizar e gerenciar suas tarefas.
          </div>
        )
      )}
      </div>
    </DialogContent>
  </Dialog>
);
}