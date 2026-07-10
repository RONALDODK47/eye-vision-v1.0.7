import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import DatePicker from "../DatePicker";
import {
  observationPeriodKey,
  getMonthlyNote,
  getAnnualNote,
  getLegacySingleMonthlyNote,
  hasStructuredMonthlyNotes,
} from "@/lib/companyObservations";
import { COMPANY_SECTOR_RESPONSIBLE_DEFS } from "@/lib/companySectorResponsibles";
import InfoTooltip from "@/components/InfoTooltip";
import { dbClient } from "@/api/dbClient";
import { useWorkspacePeerUids } from "@/hooks/useWorkspacePeerUids";
import { useCloudAccess } from "@/lib/useCloudAccess";

const MONTH_OPTIONS = [
  { v: 1, l: "Janeiro" },
  { v: 2, l: "Fevereiro" },
  { v: 3, l: "Março" },
  { v: 4, l: "Abril" },
  { v: 5, l: "Maio" },
  { v: 6, l: "Junho" },
  { v: 7, l: "Julho" },
  { v: 8, l: "Agosto" },
  { v: 9, l: "Setembro" },
  { v: 10, l: "Outubro" },
  { v: 11, l: "Novembro" },
  { v: 12, l: "Dezembro" },
];

function yearOptions(centerYear) {
  const y = Number(centerYear) || new Date().getFullYear();
  const list = [];
  for (let i = y - 3; i <= y + 2; i += 1) list.push(i);
  return list;
}

export default function CompanyForm({ open, onClose, onSubmit, onDelete, company }) {
  const [clientSinceEnabled, setClientSinceEnabled] = useState(false);
  const { officePeerUids } = useWorkspacePeerUids();
  const { isAdminEmail } = useCloudAccess();
  const [form, setForm] = useState({
    code: "", name: "", group_name: "", calendar_priority_group: "", cnpj: "", contact_name: "", contact_phone: "", contact_email: "",
    tasks_start_date: "",
    exit_tasks_start_date: "",
    client_since_date: "",
    notes: "",
    accounting_responsible: "",
    fiscal_responsible: "",
    payroll_responsible: "",
    other_responsible: "",
    regime: "",
    difficulty_level: "facil",
    custom_fields: {},
    assigned_company_token: "",
  });

  const now = new Date();
  const [obsMonth, setObsMonth] = useState(now.getMonth() + 1);
  const [obsYear, setObsYear] = useState(now.getFullYear());
  const [obsMonthlyText, setObsMonthlyText] = useState("");
  const [obsAnnualYear, setObsAnnualYear] = useState(now.getFullYear());
  const [obsAnnualText, setObsAnnualText] = useState("");
  const responsibleUsersListId = "company-sector-responsibles-users";

  const { data: workspaceProfiles = [] } = useQuery({
    queryKey: ["workspacePeersProfiles"],
    queryFn: () => dbClient.entities.UserProfile.listAll(),
    enabled: open,
    staleTime: 60_000,
    retry: 2,
  });

  const responsibleUserOptions = useMemo(() => {
    const officeUidSet = new Set((officePeerUids || []).map((u) => String(u || "").trim()).filter(Boolean));
    const names = new Set();
    for (const p of workspaceProfiles || []) {
      const uid = String(p?.uid || "").trim();
      if (officeUidSet.size > 0 && uid && !officeUidSet.has(uid)) continue;
      const username = String(p?.gc_login_username || "").trim();
      if (username) names.add(username);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }, [workspaceProfiles, officePeerUids]);

  useEffect(() => {
    if (!open) return;
    const n = new Date();
    const cy = n.getFullYear();
    const cm = n.getMonth() + 1;

    if (company) {
      const csd = company.client_since_date || "";
      setClientSinceEnabled(Boolean(String(csd).trim()));
      setForm({
        code: company.code || "",
        name: company.name || "",
        group_name: company.group_name || "",
        calendar_priority_group: company.calendar_priority_group || "",
        cnpj: company.cnpj || "",
        contact_name: company.contact_name || "",
        contact_phone: company.contact_phone || "",
        contact_email: company.contact_email || "",
        tasks_start_date: company.tasks_start_date || "",
        exit_tasks_start_date: company.exit_tasks_start_date || company.exit_date || "",
        client_since_date: csd,
        notes: company.notes || "",
        accounting_responsible: company.accounting_responsible || "",
        fiscal_responsible: company.fiscal_responsible || "",
        payroll_responsible: company.payroll_responsible || "",
        other_responsible: company.other_responsible || "",
        regime: company.regime || "",
        difficulty_level: company.difficulty_level || "facil",
        custom_fields: company.custom_fields || {},
        assigned_company_token: company.assigned_company_token || "",
      });
      setObsYear(cy);
      setObsMonth(cm);
      let monthly = getMonthlyNote(company, cy, cm);
      if (!monthly && !hasStructuredMonthlyNotes(company) && getLegacySingleMonthlyNote(company)) {
        monthly = getLegacySingleMonthlyNote(company);
      }
      setObsMonthlyText(monthly);
      setObsAnnualYear(cy);
      setObsAnnualText(getAnnualNote(company, cy));
    } else {
      setClientSinceEnabled(false);
      setForm({
        code: "", name: "", group_name: "", calendar_priority_group: "", cnpj: "", contact_name: "", contact_phone: "", contact_email: "",
        tasks_start_date: new Date().toISOString().split("T")[0],
        exit_tasks_start_date: "",
        client_since_date: "",
        notes: "",
        accounting_responsible: "",
        fiscal_responsible: "",
        payroll_responsible: "",
        other_responsible: "",
        regime: "",
        difficulty_level: "facil",
        custom_fields: {},
      });
      setObsYear(cy);
      setObsMonth(cm);
      setObsMonthlyText("");
      setObsAnnualYear(cy);
      setObsAnnualText("");
    }
  }, [company, open]);

  const refreshMonthlyTextForPeriod = (y, m) => {
    if (!company) {
      setObsMonthlyText("");
      return;
    }
    let text = getMonthlyNote(company, y, m);
    if (
      !text &&
      !hasStructuredMonthlyNotes(company) &&
      getLegacySingleMonthlyNote(company) &&
      observationPeriodKey(y, m) === observationPeriodKey(new Date().getFullYear(), new Date().getMonth() + 1)
    ) {
      text = getLegacySingleMonthlyNote(company);
    }
    setObsMonthlyText(text);
  };

  const refreshAnnualTextForYear = (y) => {
    if (!company) {
      setObsAnnualText("");
      return;
    }
    setObsAnnualText(getAnnualNote(company, y));
  };

  const handleChange = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = () => {
    const key = observationPeriodKey(obsYear, obsMonth);
    const monthly_notes = company
      ? { ...(company.monthly_notes && typeof company.monthly_notes === "object" ? company.monthly_notes : {}), [key]: obsMonthlyText }
      : obsMonthlyText
        ? { [key]: obsMonthlyText }
        : {};
    const annual_notes = company
      ? {
          ...(company.annual_notes && typeof company.annual_notes === "object" ? company.annual_notes : {}),
          [String(obsAnnualYear)]: obsAnnualText,
        }
      : obsAnnualText
        ? { [String(obsAnnualYear)]: obsAnnualText }
        : {};

    onSubmit({
      ...form,
      client_since_date: clientSinceEnabled ? String(form.client_since_date || "").trim() : "",
      monthly_notes,
      annual_notes,
      _stripLegacyMonthly: true,
    });
    onClose();
  };

  const yOpts = yearOptions(Math.max(obsYear, obsAnnualYear, new Date().getFullYear()));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{company ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Código</Label>
            <Input value={form.code} onChange={(e) => handleChange("code", e.target.value)} placeholder="Ex: 001" />
          </div>
          <div className="space-y-2">
            <Label>Nome da Empresa *</Label>
            <Input value={form.name} onChange={(e) => handleChange("name", e.target.value)} placeholder="Nome" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center gap-1.5">
              <Label>Grupo de empresas</Label>
              <InfoTooltip text="Opcional. Use o mesmo texto em várias empresas para agrupá-las em sequência e filtrar por grupo na lista." />
            </div>
            <Input
              value={form.group_name}
              onChange={(e) => handleChange("group_name", e.target.value)}
              placeholder="Ex: Grupo Econômico Silva — empresas com o mesmo nome aparecem juntas na lista"
            />
          </div>
          {isAdminEmail && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>Token da Empresa (Visibilidade)</Label>
                <InfoTooltip text="Token que controla quem vê esta empresa. Se não for definido, só você verá esta empresa. Se definido, quem tiver este token poderá vê-la." />
              </div>
              <Input
                value={form.assigned_company_token}
                onChange={(e) => handleChange("assigned_company_token", e.target.value)}
                placeholder="Ex: EMP-P1IK-FBG7BMY4"
              />
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>Grupo de prioridade no calendário</Label>
              <InfoTooltip text="Corresponde aos grupos 1, 2, 3 da aba Calendário. Define a prioridade de execução das tarefas desta empresa." />
            </div>
            <Select
              value={form.calendar_priority_group || "none"}
              onValueChange={(v) => handleChange("calendar_priority_group", v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem grupo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem grupo</SelectItem>
                <SelectItem value="1">Grupo 1</SelectItem>
                <SelectItem value="2">Grupo 2</SelectItem>
                <SelectItem value="3">Grupo 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>CNPJ</Label>
            <Input value={form.cnpj} onChange={(e) => handleChange("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
          </div>
          <div className="space-y-2">
            <Label>Contato</Label>
            <Input value={form.contact_name} onChange={(e) => handleChange("contact_name", e.target.value)} placeholder="Nome do contato" />
          </div>
          <div className="space-y-2">
            <Label>Telefone do contato</Label>
            <Input
              value={form.contact_phone}
              onChange={(e) => handleChange("contact_phone", e.target.value)}
              placeholder="(00) 00000-0000 com DDD e DDI se precisar"
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={form.contact_email} onChange={(e) => handleChange("contact_email", e.target.value)} placeholder="email@empresa.com" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center gap-1.5"><Label>Início das tarefas contábeis</Label><InfoTooltip text="A partir deste mês o sistema conta tarefas mensais e atrasos. Recomendado preencher no cadastro." /></div>
            <DatePicker
              date={form.tasks_start_date}
              onChange={(v) => handleChange("tasks_start_date", v)}
            />
          </div>
          <div className="space-y-3 md:col-span-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="client-since-enabled"
                checked={clientSinceEnabled}
                onCheckedChange={(v) => {
                  const on = v === true;
                  setClientSinceEnabled(on);
                  if (!on) handleChange("client_since_date", "");
                }}
              />
              <Label htmlFor="client-since-enabled" className="font-medium cursor-pointer">
                Cliente desde
              </Label>
            </div>
            {clientSinceEnabled ? (
              <div className="space-y-2 pl-1">
                <div className="flex items-center gap-1.5"><Label>Data em que passou a ser cliente</Label><InfoTooltip text="Opcional para controle interno e relatórios. Não substitui o início das tarefas contábeis." /></div>
                <DatePicker
                  date={form.client_since_date}
                  onChange={(v) => handleChange("client_since_date", v)}
                />
              </div>
            ) : null}
          </div>
          {company && (company.status === "saida" || company.status === "baixa") && (
            <div className="space-y-2 md:col-span-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <div className="flex items-center gap-1.5"><Label>Início das tarefas de saída / baixa</Label><InfoTooltip text="Usado no gráfico da aba Dashboard → Saídas (linha azul). Pode ser diferente da data de registro da saída." /></div>
              <DatePicker
                date={form.exit_tasks_start_date}
                onChange={(v) => handleChange("exit_tasks_start_date", v)}
              />
            </div>
          )}
          <div className="space-y-3 md:col-span-2 rounded-lg border p-3">
            <div className="flex items-center gap-1.5"><Label className="text-sm">Responsáveis por setor (equipa)</Label><InfoTooltip text="Selecione um utilizador cadastrado na lista ou digite manualmente o nome do utilizador para cada setor." /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {COMPANY_SECTOR_RESPONSIBLE_DEFS.map((d) => (
                <div key={d.field} className="space-y-1.5">
                  <Label className="text-xs font-medium">{d.label}</Label>
                  <Input
                    value={form[d.field] ?? ""}
                    onChange={(e) => handleChange(d.field, e.target.value)}
                    list={responsibleUsersListId}
                    placeholder="Selecione o utilizador ou digite o nome"
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>
            <datalist id={responsibleUsersListId}>
              {responsibleUserOptions.map((username) => (
                <option key={username} value={username} />
              ))}
            </datalist>
            {responsibleUserOptions.length === 0 ? (
              <p className="text-xs text-amber-600">
                Nenhum utilizador cadastrado foi encontrado para sugerir na lista.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Regime</Label>
            <Input value={form.regime} onChange={(e) => handleChange("regime", e.target.value)} placeholder="Ex: Simples Nacional" />
          </div>
          <div className="space-y-2">
            <Label>Nível de Dificuldade</Label>
            <Select value={form.difficulty_level} onValueChange={(v) => handleChange("difficulty_level", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="facil">Fácil</SelectItem>
                <SelectItem value="dificil">Difícil</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-1 md:col-span-2 space-y-3 rounded-lg border border-dashed p-3">
            <div className="flex items-center gap-1.5"><Label>Observação mensal (por mês)</Label><InfoTooltip text="O texto fica salvo só no mês/ano escolhidos; outros meses têm observação independente." /></div>
            <div className="flex flex-wrap gap-2">
              <Select
                value={String(obsMonth)}
                onValueChange={(v) => {
                  const m = parseInt(v, 10);
                  setObsMonth(m);
                  refreshMonthlyTextForPeriod(obsYear, m);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map((mo) => (
                    <SelectItem key={mo.v} value={String(mo.v)}>
                      {mo.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(obsYear)}
                onValueChange={(v) => {
                  const y = parseInt(v, 10);
                  setObsYear(y);
                  refreshMonthlyTextForPeriod(y, obsMonth);
                }}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yOpts.map((yy) => (
                    <SelectItem key={yy} value={String(yy)}>
                      {yy}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              value={obsMonthlyText}
              onChange={(e) => setObsMonthlyText(e.target.value)}
              placeholder="Pontos deste mês, pendências do período..."
              rows={3}
            />
          </div>

          <div className="col-span-1 md:col-span-2 space-y-3 rounded-lg border border-dashed p-3">
            <div className="flex items-center gap-1.5"><Label>Observação anual (por ano)</Label><InfoTooltip text="Metas e notas daquele ano civil; outro ano tem campo separado. A observação geral (abaixo) continua valendo para sempre." /></div>
            <Select
              value={String(obsAnnualYear)}
              onValueChange={(v) => {
                const y = parseInt(v, 10);
                setObsAnnualYear(y);
                refreshAnnualTextForYear(y);
              }}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yOpts.map((yy) => (
                  <SelectItem key={yy} value={String(yy)}>
                    {yy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={obsAnnualText}
              onChange={(e) => setObsAnnualText(e.target.value)}
              placeholder="Resumo ou pendências do ano..."
              rows={3}
            />
          </div>

          <div className="col-span-1 md:col-span-2 space-y-2">
            <div className="flex items-center gap-1.5"><Label>Observação geral</Label><InfoTooltip text="Histórico fixo, acordos permanentes — não é por mês nem por ano." /></div>
            <Textarea
              value={form.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder="Dados fixos da empresa, histórico, acordos permanentes..."
              rows={3}
            />
          </div>

        </div>
        <DialogFooter className="flex w-full items-center justify-between gap-2">
          {company && onDelete ? (
            <Button variant="destructive" onClick={() => onDelete(company)}>
              Excluir Empresa
            </Button>
          ) : (
            <span />
          )}
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!form.name} className="bg-indigo-600 hover:bg-indigo-700">{company ? "Salvar" : "Criar Empresa"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
