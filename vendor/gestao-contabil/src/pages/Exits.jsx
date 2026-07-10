import React, { useMemo, useState } from "react";
import { dbClient } from "@/api/dbClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCloudAccess } from "@/lib/useCloudAccess";
import { useWorkspacePeerUids } from "@/hooks/useWorkspacePeerUids";
import { mergeIndexedDocs } from "@/lib/officeWorkspacePeers";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import CsvImportActions from "@/components/CsvImportActions";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Check, ChevronsUpDown, Pencil, Trash2 } from "lucide-react";
import MonthPicker from "../components/MonthPicker";
import { format } from "date-fns";
import { useTheme } from "../components/ThemeProvider";
import { GestaoPageHeader } from "@/components/GestaoEyeVisionChrome";
import { getRowValue, normalizeDateInput } from "@/lib/csvUtils";
import {
  FILTER_RESPONSIBLE_NONE,
  companyMatchesResponsibleFilter,
} from "@/lib/responsibleFilter";
import {
  uniqueResponsibleLabelsFromCompanies,
  COMPANY_SECTOR_RESPONSIBLE_DEFS,
} from "@/lib/companySectorResponsibles";
import DatePicker from "../components/DatePicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function Exits() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterDate, setFilterDate] = useState(null);
  const [filterResponsible, setFilterResponsible] = useState("all");
  const [openResponsible, setOpenResponsible] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [editForm, setEditForm] = useState({
    code: "",
    name: "",
    cnpj: "",
    status: "saida",
    exit_date: new Date().toISOString().split("T")[0],
    exit_reason: "",
    accounting_responsible: "",
    fiscal_responsible: "",
    payroll_responsible: "",
    other_responsible: "",
  });

  const { user } = useAuth();
  const userUid = user?.uid;
  const { canCreateCompanies, internalStaffFullAccess, isMasterUser } = useCloudAccess();
  const { officePeerUids, officeToken } = useWorkspacePeerUids();
  const officeWideListing = Boolean(internalStaffFullAccess || isMasterUser);

  const { data: companies = [] } = useQuery({
    queryKey: ["companies", "exits", userUid, officeToken, officeWideListing, officePeerUids.join(",")],
    queryFn: async () => {
      if (!userUid) return [];
      let all;
      if (officeWideListing) {
        const uidList = officePeerUids.length ? officePeerUids : [userUid];
        all = await mergeIndexedDocs((u) => dbClient.entities.Company.list(u), uidList);
      } else {
        const uidList = officePeerUids.length ? officePeerUids : [userUid];
        all = await mergeIndexedDocs((u) => dbClient.entities.Company.list(u), uidList);
      }
      const userOfficeToken = String(officeToken || "").trim();
      return all.filter((company) => {
        const companyToken = String(company.assigned_company_token || "").trim();
        if (companyToken) return userOfficeToken === companyToken;
        return String(company.uid || "").trim() === String(userUid).trim();
      });
    },
    enabled: !!userUid,
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => dbClient.entities.Company.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setEditingCompany(null);
    },
  });

  const softDeleteMutation = useMutation({
    mutationFn: (id) =>
      dbClient.entities.Company.update(id, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setEditingCompany(null);
    },
  });

  const exits = companies.filter((c) => c.status === "baixa" || c.status === "saida");
  const responsibles = useMemo(() => uniqueResponsibleLabelsFromCompanies(companies), [companies]);

  const filtered = exits
    .filter((c) => c.name?.toLowerCase().includes(search.toLowerCase()))
    .filter((c) => filterType === "all" || c.status === filterType)
    .filter((c) => companyMatchesResponsibleFilter(filterResponsible, c))
    .filter((c) => {
      if (!filterDate) return true;
      if (!c.exit_date) return false;
      const exitDate = new Date(c.exit_date);
      return exitDate.getMonth() === filterDate.getMonth() && exitDate.getFullYear() === filterDate.getFullYear();
    });

  const handleImportExits = async (rows) => {
    const uid = userUid;
    if (!uid) {
      throw new Error("Você precisa estar logado para importar.");
    }
    if (!canCreateCompanies) {
      throw new Error("Você não tem permissão para importar baixas/saídas.");
    }

    const byCode = new Map(
      companies
        .filter((c) => c.code)
        .map((c) => [String(c.code).trim().toLowerCase(), c])
    );
    const byName = new Map(
      companies
        .filter((c) => c.name)
        .map((c) => [String(c.name).trim().toLowerCase(), c])
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const code = getRowValue(row, ["codigo", "código", "code"]);
      const name = getRowValue(row, ["nome", "empresa", "name"]);
      const rawType = getRowValue(row, ["tipo", "status"], "saida").toLowerCase();
      const type = rawType.includes("baix") ? "baixa" : "saida";

      if (!code && !name) {
        skipped += 1;
        continue;
      }

      const payload = {
        status: type,
        exit_date: normalizeDateInput(getRowValue(row, ["data_saida", "exit_date"])) || new Date().toISOString().split("T")[0],
        exit_reason: getRowValue(row, ["motivo", "exit_reason"]),
        accounting_responsible: getRowValue(row, ["responsavel_contabil", "responsavel", "accounting_responsible"]),
        fiscal_responsible: getRowValue(row, ["responsavel_fiscal", "fiscal_responsible"]),
        payroll_responsible: getRowValue(row, ["responsavel_dp", "departamento_pessoal", "payroll_responsible"]),
        other_responsible: getRowValue(row, ["responsavel_outros", "other_responsible", "outros_responsible"]),
      };

      const existing =
        (code && byCode.get(String(code).trim().toLowerCase())) ||
        (name && byName.get(String(name).trim().toLowerCase()));

      if (existing) {
        await dbClient.entities.Company.update(existing.id, payload);
        updated += 1;
      } else if (name) {
        await dbClient.entities.Company.create({
          uid,
          code,
          name,
          status: payload.status,
          exit_date: payload.exit_date,
          exit_reason: payload.exit_reason,
          accounting_responsible: payload.accounting_responsible,
          fiscal_responsible: payload.fiscal_responsible,
          payroll_responsible: payload.payroll_responsible,
          other_responsible: payload.other_responsible,
        });
        created += 1;
      } else {
        skipped += 1;
      }
    }

    await queryClient.invalidateQueries({ queryKey: ["companies"] });
    return {
      message: `Importação concluída: ${created} criadas, ${updated} atualizadas, ${skipped} ignoradas.`,
    };
  };

  const openEditDialog = (company) => {
    setEditingCompany(company);
    setEditForm({
      code: company.code || "",
      name: company.name || "",
      cnpj: company.cnpj || "",
      status: company.status === "baixa" ? "baixa" : "saida",
      exit_date: company.exit_date || new Date().toISOString().split("T")[0],
      exit_reason: company.exit_reason || "",
      accounting_responsible: company.accounting_responsible || "",
      fiscal_responsible: company.fiscal_responsible || "",
      payroll_responsible: company.payroll_responsible || "",
      other_responsible: company.other_responsible || "",
    });
  };

  const handleSaveEdit = () => {
    if (!editingCompany?.id || !editForm.name.trim()) return;
    updateMutation.mutate({
      id: editingCompany.id,
      data: {
        code: editForm.code.trim(),
        name: editForm.name.trim(),
        cnpj: editForm.cnpj.trim(),
        status: editForm.status,
        exit_date: editForm.exit_date,
        exit_reason: editForm.exit_reason.trim(),
        accounting_responsible: editForm.accounting_responsible.trim(),
        fiscal_responsible: editForm.fiscal_responsible.trim(),
        payroll_responsible: editForm.payroll_responsible.trim(),
        other_responsible: editForm.other_responsible.trim(),
      },
    });
  };

  const handleDeleteExitCompany = (company) => {
    if (!company?.id) return;
    if (!canCreateCompanies) {
      window.alert("Você não tem permissão para mover empresas para a lixeira.");
      return;
    }
    const confirmed = window.confirm(`Deseja mover "${company.name}" para a lixeira? Pode restaurar em Lixeira.`);
    if (!confirmed) return;
    softDeleteMutation.mutate(company.id);
  };

  return (
    <div className="space-y-6">
      <GestaoPageHeader
        title="Baixa e Saída"
        subtitle="Histórico de empresas que saíram ou deram baixa"
      />
      <CsvImportActions
        templateFileName="modelo_baixas_saidas.csv"
        templateHeaders={["codigo", "nome", "tipo", "data_saida", "motivo", "responsavel_contabil", "responsavel_fiscal", "responsavel_dp", "responsavel_outros"]}
        templateRows={[
          ["101", "Empresa Exemplo", "saida", "2026-03-10", "Encerramento de contrato", "Carlos", "Maria", "Ana", "João"],
        ]}
        onImportRows={handleImportExits}
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Tipos</SelectItem>
            <SelectItem value="saida">Saída</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>
        <MonthPicker 
          date={filterDate || new Date()} 
          onChange={setFilterDate} 
        />
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
      </div>

      <Card className={`overflow-x-auto ${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
        <Table>
          <TableHeader>
            <TableRow className={theme === "dark" ? "border-gray-800" : ""}>
              <TableHead className="whitespace-nowrap max-w-none">Código</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead className="whitespace-nowrap max-w-none">Tipo</TableHead>
              <TableHead className="whitespace-nowrap max-w-none">Data Saída</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead className="text-right max-w-none whitespace-nowrap">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className={theme === "dark" ? "border-gray-800" : ""}>
                <TableCell className="font-medium text-gray-500 whitespace-nowrap max-w-none">{c.code || "—"}</TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="max-w-none whitespace-nowrap">
                  <Badge className={c.status === "baixa" ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"}>
                    {c.status === "baixa" ? "Baixa" : "Saída"}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap max-w-none">
                  {c.exit_date ? format(new Date(c.exit_date), "dd/MM/yyyy") : "—"}
                </TableCell>
                <TableCell>{c.exit_reason || "—"}</TableCell>
                <TableCell className="text-right max-w-none whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(c)}>
                      <Pencil className="w-4 h-4 mr-1" /> Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteExitCompany(c)}
                      disabled={deleteMutation.isPending}
                      className="border-red-200 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Excluir
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-gray-400 max-w-none w-full">
                  Nenhum registro encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!editingCompany} onOpenChange={(open) => { if (!open) setEditingCompany(null); }}>
        <DialogContent aria-describedby={undefined} className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar Empresa ({editForm.status === "baixa" ? "Baixa" : "Saída"})</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Código</Label>
              <Input value={editForm.code} onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Empresa *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input value={editForm.cnpj} onChange={(e) => setEditForm((p) => ({ ...p, cnpj: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={editForm.status} onValueChange={(value) => setEditForm((p) => ({ ...p, status: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="saida">Saída</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data Saída</Label>
              <DatePicker date={editForm.exit_date} onChange={(v) => setEditForm((p) => ({ ...p, exit_date: v }))} />
            </div>
            <div className="space-y-3 sm:col-span-2 rounded-lg border p-3">
              <Label className="text-sm">Responsáveis por setor</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {COMPANY_SECTOR_RESPONSIBLE_DEFS.map((d) => (
                  <div key={d.field} className="space-y-2">
                    <Label>{d.label}</Label>
                    <Input
                      value={editForm[d.field] ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, [d.field]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Motivo</Label>
              <Textarea
                value={editForm.exit_reason}
                onChange={(e) => setEditForm((p) => ({ ...p, exit_reason: e.target.value }))}
                placeholder="Descreva o motivo..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCompany(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending || !editForm.name.trim()} className="bg-indigo-600 hover:bg-indigo-700">
              {updateMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}