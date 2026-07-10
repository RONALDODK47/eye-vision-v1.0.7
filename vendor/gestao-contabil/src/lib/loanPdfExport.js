import { jsPDF } from "jspdf";
import {
  computeCpcLoanView,
  computeLoanMetrics,
  computeOutstandingShortLongSplit,
  formatBRL,
  getInterPayReceiveCompanyIds,
  getInterSaldoNaturezaLoan,
  getLoanCalendarMonthContext,
  inferInterAnchorCompanyId,
  normalizeInterMonthlyBalances,
  normalizeInterPartyBalanceEntries,
} from "@/lib/loanCalculations";

function parseNum(s) {
  if (s === undefined || s === null || s === "") return 0;
  const t = String(s).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Record<string, unknown>} loan
 * @param {Date} referenceDate
 * @param {(id: string) => string} getCompanyName
 * @param {{ userEmail?: string }} [opts]
 */
export function exportLoanOperationPdf(loan, referenceDate, getCompanyName, opts = {}) {
  const ref =
    referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime()) ? referenceDate : new Date();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const maxW = pageW - margin * 2;
  let y = 14;

  const mesAnoTitulo = ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const ymFile = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;

  const m = computeLoanMetrics(loan, ref);
  const { cpc: cpcMetrics, outstanding: outstandingList, diffContratoPago } = computeCpcLoanView(loan, ref);
  const cal = getLoanCalendarMonthContext(loan, ref);

  function ensureSpace(mm) {
    if (y + mm > 280) {
      doc.addPage();
      y = 14;
    }
  }

  function addRawLine(text, size = 10, style = "normal") {
    ensureSpace(8);
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(text), maxW);
    for (const ln of lines) {
      ensureSpace(size * 0.45 + 2);
      doc.text(ln, margin, y);
      y += size * 0.45 + 1.5;
    }
  }

  function addHeading(text) {
    y += 2;
    ensureSpace(10);
    addRawLine(text, 11, "bold");
    y += 1;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Resumo da operação — empréstimo", margin, y);
  y += 8;

  addRawLine(`Mês/ano de referência: ${mesAnoTitulo}`, 11, "bold");
  addRawLine(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, 9);
  if (opts.userEmail) addRawLine(`Usuário: ${opts.userEmail}`, 9);
  y += 2;

  addHeading("Identificação");
  addRawLine(`Tipo: ${loan.loan_kind === "entre_empresas" ? "Entre empresas" : "Bancário"}`);
  addRawLine(`Nome / contrato: ${loan.title || "—"}`);
  if ((loan.loan_kind || "bancario") === "bancario") {
    if (loan.bank_name) addRawLine(`Banco / instituição: ${loan.bank_name}`);
    if (loan.linked_company_id) {
      addRawLine(`Empresa vinculada: ${getCompanyName(loan.linked_company_id)}`);
    }
  }
  if (loan.loan_kind === "entre_empresas") {
    const anchor = inferInterAnchorCompanyId(loan);
    const pr = getInterPayReceiveCompanyIds(loan);
    const nat = getInterSaldoNaturezaLoan(loan);
    addRawLine(`Empresa (título do card): ${getCompanyName(anchor)}`);
    if (pr.pay.length) {
      addRawLine(
        `Empresas a pagar: ${pr.pay.map((id) => getCompanyName(id)).join("; ")}`
      );
    }
    if (pr.receive.length) {
      addRawLine(
        `Empresas a receber: ${pr.receive.map((id) => getCompanyName(id)).join("; ")}`
      );
    }
    const natLabel =
      nat === "liquido"
        ? "Líquido (+ a receber / − a pagar)"
        : nat === "receber"
          ? "A receber (só empresas a receber)"
          : "A pagar (só empresas a pagar)";
    addRawLine(`Interpretação do saldo mensal: ${natLabel}`);
  }
  if (loan.notes && String(loan.notes).trim()) {
    addRawLine(`Observações: ${String(loan.notes).trim()}`);
  }

  addHeading("Situação no mês de referência");
  const partyPdf = normalizeInterPartyBalanceEntries(loan.inter_party_balance_entries);
  const isInterMonthView =
    loan.loan_kind === "entre_empresas" &&
    (partyPdf.length > 0 || Array.isArray(loan.inter_monthly_balances));
  if (isInterMonthView) {
    addRawLine(
      m.saldoMesReferencia != null
        ? `Saldo final (${getInterSaldoNaturezaLoan(loan) === "liquido" ? "líquido +/−" : getInterSaldoNaturezaLoan(loan) === "receber" ? "a receber" : "a pagar"}): ${formatBRL(m.saldoMesReferencia)}`
        : "Sem lançamento de saldo neste mês/ano."
    );
    if (Array.isArray(m.interPartyHits) && m.interPartyHits.length > 0) {
      for (const h of m.interPartyHits) {
        addRawLine(
          `${getCompanyName(h.party_company_id)} — ${h.direction === "pagar" ? "a pagar" : "a receber"}: ${formatBRL(h.balance)}`,
          9
        );
      }
    }
  } else {
    addRawLine(`Saldo devedor (referência): ${formatBRL(m.saldoDevedor)}`);
    addRawLine(`Parcelas pagas: ${m.parcelasPagas} · Restantes: ${m.parcelasRestantes}`);
    if (m.proximaParcela != null) {
      addRawLine(
        `Próxima parcela: nº ${m.proximaParcela}${m.valorProximaParcela != null ? ` — ${formatBRL(m.valorProximaParcela)}` : ""}`
      );
    }
    if (cal.kind === "ok" && cal.parcelaNoMes != null) {
      addRawLine(
        `Parcela com vencimento neste mês: ${cal.parcelaNoMes} de ${cal.nTot} — ${formatBRL(cal.valorParcelaNoMes)} (${cal.situacao})`
      );
    } else if (cal.kind && cal.kind !== "inter_saldo" && cal.kind !== "inter_sem_lancamento") {
      addRawLine(`Calendário no mês: ${cal.kind}`);
    }
  }

  if ((loan.loan_kind || "bancario") === "bancario") {
    const stLtPdf = computeOutstandingShortLongSplit(loan, ref);
    if (stLtPdf && stLtPdf.totalNominal > 0.005) {
      addHeading("Remanescente nominal — curto vs longo prazo");
      addRawLine(`Total em aberto (nominal): ${formatBRL(stLtPdf.totalNominal)}`, 10, "bold");
      addRawLine(
        `Circulante (vence até ${stLtPdf.horizonEnd.toLocaleDateString("pt-BR")}): ${formatBRL(stLtPdf.curto)}`
      );
      addRawLine(`Não circulante (longo prazo): ${formatBRL(stLtPdf.longo)}`);
      addRawLine(
        "Valores pela soma nominal das parcelas não pagas; horizonte 12 meses após o último dia do mês de referência.",
        8
      );
    }
    addHeading("Dados contratuais (bancário)");
    addRawLine(`Valor bruto a pagar: ${formatBRL(loan.total_contract_value)}`);
    if (parseNum(loan.loan_total_paid) > 0) {
      addRawLine(`Total já pago: ${formatBRL(loan.loan_total_paid)}`);
    }
    if (loan.loan_transaction_costs != null && String(loan.loan_transaction_costs).trim() !== "") {
      const tx = Number(loan.loan_transaction_costs);
      if (Number.isFinite(tx) && tx > 0) addRawLine(`Custos da operação: ${formatBRL(tx)}`);
    }
    if (loan.first_due_date) addRawLine(`Data do pagamento da 1ª parcela (referência): ${loan.first_due_date}`);
    addRawLine(`Nº de parcelas: ${loan.installments_total ?? "—"}`);
    addRawLine("Calendário: prestações mensais (vencimentos podem ser ajustados por parcela no cadastro).");
    if (loan.installment_contract_monthly != null && String(loan.installment_contract_monthly).trim() !== "") {
      const cm = Number(loan.installment_contract_monthly);
      if (Number.isFinite(cm) && cm > 0) addRawLine(`Parcela mensal de referência (contratual): ${formatBRL(cm)}`);
    }
    if (loan.juros_apropriar_valor != null && String(loan.juros_apropriar_valor).trim() !== "") {
      addRawLine(`Juros (cadastro legado, ignorado no fluxo novo): ${formatBRL(loan.juros_apropriar_valor)}`);
    }
    if (loan.loan_disbursement_date) {
      addRawLine(`Data liberação do crédito: ${loan.loan_disbursement_date}`);
    }

    addHeading("Juros a apropriar (automático — mês de referência)");
    addRawLine(`Total (parcela contratual − valor pago): ${formatBRL(diffContratoPago?.totalMes ?? 0)}`, 10, "bold");
    if (diffContratoPago?.linhas?.length > 0) {
      for (const row of diffContratoPago.linhas) {
        addRawLine(
          `Parc. ${row.index} (${row.dueDate.toLocaleDateString("pt-BR")}): contratual ${formatBRL(row.parcelaContratual)} − pago ${formatBRL(row.valorPago)} → ${formatBRL(row.jurosDiferenca)}`
        );
      }
    }

    addHeading("Referência CPC (taxa efetiva)");
    if (cpcMetrics) {
      addRawLine(`Taxa efetiva a.a. (estimada): ${(cpcMetrics.taxaEfetivaAnual * 100).toFixed(4)}%`);
      addRawLine(`Juros a apropriar no mês (CPC): ${formatBRL(cpcMetrics.jurosMes)}`);
      if (cpcMetrics.custosTransacao > 0) {
        addRawLine(
          `Bruto − custos (custo amortizado inicial): ${formatBRL(cpcMetrics.principalCustoAmortizadoInicial)}`
        );
      }
      if (cpcMetrics.parcelaIndexNoMes != null) {
        addRawLine(
          `Prestação no mês (parc. ${cpcMetrics.parcelaIndexNoMes}): juros ${formatBRL(cpcMetrics.jurosParcelaNoMes ?? 0)}, principal ${formatBRL(cpcMetrics.principalParcelaNoMes ?? 0)}`
        );
      }
    } else {
      addRawLine("Não foi possível calcular a taxa efetiva (verifique total, parcelas e datas).");
    }

    const nTot = Math.max(
      0,
      Math.floor(Number(String(loan.installments_total ?? "").replace(/\D/g, "") || "0"))
    );
    const amtArr = Array.isArray(loan.installment_amounts) ? loan.installment_amounts : [];
    const dateArr = Array.isArray(loan.installment_due_dates) ? loan.installment_due_dates : [];

    if (nTot > 0 && (amtArr.length > 0 || dateArr.length > 0)) {
      addHeading("Cronograma completo de parcelas");
      addRawLine("Parc. | Vencimento | Valor", 9, "bold");
      for (let i = 0; i < nTot; i++) {
        const v = amtArr[i] != null ? formatBRL(amtArr[i]) : "—";
        const d = dateArr[i] != null ? String(dateArr[i]) : "—";
        addRawLine(`${i + 1} | ${d} | ${v}`, 9);
      }
    }

    if (outstandingList.length > 0) {
      addHeading("Parcelas em aberto (resumo)");
      const slice = outstandingList.slice(0, 60);
      for (const row of slice) {
        const dt = row.dueDate ? row.dueDate.toLocaleDateString("pt-BR") : "—";
        addRawLine(`Parc. ${row.index}: ${dt} — ${formatBRL(row.amount)}`, 9);
      }
      if (outstandingList.length > 60) {
        addRawLine(`… e mais ${outstandingList.length - 60} parcela(s).`, 9);
      }
    }
  }

  if (loan.loan_kind === "entre_empresas") {
    if (partyPdf.length > 0) {
      addHeading("Lançamentos por empresa e mês");
      const sorted = [...partyPdf].sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.month !== b.month ? a.month - b.month : 0
      );
      for (const e of sorted) {
        const label = `${String(e.month).padStart(2, "0")}/${e.year}`;
        addRawLine(
          `${getCompanyName(e.party_company_id)} — ${e.direction === "pagar" ? "a pagar" : "a receber"} — ${label}: ${formatBRL(e.balance)}`,
          9
        );
      }
    } else if (Array.isArray(loan.inter_monthly_balances)) {
      addHeading("Saldos finais cadastrados por mês");
      const list = normalizeInterMonthlyBalances(loan.inter_monthly_balances);
      for (const r of list) {
        const label = `${String(r.month).padStart(2, "0")}/${r.year}`;
        addRawLine(`${label}: ${formatBRL(r.balance)}`, 9);
      }
    }
  }

  const base = String(loan.title || "emprestimo")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 72);
  doc.save(`${base}_${ymFile}.pdf`);
}
