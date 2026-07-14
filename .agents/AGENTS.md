# Extrato Vision - Scanned PDF & OCR Precision Rules

This document outlines the rules and design patterns for cropping and parsing scanned bank statements that have had an OCR text layer injected (e.g. Banco do Brasil statements parsed via Acrobat OCR).

## 1. Value Column Signs (D/C) Handling

- Scanned bank statements often right-align monetary values. Due to OCR parsing offsets, the credit (`C`) or debit (`D`) sign letters can sit outside the primary visual column guides drawn by the user.
- To ensure signs are fully visible in the visual crops but stripped out of the editable spreadsheet cell values, follow these rules:

### A. Horizontal Spanning Check

- **Sign Letters (`C`, `D`, `DEBITO`, `CREDITO`):** Allowed to sit up to `+75px` beyond the right guide boundary and up to `55px` from the end of the digit block.
- **Digit Blocks (Saldo column numbers):** To prevent bleed-through into adjacent columns (like Saldo), adjacent matching blocks that contain digits (`/\d/`) must be restricted to a tight boundary (`<= 12px` horizontal distance from the value and `<= 24px` beyond the column guide).

### B. Visual Crop Bounds (`cropEndX`)

- Crop endpoints for the Value column must be dynamically calculated:

  ```typescript
  cropEndX = Math.min(valCol.startX + valCol.width + 75, maxX + 35);
  ```

  This guarantees that the cropped canvas section includes the sign character without capturing the next column.

### C. Editable Text Sanitization

- The string returned to the editable spreadsheet row object (`valueText`) must be clean and ready for accounting inputs:

  1. Remove all letters (`C`, `D`, `CRÉDITO`, `DÉBITO`).
  2. Prefix negative values with a leading `-` sign (no trailing signs).
  3. Positive values must have no sign prefix.

## 2. Date and History Columns

- Revert boundaries for Date and History to safe margins to avoid overlap:

  - Date/History crops must clamp to `+20px` (or `+30px` past guides).
  - Date adjacent search joins must be restricted to `15px` distance.
