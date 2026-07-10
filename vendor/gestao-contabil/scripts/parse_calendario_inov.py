"""
Extrai tarefas datadas do Excel CALENDARIO INOV (*.xlsx) para JSON usado pelo app.

Layout esperado (calendário mensal):
  - Colunas B–H: dias da semana (dom–sáb).
  - Linhas alternadas: uma linha só com datas, a seguinte com textos alinhados às colunas.
  - Colunas J em diante: rótulos de contexto (PRAZOS CONTÁBIL, GRUPO 1, …) — prefixados ao texto.

Também captura:
  - Textos “órfãos” em B–H sem data na coluna (usa última data emitida na folha).
  - Linhas só com texto nas colunas laterais (ex.: fases Paralegal) — data = 1.º dia do mês da folha.

Uso:
  python scripts/parse_calendario_inov.py "C:\\Users\\...\\CALENDARIO INOV (1).xlsx"

Requer: pip install openpyxl
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import date, datetime

try:
    import openpyxl
except ImportError:
    print("Instale openpyxl: pip install openpyxl", file=sys.stderr)
    sys.exit(1)

MONTHS_ORDER = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
]
MONTH_TO_NUM = {name: i + 1 for i, name in enumerate(MONTHS_ORDER)}

SKIP_STRINGS = frozenset(
    {
        "anotações",
        "anotacoes",
        " ",
        "",
    }
)

WEEKDAY_MARKERS = (
    "domingo",
    "segunda",
    "terça",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sábado",
    "sabado",
)


def norm_sheet_name(name: str) -> str:
    """Alinha nomes de abas (incl. encoding estranho) aos 12 meses canónicos."""
    n = unicodedata.normalize("NFC", (name or "").strip())
    if n in MONTH_TO_NUM:
        return n
    low = re.sub(r"[^a-záàâãéêíóôõúç]", "", n.lower())
    for m in MONTHS_ORDER:
        mslug = re.sub(r"[^a-záàâãéêíóôõúç]", "", m.lower())
        if low == mslug or (len(low) >= 4 and len(mslug) >= 4 and low[:4] == mslug[:4]):
            return m
    if low.startswith("mar") and len(low) <= 6:
        return "Março"
    return n


def cell_date(val):
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    return None


def norm_text(s: str) -> str:
    return unicodedata.normalize("NFC", s.strip())


def should_skip_cell_text(t: str) -> bool:
    if len(t) < 3:
        return True
    low = t.lower()
    if low in SKIP_STRINGS:
        return True
    if re.match(r"^[a-záàâãéêíóôõúç\s\-]+$", low) and any(w in low for w in WEEKDAY_MARKERS):
        if len(t) < 25:
            return True
    if re.search(r"\b20\d{2}\b", t) and len(t) < 24 and any(m.lower() in low for m in MONTHS_ORDER):
        return True
    if "configurações" in low or "configuracoes" in low:
        return True
    return False


def row_values(ws, ri: int, max_col: int) -> list:
    return [ws.cell(ri, c).value for c in range(1, max_col + 1)]


def count_dates_in_week(row: list, c0: int = 1, c1: int = 8) -> int:
    n = 0
    for i in range(c0, min(c1, len(row))):
        if cell_date(row[i]) is not None:
            n += 1
    return n


def collect_sidebar(row: list, j0: int = 9) -> str:
    """Colunas J (índice 9) em diante: rótulos da planilha."""
    parts = []
    seen = set()
    for i in range(j0, len(row)):
        v = row[i]
        if not isinstance(v, str):
            continue
        t = norm_text(v)
        if len(t) < 2 or should_skip_cell_text(t):
            continue
        key = t.lower()
        if key in seen:
            continue
        seen.add(key)
        parts.append(t)
    return " · ".join(parts)


def combine_raw(sidebar: str, body: str) -> str:
    body = norm_text(body)
    if not sidebar:
        return body
    return f"[{sidebar}] {body}"


def detect_weekday_col_labels(ws, max_col: int) -> list[str]:
    """Lê a linha de cabeçalho domingo…sábado (cols B–H) para mostrar igual à planilha."""
    fallback = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
    labels = [""] * 8
    for ri in range(1, min(10, ws.max_row + 1)):
        row = row_values(ws, ri, max_col)
        if len(row) < 8:
            continue
        hits = 0
        for i in range(1, 8):
            v = row[i]
            if isinstance(v, str) and any(
                w in v.lower() for w in ("domingo", "segunda", "terça", "terca", "quarta", "quinta", "sexta", "sábado", "sabado")
            ):
                hits += 1
        if hits >= 4:
            for i in range(1, 8):
                v = row[i] if i < len(row) else None
                if isinstance(v, str) and len(v.strip()) > 2:
                    labels[i] = norm_text(v)[:14]
            break
    for i in range(1, 8):
        if not labels[i]:
            labels[i] = fallback[i - 1]
    return labels


def detect_year_from_sheet(ws, max_col: int) -> int | None:
    for ri in range(1, min(6, ws.max_row + 1)):
        row = row_values(ws, ri, max_col)
        for v in row:
            d = cell_date(v)
            if d:
                return d.year
            if isinstance(v, str) and re.search(r"(20\d{2})", v):
                return int(re.search(r"(20\d{2})", v).group(1))
    return None


def parse_month_sheet(ws, sheet_name: str, max_col: int) -> list[dict]:
    canon = norm_sheet_name(sheet_name)
    month_num = MONTH_TO_NUM.get(canon)
    if not month_num:
        return []

    year_hint = detect_year_from_sheet(ws, max_col) or date.today().year
    month_anchor = date(year_hint, month_num, 1)
    col_labels = detect_weekday_col_labels(ws, max_col)

    pending: list[date | None] = [None] * 8
    tasks: list[dict] = []
    seen_pairs: set[tuple[str, str]] = set()
    last_any_date: date | None = None
    last_emitted_max: date | None = None
    last_sidebar_block = ""
    seq = 0

    def emit(
        d: date,
        raw: str,
        *,
        excel_row: int = 0,
        grid_col: int = 0,
        layout_sidebar: str = "",
    ):
        nonlocal seq, last_emitted_max
        raw = norm_text(raw)
        if len(raw) < 4:
            return
        key = (d.isoformat(), raw)
        if key in seen_pairs:
            return
        seen_pairs.add(key)
        seq += 1
        side = norm_text(layout_sidebar)[:400] if layout_sidebar else ""
        gl = col_labels[grid_col] if 1 <= grid_col <= 7 else ""
        tasks.append(
            {
                "date": d.isoformat(),
                "raw": raw,
                "seq": seq,
                "excel_row": excel_row,
                "grid_col": grid_col,
                "grid_col_label": gl,
                "layout_sidebar": side,
            }
        )
        last_emitted_max = d if last_emitted_max is None else max(last_emitted_max, d)

    for ri in range(1, ws.max_row + 1):
        row = row_values(ws, ri, max_col)
        if len(row) < 8:
            row.extend([None] * (8 - len(row)))

        sidebar = collect_sidebar(row, j0=9)

        nd = count_dates_in_week(row, 1, 8)
        has_text_b_h = any(
            isinstance(row[i], str) and not should_skip_cell_text(norm_text(row[i]))
            for i in range(1, 8)
        )

        # Linha de cabeçalho de datas da semana
        if nd >= 4 and not has_text_b_h:
            pending = [None] * 8
            for i in range(1, 8):
                pending[i] = cell_date(row[i])
                if pending[i]:
                    last_any_date = pending[i] if last_any_date is None else max(last_any_date, pending[i])
            continue

        # Linha “mista” (poucas datas + Anotações, etc.): atualiza só as células com data
        if 1 <= nd < 4:
            for i in range(1, 8):
                d = cell_date(row[i])
                if d:
                    pending[i] = d
                    last_any_date = d if last_any_date is None else max(last_any_date, d)
            continue

        # Linha só com rótulos laterais (sem texto B–H) — fases / grupos soltos
        if sidebar and not has_text_b_h and nd == 0:
            u = sidebar.upper()
            is_subrow = bool(re.match(r"^FASE\s+\d", u.strip())) or u.startswith("GRUPO")
            if not is_subrow:
                if len(sidebar) >= 28 or any(
                    k in u for k in ("PARALEGAL", "PRAZOS", "PROCESSO", "ABERTURA", "BAIXA")
                ):
                    last_sidebar_block = sidebar
            lateral = (
                f"{last_sidebar_block} — {sidebar}"
                if last_sidebar_block and sidebar != last_sidebar_block
                else sidebar
            )
            emit(
                month_anchor,
                lateral,
                excel_row=ri,
                grid_col=0,
                layout_sidebar=(lateral[:350] if lateral else sidebar),
            )
            continue

        if not has_text_b_h:
            continue

        # Linha de conteúdo sob o último cabeçalho de datas
        for ci in range(1, 8):
            v = row[ci] if ci < len(row) else None
            if not isinstance(v, str):
                continue
            t = norm_text(v)
            if should_skip_cell_text(t):
                continue
            d = pending[ci] if ci < len(pending) else None
            if d is None:
                # vizinho mais próximo com data
                left = next((pending[j] for j in range(ci - 1, 0, -1) if pending[j]), None)
                right = next((pending[j] for j in range(ci + 1, 8) if pending[j]), None)
                d = left or right or last_emitted_max or last_any_date or month_anchor
            raw = combine_raw(sidebar, t)
            emit(d, raw, excel_row=ri, grid_col=ci, layout_sidebar=sidebar)

    return tasks


def parse_workbook(path: str) -> dict:
    wb = openpyxl.load_workbook(path, data_only=True)
    months_out = []

    # Ordem das abas no ficheiro = Janeiro…Dezembro (evita nomes corrompidos no .xlsx)
    for idx, sn in enumerate(wb.sheetnames):
        if idx >= len(MONTHS_ORDER):
            break
        canon = MONTHS_ORDER[idx]
        ws = wb[sn]
        max_col = min(max(ws.max_column or 12, 12), 24)
        tasks = parse_month_sheet(ws, canon, max_col)
        col_labels = detect_weekday_col_labels(ws, max_col)
        weekday_labels = [col_labels[i] if i < len(col_labels) else "" for i in range(1, 8)]
        sheet_title = ""
        for ri in range(1, min(6, ws.max_row + 1)):
            row = row_values(ws, ri, max_col)
            if len(row) < 2:
                continue
            for j in range(1, min(8, len(row))):
                v = row[j]
                if isinstance(v, str) and len(norm_text(v)) > 4:
                    t = norm_text(v)
                    if any(m.lower() in t.lower() for m in MONTHS_ORDER) and re.search(
                        r"20\d{2}", t
                    ):
                        sheet_title = t
                        break
            if sheet_title:
                break
        if not sheet_title:
            y = detect_year_from_sheet(ws, max_col) or date.today().year
            sheet_title = f"{canon} {y}"
        months_out.append(
            {
                "sheet": canon,
                "sheet_title": sheet_title,
                "weekday_labels": weekday_labels,
                "tasks": tasks,
            }
        )

    wb.close()
    return {"extracted_at": date.today().isoformat(), "months": months_out}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx", help="Caminho do .xlsx")
    ap.add_argument(
        "-o",
        "--out",
        default=os.path.join("src", "data", "inovCalendarExtracted.json"),
        help="Arquivo JSON de saída (relativo à raiz do projeto)",
    )
    args = ap.parse_args()
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = args.out if os.path.isabs(args.out) else os.path.join(root, args.out)
    data = parse_workbook(args.xlsx)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    n = sum(len(m["tasks"]) for m in data["months"])
    print(f"OK: {len(data['months'])} meses, {n} tarefas -> {out_path}")


if __name__ == "__main__":
    main()
