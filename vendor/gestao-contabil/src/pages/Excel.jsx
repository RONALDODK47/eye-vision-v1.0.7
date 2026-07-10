import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  Plus,
  Trash2,
  Wand2,
  Download,
  FileUp,
  Eye,
  ScissorsLineDashed,
  RotateCcw,
  Eraser,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "gc_excel_intuitivo_v1";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function makeDefaultSheet() {
  const columns = ["A", "B", "C", "D"].map((name) => ({ id: uid(), name }));
  const rows = Array.from({ length: 12 }, () => ({
    id: uid(),
    cells: Object.fromEntries(columns.map((c) => [c.id, ""])),
  }));
  return { columns, rows };
}

function loadSheet() {
  if (typeof localStorage === "undefined") return makeDefaultSheet();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeDefaultSheet();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.columns) || !Array.isArray(parsed?.rows)) return makeDefaultSheet();
    return parsed;
  } catch {
    return makeDefaultSheet();
  }
}

function saveSheet(sheet) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sheet));
}

function rowToCsv(row, columns) {
  const vals = columns.map((c) => String(row.cells?.[c.id] ?? ""));
  return vals
    .map((v) => `"${v.replace(/"/g, '""')}"`)
    .join(",");
}

function normalizeLookupKey(v) {
  return String(v ?? "").trim().toLowerCase();
}

function parsePtNumber(raw) {
  const normalized = String(raw ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatSolverNumber(n) {
  if (!Number.isFinite(n)) return "";
  const fixed = n.toFixed(6);
  return fixed.replace(/\.?0+$/, "");
}

function formatDateBr(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "-";
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  const dmy = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return text;
  const asDate = new Date(text);
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.toLocaleDateString("pt-BR");
  }
  return text;
}

function formatCurrencyBr(n) {
  if (!Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

function toCents(n) {
  return Math.round(Number(n) * 100);
}

function fromCents(cents) {
  return cents / 100;
}

function solveTargetSumSatLike({ baseValuesCents, targetCents }) {
  const rowCount = baseValuesCents.length;
  if (rowCount === 0) {
    throw new Error("A coluna escolhida não possui números para o Solver ajustar.");
  }

  const currentSum = baseValuesCents.reduce((acc, n) => acc + n, 0);
  const delta = targetCents - currentSum;
  if (delta === 0) {
    return baseValuesCents.map(() => 0);
  }

  // Mantém células originalmente não negativas sem ficar negativas após ajuste.
  const mins = baseValuesCents.map((base) => (base >= 0 ? -base : -Math.abs(delta) - Math.abs(base)));
  const maxs = baseValuesCents.map((base) => Math.abs(delta) + Math.abs(base) + 1_000_000);

  const isFeasibleWithBound = (bound) => {
    let minSum = 0;
    let maxSum = 0;
    for (let i = 0; i < rowCount; i++) {
      const low = Math.max(mins[i], -bound);
      const high = Math.min(maxs[i], bound);
      if (low > high) return false;
      minSum += low;
      maxSum += high;
    }
    return delta >= minSum && delta <= maxSum;
  };

  let lo = 0;
  let hi = Math.max(Math.abs(delta), ...baseValuesCents.map((n) => Math.abs(n)));
  while (!isFeasibleWithBound(hi)) {
    hi *= 2;
    if (hi > 1_000_000_000) {
      throw new Error("Solver SAT não encontrou faixa viável para a meta.");
    }
  }
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (isFeasibleWithBound(mid)) hi = mid;
    else lo = mid + 1;
  }
  const bestBound = lo;

  const adjustments = [];
  let sumAdjustments = 0;
  for (let i = 0; i < rowCount; i++) {
    const low = Math.max(mins[i], -bestBound);
    adjustments.push(low);
    sumAdjustments += low;
  }

  let remaining = delta - sumAdjustments;
  for (let i = 0; i < rowCount && remaining > 0; i++) {
    const high = Math.min(maxs[i], bestBound);
    const room = high - adjustments[i];
    if (room <= 0) continue;
    const take = Math.min(room, remaining);
    adjustments[i] += take;
    remaining -= take;
  }

  if (remaining !== 0) {
    throw new Error("Solver SAT não conseguiu fechar a soma exata.");
  }
  return adjustments;
}

function getSolverTargetRowIds({ sheet, valueColumnId, lookupColumnId, selectedKeysRaw }) {
  const selectedKeys = String(selectedKeysRaw || "")
    .split(",")
    .map((k) => normalizeLookupKey(k))
    .filter(Boolean);
  const selectedSet = new Set(selectedKeys);
  const useFilter = selectedSet.size > 0;
  const rowIds = [];
  sheet.rows.forEach((r) => {
    const n = parsePtNumber(r.cells?.[valueColumnId]);
    if (n === null) return;
    const key = normalizeLookupKey(r.cells?.[lookupColumnId]);
    if (useFilter && !selectedSet.has(key)) return;
    rowIds.push(r.id);
  });
  return rowIds;
}

function sanitizePastedCell(raw) {
  const value = String(raw ?? "");
  // Remove caracteres invisíveis/comuns de formatação ao copiar do Excel/web.
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
}

const OCR_LANGUAGE_OPTIONS = [
  { id: "auto", label: "Auto (Português + Inglês)", tess: "por+eng" },
  { id: "por", label: "Português", tess: "por" },
  { id: "eng", label: "Inglês", tess: "eng" },
];

const PDF_COLUMN_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#a855f7",
  "#14b8a6",
  "#eab308",
  "#ef4444",
  "#6366f1",
];

async function preprocessImageForOcr(imageUrl, highPrecision) {
  if (!highPrecision) return imageUrl;
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = imageUrl;
  });
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(img.width * scale));
  canvas.height = Math.max(1, Math.floor(img.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    const bw = gray > 165 ? 255 : 0;
    data[i] = bw;
    data[i + 1] = bw;
    data[i + 2] = bw;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

const ACTIONS = [
  {
    id: "trim",
    label: "Limpar espaços",
    description: "Remove espaços extras no início/fim em todas as células.",
    run: ({ sheet }) => ({
      ...sheet,
      rows: sheet.rows.map((r) => ({
        ...r,
        cells: Object.fromEntries(
          sheet.columns.map((c) => [c.id, String(r.cells?.[c.id] ?? "").trim()])
        ),
      })),
    }),
  },
  {
    id: "upper",
    label: "Texto em MAIÚSCULO",
    description: "Converte texto para maiúsculo (coluna selecionada).",
    needsColumn: true,
    run: ({ sheet, columnId }) => ({
      ...sheet,
      rows: sheet.rows.map((r) => ({
        ...r,
        cells: { ...r.cells, [columnId]: String(r.cells?.[columnId] ?? "").toUpperCase() },
      })),
    }),
  },
  {
    id: "lower",
    label: "Texto em minúsculo",
    description: "Converte texto para minúsculo (coluna selecionada).",
    needsColumn: true,
    run: ({ sheet, columnId }) => ({
      ...sheet,
      rows: sheet.rows.map((r) => ({
        ...r,
        cells: { ...r.cells, [columnId]: String(r.cells?.[columnId] ?? "").toLowerCase() },
      })),
    }),
  },
  {
    id: "fill-empty",
    label: "Preencher vazios",
    description: "Preenche células vazias da coluna com um valor.",
    needsColumn: true,
    needsValue: true,
    run: ({ sheet, columnId, value }) => ({
      ...sheet,
      rows: sheet.rows.map((r) => {
        const current = String(r.cells?.[columnId] ?? "");
        if (current.trim() !== "") return r;
        return { ...r, cells: { ...r.cells, [columnId]: value } };
      }),
    }),
  },
  {
    id: "replace",
    label: "Substituir texto",
    description: "Substitui um texto por outro na coluna selecionada.",
    needsColumn: true,
    needsValue: true,
    needsSecondValue: true,
    secondValueLabel: "Novo valor",
    run: ({ sheet, columnId, value, secondValue }) => ({
      ...sheet,
      rows: sheet.rows.map((r) => ({
        ...r,
        cells: {
          ...r.cells,
          [columnId]: String(r.cells?.[columnId] ?? "").split(value).join(secondValue),
        },
      })),
    }),
  },
  {
    id: "sort-asc",
    label: "Ordenar A → Z",
    description: "Ordena as linhas pela coluna selecionada (crescente).",
    needsColumn: true,
    run: ({ sheet, columnId }) => ({
      ...sheet,
      rows: [...sheet.rows].sort((a, b) =>
        String(a.cells?.[columnId] ?? "").localeCompare(String(b.cells?.[columnId] ?? ""), "pt-BR")
      ),
    }),
  },
  {
    id: "sort-desc",
    label: "Ordenar Z → A",
    description: "Ordena as linhas pela coluna selecionada (decrescente).",
    needsColumn: true,
    run: ({ sheet, columnId }) => ({
      ...sheet,
      rows: [...sheet.rows].sort((a, b) =>
        String(b.cells?.[columnId] ?? "").localeCompare(String(a.cells?.[columnId] ?? ""), "pt-BR")
      ),
    }),
  },
  {
    id: "remove-duplicates",
    label: "Remover duplicados",
    description: "Mantém só a 1ª ocorrência de cada valor na coluna selecionada.",
    needsColumn: true,
    run: ({ sheet, columnId }) => {
      const seen = new Set();
      const rows = [];
      for (const r of sheet.rows) {
        const key = String(r.cells?.[columnId] ?? "").trim().toLowerCase();
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        rows.push(r);
      }
      return { ...sheet, rows };
    },
  },
  {
    id: "procv",
    label: "PROCV (busca em tabela)",
    description:
      "Procura um valor de chave e retorna outro campo correspondente. Você escolhe as colunas de busca e saída.",
    needsColumn: true,
    needsLookupColumn: true,
    needsReturnColumn: true,
    needsOutputColumn: true,
    valueLabel: "Texto quando não encontrar (opcional)",
    run: ({ sheet, columnId, lookupColumnId, returnColumnId, outputColumnId, value }) => {
      const map = new Map();
      for (const r of sheet.rows) {
        const key = normalizeLookupKey(r.cells?.[lookupColumnId]);
        if (!key || map.has(key)) continue;
        map.set(key, String(r.cells?.[returnColumnId] ?? ""));
      }
      const fallback = String(value ?? "");
      return {
        ...sheet,
        rows: sheet.rows.map((r) => {
          const key = normalizeLookupKey(r.cells?.[columnId]);
          const found = key ? map.get(key) : undefined;
          return {
            ...r,
            cells: { ...r.cells, [outputColumnId]: found ?? fallback },
          };
        }),
      };
    },
  },
  {
    id: "solver-total",
    label: "Solver SAT (meta de soma)",
    description:
      "Usa modelo SAT inteiro para ajustar valores com filtro por coluna e grava um resultado com data/texto/valor apurado.",
    needsColumn: true,
    needsValue: true,
    needsSecondValue: true,
    needsLookupColumn: true,
    needsOutputColumn: true,
    needsDateColumn: true,
    needsTextColumn: true,
    lookupColumnLabel: "Coluna para procurar os valores",
    outputColumnLabel: "Coluna de resultado",
    dateColumnLabel: "Coluna de data",
    textColumnLabel: "Coluna de texto",
    secondValueLabel: "Valores escolhidos (separe por vírgula)",
    valueLabel: "Meta da soma (número, SAT)",
    run: ({ sheet, columnId, value, secondValue, lookupColumnId, outputColumnId, dateColumnId, textColumnId }) => {
      const target = parsePtNumber(value);
      if (target === null) throw new Error("Informe uma meta numérica válida para o Solver SAT.");
      const selectedKeys = String(secondValue || "")
        .split(",")
        .map((k) => normalizeLookupKey(k))
        .filter(Boolean);
      const selectedSet = new Set(selectedKeys);
      const useFilter = selectedSet.size > 0;
      const indices = [];
      const baseValuesCents = [];
      sheet.rows.forEach((r, idx) => {
        const n = parsePtNumber(r.cells?.[columnId]);
        if (n === null) return;
        const key = normalizeLookupKey(r.cells?.[lookupColumnId]);
        if (useFilter && !selectedSet.has(key)) return;
        indices.push(idx);
        baseValuesCents.push(toCents(n));
      });
      if (indices.length === 0) {
        throw new Error(
          useFilter
            ? "Nenhuma linha numérica correspondeu aos valores escolhidos."
            : "A coluna escolhida não possui números para o Solver SAT ajustar."
        );
      }
      const targetCents = toCents(target);
      const adjustments = solveTargetSumSatLike({
        baseValuesCents,
        targetCents,
      });
      const indexSet = new Set(indices);
      let adjPos = 0;
      return {
        ...sheet,
        rows: sheet.rows.map((r, idx) => {
          if (!indexSet.has(idx)) return r;
          const currentCents = baseValuesCents[adjPos];
          const nextCents = currentCents + adjustments[adjPos];
          const nextValueText = formatSolverNumber(fromCents(nextCents));
          const dateValue = String(r.cells?.[dateColumnId] ?? "").trim();
          const textValue = String(r.cells?.[textColumnId] ?? "").trim();
          const keyValue = String(r.cells?.[lookupColumnId] ?? "").trim();
          const apurado = [
            `Data: ${formatDateBr(dateValue)}`,
            `Texto: ${textValue || "-"}`,
            `Valor apurado: ${formatCurrencyBr(fromCents(nextCents))}`,
            `Chave: ${keyValue || "-"}`,
          ].join("\n");
          adjPos += 1;
          return {
            ...r,
            cells: { ...r.cells, [columnId]: nextValueText, [outputColumnId]: apurado },
          };
        }),
      };
    },
  },
];

export default function Excel() {
  const { theme } = useTheme();
  const [sheet, setSheet] = useState(() => loadSheet());
  const [searchAction, setSearchAction] = useState("");
  const [selectedActionId, setSelectedActionId] = useState("");
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [value, setValue] = useState("");
  const [secondValue, setSecondValue] = useState("");
  const [lookupColumnId, setLookupColumnId] = useState("");
  const [returnColumnId, setReturnColumnId] = useState("");
  const [outputColumnId, setOutputColumnId] = useState("");
  const [dateColumnId, setDateColumnId] = useState("");
  const [textColumnId, setTextColumnId] = useState("");
  const [copyOnlyFilteredRows, setCopyOnlyFilteredRows] = useState(true);
  const [copyWithHeader, setCopyWithHeader] = useState(true);
  const [copyHeaderText, setCopyHeaderText] = useState("Relatório apurado (Solver SAT)");
  const [lastSolverResultRowIds, setLastSolverResultRowIds] = useState([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfPreview, setPdfPreview] = useState(null);
  const [pdfSeparators, setPdfSeparators] = useState([]);
  const [segmentConfigs, setSegmentConfigs] = useState([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [ocrLanguage, setOcrLanguage] = useState("auto");
  const [ocrHighPrecision, setOcrHighPrecision] = useState(false);
  const previewRef = useRef(null);

  const selectedAction = useMemo(
    () => ACTIONS.find((a) => a.id === selectedActionId) || null,
    [selectedActionId]
  );

  const filteredActions = useMemo(() => {
    const t = searchAction.trim().toLowerCase();
    if (!t) return ACTIONS;
    return ACTIONS.filter(
      (a) => a.label.toLowerCase().includes(t) || a.description.toLowerCase().includes(t)
    );
  }, [searchAction]);

  const sortedGuides = useMemo(
    () =>
      pdfSeparators
        .map((value, originalIndex) => ({ value, originalIndex }))
        .sort((a, b) => a.value - b.value),
    [pdfSeparators]
  );

  const segments = useMemo(() => {
    const out = [];
    for (let i = 0; i + 1 < sortedGuides.length; i += 2) {
      const leftGuide = sortedGuides[i];
      const rightGuide = sortedGuides[i + 1];
      const start = Math.min(leftGuide.value, rightGuide.value);
      const end = Math.max(leftGuide.value, rightGuide.value);
      const segmentIndex = out.length;
      out.push({
        index: segmentIndex,
        start,
        end,
        guideA: leftGuide.value,
        guideB: rightGuide.value,
        guideAOriginalIndex: leftGuide.originalIndex,
        guideBOriginalIndex: rightGuide.originalIndex,
        color: PDF_COLUMN_COLORS[segmentIndex % PDF_COLUMN_COLORS.length],
      });
    }
    return out;
  }, [sortedGuides]);

  const hasUnpairedGuide = sortedGuides.length % 2 !== 0;

  const guideMetaByOriginalIndex = useMemo(() => {
    const map = new Map();
    segments.forEach((seg) => {
      map.set(seg.guideAOriginalIndex, {
        paired: true,
        color: seg.color,
      });
      map.set(seg.guideBOriginalIndex, {
        paired: true,
        color: seg.color,
      });
    });
    sortedGuides.forEach((guide) => {
      if (!map.has(guide.originalIndex)) {
        map.set(guide.originalIndex, {
          paired: false,
          color: "#f59e0b",
        });
      }
    });
    return map;
  }, [segments, sortedGuides]);

  useEffect(() => {
    setSegmentConfigs((prev) =>
      segments.map((s, idx) => {
        const old = prev[idx];
        const fallbackCol = sheet.columns[idx]?.id || sheet.columns[0]?.id || "";
        return {
          extract: old?.extract !== false,
          targetColumnId: old?.targetColumnId || fallbackCol,
        };
      })
    );
  }, [segments, sheet.columns]);

  const setAndPersist = (next) => {
    setSheet(next);
    saveSheet(next);
  };

  const addColumn = () => {
    const name = window.prompt("Nome da nova coluna:", `Coluna ${sheet.columns.length + 1}`);
    if (!name || !name.trim()) return;
    const col = { id: uid(), name: name.trim() };
    const next = {
      columns: [...sheet.columns, col],
      rows: sheet.rows.map((r) => ({ ...r, cells: { ...r.cells, [col.id]: "" } })),
    };
    setAndPersist(next);
  };

  const removeColumn = () => {
    if (!selectedColumnId) {
      window.alert("Selecione uma coluna.");
      return;
    }
    const col = sheet.columns.find((c) => c.id === selectedColumnId);
    if (!col) return;
    if (!window.confirm(`Remover a coluna "${col.name}"?`)) return;
    const nextCols = sheet.columns.filter((c) => c.id !== selectedColumnId);
    const nextRows = sheet.rows.map((r) => {
      const { [selectedColumnId]: _omit, ...rest } = r.cells || {};
      return { ...r, cells: rest };
    });
    setAndPersist({ columns: nextCols, rows: nextRows });
    setSelectedColumnId("");
  };

  const addRow = () => {
    const row = {
      id: uid(),
      cells: Object.fromEntries(sheet.columns.map((c) => [c.id, ""])),
    };
    setAndPersist({ ...sheet, rows: [...sheet.rows, row] });
  };

  const removeLastRow = () => {
    if (sheet.rows.length === 0) return;
    setAndPersist({ ...sheet, rows: sheet.rows.slice(0, -1) });
  };

  /** Volta a 4 colunas A–D; mantém o texto das primeiras 4 colunas por posição (o resto é descartado). */
  const resetColumnsToDefaultABCD = () => {
    if (
      !window.confirm(
        "Restaurar colunas para A, B, C e D? Se tiver mais de quatro colunas, os dados das colunas extra deixam de estar nesta planilha (as primeiras quatro colunas são preservadas por ordem)."
      )
    ) {
      return;
    }
    const defaultCols = ["A", "B", "C", "D"].map((name) => ({ id: uid(), name }));
    const oldCols = sheet.columns || [];
    const nextRows = sheet.rows.map((r) => {
      const cells = {};
      defaultCols.forEach((c, i) => {
        const oldId = oldCols[i]?.id;
        cells[c.id] = oldId != null ? String(r.cells?.[oldId] ?? "") : "";
      });
      return { ...r, cells };
    });
    setAndPersist({ columns: defaultCols, rows: nextRows });
    setSelectedColumnId("");
  };

  /** Limpa todas as células; mantém linhas e colunas. */
  const clearAllCellContents = () => {
    if (!window.confirm("Limpar todo o conteúdo das células? (Estrutura de linhas e colunas mantém-se.)")) return;
    setAndPersist({
      ...sheet,
      rows: sheet.rows.map((r) => ({
        ...r,
        cells: Object.fromEntries(sheet.columns.map((c) => [c.id, ""])),
      })),
    });
  };

  /** Limpa só a coluna atualmente selecionada na lista «Coluna» (painel da esquerda). */
  const clearSelectedColumnContents = () => {
    if (!selectedColumnId) {
      window.alert("Selecione uma coluna no campo «Coluna» acima.");
      return;
    }
    const col = sheet.columns.find((c) => c.id === selectedColumnId);
    if (!col) return;
    if (!window.confirm(`Limpar todo o conteúdo da coluna «${col.name}»?`)) return;
    setAndPersist({
      ...sheet,
      rows: sheet.rows.map((r) => ({
        ...r,
        cells: { ...r.cells, [selectedColumnId]: "" },
      })),
    });
  };

  /** Limpa uma linha pelo número exibido na grelha (#). */
  const clearRowByLineNumber = () => {
    const raw = window.prompt("Número da linha a limpar (1 = primeira linha de dados):", "1");
    if (raw == null) return;
    const n = parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > sheet.rows.length) {
      window.alert(`Indique um número entre 1 e ${sheet.rows.length}.`);
      return;
    }
    const row = sheet.rows[n - 1];
    if (!window.confirm(`Limpar todo o conteúdo da linha ${n}?`)) return;
    setAndPersist({
      ...sheet,
      rows: sheet.rows.map((r) =>
        r.id === row.id
          ? { ...r, cells: Object.fromEntries(sheet.columns.map((c) => [c.id, ""])) }
          : r
      ),
    });
  };

  const setCell = (rowId, colId, cellValue) => {
    const next = {
      ...sheet,
      rows: sheet.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: cellValue } } : r
      ),
    };
    setAndPersist(next);
  };

  const handleGridPaste = (rowId, colId, event) => {
    const raw = event.clipboardData?.getData("text/plain") || "";
    const hasGridData = raw.includes("\n") || raw.includes("\t");
    if (!hasGridData) return;

    event.preventDefault();

    const startRowIndex = sheet.rows.findIndex((r) => r.id === rowId);
    const startColIndex = sheet.columns.findIndex((c) => c.id === colId);
    if (startRowIndex < 0 || startColIndex < 0) return;

    const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    const matrix = lines.map((line) => line.split("\t").map((cell) => sanitizePastedCell(cell)));
    if (!matrix.length) return;

    const requiredRows = startRowIndex + matrix.length;
    const nextRows = [...sheet.rows];
    while (nextRows.length < requiredRows) {
      nextRows.push({
        id: uid(),
        cells: Object.fromEntries(sheet.columns.map((c) => [c.id, ""])),
      });
    }

    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        const targetColIdx = startColIndex + c;
        if (targetColIdx >= sheet.columns.length) continue;
        const targetColId = sheet.columns[targetColIdx].id;
        const targetRow = nextRows[startRowIndex + r];
        targetRow.cells = {
          ...targetRow.cells,
          [targetColId]: matrix[r][c],
        };
      }
    }

    setAndPersist({
      ...sheet,
      rows: nextRows,
    });
  };

  const applyAction = () => {
    if (!selectedAction) {
      window.alert("Selecione uma ação.");
      return;
    }
    if (selectedAction.needsColumn && !selectedColumnId) {
      window.alert("Selecione a coluna da ação.");
      return;
    }
    if (selectedAction.needsValue && !String(value).trim()) {
      window.alert("Informe o valor da ação.");
      return;
    }
    if (selectedAction.needsSecondValue && !String(secondValue).trim()) {
      window.alert("Informe o segundo valor da ação.");
      return;
    }
    if (selectedAction.needsLookupColumn && !lookupColumnId) {
      window.alert("Selecione a coluna da tabela para procurar a chave (PROCV).");
      return;
    }
    if (selectedAction.needsReturnColumn && !returnColumnId) {
      window.alert("Selecione a coluna da tabela para retornar o resultado (PROCV).");
      return;
    }
    if (selectedAction.needsOutputColumn && !outputColumnId) {
      window.alert("Selecione a coluna onde o resultado será escrito.");
      return;
    }
    if (selectedAction.needsDateColumn && !dateColumnId) {
      window.alert("Selecione a coluna de data.");
      return;
    }
    if (selectedAction.needsTextColumn && !textColumnId) {
      window.alert("Selecione a coluna de texto.");
      return;
    }
    try {
      const next = selectedAction.run({
        sheet,
        columnId: selectedColumnId,
        value: String(value),
        secondValue: String(secondValue),
        lookupColumnId,
        returnColumnId,
        outputColumnId,
        dateColumnId,
        textColumnId,
      });
      setAndPersist(next);
      if (selectedAction.id === "solver-total") {
        setLastSolverResultRowIds(
          getSolverTargetRowIds({
            sheet,
            valueColumnId: selectedColumnId,
            lookupColumnId,
            selectedKeysRaw: secondValue,
          })
        );
      }
    } catch (err) {
      window.alert(err?.message || "Não foi possível aplicar a ação.");
    }
  };

  const copyApuradoOutput = async () => {
    if (!outputColumnId) {
      window.alert("Selecione a coluna de resultado para copiar.");
      return;
    }
    const allowed = new Set(lastSolverResultRowIds);
    const targetRows = copyOnlyFilteredRows ? sheet.rows.filter((r) => allowed.has(r.id)) : sheet.rows;
    const lines = targetRows
      .map((r) => String(r.cells?.[outputColumnId] ?? "").trim())
      .filter(Boolean);
    if (lines.length === 0) {
      window.alert(
        copyOnlyFilteredRows
          ? "Não há resultado apurado nas linhas filtradas. Execute o Solver ou desmarque o filtro de cópia."
          : "Não há resultado apurado para copiar nesta coluna."
      );
      return;
    }
    const generatedAt = new Date().toLocaleString("pt-BR");
    const columnName = sheet.columns.find((c) => c.id === outputColumnId)?.name || "Resultado";
    const headerBlock = `${String(copyHeaderText || "Relatório apurado").trim()}\nColuna: ${columnName}\nGerado em: ${generatedAt}`;
    const payload = copyWithHeader ? `${headerBlock}\n\n${lines.join("\n\n")}` : lines.join("\n\n");
    try {
      await navigator.clipboard.writeText(payload);
      window.alert(`${lines.length} resultado(s) copiado(s).`);
    } catch {
      window.alert("Não foi possível copiar automaticamente. Verifique as permissões do navegador.");
    }
  };

  const exportCsv = () => {
    const header = sheet.columns.map((c) => `"${String(c.name).replace(/"/g, '""')}"`).join(",");
    const body = sheet.rows.map((r) => rowToCsv(r, sheet.columns)).join("\n");
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "excel_intuitivo.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePdfFile = async (file) => {
    if (!file) return;
    setPdfBusy(true);
    setPdfError("");
    try {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
      const data = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      const page = await pdf.getPage(1);
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const textContent = await page.getTextContent();
      const items = (textContent.items || [])
        .map((it) => {
          const text = String(it.str || "").trim();
          const x = Number(it.transform?.[4] ?? 0) * scale;
          const y = viewport.height - Number(it.transform?.[5] ?? 0) * scale;
          const width = Math.max(1, Number(it.width || 0) * scale);
          return { text, x, y, width };
        })
        .filter((it) => it.text.length > 0);
      setPdfPreview({
        fileName: file.name,
        width: viewport.width,
        height: viewport.height,
        imageUrl: canvas.toDataURL("image/png"),
        items,
        extractionMode: items.length > 0 ? "pdf-texto" : "sem-texto",
      });
      setPdfSeparators([]);
      setOcrProgress(0);
      setOcrStatus("");
    } catch (e) {
      setPdfError(e?.message || "Falha ao ler PDF.");
      setPdfPreview(null);
      setPdfSeparators([]);
    } finally {
      setPdfBusy(false);
    }
  };

  const addSeparatorAtClick = (event) => {
    if (!previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = Math.min(0.98, Math.max(0.02, x / rect.width));
    setPdfSeparators((prev) => {
      const merged = [...prev, ratio].sort((a, b) => a - b);
      const dedup = [];
      for (const v of merged) {
        if (dedup.length === 0 || Math.abs(dedup[dedup.length - 1] - v) > 0.01) dedup.push(v);
      }
      return dedup;
    });
  };

  const removeSeparator = (idx) => {
    setPdfSeparators((prev) => prev.filter((_, i) => i !== idx));
  };

  const importPdfToSheet = () => {
    if (!pdfPreview) {
      window.alert("Carregue um PDF primeiro.");
      return;
    }
    if (!segments.length) {
      window.alert("Defina ao menos uma coluna (cada coluna precisa de 2 linhas).");
      return;
    }
    if (hasUnpairedGuide) {
      window.alert("Há uma linha sem par. Cada coluna precisa de duas linhas (início e fim).");
      return;
    }
    const validItems = [...pdfPreview.items].sort((a, b) => a.y - b.y || a.x - b.x);
    if (validItems.length === 0) {
      window.alert(
        "Este PDF parece imagem/scanner sem texto selecionável. Use o botão 'Executar OCR' e depois importe novamente."
      );
      return;
    }

    const rowBuckets = [];
    const tolerance = 8;
    for (const it of validItems) {
      const existing = rowBuckets.find((r) => Math.abs(r.y - it.y) <= tolerance);
      if (existing) {
        existing.items.push(it);
      } else {
        rowBuckets.push({ y: it.y, items: [it] });
      }
    }
    rowBuckets.sort((a, b) => a.y - b.y);

    const importedRows = rowBuckets.map((bucket) => {
      const cells = Object.fromEntries(sheet.columns.map((c) => [c.id, ""]));
      segments.forEach((seg, idx) => {
        const cfg = segmentConfigs[idx];
        if (!cfg || cfg.extract === false || !cfg.targetColumnId) return;
        const txt = bucket.items
          .filter((it) => {
            const center = (it.x + it.width / 2) / pdfPreview.width;
            return center >= seg.start && center < seg.end;
          })
          .sort((a, b) => a.x - b.x)
          .map((it) => it.text)
          .join(" ")
          .trim();
        if (txt) cells[cfg.targetColumnId] = txt;
      });
      const hasAny = Object.values(cells).some((v) => String(v).trim() !== "");
      return hasAny ? { id: uid(), cells } : null;
    }).filter(Boolean);

    if (importedRows.length === 0) {
      window.alert("Nenhuma linha útil foi extraída com a configuração atual.");
      return;
    }

    setAndPersist({ ...sheet, rows: [...sheet.rows, ...importedRows] });
    window.alert(`${importedRows.length} linha(s) importada(s) do PDF.`);
  };

  const runOcrOnPreview = async () => {
    if (!pdfPreview?.imageUrl) {
      window.alert("Carregue e visualize um PDF primeiro.");
      return;
    }
    setOcrBusy(true);
    setOcrProgress(0);
    setOcrStatus("Iniciando OCR...");
    setPdfError("");
    let worker = null;
    try {
      const langConfig = OCR_LANGUAGE_OPTIONS.find((opt) => opt.id === ocrLanguage) || OCR_LANGUAGE_OPTIONS[0];
      const sourceImage = await preprocessImageForOcr(pdfPreview.imageUrl, ocrHighPrecision);
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker(langConfig.tess, 1, {
        logger: (m) => {
          if (typeof m?.progress === "number") {
            setOcrProgress(Math.round(m.progress * 100));
          }
          if (m?.status) setOcrStatus(String(m.status));
        },
      });
      if (ocrHighPrecision) {
        await worker.setParameters({
          tessedit_pageseg_mode: "6",
          preserve_interword_spaces: "1",
        });
      }
      const result = await worker.recognize(sourceImage);
      const words = (result?.data?.words || [])
        .map((w) => {
          const text = String(w?.text || "").trim();
          const x0 = Number(w?.bbox?.x0 ?? 0);
          const x1 = Number(w?.bbox?.x1 ?? x0 + 1);
          const y0 = Number(w?.bbox?.y0 ?? 0);
          return {
            text,
            x: x0,
            y: y0,
            width: Math.max(1, x1 - x0),
          };
        })
        .filter((w) => w.text.length > 0);
      setPdfPreview((prev) =>
        prev
          ? {
              ...prev,
              items: words,
              extractionMode: words.length > 0 ? "ocr" : "ocr-vazio",
            }
          : prev
      );
      if (words.length === 0) {
        setPdfError("OCR executado, mas nenhum texto foi reconhecido nesta página.");
      } else {
        setOcrStatus(`OCR concluído: ${words.length} bloco(s) de texto reconhecidos.`);
      }
    } catch (e) {
      setPdfError(e?.message || "Falha ao executar OCR.");
    } finally {
      if (worker) await worker.terminate();
      setOcrBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Excel</h1>
        <p className={cn("text-sm", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
          Planilha intuitiva sem fórmulas: você escolhe ações prontas para transformar os dados.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-4 items-start">
        <Card className={cn("p-4 border space-y-3", theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white")}>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Pesquisar ação</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchAction}
                onChange={(e) => setSearchAction(e.target.value)}
                placeholder="Ex.: ordenar, duplicados, substituir..."
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ação</Label>
            <Select value={selectedActionId} onValueChange={setSelectedActionId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o que quer fazer com os dados" />
              </SelectTrigger>
              <SelectContent>
                {filteredActions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAction && (
              <p className="text-xs text-muted-foreground">{selectedAction.description}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Coluna</Label>
            <Select value={selectedColumnId} onValueChange={setSelectedColumnId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolher coluna" />
              </SelectTrigger>
              <SelectContent>
                {sheet.columns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAction?.needsLookupColumn && (
            <div className="space-y-2">
              <Label>{selectedAction?.lookupColumnLabel || "Coluna da tabela (chave)"}</Label>
              <Select value={lookupColumnId} onValueChange={setLookupColumnId}>
                <SelectTrigger>
                  <SelectValue placeholder="Onde procurar a chave" />
                </SelectTrigger>
                <SelectContent>
                  {sheet.columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedAction?.needsReturnColumn && (
            <div className="space-y-2">
              <Label>{selectedAction?.returnColumnLabel || "Coluna da tabela (retorno)"}</Label>
              <Select value={returnColumnId} onValueChange={setReturnColumnId}>
                <SelectTrigger>
                  <SelectValue placeholder="Valor que será retornado" />
                </SelectTrigger>
                <SelectContent>
                  {sheet.columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedAction?.needsOutputColumn && (
            <div className="space-y-2">
              <Label>{selectedAction?.outputColumnLabel || "Coluna de saída"}</Label>
              <Select value={outputColumnId} onValueChange={setOutputColumnId}>
                <SelectTrigger>
                  <SelectValue placeholder="Onde gravar o resultado" />
                </SelectTrigger>
                <SelectContent>
                  {sheet.columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedAction?.needsDateColumn && (
            <div className="space-y-2">
              <Label>{selectedAction?.dateColumnLabel || "Coluna de data"}</Label>
              <Select value={dateColumnId} onValueChange={setDateColumnId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher coluna de data" />
                </SelectTrigger>
                <SelectContent>
                  {sheet.columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedAction?.needsTextColumn && (
            <div className="space-y-2">
              <Label>{selectedAction?.textColumnLabel || "Coluna de texto"}</Label>
              <Select value={textColumnId} onValueChange={setTextColumnId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher coluna de texto" />
                </SelectTrigger>
                <SelectContent>
                  {sheet.columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(selectedAction?.needsValue || selectedAction?.id === "procv") && (
            <div className="space-y-2">
              <Label>{selectedAction?.valueLabel || "Valor"}</Label>
              <Input value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
          )}

          {selectedAction?.needsSecondValue && (
            <div className="space-y-2">
              <Label>{selectedAction?.secondValueLabel || "Novo valor"}</Label>
              <Input value={secondValue} onChange={(e) => setSecondValue(e.target.value)} />
            </div>
          )}

          <Button type="button" className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={applyAction}>
            <Wand2 className="w-4 h-4 mr-2" />
            Aplicar ação
          </Button>
          {selectedAction?.id === "solver-total" && selectedAction?.needsOutputColumn && (
            <div className="space-y-2 rounded-md border p-2">
              <p className="text-xs font-medium">Opções de cópia</p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="copy-only-filtered-rows"
                  checked={copyOnlyFilteredRows}
                  onCheckedChange={(v) => setCopyOnlyFilteredRows(v === true)}
                />
                <Label htmlFor="copy-only-filtered-rows" className="text-xs cursor-pointer">
                  Copiar só linhas filtradas do Solver
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="copy-with-header"
                  checked={copyWithHeader}
                  onCheckedChange={(v) => setCopyWithHeader(v === true)}
                />
                <Label htmlFor="copy-with-header" className="text-xs cursor-pointer">
                  Incluir cabeçalho
                </Label>
              </div>
              {copyWithHeader && (
                <div className="space-y-1">
                  <Label className="text-xs">Texto do cabeçalho</Label>
                  <Input value={copyHeaderText} onChange={(e) => setCopyHeaderText(e.target.value)} />
                </div>
              )}
              <Button type="button" variant="outline" className="w-full" onClick={copyApuradoOutput}>
                Copiar resultado apurado
              </Button>
            </div>
          )}

          <div className="pt-2 border-t space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addColumn}>
                <Plus className="w-4 h-4 mr-1" />
                Coluna
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={removeColumn}>
                <Trash2 className="w-4 h-4 mr-1" />
                Remover coluna
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="w-4 h-4 mr-1" />
                Linha
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={removeLastRow}>
                <Trash2 className="w-4 h-4 mr-1" />
                Última linha
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
                <Download className="w-4 h-4 mr-1" />
                CSV
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={resetColumnsToDefaultABCD} title="Colunas A, B, C e D">
                <RotateCcw className="w-4 h-4 mr-1" />
                Colunas padrão (A–D)
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={clearAllCellContents}>
                <Eraser className="w-4 h-4 mr-1" />
                Excluir conteúdo (tudo)
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={clearSelectedColumnContents}>
                Limpar coluna selecionada
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={clearRowByLineNumber}>
                Limpar linha (por nº)
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              «Limpar coluna» usa a coluna escolhida no campo <strong>Coluna</strong> acima. «Limpar linha» pede o número da
              linha (# na grelha).
            </p>
          </div>

          <div className="pt-3 border-t space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Importar PDF (1ª página)</Label>
            <Input
              type="file"
              accept="application/pdf"
              onChange={(e) => handlePdfFile(e.target.files?.[0] || null)}
            />
            {pdfBusy && <p className="text-xs text-muted-foreground">Lendo PDF…</p>}
            {pdfError && <p className="text-xs text-red-500">{pdfError}</p>}
            {pdfPreview && (
              <>
                <p className="text-xs text-muted-foreground">
                  Arquivo: <strong>{pdfPreview.fileName}</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  Modo de extração atual: <strong>{pdfPreview.extractionMode}</strong>
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Clique na imagem para criar linhas verticais. Agora cada coluna do PDF é formada por{" "}
                  <strong>duas linhas</strong> (início e fim). Marque colunas para ignorar quando não quiser extrair dados
                  (mesmo em PDF escaneado).
                </p>
                {hasUnpairedGuide && (
                  <p className="text-[11px] text-amber-500">
                    Falta uma linha para fechar a última coluna. Adicione mais uma linha.
                  </p>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Idioma OCR</Label>
                    <Select value={ocrLanguage} onValueChange={setOcrLanguage}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Escolha o idioma OCR" />
                      </SelectTrigger>
                      <SelectContent>
                        {OCR_LANGUAGE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Qualidade OCR</Label>
                    <div className="flex h-8 items-center gap-2 rounded-md border px-2">
                      <Checkbox
                        id="ocr-high-precision"
                        checked={ocrHighPrecision}
                        onCheckedChange={(v) => setOcrHighPrecision(v === true)}
                      />
                      <Label htmlFor="ocr-high-precision" className="text-xs cursor-pointer">
                        Mais precisão (documentos ruins)
                      </Label>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={runOcrOnPreview} disabled={ocrBusy}>
                    {ocrBusy ? "Executando OCR..." : "Executar OCR (scanner)"}
                  </Button>
                  <p className="text-xs text-muted-foreground self-center">
                    {ocrStatus || "Use OCR para PDFs escaneados/imagem."}
                  </p>
                </div>
                {ocrBusy && (
                  <div className="space-y-1">
                    <div className="h-2 rounded bg-gray-200 dark:bg-gray-800 overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 transition-all"
                        style={{ width: `${Math.max(2, ocrProgress)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">{ocrProgress}%</p>
                  </div>
                )}
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {segments.map((seg, idx) => (
                    <div key={idx} className="rounded-md border p-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium">
                          Coluna {idx + 1} ({Math.round(seg.start * 100)}% → {Math.round(seg.end * 100)}%)
                        </p>
                        <span
                          className="inline-flex h-4 w-4 rounded-full border border-black/20"
                          style={{ backgroundColor: seg.color }}
                          title={`Cor da coluna ${idx + 1}`}
                        />
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`extract-${idx}`} className="text-xs">
                            Extrair
                          </Label>
                          <Checkbox
                            id={`extract-${idx}`}
                            checked={segmentConfigs[idx]?.extract !== false}
                            onCheckedChange={(v) =>
                              setSegmentConfigs((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, extract: v === true } : p))
                              )
                            }
                          />
                        </div>
                      </div>
                      <Select
                        value={segmentConfigs[idx]?.targetColumnId || ""}
                        onValueChange={(v) =>
                          setSegmentConfigs((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, targetColumnId: v } : p))
                          )
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Enviar para coluna..." />
                        </SelectTrigger>
                        <SelectContent>
                          {sheet.columns.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        Cabeçalho no preview:{" "}
                        <span className="font-medium">
                          {sheet.columns.find((c) => c.id === segmentConfigs[idx]?.targetColumnId)?.name || "Sem coluna"}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setPdfSeparators([])}>
                    <ScissorsLineDashed className="w-4 h-4 mr-1" />
                    Limpar linhas
                  </Button>
                  <Button type="button" size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={importPdfToSheet}>
                    <FileUp className="w-4 h-4 mr-1" />
                    Importar para planilha
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>

        <div className="space-y-4 min-w-0">
          {pdfPreview && (
            <Card className={cn("border p-3", theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white")}>
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-indigo-500" />
                <p className="text-sm font-semibold">Pré-visualização do PDF</p>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Clique para criar linhas verticais. Use <strong>2 linhas por coluna</strong> (início/fim). Cada coluna fica
                com uma <strong>cor</strong> e um <strong>cabeçalho</strong> entre as linhas indicando a coluna de destino.
                Clique no “x” da linha para remover.
              </p>
              <div className="overflow-auto border rounded-md p-2">
                <div
                  ref={previewRef}
                  className="relative inline-block cursor-crosshair"
                  onClick={addSeparatorAtClick}
                  style={{ lineHeight: 0 }}
                >
                  <img src={pdfPreview.imageUrl} alt="Preview PDF" className="max-w-none block" />
                  {segments.map((seg) => {
                    const targetName =
                      sheet.columns.find((c) => c.id === segmentConfigs[seg.index]?.targetColumnId)?.name || "Sem coluna";
                    return (
                      <div
                        key={`overlay-${seg.index}`}
                        className="absolute top-0 bottom-0 pointer-events-none"
                        style={{
                          left: `${seg.start * 100}%`,
                          width: `${Math.max(0, seg.end - seg.start) * 100}%`,
                          backgroundColor: `${seg.color}22`,
                          borderLeft: `1px solid ${seg.color}88`,
                          borderRight: `1px solid ${seg.color}88`,
                        }}
                      >
                        <div className="absolute top-1 left-1/2 -translate-x-1/2">
                          <span
                            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold text-white shadow"
                            style={{ backgroundColor: seg.color }}
                          >
                            {`Coluna ${seg.index + 1}`}
                            <span className="opacity-90">·</span>
                            <span className="opacity-95">{targetName}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {sortedGuides.map((guide) => (
                      <button
                        key={`${guide.value}-${guide.originalIndex}`}
                        type="button"
                        title="Remover linha"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSeparator(guide.originalIndex);
                        }}
                        className="absolute top-0 bottom-0 w-0.5 hover:opacity-80"
                        style={{ left: `${guide.value * 100}%` }}
                      >
                        <span
                          className="absolute inset-0"
                          style={{
                            backgroundColor:
                              guideMetaByOriginalIndex.get(guide.originalIndex)?.color || "#ef4444",
                          }}
                        />
                        <span
                          className="absolute -top-2 -left-2 rounded-full text-white text-[10px] h-4 w-4 flex items-center justify-center"
                          style={{
                            backgroundColor:
                              guideMetaByOriginalIndex.get(guide.originalIndex)?.color || "#ef4444",
                          }}
                        >
                          x
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            </Card>
          )}

          <Card className={cn("border p-0 overflow-hidden max-w-full", theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white")}>
            <div className="w-full max-w-full overflow-x-auto overflow-y-visible overscroll-x-contain">
              <table className="w-max min-w-full text-sm">
                <thead className={theme === "dark" ? "bg-gray-800" : "bg-gray-100"}>
                  <tr>
                    <th className="p-2 text-left w-14">#</th>
                    {sheet.columns.map((c) => (
                      <th key={c.id} className="p-2 text-left whitespace-nowrap">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.map((r, index) => (
                    <tr
                      key={r.id}
                      className={cn(
                        "border-t",
                        theme === "dark" ? "border-gray-800" : "border-gray-200"
                      )}
                    >
                      <td className="p-2 text-xs text-muted-foreground">{index + 1}</td>
                      {sheet.columns.map((c) => (
                        <td key={`${r.id}-${c.id}`} className="p-1.5 align-top">
                          <Input
                            value={String(r.cells?.[c.id] ?? "")}
                            onChange={(e) => setCell(r.id, c.id, e.target.value)}
                            onPaste={(e) => handleGridPaste(r.id, c.id, e)}
                            className={cn(
                              "h-8",
                              theme === "dark" ? "bg-gray-950 border-gray-700" : ""
                            )}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

