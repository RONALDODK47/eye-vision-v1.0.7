import React, { useMemo, useState } from "react";
import { mergeIndexedDocs } from "@/lib/officeWorkspacePeers";
import { useWorkspacePeerUids } from "@/hooks/useWorkspacePeerUids";
import { dbClient } from "@/api/dbClient";
import { auth } from "@/lib/firebase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteField } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Landmark, ArrowRightLeft, Minus, PlusCircle, FileDown } from "lucide-react";
import { useTheme } from "../components/ThemeProvider";
import { cn } from "@/lib/utils";
import {
  computeCpcLoanView,
  computeLoanMetrics,
  computeOutstandingShortLongSplit,
  deriveInterMonthlyBalancesFromPartyEntries,
  formatBRL,
  getInterPayReceiveCompanyIds,
  getInterSaldoNaturezaLoan,
  getLoanCalendarMonthContext,
  inferInterAnchorCompanyId,
  normalizeInterMonthlyBalances,
  normalizeInterPartyBalanceEntries,
} from "@/lib/loanCalculations";
import MonthPicker from "../components/MonthPicker";
import { exportLoanOperationPdf } from "@/lib/loanPdfExport";
import { useCloudAccess } from "@/lib/useCloudAccess";
import TabReadOnlyBanner from "@/components/TabReadOnlyBanner";

const EMPTY_FORM = {
  loan_kind: "bancario",
  title: "",
  bank_name: "",
  /** Empresa do título do card: bancário = tomadora; entre empresas = foco do saldo */
  card_company_id: "",
  /** Entre empresas: âncora deve a estas empresas (uma linha por slot) */
  inter_pay_company_ids: [],
  /** Entre empresas: âncora recebe destas */
  inter_receive_company_ids: [],
  total_contract_value: "",
  installments_total: "",
  installment_amount: "",
  installments_paid: "0",
  manual_balance_current: "",
  first_due_date: "",
  notes: "",
  /** bancário: cronograma gerado ao salvar (fixo no Firestore) */
  installment_schedule: "variavel",
  installment_amounts: [],
  installment_due_dates: [],
  /** linhas do cronograma: data (opcional) e valor pago na parcela */
  bank_schedule_rows: [],
  /** Bancário: data da 1ª parcela (preenche o cronograma mensal automaticamente na UI) */
  bank_simple_first_date: "",
  /** total já amortizado / pago (R$) — saldo = bruto − este valor */
  loan_total_paid: "",
  /** periodicidade entre parcelas: dia | mes | ano */
  installment_frequency_unit: "mes",
  /** intervalo (ex.: 1 = mensal, 7 = semanal se unidade = dia) */
  installment_frequency_step: "1",
  /** custos da operação: tarifas, impostos na contratação (CPC 48) — opcional */
  loan_transaction_costs: "",
  loan_disbursement_date: "",
  /** entre empresas: saldo final por mês/ano (legado / saldo único) */
  inter_monthly_rows: [],
  /** entre empresas: uma linha por empresa + mês + valor (a pagar ou a receber) */
  inter_party_balance_rows: [],
};

const MAX_PARCELAS_VALOR_MANUAL = 360;
const MAX_INTER_COUNTERPARTY_SLOTS = 15;

function parseNum(s) {
  if (s === undefined || s === null || s === "") return 0;
  const t = String(s).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function parseIntSafe(s) {
  const n = Math.floor(Number(String(s).replace(/\D/g, "") || "0"));
  return Number.isFinite(n) ? n : 0;
}

/** IDs não vazios e sem repetir (formulário). */
function collectInterCompanyIdsFromSlots(slots) {
  const raw = Array.isArray(slots) ? slots : [];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const id = String(x ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function roundMoney2(x) {
  return Math.round(Number(x) * 100) / 100;
}

/** Soma `deltaMonths` a uma data AAAA-MM-DD (meio-dia local). */
function addMonthsToISODate(iso, deltaMonths) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
  dt.setMonth(dt.getMonth() + deltaMonths);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/**
 * Cronograma mensal: data da parcela 1 na tabela como âncora; demais vencimentos mensais se em branco; parcela contratual ou divisão do bruto; valores pagos por linha.
 */
function buildBankScheduleFromSimpleForm(form) {
  const n = Math.min(Math.max(parseIntSafe(form.installments_total), 0), MAX_PARCELAS_VALOR_MANUAL);
  if (n <= 0) {
    return {
      ok: false,
      error: "Informe o número de parcelas.",
      amounts: [],
      dates: [],
      paidAmounts: [],
      firstDue: "",
    };
  }
  const rows = form.bank_schedule_rows || [];
  const d0 =
    String(form.bank_simple_first_date || "").trim() ||
    String(rows[0]?.due_date || "").trim() ||
    String(form.loan_disbursement_date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d0)) {
    return {
      ok: false,
      error: "Informe a data da primeira parcela (contrato).",
      amounts: [],
      dates: [],
      paidAmounts: [],
      firstDue: "",
    };
  }

  const total = parseNum(form.total_contract_value);
  const parcelaRef = parseNum(form.installment_amount);
  const each = parcelaRef > 0 ? parcelaRef : n > 0 ? roundMoney2(total / n) : 0;
  if (each <= 0 || !Number.isFinite(each)) {
    return {
      ok: false,
      error:
        "Informe o valor bruto e o nº de parcelas, ou a parcela mensal de referência (R$), para formar o valor contratual de cada prestação.",
      amounts: [],
      dates: [],
      paidAmounts: [],
      firstDue: "",
    };
  }

  const dates = [];
  for (let i = 0; i < n; i++) {
    const raw = String(rows[i]?.due_date || "").trim();
    const di = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : addMonthsToISODate(d0, i);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(di)) {
      return {
        ok: false,
        error: `Data inválida na parcela ${i + 1}.`,
        amounts: [],
        dates: [],
        paidAmounts: [],
        firstDue: "",
      };
    }
    dates.push(di);
  }

  const amounts = Array.from({ length: n }, () => String(each));
  const paidAmounts = [];
  for (let i = 0; i < n; i++) {
    const p = String(rows[i]?.paid_amount ?? "").trim();
    paidAmounts.push(p !== "" ? roundMoney2(parseNum(p)) : null);
  }

  return { ok: true, amounts, dates, paidAmounts, firstDue: d0 };
}

export default function LoanControl() {
  const { theme } = useTheme();
  const { canEditTab, isAdminEmail, internalStaffFullAccess } = useCloudAccess();
  const canEditLoan = canEditTab("LoanControl");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("bancario");
  /** Mês e ano de referência (igual Empresas): qual parcela “cai” nesse mês/ano a partir da 1ª parcela */
  const [filterDate, setFilterDate] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const uid = auth.currentUser?.uid;
  const { officePeerUids: officeUids, stableOfficeUidsKey, officeToken } = useWorkspacePeerUids();
  const officeWideCompanies = Boolean(isAdminEmail || internalStaffFullAccess);

  const companiesQueryKey = useMemo(
    () => ["companies", "loanControl", uid, officeToken, stableOfficeUidsKey, officeWideCompanies],
    [uid, officeToken, stableOfficeUidsKey, officeWideCompanies]
  );

  const { data: companies = [] } = useQuery({
    queryKey: companiesQueryKey,
    queryFn: async () => {
      if (!auth.currentUser) return [];
      const currentUserUid = auth.currentUser.uid;
      
      let allCompanies;
      if (officeWideCompanies) {
        const all = await dbClient.entities.Company.listAll();
        if (!Array.isArray(all)) return [];
        allCompanies = [...all].sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" })
        );
      } else {
        const uidList = officeUids.length > 0 ? officeUids : [auth.currentUser.uid];
        const merged = await mergeIndexedDocs((u) => dbClient.entities.Company.list(u), uidList);
        allCompanies = [...merged].sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" })
        );
      }
      
      // Now filter the companies based on assigned_company_token or ownership
      return allCompanies.filter((company) => {
        const companyToken = String(company.assigned_company_token || "").trim();
        const userOfficeToken = String(officeToken || "").trim();
        
        // If company has a token, only show it to users with that token
        if (companyToken) {
          return userOfficeToken === companyToken;
        }
        
        // If company doesn't have a token, only show it to the owner (the user who created it)
        return String(company.uid || "").trim() === String(currentUserUid).trim();
      });
    },
    enabled: !!uid,
    retry: false,
  });

  const { data: loans = [] } = useQuery({
    queryKey: ["loanControls", uid],
    queryFn: () => (uid ? dbClient.entities.LoanControl.list(uid) : []),
    enabled: !!uid,
    retry: false,
  });

  const companyName = (id) => companies.find((c) => c.id === id)?.name || "—";

  const bankLoans = useMemo(
    () => loans.filter((l) => (l.loan_kind || "bancario") === "bancario"),
    [loans]
  );
  const interLoans = useMemo(
    () => loans.filter((l) => l.loan_kind === "entre_empresas"),
    [loans]
  );

  const saveMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      if (!canEditLoan) throw new Error("Sem permissão para alterar empréstimos.");
      if (!uid) throw new Error("Faça login.");
      if (id) return dbClient.entities.LoanControl.update(id, payload);
      return dbClient.entities.LoanControl.create({ ...payload, uid });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loanControls"] });
      closeDialog();
    },
    onError: (err) => {
      console.error(err);
      window.alert(
        err?.message || "Não foi possível salvar o empréstimo. Verifique a conexão e tente de novo."
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => {
      if (!canEditLoan) throw new Error("Sem permissão para alterar empréstimos.");
      return dbClient.entities.LoanControl.delete(id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["loanControls"] }),
  });

  const bumpPaidMutation = useMutation({
    mutationFn: ({ id, next }) => {
      if (!canEditLoan) throw new Error("Sem permissão para alterar empréstimos.");
      return dbClient.entities.LoanControl.update(id, { installments_paid: next });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["loanControls"] }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const openNew = (kind) => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      loan_kind: kind,
      installment_schedule: kind === "bancario" ? "variavel" : "fixa",
      installment_amounts: [],
      installment_due_dates: [],
      loan_total_paid: "",
      installment_frequency_unit: "mes",
      installment_frequency_step: "1",
      bank_schedule_rows: [],
      bank_simple_first_date: "",
      inter_monthly_rows: [],
      inter_party_balance_rows: [],
      inter_pay_company_ids: [],
      inter_receive_company_ids: [],
    });
    setDialogOpen(true);
  };

  const openEdit = (loan) => {
    setEditingId(loan.id);
    const isVariavel = loan.installment_schedule === "variavel" && Array.isArray(loan.installment_amounts);
    const isBancario = (loan.loan_kind || "bancario") === "bancario";
    const contractMonthly = parseNum(loan.installment_contract_monthly);
    let installmentAmountStr = "";
    if (isBancario && contractMonthly > 0) {
      installmentAmountStr = String(contractMonthly);
    } else if (isBancario && isVariavel && Array.isArray(loan.installment_amounts) && loan.installment_amounts.length > 0) {
      installmentAmountStr = String(loan.installment_amounts[0] ?? "");
    } else if (loan.installment_amount !== undefined && loan.installment_amount !== null) {
      installmentAmountStr = String(loan.installment_amount);
    }
    const nSchedule = Math.min(
      MAX_PARCELAS_VALOR_MANUAL,
      Math.max(0, parseIntSafe(String(loan.installments_total ?? 0)))
    );
    const datesSaved = Array.isArray(loan.installment_due_dates) ? loan.installment_due_dates : [];
    const paidsSaved = Array.isArray(loan.installment_paid_amounts) ? loan.installment_paid_amounts : [];
    const bank_schedule_rows = [];
    const firstSaved = String(loan.first_due_date || "").trim();
    for (let i = 0; i < nSchedule; i++) {
      const dr = datesSaved[i];
      const pr = paidsSaved[i];
      let due = dr != null && String(dr).trim() ? String(dr).trim() : "";
      if (i === 0 && !due && /^\d{4}-\d{2}-\d{2}$/.test(firstSaved)) due = firstSaved;
      bank_schedule_rows.push({
        due_date: due,
        paid_amount:
          pr !== undefined && pr !== null && String(pr).trim() !== "" ? String(pr) : "",
      });
    }
    const fuRaw = String(loan.installment_frequency_unit || "mes").toLowerCase();
    const prIds = loan.loan_kind === "entre_empresas" ? getInterPayReceiveCompanyIds(loan) : { pay: [], receive: [] };
    const interRows =
      Array.isArray(loan.inter_monthly_balances) && loan.loan_kind === "entre_empresas"
        ? normalizeInterMonthlyBalances(loan.inter_monthly_balances).map((r) => ({
            period: `${r.year}-${String(r.month).padStart(2, "0")}`,
            balance: String(r.balance),
          }))
        : [];
    let interPartyBalanceRows = [];
    const existingParty = normalizeInterPartyBalanceEntries(loan.inter_party_balance_entries);
    if (existingParty.length > 0) {
      interPartyBalanceRows = existingParty.map((e) => ({
        party_company_id: e.party_company_id,
        direction: e.direction,
        period: `${e.year}-${String(e.month).padStart(2, "0")}`,
        balance: String(e.balance),
      }));
    } else if (loan.loan_kind === "entre_empresas" && interRows.length > 0 && prIds.pay.length + prIds.receive.length > 0) {
      const onlyPay = prIds.pay.length > 0 && prIds.receive.length === 0;
      const onlyRec = prIds.receive.length > 0 && prIds.pay.length === 0;
      if (onlyPay || onlyRec) {
        for (const row of interRows) {
          const ids = onlyPay ? prIds.pay : prIds.receive;
          const direction = onlyPay ? "pagar" : "receber";
          for (const pid of ids) {
            interPartyBalanceRows.push({
              party_company_id: pid,
              direction,
              period: row.period,
              balance: row.balance,
            });
          }
        }
      }
    }
    const interMonthlyRowsForForm = interPartyBalanceRows.length > 0 ? [] : interRows;
    const simpleFirstDate =
      /^\d{4}-\d{2}-\d{2}$/.test(firstSaved)
        ? firstSaved
        : /^\d{4}-\d{2}-\d{2}$/.test(String(bank_schedule_rows[0]?.due_date || "").trim())
          ? String(bank_schedule_rows[0]?.due_date).trim()
          : String(loan.loan_disbursement_date || "").trim();
    setForm({
      loan_kind: loan.loan_kind || "bancario",
      title: loan.title || "",
      bank_name: loan.bank_name || "",
      card_company_id:
        (loan.loan_kind || "bancario") === "bancario"
          ? loan.linked_company_id || ""
          : inferInterAnchorCompanyId(loan),
      inter_pay_company_ids: loan.loan_kind === "entre_empresas" ? [...prIds.pay] : [],
      inter_receive_company_ids: loan.loan_kind === "entre_empresas" ? [...prIds.receive] : [],
      total_contract_value:
        loan.total_contract_value !== undefined && loan.total_contract_value !== null
          ? String(loan.total_contract_value)
          : "",
      installments_total:
        loan.installments_total !== undefined && loan.installments_total !== null
          ? String(loan.installments_total)
          : "",
      installment_amount: installmentAmountStr,
      installments_paid: String(loan.installments_paid ?? 0),
      manual_balance_current:
        loan.manual_balance_current !== undefined &&
        loan.manual_balance_current !== null &&
        loan.manual_balance_current !== ""
          ? String(loan.manual_balance_current)
          : "",
      first_due_date: loan.first_due_date || "",
      notes: loan.notes || "",
      installment_schedule: isBancario ? "variavel" : isVariavel ? "variavel" : "fixa",
      installment_amounts: [],
      installment_due_dates: [],
      bank_schedule_rows,
      bank_simple_first_date: simpleFirstDate,
      loan_total_paid:
        loan.loan_total_paid !== undefined && loan.loan_total_paid !== null
          ? String(loan.loan_total_paid)
          : "",
      installment_frequency_unit: ["dia", "mes", "ano"].includes(fuRaw) ? fuRaw : "mes",
      installment_frequency_step:
        loan.installment_frequency_step !== undefined && loan.installment_frequency_step !== null
          ? String(loan.installment_frequency_step)
          : "1",
      loan_transaction_costs:
        loan.loan_transaction_costs !== undefined && loan.loan_transaction_costs !== null
          ? String(loan.loan_transaction_costs)
          : "",
      loan_disbursement_date: loan.loan_disbursement_date || "",
      inter_monthly_rows: interMonthlyRowsForForm,
      inter_party_balance_rows: interPartyBalanceRows,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!canEditLoan) {
      window.alert("Sem permissão para alterar empréstimos.");
      return;
    }
    const total = parseNum(form.total_contract_value);
    const nParc = parseIntSafe(form.installments_total);
    let paid = Math.min(nParc, Math.max(0, parseIntSafe(form.installments_paid)));
    const manualStr = String(form.manual_balance_current || "").trim();
    let completedBank = null;

    if (!form.title.trim()) {
      window.alert("Informe um nome / identificação do empréstimo.");
      return;
    }
    const cardCo = String(form.card_company_id || "").trim();
    if (!cardCo) {
      window.alert("Selecione a empresa (nome que aparece como título do card).");
      return;
    }
    if (form.loan_kind === "entre_empresas") {
      const payIds = collectInterCompanyIdsFromSlots(form.inter_pay_company_ids);
      const recIds = collectInterCompanyIdsFromSlots(form.inter_receive_company_ids);
      if (payIds.length === 0 && recIds.length === 0) {
        window.alert("Informe ao menos uma empresa a pagar ou uma empresa a receber.");
        return;
      }
      const overlap = payIds.some((id) => recIds.includes(id));
      if (overlap) {
        window.alert("A mesma empresa não pode estar em \"a pagar\" e em \"a receber\" ao mesmo tempo.");
        return;
      }
      if (payIds.includes(cardCo) || recIds.includes(cardCo)) {
        window.alert("A empresa do card não pode constar nas listas a pagar ou a receber.");
        return;
      }
    }

    if (form.loan_kind === "bancario") {
      if (nParc <= 0) {
        window.alert("Informe o número de parcelas.");
        return;
      }
      if (nParc > MAX_PARCELAS_VALOR_MANUAL) {
        window.alert(
          `O limite é ${MAX_PARCELAS_VALOR_MANUAL} parcelas. Reduza o total ou use outro controle.`
        );
        return;
      }

      completedBank = buildBankScheduleFromSimpleForm(form);
      if (!completedBank.ok) {
        window.alert(completedBank.error);
        return;
      }
    }

    const payload = {
      loan_kind: form.loan_kind,
      title: form.title.trim(),
      bank_name: form.loan_kind === "bancario" ? form.bank_name.trim() : "",
      lender_company_id: "",
      borrower_company_id: "",
      notes: form.notes.trim() || "",
    };

    if (form.loan_kind === "entre_empresas") {
      const anchor = cardCo;
      const payIds = collectInterCompanyIdsFromSlots(form.inter_pay_company_ids);
      const recIds = collectInterCompanyIdsFromSlots(form.inter_receive_company_ids);
      let natureza;
      if (payIds.length > 0 && recIds.length > 0) natureza = "liquido";
      else if (payIds.length > 0) natureza = "pagar";
      else natureza = "receber";

      payload.inter_anchor_company_id = anchor;
      payload.inter_pay_company_ids = payIds;
      payload.inter_receive_company_ids = recIds;
      payload.inter_saldo_natureza = natureza;

      if (payIds.length > 0 && recIds.length === 0) {
        payload.borrower_company_id = anchor;
        payload.lender_company_id = payIds[0] || "";
      } else if (recIds.length > 0 && payIds.length === 0) {
        payload.lender_company_id = anchor;
        payload.borrower_company_id = recIds[0] || "";
      } else {
        payload.borrower_company_id = anchor;
        payload.lender_company_id = recIds[0] || payIds[0] || "";
      }
      const partyRowsForm = form.inter_party_balance_rows || [];
      const partyEntries = [];
      for (const row of partyRowsForm) {
        const pid = String(row.party_company_id || "").trim();
        let dir;
        if (payIds.length > 0 && recIds.length === 0) dir = "pagar";
        else if (recIds.length > 0 && payIds.length === 0) dir = "receber";
        else dir = row.direction === "receber" ? "receber" : "pagar";
        const per = String(row.period || "").trim();
        if (!pid || !/^\d{4}-\d{2}$/.test(per)) continue;
        const balStr = String(row.balance ?? "").trim();
        if (balStr === "") continue;
        const [yStr, mStr] = per.split("-");
        const year = parseInt(yStr, 10);
        const month = parseInt(mStr, 10);
        if (month < 1 || month > 12) continue;
        partyEntries.push({
          party_company_id: pid,
          direction: dir,
          year,
          month,
          balance: parseNum(row.balance),
        });
      }
      const partyTouched = partyRowsForm.some(
        (r) =>
          String(r.party_company_id || "").trim() ||
          String(r.period || "").trim() ||
          String(r.balance ?? "").trim()
      );
      if (partyTouched && partyEntries.length === 0) {
        window.alert(
          "Nos saldos por empresa, cada linha válida precisa de empresa, mês/ano (AAAA-MM) e saldo em R$."
        );
        return;
      }
      if (partyEntries.length > 0) {
        for (const e of partyEntries) {
          const okPagar = payIds.includes(e.party_company_id) && e.direction === "pagar";
          const okReceber = recIds.includes(e.party_company_id) && e.direction === "receber";
          if (!okPagar && !okReceber) {
            window.alert(
              "Cada linha deve usar uma empresa das listas a pagar (com tipo «a pagar») ou a receber (com tipo «a receber»), conforme o cadastro."
            );
            return;
          }
        }
        payload.inter_party_balance_entries = partyEntries;
        payload.inter_monthly_balances = deriveInterMonthlyBalancesFromPartyEntries(partyEntries, natureza);
      } else {
        const byKey = new Map();
        for (const row of form.inter_monthly_rows || []) {
          const p = String(row.period || "").trim();
          if (!/^\d{4}-\d{2}$/.test(p)) continue;
          const [yStr, mStr] = p.split("-");
          const year = parseInt(yStr, 10);
          const month = parseInt(mStr, 10);
          if (month < 1 || month > 12) continue;
          const balance = parseNum(row.balance);
          byKey.set(p, { year, month, balance });
        }
        const interBalances = Array.from(byKey.values()).sort((a, b) =>
          a.year !== b.year ? a.year - b.year : a.month - b.month
        );
        const rowsIn = form.inter_monthly_rows || [];
        const hasAnyInput = rowsIn.some(
          (r) => String(r.period || "").trim() || String(r.balance ?? "").trim()
        );
        if (hasAnyInput && interBalances.length === 0) {
          window.alert(
            "Informe ao menos um mês e ano válidos (AAAA-MM) e o saldo final em R$ em cada linha que preencher."
          );
          return;
        }
        payload.inter_monthly_balances = interBalances;
        if (editingId) payload.inter_party_balance_entries = deleteField();
      }
      payload.total_contract_value = 0;
      payload.installments_total = 0;
      payload.installments_paid = 0;
      payload.installment_amount = 0;
      payload.first_due_date = "";
      if (editingId) {
        payload.manual_balance_current = deleteField();
        payload.installment_schedule = deleteField();
        payload.installment_amounts = deleteField();
        payload.installment_due_dates = deleteField();
        payload.installment_contract_monthly = deleteField();
        payload.installment_paid_amounts = deleteField();
        payload.juros_apropriar_manual_por_mes = deleteField();
        payload.loan_total_paid = deleteField();
        payload.installment_frequency_unit = deleteField();
        payload.installment_frequency_step = deleteField();
        payload.juros_apropriar_valor = deleteField();
        payload.loan_principal_disbursed = deleteField();
        payload.loan_transaction_costs = deleteField();
        payload.loan_disbursement_date = deleteField();
        payload.linked_company_id = deleteField();
      }
    } else {
      payload.total_contract_value = total;
      payload.installments_total = nParc;
      payload.installments_paid = paid;
      payload.linked_company_id = cardCo;
      /** Mesmo montante: valor bruto do contrato = base creditada / passivo inicial antes de custos (CPC). */
      payload.loan_principal_disbursed = total;
      if (form.loan_kind === "bancario" && completedBank) {
        payload.installment_schedule = "variavel";
        payload.installment_amounts = completedBank.amounts.map((s) => parseNum(s));
        payload.installment_due_dates = completedBank.dates.map((s) => String(s ?? "").trim());
        payload.installment_amount = 0;
        payload.first_due_date = String(completedBank.firstDue || "").trim();
        payload.loan_disbursement_date = String(completedBank.firstDue || "").trim();
        payload.installment_frequency_unit = "mes";
        payload.installment_frequency_step = 1;
        const pref = parseNum(form.installment_amount);
        if (pref > 0) payload.installment_contract_monthly = pref;
        else if (editingId) payload.installment_contract_monthly = deleteField();
        const paidList = completedBank.paidAmounts || [];
        const anyPaid = paidList.some((x) => x != null && Number(x) > 0);
        if (anyPaid) payload.installment_paid_amounts = paidList;
        else if (editingId) payload.installment_paid_amounts = deleteField();
      } else {
        payload.first_due_date = form.first_due_date.trim() || "";
        if (editingId) {
          payload.installment_schedule = deleteField();
          payload.installment_amounts = deleteField();
          payload.installment_due_dates = deleteField();
        }
        payload.installment_amount = parseNum(form.installment_amount);
      }
      const totalPagoPayload = parseNum(form.loan_total_paid);
      if (totalPagoPayload > 0) payload.loan_total_paid = totalPagoPayload;
      else if (editingId) payload.loan_total_paid = deleteField();
      if (!(form.loan_kind === "bancario" && completedBank)) {
        const fu = String(form.installment_frequency_unit || "mes").toLowerCase();
        payload.installment_frequency_unit = ["dia", "mes", "ano"].includes(fu) ? fu : "mes";
        payload.installment_frequency_step = Math.max(1, parseIntSafe(String(form.installment_frequency_step || "1")));
      }

      if (form.loan_kind === "bancario" && editingId) {
        payload.manual_balance_current = deleteField();
        payload.juros_apropriar_valor = deleteField();
        payload.juros_apropriar_manual_por_mes = deleteField();
      }

      if (!(form.loan_kind === "bancario" && completedBank)) {
        const disbStr = String(form.loan_disbursement_date || "").trim();
        if (disbStr === "") {
          if (editingId) payload.loan_disbursement_date = deleteField();
        } else {
          payload.loan_disbursement_date = disbStr;
        }
      }

      const txStr = String(form.loan_transaction_costs || "").trim();
      if (txStr === "") {
        if (editingId) payload.loan_transaction_costs = deleteField();
      } else {
        const txNum = parseNum(txStr);
        if (total > 0 && txNum >= total) {
          window.alert(
            "Os custos de transação (CPC 08 / CPC 48) precisam ser menores que o valor bruto do contrato (creditado) para formar o custo amortizado inicial."
          );
          return;
        }
        payload.loan_transaction_costs = txNum;
      }
      if (editingId) {
        payload.inter_monthly_balances = deleteField();
        payload.inter_party_balance_entries = deleteField();
        payload.inter_saldo_natureza = deleteField();
        payload.inter_anchor_company_id = deleteField();
        payload.inter_pay_company_ids = deleteField();
        payload.inter_receive_company_ids = deleteField();
      }
      if (form.loan_kind !== "bancario") {
        if (editingId) {
          if (manualStr === "") {
            payload.manual_balance_current = deleteField();
          } else {
            payload.manual_balance_current = parseNum(manualStr);
          }
        } else if (manualStr !== "") {
          payload.manual_balance_current = parseNum(manualStr);
        }
      }
    }

    saveMutation.mutate({ id: editingId, payload });
  };

  const cardBg = theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const muted = theme === "dark" ? "text-gray-400" : "text-gray-600";

  const monthRef = filterDate || new Date();

  const renderLoanCard = (loan) => {
    const ref = monthRef;
    const m = computeLoanMetrics(loan, ref);
    const {
      cpc: cpcMetrics,
      outstanding: outstandingList,
      diffContratoPago,
    } = computeCpcLoanView(loan, ref);
    const jurosDeclaradoRaw = loan.juros_apropriar_valor;
    const hasJurosDeclarado =
      jurosDeclaradoRaw !== undefined && jurosDeclaradoRaw !== null && String(jurosDeclaradoRaw).trim() !== "";
    const jurosDeclaradoNum = hasJurosDeclarado ? parseNum(String(jurosDeclaradoRaw)) : 0;
    const nTot = Math.max(0, Math.floor(parseIntSafe(loan.installments_total)));
    const cal = getLoanCalendarMonthContext(loan, ref);
    const partyStored = normalizeInterPartyBalanceEntries(loan.inter_party_balance_entries);
    const isInterMensal =
      loan.loan_kind === "entre_empresas" &&
      (Array.isArray(loan.inter_monthly_balances) || partyStored.length > 0);
    const isInterLegacy =
      loan.loan_kind === "entre_empresas" &&
      !Array.isArray(loan.inter_monthly_balances) &&
      partyStored.length === 0;
    const interNat = getInterSaldoNaturezaLoan(loan);
    const interPr =
      loan.loan_kind === "entre_empresas" ? getInterPayReceiveCompanyIds(loan) : { pay: [], receive: [] };
    const interAnchorId = loan.loan_kind === "entre_empresas" ? inferInterAnchorCompanyId(loan) : "";
    const payNamesStr = interPr.pay.map((id) => companyName(id)).join(", ");
    const recNamesStr = interPr.receive.map((id) => companyName(id)).join(", ");
    const anchorTitle =
      loan.loan_kind === "entre_empresas"
        ? companyName(interAnchorId) || loan.title || "Empréstimo"
        : loan.linked_company_id
          ? companyName(loan.linked_company_id)
          : loan.title || "Empréstimo";
    const stLt =
      loan.loan_kind === "bancario" ? computeOutstandingShortLongSplit(loan, ref) : null;

    return (
      <Card key={loan.id} className={cn("p-4 border", cardBg)}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-base truncate">{anchorTitle}</h3>
              {loan.loan_kind === "entre_empresas" && loan.title?.trim() && (
                <p className={cn("text-sm truncate", muted)}>{loan.title}</p>
              )}
              {loan.loan_kind === "bancario" && loan.title?.trim() && (
                <p className={cn("text-sm truncate", muted)}>{loan.title}</p>
              )}
              {loan.loan_kind === "bancario" && loan.bank_name && (
                <p className={cn("text-sm", muted)}>{loan.bank_name}</p>
              )}
              {loan.loan_kind === "bancario" && (
                <p className="text-xs text-sky-600 dark:text-sky-400 mt-0.5">
                  Prestações em calendário <strong>mensal</strong> (datas podem ser ajustadas por parcela no cadastro).
                </p>
              )}
              {loan.loan_kind === "entre_empresas" && (
                <div className={cn("text-sm mt-1 space-y-1", muted)}>
                  {interPr.pay.length > 0 && (
                    <p>
                      <span className="text-foreground/90 font-medium">A pagar: </span>
                      <span className="text-amber-600 dark:text-amber-400 font-medium">{payNamesStr}</span>
                    </p>
                  )}
                  {interPr.receive.length > 0 && (
                    <p>
                      <span className="text-foreground/90 font-medium">A receber: </span>
                      <span className="text-sky-600 dark:text-sky-400 font-medium">{recNamesStr}</span>
                    </p>
                  )}
                  <p className="text-xs">
                    {interNat === "liquido" ? (
                      <>
                        Saldo mensal <strong className="text-foreground">líquido</strong> da empresa do card (valores{" "}
                        <strong>positivos</strong> = a receber líquido; <strong>negativos</strong> = a pagar líquido).
                      </>
                    ) : (
                      <>
                        Saldo da <strong className="text-foreground">{companyName(interAnchorId)}</strong> como{" "}
                        <strong className="text-foreground">
                          {interNat === "receber" ? "a receber" : "a pagar"}
                        </strong>
                        .
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 shrink-0 justify-end items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-emerald-600/35 text-emerald-800 dark:text-emerald-300"
                title={`Baixar PDF — ${ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`}
                onClick={() =>
                  exportLoanOperationPdf(loan, ref, companyName, {
                    userEmail: auth.currentUser?.email || undefined,
                  })
                }
              >
                <FileDown className="w-4 h-4 shrink-0" />
                Baixar PDF
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!canEditLoan}
                onClick={() => openEdit(loan)}
                title="Editar"
              >
                <Pencil className="w-4 h-4 text-indigo-400" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!canEditLoan}
                onClick={() => {
                  if (window.confirm("Excluir este registro de empréstimo?")) deleteMutation.mutate(loan.id);
                }}
                title="Excluir"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </Button>
            </div>
          </div>

          {isInterMensal ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-black/5 dark:bg-white/5 p-2">
                <p className={cn("text-xs uppercase tracking-wide", muted)}>
                  Saldo final —{" "}
                  {interNat === "liquido"
                    ? "líquido (+/−)"
                    : interNat === "receber"
                      ? "a receber"
                      : "a pagar"}{" "}
                  (mês/ano)
                </p>
                <p className="font-semibold text-lg">
                  {m.saldoMesReferencia != null ? formatBRL(m.saldoMesReferencia) : "—"}
                </p>
                {m.saldoMesReferencia == null && (
                  <p className="text-[10px] text-muted-foreground">Sem lançamento neste mês/ano</p>
                )}
              </div>
              <div className="rounded-md bg-black/5 dark:bg-white/5 p-2">
                <p className={cn("text-xs uppercase tracking-wide", muted)}>Meses com saldo cadastrado</p>
                <p className="font-semibold text-lg">{m.mesesLancados ?? 0}</p>
              </div>
            </div>
          ) : null}
          {isInterMensal && Array.isArray(m.interPartyHits) && m.interPartyHits.length > 0 && (
            <div className={cn("text-xs rounded-md border p-2 space-y-1", muted)}>
              <p className="font-medium text-foreground">Neste mês/ano, por empresa</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {m.interPartyHits.map((h, i) => (
                  <li key={`${h.party_company_id}-${h.direction}-${i}`}>
                    <span className="text-foreground font-medium">{companyName(h.party_company_id)}</span>
                    {h.direction === "pagar" ? " — a pagar: " : " — a receber: "}
                    <span className="tabular-nums font-semibold text-foreground">{formatBRL(h.balance)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!isInterMensal ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="rounded-md bg-black/5 dark:bg-white/5 p-2">
                <p className={cn("text-xs uppercase tracking-wide", muted)}>
                  {loan.loan_kind === "entre_empresas" && interNat === "liquido"
                    ? "Saldo líquido"
                    : loan.loan_kind === "entre_empresas" && interNat === "receber"
                      ? "Saldo a receber"
                      : "Saldo a pagar"}
                </p>
                <p className="font-semibold text-lg">{formatBRL(m.saldoDevedor)}</p>
                {m.mode === "manual" && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">Saldo informado manualmente</p>
                )}
                {m.mode === "total_pago" && loan.loan_kind === "bancario" && (
                  <p className="text-[10px] text-muted-foreground">Saldo = bruto − total já pago</p>
                )}
              </div>
              <div className="rounded-md bg-black/5 dark:bg-white/5 p-2">
                <p className={cn("text-xs uppercase tracking-wide", muted)}>Parcela atual</p>
                <p className="font-semibold text-lg">
                  {m.proximaParcela != null ? `${m.proximaParcela} / ${nTot || "—"}` : nTot ? "Quitado" : "—"}
                </p>
                {loan.loan_kind === "bancario" && m.proximaParcela != null && m.valorProximaParcela != null && (
                  <p className="text-[11px] font-medium text-foreground mt-0.5">
                    Valor: {formatBRL(m.valorProximaParcela)}
                  </p>
                )}
              </div>
              <div className="rounded-md bg-black/5 dark:bg-white/5 p-2">
                <p className={cn("text-xs uppercase tracking-wide", muted)}>Parcelas pagas</p>
                <p className="font-semibold">{m.parcelasPagas}</p>
              </div>
              <div className="rounded-md bg-black/5 dark:bg-white/5 p-2">
                <p className={cn("text-xs uppercase tracking-wide", muted)}>Faltam (qtd)</p>
                <p className="font-semibold">{m.parcelasRestantes}</p>
              </div>
            </div>
          ) : null}
          {loan.loan_kind === "bancario" && !isInterMensal && stLt ? (
            <div
              className={cn(
                "rounded-lg border p-3 space-y-2 text-sm",
                theme === "dark" ? "border-amber-900/50 bg-amber-950/20" : "border-amber-200 bg-amber-50/80"
              )}
            >
              <p className={cn("text-xs font-semibold uppercase tracking-wide", muted)}>
                Remanescente mensal · curto vs longo prazo
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-md bg-black/5 dark:bg-white/5 p-2">
                  <p className={cn("text-[10px] uppercase tracking-wide", muted)}>Nominal total em aberto</p>
                  <p className="font-semibold text-lg tabular-nums">{formatBRL(stLt.totalNominal)}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Soma das parcelas ainda não contadas como pagas pelo cronograma. Pode diferir da coluna
                    «Saldo» se usar total já pago ou saldo CPC.
                  </p>
                </div>
                <div className="rounded-md bg-black/5 dark:bg-white/5 p-2">
                  <p className={cn("text-[10px] uppercase tracking-wide", muted)}>
                    Circulante (curto — vence em até 12 meses)
                  </p>
                  <p className="font-semibold text-lg tabular-nums text-amber-800 dark:text-amber-300">
                    {formatBRL(stLt.curto)}
                  </p>
                </div>
                <div className="rounded-md bg-black/5 dark:bg-white/5 p-2">
                  <p className={cn("text-[10px] uppercase tracking-wide", muted)}>
                    Não circulante (longo — além de 12 meses)
                  </p>
                  <p className="font-semibold text-lg tabular-nums text-indigo-800 dark:text-indigo-300">
                    {formatBRL(stLt.longo)}
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Critério: soma nominal das parcelas em aberto com vencimento até{" "}
                <strong>{stLt.horizonEnd.toLocaleDateString("pt-BR")}</strong> → curto; o restante → longo (horizonte 12 meses após o fim do mês de{" "}
                {ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}).
              </p>
            </div>
          ) : null}
          {loan.loan_kind === "bancario" && !isInterMensal && parseNum(loan.loan_total_paid) > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Total já pago no cadastro:{" "}
              <strong className="text-foreground">{formatBRL(parseNum(loan.loan_total_paid))}</strong>
              . Para ajustar quantidade paga, altere esse valor em <strong>Editar</strong> (os botões +/− de parcelas ficam
              desativados enquanto houver total já pago).
            </p>
          )}

          {loan.loan_kind === "entre_empresas" && (
            <div className={cn("text-xs rounded-md border border-dashed p-2", muted)}>
              {interNat === "liquido" ? (
                <>
                  <strong className="text-foreground">{companyName(interAnchorId)}</strong> — saldo líquido{" "}
                  {isInterMensal && m.saldoMesReferencia != null
                    ? `neste mês/ano: ${formatBRL(m.saldoMesReferencia)}`
                    : isInterMensal
                      ? "neste mês/ano: — (sem lançamento)"
                      : `: ${formatBRL(m.saldoDevedor)}`}
                  . A pagar: {payNamesStr || "—"}. A receber de: {recNamesStr || "—"}.
                </>
              ) : interNat === "pagar" ? (
                <>
                  <strong className="text-foreground">{companyName(interAnchorId)}</strong>{" "}
                  {isInterMensal && m.saldoMesReferencia != null
                    ? `deve ${formatBRL(m.saldoMesReferencia)} neste mês/ano`
                    : isInterMensal
                      ? "— sem saldo neste mês/ano"
                      : `deve ${formatBRL(m.saldoDevedor)}`}
                  {payNamesStr ? ` (a: ${payNamesStr})` : ""}
                </>
              ) : (
                <>
                  <strong className="text-foreground">{companyName(interAnchorId)}</strong>{" "}
                  {isInterMensal && m.saldoMesReferencia != null
                    ? `tem a receber ${formatBRL(m.saldoMesReferencia)} neste mês/ano`
                    : isInterMensal
                      ? "— sem saldo neste mês/ano"
                      : `tem a receber ${formatBRL(m.saldoDevedor)}`}
                  {recNamesStr ? ` (de: ${recNamesStr})` : ""}
                </>
              )}
            </div>
          )}

          <div
            className={cn(
              "text-xs rounded-md border p-2.5 space-y-1",
              theme === "dark" ? "border-indigo-900/60 bg-indigo-950/30" : "border-indigo-200 bg-indigo-50/80"
            )}
          >
            <p
              className={cn(
                "font-medium",
                theme === "dark" ? "text-indigo-200" : "text-indigo-900"
              )}
            >
              Mês e ano de referência:{" "}
              <span className="tabular-nums">
                {ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </span>
            </p>
            {cal.kind === "inter_saldo" && cal.saldoFinal != null && loan.loan_kind === "entre_empresas" && (
              <p className="text-foreground">
                <strong>
                  Saldo final (
                  {getInterSaldoNaturezaLoan(loan) === "liquido"
                    ? "líquido +/−"
                    : getInterSaldoNaturezaLoan(loan) === "receber"
                      ? "a receber"
                      : "a pagar"}
                  )
                </strong>{" "}
                neste
                mês/ano: <span className="tabular-nums font-semibold">{formatBRL(cal.saldoFinal)}</span>
              </p>
            )}
            {cal.kind === "inter_sem_lancamento" && (
              <p className={muted}>
                Não há saldo final cadastrado para este mês/ano. Total de meses com lançamento:{" "}
                <strong className="text-foreground">{cal.totalMesesCadastrados ?? 0}</strong>.
              </p>
            )}
            {cal.kind === "sem_data" && !isInterMensal && (
              <p className={muted}>
                Cadastre a <strong className="text-foreground">data do pagamento da parcela 1</strong> (tabela no
                empréstimo) para alinhar cada <strong className="text-foreground">mês e ano</strong> do calendário às
                prestações.
              </p>
            )}
            {cal.kind === "sem_parcelas" && !isInterMensal && (
              <p className={muted}>Informe o número de parcelas para usar o calendário mensal.</p>
            )}
            {cal.kind === "antes" && cal.inicio && !isInterMensal && (
              <p className={muted}>
                Neste mês/ano ainda não há parcela: o contrato começa em{" "}
                <strong className="text-foreground">
                  {String(cal.inicio.month).padStart(2, "0")}/{cal.inicio.year}
                </strong>
                .
              </p>
            )}
            {cal.kind === "depois" && !isInterMensal && (
              <p className={muted}>
                Neste mês/ano já não há parcela deste contrato (última foi a parcela {cal.ultimaParcela ?? nTot} de {nTot}).
              </p>
            )}
            {cal.kind === "ok" && cal.parcelaNoMes != null && !isInterMensal && (
              <div className="space-y-0.5">
                <p className="text-foreground">
                  Parcela <strong>{cal.parcelaNoMes}</strong> de {cal.nTot}
                  {cal.situacao === "paga" && (
                    <span className="text-green-600 dark:text-green-400"> — já paga</span>
                  )}
                  {cal.situacao === "a_vencer" && (
                    <span className="text-amber-600 dark:text-amber-400"> — a pagar neste mês/ano</span>
                  )}
                  {cal.situacao === "em_atraso" && (
                    <span className="text-red-600 dark:text-red-400"> — há parcelas anteriores em aberto</span>
                  )}
                </p>
                <p className={muted}>
                  Valor previsto desta parcela: <strong className="text-foreground">{formatBRL(cal.valorParcelaNoMes)}</strong>
                </p>
              </div>
            )}
            {cal.kind === "sem_parcela_mes" && !isInterMensal && (
              <p className={muted}>
                Neste mês/ano <strong className="text-foreground">não há</strong> vencimento nas datas cadastradas (parcelas
                variáveis com calendário próprio). Use o mês de uma parcela em aberto ou a lista abaixo.
              </p>
            )}
          </div>

          {loan.loan_kind === "bancario" && !isInterMensal && outstandingList.length > 0 && (
            <div className={cn("text-xs rounded-md border p-2 space-y-1", muted)}>
              <p className="font-medium text-foreground">Só o que falta pagar (parcelas em aberto)</p>
              <ul className="list-disc pl-4 space-y-0.5 max-h-28 overflow-y-auto">
                {outstandingList.slice(0, 12).map((row) => (
                  <li key={row.index}>
                    Parc. {row.index}: {row.dueDate ? row.dueDate.toLocaleDateString("pt-BR") : "—"} —{" "}
                    <strong className="text-foreground">{formatBRL(row.amount)}</strong>
                  </li>
                ))}
              </ul>
              {outstandingList.length > 12 && (
                <p className="text-[10px]">… e mais {outstandingList.length - 12} parcela(s).</p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Marque manualmente quantas já pagou com +/−; o sistema não altera isso sozinho.
              </p>
            </div>
          )}

          {loan.loan_kind === "bancario" && !isInterMensal && (
            <div
              className={cn(
                "text-xs rounded-md border p-2.5 space-y-1",
                theme === "dark" ? "border-violet-900/50 bg-violet-950/25" : "border-violet-200 bg-violet-50/90"
              )}
            >
              <p className="font-semibold text-violet-900 dark:text-violet-100">
                Juros a apropriar (automático — parcela contratual − valor pago, neste mês)
              </p>
              <p className="text-foreground text-sm">
                <strong className="tabular-nums">{formatBRL(diffContratoPago?.totalMes ?? 0)}</strong>
              </p>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Preencha o <strong>valor pago</strong> na parcela cujo vencimento cai no mês de referência para este total
                refletir a diferença em relação à parcela de referência do contrato.
              </p>
            </div>
          )}

          {loan.loan_kind === "bancario" && !isInterMensal && cpcMetrics && (
            <div
              className={cn(
                "text-xs rounded-md border p-2.5 space-y-1",
                theme === "dark" ? "border-emerald-900/50 bg-emerald-950/25" : "border-emerald-200 bg-emerald-50/90"
              )}
            >
              <p className="font-semibold text-emerald-800 dark:text-emerald-200">
                Referência CPC — taxa efetiva (CPC 12 / CPC 48 / CPC 20)
              </p>
              <p className="text-[10px] text-emerald-900/80 dark:text-emerald-200/80 leading-snug">
                <strong>CPC 12:</strong> fluxos descontados ao valor presente. <strong>CPC 08</strong> (revogado; hoje{" "}
                <strong>CPC 48</strong>): custos de transação reduzem o passivo inicial e elevam a taxa efetiva.{" "}
                <strong>CPC 20:</strong> encargos pelo método da taxa efetiva.
              </p>
              {cpcMetrics.custosTransacao > 0 && (
                <p className="text-foreground text-[11px]">
                  Bruto do contrato (creditado) {formatBRL(cpcMetrics.liberadoBruto)} − custos{" "}
                  {formatBRL(cpcMetrics.custosTransacao)} ={" "}
                  <strong>custo amortizado inicial {formatBRL(cpcMetrics.principalCustoAmortizadoInicial)}</strong>
                </p>
              )}
              <p className="text-foreground">
                Taxa efetiva a.a. (estimada):{" "}
                <strong className="tabular-nums">{(cpcMetrics.taxaEfetivaAnual * 100).toFixed(4)}%</strong>
              </p>
              <p className="text-foreground">
                Juros a apropriar no mês de referência (CPC automático):{" "}
                <strong className="tabular-nums">{formatBRL(cpcMetrics.jurosMes)}</strong>
              </p>
              {hasJurosDeclarado && (
                <p className="text-foreground text-[10px] opacity-90">
                  Legado — valor manual antigo no cadastro:{" "}
                  <strong className="tabular-nums">{formatBRL(jurosDeclaradoNum)}</strong> (não usado no fluxo novo; limpe ao
                  regravar o empréstimo).
                </p>
              )}
              {cpcMetrics.parcelaIndexNoMes != null && (
                <p className={muted}>
                  Prestação com vencimento neste mês (parc. {cpcMetrics.parcelaIndexNoMes}): juros{" "}
                  <strong className="text-foreground">{formatBRL(cpcMetrics.jurosParcelaNoMes ?? 0)}</strong>, principal{" "}
                  <strong className="text-foreground">{formatBRL(cpcMetrics.principalParcelaNoMes ?? 0)}</strong>.
                </p>
              )}
              <p className="text-[10px] opacity-90">
                Base: fluxos descontados na data de liberação, capitalização anual e dias actual/365, alinhado ao método da
                CPC 12 (AVP), CPC 48 (passivo financeiro) e CPC 20. Valide com seu contador conforme o contrato e políticas da
                entidade.
              </p>
            </div>
          )}

          {loan.loan_kind === "bancario" && !isInterMensal && diffContratoPago?.linhas?.length > 0 && (
            <div
              className={cn(
                "text-xs rounded-md border p-2.5 space-y-1",
                theme === "dark" ? "border-sky-900/50 bg-sky-950/20" : "border-sky-200 bg-sky-50/90"
              )}
            >
              <p className="font-semibold text-sky-900 dark:text-sky-100">
                Controle: parcela contratual × valor pago (mês de referência)
              </p>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Só entram parcelas com <strong>valor pago</strong> preenchido no cronograma e com vencimento neste mês. A
                diferença (contratual − pago, mínimo zero) é mostrada como referência de <strong>juros pelo desvio de
                pagamento</strong>, além do juros pela taxa efetiva (CPC), quando houver.
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                {diffContratoPago.linhas.map((row) => (
                  <li key={row.index}>
                    Parc. {row.index} ({row.dueDate.toLocaleDateString("pt-BR")}): contratual{" "}
                    {formatBRL(row.parcelaContratual)} − pago {formatBRL(row.valorPago)} →{" "}
                    <strong className="text-foreground">{formatBRL(row.jurosDiferenca)}</strong>
                  </li>
                ))}
              </ul>
              <p className="text-foreground text-[11px]">
                Total diferença no mês: <strong>{formatBRL(diffContratoPago.totalMes)}</strong>
              </p>
            </div>
          )}

          {!isInterMensal && (
            <div className="flex flex-col gap-2">
              {(loan.loan_kind !== "bancario" || parseNum(loan.loan_total_paid) <= 0) && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("text-xs", muted)}>Ajustar parcelas pagas:</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={!canEditLoan || bumpPaidMutation.isPending || m.parcelasPagas <= 0}
                    onClick={() =>
                      bumpPaidMutation.mutate({
                        id: loan.id,
                        next: Math.max(0, m.parcelasPagas - 1),
                      })
                    }
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium w-8 text-center">{m.parcelasPagas}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={
                      !canEditLoan || bumpPaidMutation.isPending || nTot === 0 || m.parcelasPagas >= nTot
                    }
                    onClick={() =>
                      bumpPaidMutation.mutate({
                        id: loan.id,
                        next: Math.min(nTot, m.parcelasPagas + 1),
                      })
                    }
                  >
                    <PlusCircle className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {isInterLegacy && (
            <p className="text-xs text-amber-600 dark:text-amber-400 rounded-md border border-amber-800/50 p-2">
              Modelo antigo (parcelas). <strong>Edite e salve</strong> para passar a usar só saldo final por mês/ano.
            </p>
          )}

          {loan.first_due_date && !isInterMensal && (
            <p className={cn("text-xs", muted)}>1º pagamento: {loan.first_due_date}</p>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <TabReadOnlyBanner pageKey="LoanControl" />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Controle de empréstimos</h1>
          <p className={cn("text-sm", muted)}>
            <strong className="text-foreground">Mês/ano de referência</strong> alinha calendário, juros automáticos (parcela ×
            pago) e referência CPC em todos os cards.{" "}
            <strong className="text-foreground">Bancário</strong>: valor, custos, parcela de referência, pagamentos por linha.{" "}
            <strong className="text-foreground">Entre empresas</strong>: saldo por empresa e mês (ou saldo líquido único no
            modo misto).
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className={theme === "dark" ? "bg-gray-800" : ""}>
            <TabsTrigger value="bancario" className="gap-1.5">
              <Landmark className="w-4 h-4" />
              Bancários
            </TabsTrigger>
            <TabsTrigger value="entre_empresas" className="gap-1.5">
              <ArrowRightLeft className="w-4 h-4" />
              Entre empresas
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-3">
            <MonthPicker date={monthRef} onChange={setFilterDate} />
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={!canEditLoan}
              onClick={() => openNew(tab === "entre_empresas" ? "entre_empresas" : "bancario")}
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo empréstimo
            </Button>
          </div>
        </div>

        <TabsContent value="bancario" className="space-y-4 mt-0">
          {bankLoans.length === 0 ? (
            <p className={cn("text-center py-12 text-sm", muted)}>Nenhum empréstimo bancário cadastrado.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{bankLoans.map(renderLoanCard)}</div>
          )}
        </TabsContent>

        <TabsContent value="entre_empresas" className="space-y-4 mt-0">
          {companies.length < 2 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Cadastre pelo menos duas empresas em <strong>Empresas</strong> para registrar empréstimos entre elas.
            </p>
          )}
          {interLoans.length === 0 ? (
            <p className={cn("text-center py-12 text-sm", muted)}>
              Nenhum empréstimo entre empresas. Cadastre a <strong>empresa do card</strong>, a{" "}
              <strong>contrapartida</strong> e o <strong>saldo final de cada mês/ano</strong>.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{interLoans.map(renderLoanCard)}</div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent
          aria-describedby={undefined}
          className={cn(
            "max-h-[90vh] overflow-y-auto",
            form.loan_kind === "entre_empresas"
              ? "max-w-xl"
              : form.loan_kind === "bancario"
                ? "max-w-2xl"
                : "max-w-lg"
          )}
        >
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar empréstimo" : "Novo empréstimo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Empresa *</Label>
              <Select
                value={form.card_company_id || undefined}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    card_company_id: v,
                    inter_pay_company_ids: (p.inter_pay_company_ids || []).map((id) =>
                      id === v ? "" : id
                    ),
                    inter_receive_company_ids: (p.inter_receive_company_ids || []).map((id) =>
                      id === v ? "" : id
                    ),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa (título do card)" />
                </SelectTrigger>
                <SelectContent>
                  {companies
                    .slice()
                    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"))
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.loan_kind === "entre_empresas" ? (
                  <>
                    Esta empresa é o <strong>título do card</strong>. Abaixo você escolhe só a{" "}
                    <strong>contrapartida</strong> e se o saldo é <strong>a pagar</strong> ou <strong>a receber</strong>{" "}
                    para ela.
                  </>
                ) : (
                  <>
                    <strong>Tomadora</strong> do contrato bancário — também usada como <strong>título do card</strong>.
                  </>
                )}
              </p>
              {companies.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Cadastre empresas em <strong>Empresas</strong> antes de registrar o empréstimo.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={form.loan_kind}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    loan_kind: v,
                    installment_schedule: v === "bancario" ? "variavel" : p.installment_schedule,
                    installment_amounts: v === "bancario" ? p.installment_amounts : [],
                    installment_due_dates: v === "bancario" ? p.installment_due_dates : [],
                    inter_monthly_rows:
                      v === "entre_empresas" && p.loan_kind === "entre_empresas"
                        ? p.inter_monthly_rows
                        : [],
                    inter_party_balance_rows:
                      v === "entre_empresas" && p.loan_kind === "entre_empresas"
                        ? p.inter_party_balance_rows
                        : [],
                    inter_pay_company_ids:
                      v === "entre_empresas" && p.loan_kind === "entre_empresas"
                        ? p.inter_pay_company_ids
                        : [],
                    inter_receive_company_ids:
                      v === "entre_empresas" && p.loan_kind === "entre_empresas"
                        ? p.inter_receive_company_ids
                        : [],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bancario">Bancário</SelectItem>
                  <SelectItem value="entre_empresas">Entre empresas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nome / contrato *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Ex: Financiamento veículo, linha de crédito…"
              />
            </div>
            {form.loan_kind === "bancario" && (
              <div className="space-y-2">
                <Label>Banco / instituição</Label>
                <Input
                  value={form.bank_name}
                  onChange={(e) => setForm((p) => ({ ...p, bank_name: e.target.value }))}
                  placeholder="Ex: Banco do Brasil"
                />
              </div>
            )}
            {form.loan_kind === "entre_empresas" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Quantidade de empresas a pagar</Label>
                    <Input
                      type="number"
                      min={0}
                      max={MAX_INTER_COUNTERPARTY_SLOTS}
                      value={form.inter_pay_company_ids?.length || 0}
                      onChange={(e) => {
                        const n = Math.min(
                          MAX_INTER_COUNTERPARTY_SLOTS,
                          Math.max(0, parseIntSafe(e.target.value))
                        );
                        setForm((p) => {
                          const prev = [...(p.inter_pay_company_ids || [])];
                          const next = prev.slice(0, n);
                          while (next.length < n) next.push("");
                          return { ...p, inter_pay_company_ids: next };
                        });
                      }}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Quantas empresas diferentes a <strong>empresa do card</strong> deve (uma seleção por linha abaixo).
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantidade de empresas a receber</Label>
                    <Input
                      type="number"
                      min={0}
                      max={MAX_INTER_COUNTERPARTY_SLOTS}
                      value={form.inter_receive_company_ids?.length || 0}
                      onChange={(e) => {
                        const n = Math.min(
                          MAX_INTER_COUNTERPARTY_SLOTS,
                          Math.max(0, parseIntSafe(e.target.value))
                        );
                        setForm((p) => {
                          const prev = [...(p.inter_receive_company_ids || [])];
                          const next = prev.slice(0, n);
                          while (next.length < n) next.push("");
                          return { ...p, inter_receive_company_ids: next };
                        });
                      }}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Quantas empresas das quais a <strong>empresa do card</strong> tem valor a receber.
                    </p>
                  </div>
                </div>
                {(form.inter_pay_company_ids || []).length > 0 && (
                  <div className="space-y-2 rounded-md border p-3 bg-black/[0.03] dark:bg-white/[0.04]">
                    <Label className="text-sm">Empresas a pagar *</Label>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {(form.inter_pay_company_ids || []).map((cid, idx) => (
                        <Select
                          key={`inter-pay-${idx}`}
                          value={cid || "__none__"}
                          onValueChange={(v) =>
                            setForm((p) => {
                              const next = [...(p.inter_pay_company_ids || [])];
                              next[idx] = v === "__none__" ? "" : v;
                              return { ...p, inter_pay_company_ids: next };
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={`Empresa ${idx + 1}`} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Selecione…</SelectItem>
                            {companies
                              .slice()
                              .sort((a, b) =>
                                String(a.name || "").localeCompare(String(b.name || ""), "pt-BR")
                              )
                              .filter((c) => {
                                const cardId = String(form.card_company_id || "").trim();
                                if (cardId && c.id === cardId) return false;
                                const recv = form.inter_receive_company_ids || [];
                                if (recv.includes(c.id)) return false;
                                return true;
                              })
                              .map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ))}
                    </div>
                  </div>
                )}
                {(form.inter_receive_company_ids || []).length > 0 && (
                  <div className="space-y-2 rounded-md border p-3 bg-black/[0.03] dark:bg-white/[0.04]">
                    <Label className="text-sm">Empresas a receber *</Label>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {(form.inter_receive_company_ids || []).map((cid, idx) => (
                        <Select
                          key={`inter-rec-${idx}`}
                          value={cid || "__none__"}
                          onValueChange={(v) =>
                            setForm((p) => {
                              const next = [...(p.inter_receive_company_ids || [])];
                              next[idx] = v === "__none__" ? "" : v;
                              return { ...p, inter_receive_company_ids: next };
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={`Empresa ${idx + 1}`} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Selecione…</SelectItem>
                            {companies
                              .slice()
                              .sort((a, b) =>
                                String(a.name || "").localeCompare(String(b.name || ""), "pt-BR")
                              )
                              .filter((c) => {
                                const cardId = String(form.card_company_id || "").trim();
                                if (cardId && c.id === cardId) return false;
                                const pay = form.inter_pay_company_ids || [];
                                if (pay.includes(c.id)) return false;
                                return true;
                              })
                              .map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ))}
                    </div>
                  </div>
                )}
                {collectInterCompanyIdsFromSlots(form.inter_pay_company_ids).length > 0 &&
                  collectInterCompanyIdsFromSlots(form.inter_receive_company_ids).length > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 rounded-md border border-dashed border-amber-800/40 dark:border-amber-700/50 p-2">
                      Há empresas <strong>a pagar</strong> e <strong>a receber</strong>. Preencha os{" "}
                      <strong>saldos por empresa</strong> (cada linha: empresa, tipo a pagar ou a receber, mês e valor) ou,
                      se preferir, use só o bloco <strong>saldo líquido único por mês</strong> abaixo (positivo = a receber
                      líquido; negativo = a pagar líquido). Se houver linhas válidas por empresa, elas prevalecem sobre o bloco
                      único.
                    </p>
                  )}
              </>
            )}
            {form.loan_kind === "bancario" && (
              <>
                <div className="rounded-lg border border-sky-800/35 dark:border-sky-700/45 p-4 space-y-4 bg-sky-50/80 dark:bg-sky-950/25">
                  <p className="text-sm font-semibold text-sky-900 dark:text-sky-200">
                    Contrato principal (bancário)
                  </p>
                  <div className="space-y-2">
                    <Label>Data da primeira parcela *</Label>
                    <Input
                      type="date"
                      value={form.bank_simple_first_date || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm((p) => {
                          if (p.loan_kind !== "bancario") return { ...p, bank_simple_first_date: val };
                          const nRaw = parseIntSafe(String(p.installments_total || "0"));
                          const n = Math.min(MAX_PARCELAS_VALOR_MANUAL, Math.max(0, nRaw));
                          const prevRows = p.bank_schedule_rows || [];
                          const nextRows = [...prevRows];
                          while (nextRows.length < n) nextRows.push({ due_date: "", paid_amount: "" });
                          nextRows.length = n;
                          if (n > 0 && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
                            for (let i = 0; i < n; i++) {
                              nextRows[i] = {
                                ...(nextRows[i] || {}),
                                due_date: addMonthsToISODate(val, i),
                                paid_amount: nextRows[i]?.paid_amount ?? "",
                              };
                            }
                          }
                          return {
                            ...p,
                            bank_simple_first_date: val,
                            ...(n > 0 ? { bank_schedule_rows: nextRows } : {}),
                          };
                        });
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Esta data monta automaticamente um <strong>calendário mensal</strong> até ao total de parcelas. Você pode
                      ajustar cada vencimento no quadro opcional mais abaixo.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor original do empréstimo (R$) *</Label>
                    <Input
                      value={form.total_contract_value}
                      onChange={(e) => setForm((p) => ({ ...p, total_contract_value: e.target.value }))}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Valor da parcela (R$)</Label>
                      <Input
                        value={form.installment_amount}
                        onChange={(e) => setForm((p) => ({ ...p, installment_amount: e.target.value }))}
                        placeholder="Vazio → divide pelo total de parcelas"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Total de parcelas *</Label>
                      <Input
                        value={form.installments_total}
                        onChange={(e) => {
                          const v = e.target.value;
                          const nRaw = parseIntSafe(v);
                          const n = Math.min(Math.max(nRaw, 0), MAX_PARCELAS_VALOR_MANUAL);
                          const totalStr =
                            nRaw > MAX_PARCELAS_VALOR_MANUAL ? String(MAX_PARCELAS_VALOR_MANUAL) : v;
                          setForm((p) => {
                            const prev = p.bank_schedule_rows || [];
                            const next = [...prev];
                            while (next.length < n) next.push({ due_date: "", paid_amount: "" });
                            if (next.length > n) next.length = n;
                            const d0 = String(p.bank_simple_first_date || "").trim();
                            if (n > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d0)) {
                              for (let i = 0; i < n; i++) {
                                next[i] = {
                                  ...(next[i] || {}),
                                  due_date: addMonthsToISODate(d0, i),
                                  paid_amount: next[i]?.paid_amount ?? "",
                                };
                              }
                            }
                            return { ...p, installments_total: totalStr, bank_schedule_rows: next };
                          });
                        }}
                        placeholder="Ex: 48"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Parcelas já pagas (quantidade)</Label>
                    <Input
                      value={form.installments_paid}
                      onChange={(e) => setForm((p) => ({ ...p, installments_paid: e.target.value }))}
                      placeholder="0"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Quantidade de prestações quitadas ou use <strong>valor já pago no total</strong> abaixo — o sistema
                      calcula quantas foram pagas quando fizer sentido.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Custo da operação — taxas e impostos (R$)</Label>
                  <Input
                    value={form.loan_transaction_costs}
                    onChange={(e) => setForm((p) => ({ ...p, loan_transaction_costs: e.target.value }))}
                    placeholder="0,00"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Tarifas na contratação; na referência CPC reduzem o custo amortizado inicial (bruto − custos).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Valor já pago no total (R$)</Label>
                  <Input
                    value={form.loan_total_paid}
                    onChange={(e) => setForm((p) => ({ ...p, loan_total_paid: e.target.value }))}
                    placeholder="0,00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Soma já quitada. <strong>Saldo devedor = bruto − já pago.</strong> Se deixar{" "}
                    <strong>parcelas pagas</strong> em zero, o sistema ainda pode estimar quantas parcelas já foram pagas a
                    partir deste total e da parcela de referência.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Pagamentos por parcela (detalhe — opcional)</Label>
                  <p className="text-xs text-muted-foreground">
                    Por defeito usa as datas geradas a partir da <strong>primeira parcela</strong>. Ajuste só se precisar de
                    vencimento diferente. Informe <strong>valor pago</strong> quando quiser o controle parcela × juros na
                    diferença «contrato − pagamento».
                  </p>
                  <div className="max-h-56 overflow-y-auto rounded-md border p-2 space-y-2 bg-black/[0.03] dark:bg-white/[0.04]">
                    {(form.bank_schedule_rows || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground px-1">
                        Informe o número de parcelas para listar as linhas.
                      </p>
                    ) : (
                      (form.bank_schedule_rows || []).map((row, idx) => (
                        <div
                          key={idx}
                          className="flex flex-wrap items-end gap-2 border-b border-dashed pb-2 last:border-0 last:pb-0"
                        >
                          <span className="text-xs text-muted-foreground w-8 pt-2">{idx + 1}.</span>
                          <div className="space-y-1 min-w-[140px]">
                            <span className="text-[10px] text-muted-foreground">Data prevista</span>
                            <Input
                              type="date"
                              value={row.due_date || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((p) => {
                                  const next = [...(p.bank_schedule_rows || [])];
                                  next[idx] = { ...next[idx], due_date: val };
                                  return { ...p, bank_schedule_rows: next };
                                });
                              }}
                            />
                          </div>
                          <div className="space-y-1 flex-1 min-w-[120px]">
                            <span className="text-[10px] text-muted-foreground">Valor pago (R$)</span>
                            <Input
                              value={row.paid_amount ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((p) => {
                                  const next = [...(p.bank_schedule_rows || [])];
                                  next[idx] = { ...next[idx], paid_amount: val };
                                  return { ...p, bank_schedule_rows: next };
                                });
                              }}
                              placeholder="Opcional"
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground rounded-md border border-dashed border-emerald-800/30 dark:border-emerald-700/40 p-2 bg-emerald-950/10 dark:bg-emerald-950/20">
                  <strong>Juros a apropriar</strong> não são mais digitados: ao escolher o mês na lista principal, o sistema
                  mostra o total automático (parcela de referência − valor pago) e, em paralelo, a estimativa pela taxa
                  efetiva (CPC), quando os dados permitirem.
                </p>
              </>
            )}
            {form.loan_kind === "entre_empresas" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Saldos por empresa (recomendado)</Label>
                  <p className="text-xs text-muted-foreground">
                    Uma linha por combinação de <strong>empresa contrapartida</strong>, <strong>tipo</strong> (quanto a
                    empresa do card deve a ela ou quanto tem a receber dela), <strong>mês/ano</strong> e <strong>valor</strong>.
                    Cada empresa pode ter meses e valores diferentes. Se preencher ao menos uma linha válida aqui, esse modo
                    prevalece sobre o bloco de saldo único abaixo.
                  </p>
                  <div className="space-y-2 max-h-72 overflow-y-auto rounded-md border p-3 bg-black/[0.03] dark:bg-white/[0.04]">
                    {(form.inter_party_balance_rows || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nenhuma linha. Use &quot;Adicionar linha por empresa&quot; depois de definir as listas a pagar / a
                        receber.
                      </p>
                    ) : (
                      (form.inter_party_balance_rows || []).map((row, idx) => {
                        const payL = collectInterCompanyIdsFromSlots(form.inter_pay_company_ids);
                        const recL = collectInterCompanyIdsFromSlots(form.inter_receive_company_ids);
                        const mixed = payL.length > 0 && recL.length > 0;
                        const dir = mixed ? (row.direction === "receber" ? "receber" : "pagar") : payL.length > 0 ? "pagar" : "receber";
                        const idChoices = dir === "pagar" ? payL : recL;
                        return (
                          <div
                            key={idx}
                            className="flex flex-wrap items-end gap-2 border-b border-dashed pb-2 last:border-0"
                          >
                            {mixed && (
                              <div className="space-y-1 min-w-[140px]">
                                <span className="text-[10px] text-muted-foreground">Tipo</span>
                                <Select
                                  value={row.direction === "receber" ? "receber" : "pagar"}
                                  onValueChange={(v) =>
                                    setForm((p) => {
                                      const next = [...(p.inter_party_balance_rows || [])];
                                      next[idx] = {
                                        ...next[idx],
                                        direction: v === "receber" ? "receber" : "pagar",
                                        party_company_id: "",
                                      };
                                      return { ...p, inter_party_balance_rows: next };
                                    })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pagar">A pagar (à contrapartida)</SelectItem>
                                    <SelectItem value="receber">A receber (da contrapartida)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            <div className="space-y-1 min-w-[160px] flex-1">
                              <span className="text-[10px] text-muted-foreground">Empresa</span>
                              <Select
                                value={row.party_company_id || "__none__"}
                                onValueChange={(v) =>
                                  setForm((p) => {
                                    const next = [...(p.inter_party_balance_rows || [])];
                                    next[idx] = { ...next[idx], party_company_id: v === "__none__" ? "" : v };
                                    return { ...p, inter_party_balance_rows: next };
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione…" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">Selecione…</SelectItem>
                                  {idChoices.map((cid) => (
                                    <SelectItem key={cid} value={cid}>
                                      {companyName(cid)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1 min-w-[140px]">
                              <span className="text-[10px] text-muted-foreground">Mês e ano</span>
                              <Input
                                type="month"
                                value={row.period || ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setForm((p) => {
                                    const next = [...(p.inter_party_balance_rows || [])];
                                    next[idx] = { ...next[idx], period: v };
                                    return { ...p, inter_party_balance_rows: next };
                                  });
                                }}
                              />
                            </div>
                            <div className="space-y-1 min-w-[120px] flex-1">
                              <span className="text-[10px] text-muted-foreground">Saldo (R$)</span>
                              <Input
                                value={row.balance ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setForm((p) => {
                                    const next = [...(p.inter_party_balance_rows || [])];
                                    next[idx] = { ...next[idx], balance: v };
                                    return { ...p, inter_party_balance_rows: next };
                                  });
                                }}
                                placeholder="0,00"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0 text-red-600 hover:text-red-700"
                              onClick={() =>
                                setForm((p) => ({
                                  ...p,
                                  inter_party_balance_rows: (p.inter_party_balance_rows || []).filter((_, i) => i !== idx),
                                }))
                              }
                              aria-label="Remover linha"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const payL = collectInterCompanyIdsFromSlots(form.inter_pay_company_ids);
                      const recL = collectInterCompanyIdsFromSlots(form.inter_receive_company_ids);
                      const dir =
                        payL.length > 0 && recL.length === 0
                          ? "pagar"
                          : recL.length > 0 && payL.length === 0
                            ? "receber"
                            : "pagar";
                      setForm((p) => ({
                        ...p,
                        inter_party_balance_rows: [
                          ...(p.inter_party_balance_rows || []),
                          { party_company_id: "", direction: dir, period: "", balance: "" },
                        ],
                      }));
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar linha por empresa
                  </Button>
                </div>

                <div className="space-y-2 rounded-md border border-dashed p-3">
                  <Label>Saldo único por mês (opcional — modo líquido)</Label>
                  <p className="text-xs text-muted-foreground">
                    Use quando houver <strong>a pagar</strong> e <strong>a receber</strong> ao mesmo tempo e quiser um único
                    saldo líquido por mês (positivo = a receber líquido; negativo = a pagar líquido). Deixe em branco se usar
                    só o bloco por empresa.
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto rounded-md border p-3 bg-black/[0.03] dark:bg-white/[0.04]">
                    {(form.inter_monthly_rows || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhum mês neste bloco.</p>
                    ) : (
                      (form.inter_monthly_rows || []).map((row, idx) => (
                        <div key={idx} className="flex flex-wrap items-end gap-2 border-b border-dashed pb-2 last:border-0">
                          <div className="space-y-1 min-w-[160px]">
                            <span className="text-xs text-muted-foreground">Mês e ano</span>
                            <Input
                              type="month"
                              value={row.period || ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setForm((p) => {
                                  const next = [...(p.inter_monthly_rows || [])];
                                  next[idx] = { ...next[idx], period: v };
                                  return { ...p, inter_monthly_rows: next };
                                });
                              }}
                            />
                          </div>
                          <div className="space-y-1 flex-1 min-w-[140px]">
                            <span className="text-xs text-muted-foreground">Saldo líquido (R$)</span>
                            <Input
                              value={row.balance ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setForm((p) => {
                                  const next = [...(p.inter_monthly_rows || [])];
                                  next[idx] = { ...next[idx], balance: v };
                                  return { ...p, inter_monthly_rows: next };
                                });
                              }}
                              placeholder="0,00"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-red-600 hover:text-red-700"
                            onClick={() =>
                              setForm((p) => ({
                                ...p,
                                inter_monthly_rows: (p.inter_monthly_rows || []).filter((_, i) => i !== idx),
                              }))
                            }
                            aria-label="Remover linha"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        inter_monthly_rows: [...(p.inter_monthly_rows || []), { period: "", balance: "" }],
                      }))
                    }
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar mês (saldo único)
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" type="button" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={saveMutation.isPending || !canEditLoan}
              onClick={handleSubmit}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
