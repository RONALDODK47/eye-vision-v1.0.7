import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { downloadCsvTemplate, parseCsvFile } from "@/lib/csvUtils";

export default function CsvImportActions({
  templateFileName,
  templateHeaders,
  templateRows = [],
  onImportRows,
  className = "",
}) {
  const inputRef = useRef(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleDownloadTemplate = () => {
    downloadCsvTemplate({
      filename: templateFileName,
      headers: templateHeaders,
      rows: templateRows,
    });
  };

  const handlePickFile = () => {
    inputRef.current?.click();
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const rows = await parseCsvFile(file);
      if (!rows.length) {
        alert("A planilha está vazia.");
        return;
      }

      const result = await onImportRows(rows);
      if (result?.message) {
        alert(result.message);
      } else {
        alert("Importação concluída com sucesso.");
      }
    } catch (error) {
      alert(`Erro ao importar planilha: ${error.message || "erro desconhecido"}`);
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  return (
    <div className={`flex gap-2 flex-wrap ${className}`}>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleImportFile}
        className="hidden"
      />
      <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2">
        <Download className="w-4 h-4" /> Planilha Modelo
      </Button>
      <Button variant="outline" onClick={handlePickFile} disabled={isImporting} className="gap-2">
        <Upload className="w-4 h-4" /> {isImporting ? "Importando..." : "Importar Planilha"}
      </Button>
    </div>
  );
}

