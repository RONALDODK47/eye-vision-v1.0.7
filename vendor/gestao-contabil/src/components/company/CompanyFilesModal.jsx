import React, { useState } from "react";
import { dbClient } from "@/api/dbClient";
import { auth } from "@/lib/firebase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, Trash2, FileText, Image as ImageIcon, File } from "lucide-react";
import { useTheme } from "../ThemeProvider";

const MONTHS = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function CompanyFilesModal({ open, onClose, company }) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [uploading, setUploading] = useState(false);

  const { data: files = [] } = useQuery({
    queryKey: ["companyFiles", company?.id, auth.currentUser?.uid],
    queryFn: () => (company?.id && auth.currentUser) ? dbClient.entities.CompanyFile.filter({ company_id: company.id }) : [],
    enabled: !!auth.currentUser && !!company?.id,
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => dbClient.entities.CompanyFile.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["companyFiles", company?.id] }),
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const response = await dbClient.integrations.Core.UploadFile({ file });
      
      const fileType = file.type.includes("image") ? "image" 
        : file.type.includes("pdf") ? "pdf"
        : file.type.includes("sheet") || file.name.endsWith(".xlsx") ? "excel"
        : "other";

      await dbClient.entities.CompanyFile.create({
        company_id: company.id,
        file_name: file.name,
        file_url: response.file_url,
        file_type: fileType,
        year: selectedYear,
        uid: auth.currentUser?.uid
      });

      queryClient.invalidateQueries({ queryKey: ["companyFiles", company?.id] });
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = (type) => {
    switch (type) {
      case "image": return <ImageIcon className="w-4 h-4" />;
      case "pdf": return <FileText className="w-4 h-4" />;
      case "excel": return <FileText className="w-4 h-4" />;
      default: return <File className="w-4 h-4" />;
    }
  };

  const filesByYear = files.reduce((acc, file) => {
    const year = file.year || selectedYear;
    if (!acc[year]) acc[year] = {};
    const month = file.month || 0;
    if (!acc[year][month]) acc[year][month] = [];
    acc[year][month].push(file);
    return acc;
  }, {});

  const availableYears = Object.keys(filesByYear).sort().reverse();
  const currentYearFiles = filesByYear[selectedYear] || {};
  const monthsWithFiles = Object.keys(currentYearFiles).sort((a, b) => parseInt(a) - parseInt(b));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent aria-describedby={undefined} className={`max-w-3xl max-h-[80vh] overflow-y-auto ${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
        <DialogHeader>
          <DialogTitle>Arquivos - {company?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Upload section */}
          <div className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-gray-50"}`}>
            <h3 className="font-semibold mb-3 text-sm">Fazer Upload de Arquivo</h3>
            <div className="flex gap-2">
              <label className="flex-1">
                <div className={`flex items-center justify-center gap-2 px-4 py-2 rounded border-2 border-dashed cursor-pointer ${
                  theme === "dark" ? "border-gray-600 hover:border-gray-500" : "border-gray-300 hover:border-gray-400"
                }`}>
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">{uploading ? "Enviando..." : "Clique para enviar arquivo"}</span>
                  <input 
                    type="file" 
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </div>
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className={`px-3 py-2 rounded border ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"} text-sm`}
              >
                {[...Array(5)].map((_, i) => {
                  const year = new Date().getFullYear() - i;
                  return <option key={year} value={year}>{year}</option>;
                })}
              </select>
            </div>
          </div>

          {/* Year selector */}
          {availableYears.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Selecionar Ano</h3>
              <div className="flex flex-wrap gap-2">
                {availableYears.map(year => (
                  <Button
                    key={year}
                    variant={selectedYear === parseInt(year) ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedYear(parseInt(year))}
                  >
                    {year}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Files by month */}
          <div className="space-y-4">
            {monthsWithFiles.length === 0 ? (
              <div className={`p-4 rounded text-sm text-center ${theme === "dark" ? "bg-gray-800 text-gray-400" : "bg-gray-50 text-gray-500"}`}>
                Nenhum arquivo para o ano {selectedYear}
              </div>
            ) : (
              monthsWithFiles.map(month => (
                <div key={month} className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-gray-50"}`}>
                  <h4 className="font-semibold text-sm mb-3">
                    {month === "0" ? "Sem período específico" : MONTHS[parseInt(month)]}
                  </h4>
                  <div className="space-y-2">
                    {currentYearFiles[month].map(file => (
                      <div key={file.id} className={`flex items-center gap-3 p-2 rounded ${theme === "dark" ? "bg-gray-700" : "bg-white border"}`}>
                        {getFileIcon(file.file_type)}
                        <div className="flex-1">
                          <a
                            href={file.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-indigo-600 hover:underline truncate"
                          >
                            {file.file_name}
                          </a>
                          {file.notes && <p className="text-xs text-gray-500">{file.notes}</p>}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {file.file_type}
                        </Badge>
                        <a
                          href={file.file_url}
                          download
                          className="text-indigo-600 hover:text-indigo-700"
                          title="Baixar"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => {
                            if (window.confirm("Deletar este arquivo?")) {
                              deleteMutation.mutate(file.id);
                            }
                          }}
                          className="text-red-600 hover:text-red-700"
                          title="Deletar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}