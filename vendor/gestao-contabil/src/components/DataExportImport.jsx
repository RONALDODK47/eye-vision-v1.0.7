import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/AuthContext";
import { dbClient } from "@/api/dbClient";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Download, Upload } from "lucide-react";

export default function DataExportImport() {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [companyTokenInput, setCompanyTokenInput] = useState("");
  const [exportType, setExportType] = useState("all");
  const [importType, setImportType] = useState("all");
  const fileInputRef = useRef(null);

  const handleExport = async () => {
    if (!user?.uid) {
      alert("Usuário não autenticado");
      return;
    }
    const token = String(companyTokenInput || "").trim();
    if (!token) {
      alert("Por favor, digite o token da empresa que deseja exportar!");
      return;
    }
    setIsExporting(true);
    try {
      const allCompanies = await dbClient.entities.Company.list(user.uid);
      const selectedCompany = allCompanies.find(
        (c) =>
          String(c.assigned_company_token || c.portal_token || c.id || "")
            .trim()
            .toLowerCase() === token.toLowerCase()
      );

      if (!selectedCompany) {
        throw new Error(
          `Nenhuma empresa encontrada com o token "${token}". Certifique-se de que o token esteja correto.`
        );
      }

      if (!confirm(`Deseja exportar os dados da empresa "${selectedCompany.name}"?`)) {
        setIsExporting(false);
        return;
      }

      const isShared = exportType === "all" || exportType === "shared";
      const isPrivate = exportType === "all" || exportType === "private";

      let customColumns = [];
      let tasks = [];
      let taskTemplates = [];
      let appSettings = [];
      let calendarData = null;
      let chatData = null;
      let notices = [];
      let usefulSites = [];

      if (isShared) {
        customColumns = await dbClient.entities.CustomColumn.list(user.uid);
        const allTasks = await dbClient.entities.CompanyTask.list(user.uid);
        tasks = allTasks.filter((t) => t.company_id === selectedCompany.id);
        const allTemplates = await dbClient.entities.TaskTemplate.list(user.uid);
        taskTemplates = allTemplates.filter((t) => t.company_id === selectedCompany.id);
        appSettings = await dbClient.entities.AppSettings.list(user.uid);

        try {
          const calendarCompletionsSnap = await getDocs(
            collection(db, "calendar_inov_completions")
          );
          const calendarCompletions = calendarCompletionsSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          const calendarDataSnap = await dbClient.entities.InovCalendarSnapshot.getLive();
          calendarData = {
            completions: calendarCompletions.filter((c) => c.company_id === selectedCompany.id || !c.company_id),
            snapshot: calendarDataSnap,
          };
        } catch (e) {
          console.log("Erro ao carregar dados do calendário (ignorando):", e);
        }

        try {
          const threads = await dbClient.entities.DirectChatThread.listForUser(user.uid);
          const messages = [];
          for (const th of threads) {
            const msgs = await dbClient.entities.DirectChatMessage.listByThread(th.id);
            messages.push(...msgs);
          }
          chatData = { threads, messages };
        } catch (e) {
          console.log("Erro ao carregar dados do chat (ignorando):", e);
        }
      }

      if (isPrivate) {
        const allNotices = await dbClient.entities.Notice.list(user.uid);
        notices = allNotices.filter((n) => !n.company_id || n.company_id === selectedCompany.id);
        const allSites = await dbClient.entities.UsefulSite.list(user.uid);
        usefulSites = allSites.filter((s) => !s.company_id || s.company_id === selectedCompany.id);
      }

      const exportData = {
        exportedAt: new Date().toISOString(),
        exportedByUid: user.uid,
        exportedByEmail: user.email,
        companyToken: token,
        exportType,
      };

      if (isShared) {
        exportData.companies = [selectedCompany];
        exportData.customColumns = customColumns;
        exportData.tasks = tasks;
        exportData.taskTemplates = taskTemplates;
        exportData.appSettings = appSettings;
        exportData.calendarData = calendarData;
        exportData.chatData = chatData;
      }

      if (isPrivate) {
        exportData.notices = notices;
        exportData.usefulSites = usefulSites;
      }

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gestao-contabil-${exportType}-${selectedCompany.name.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      alert(`Exportação concluída com sucesso!`);
    } catch (err) {
      console.error(err);
      alert("Erro na exportação: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    const token = String(companyTokenInput || "").trim();
    if (!token) {
      alert("Por favor, digite o token da empresa antes de importar os dados!");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = String(companyTokenInput || "").trim();
    if (!token) {
      alert("Por favor, digite o token da empresa antes de importar os dados!");
      e.target.value = "";
      return;
    }

    if (
      !confirm(
        `Tem certeza que deseja importar o arquivo "${file.name}"? Dependendo do tipo escolhido, isso pode substituir dados existentes no sistema!`
      )
    ) {
      e.target.value = "";
      return;
    }
    setIsImporting(true);
    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      if (!user?.uid) throw new Error("Usuário não autenticado");

      const fileToken = String(importData.companyToken || "").trim();
      if (token.toLowerCase() !== fileToken.toLowerCase() && fileToken) {
        throw new Error(
          `O token digitado (${token}) não coincide com o token do arquivo (${fileToken}).`
        );
      }

      const existingCompanies = await dbClient.entities.Company.list(user.uid);
      const companyToOverwrite = existingCompanies.find(
        (c) =>
          String(c.assigned_company_token || c.portal_token || c.id || "")
            .trim()
            .toLowerCase() === token.toLowerCase()
      );

      const isShared = importType === "all" || importType === "shared";
      const isPrivate = importType === "all" || importType === "private";

      if (isShared && companyToOverwrite && importData.companies) {
        const existingTasks = await dbClient.entities.CompanyTask.list(user.uid);
        const tasksToDelete = existingTasks.filter((t) => t.company_id === companyToOverwrite.id);
        for (const t of tasksToDelete) {
          await dbClient.entities.CompanyTask.delete(t.id);
        }
        await dbClient.entities.Company.delete(companyToOverwrite.id);
      }

      if (isShared) {
        for (const company of importData.companies || []) {
          const { id: _id, ...companyData } = company;
          await dbClient.entities.Company.create({ ...companyData, uid: user.uid });
        }
        for (const column of importData.customColumns || []) {
          const { id: _id, ...columnData } = column;
          await dbClient.entities.CustomColumn.create({ ...columnData, uid: user.uid });
        }
        for (const task of importData.tasks || []) {
          const { id: _id, ...taskData } = task;
          await dbClient.entities.CompanyTask.create({ ...taskData, uid: user.uid });
        }
        for (const template of importData.taskTemplates || []) {
          const { id: _id, ...templateData } = template;
          await dbClient.entities.TaskTemplate.create({ ...templateData, uid: user.uid });
        }
        for (const setting of importData.appSettings || []) {
          const { id: _id, ...settingData } = setting;
          await dbClient.entities.AppSettings.create({ ...settingData, uid: user.uid });
        }
        if (importData.chatData) {
          const { threads = [], messages = [] } = importData.chatData;
          for (const th of threads) {
            const { id, ...thData } = th;
            await setDoc(doc(db, "direct_chat_threads", id), thData, { merge: true });
          }
          for (const msg of messages) {
            const { id, ...msgData } = msg;
            await setDoc(doc(db, "direct_chat_messages", id), msgData, { merge: true });
          }
        }
        if (importData.calendarData?.completions) {
          for (const c of importData.calendarData.completions) {
            const { id, ...cData } = c;
            await setDoc(doc(db, "calendar_inov_completions", id), cData, { merge: true });
          }
        }
        if (importData.calendarData?.snapshot) {
          const snapData = importData.calendarData.snapshot;
          await setDoc(doc(db, "inov_calendar_data", "live"), snapData, { merge: true });
        }
      }

      if (isPrivate) {
        for (const notice of importData.notices || []) {
          const { id: _id, ...noticeData } = notice;
          await dbClient.entities.Notice.create({ ...noticeData, uid: user.uid });
        }
        for (const site of importData.usefulSites || []) {
          const { id: _id, ...siteData } = site;
          await dbClient.entities.UsefulSite.create({ ...siteData, uid: user.uid });
        }
      }

      alert("Importação concluída com sucesso!");
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Erro na importação: " + err.message);
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  return (
    <Card className="p-6 max-w-2xl mx-auto space-y-6">
      <h2 className="text-xl font-bold border-b pb-3">Exportar/Importar Dados da Empresa</h2>

      <div className="space-y-2 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 p-4 rounded-xl">
        <Label className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
          Token da Empresa (Obrigatório)
        </Label>
        <Input
          value={companyTokenInput}
          onChange={(e) => setCompanyTokenInput(e.target.value)}
          placeholder="Digite ou cole o token da empresa (Ex: CL-FN14-...)"
          className="w-full bg-white dark:bg-gray-950"
        />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Para garantir a segurança, você deve inserir o token correspondente à empresa que deseja exportar ou importar.
        </p>
      </div>

      <div className="space-y-6 pt-2">
        <div className="space-y-3">
          <h3 className="font-semibold text-base">Exportar Dados</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Selecione o tipo de dado que deseja incluir no arquivo de exportação:
          </p>
          <div className="flex flex-col gap-2 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="exportType" value="all" checked={exportType === "all"} onChange={(e) => setExportType(e.target.value)} />
              <span className="text-sm font-medium">Todos os Dados</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="exportType" value="shared" checked={exportType === "shared"} onChange={(e) => setExportType(e.target.value)} />
              <span className="text-sm font-medium">Apenas Compartilhados (Calendário, Novidades, Empresas, Chat)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="exportType" value="private" checked={exportType === "private"} onChange={(e) => setExportType(e.target.value)} />
              <span className="text-sm font-medium">Apenas Privados (Recados, Links)</span>
            </label>
          </div>
          <Button onClick={handleExport} disabled={isExporting} className="w-full font-medium">
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? "Exportando..." : "Exportar Arquivo"}
          </Button>
        </div>

        <div className="border-t pt-6 space-y-3">
          <h3 className="font-semibold text-base">Importar Dados</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Selecione quais dados do arquivo deseja aplicar. <span className="text-red-500 font-medium">Aviso: importar dados compartilhados pode substituir informações da empresa!</span>
          </p>
          <div className="flex flex-col gap-2 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="importType" value="all" checked={importType === "all"} onChange={(e) => setImportType(e.target.value)} />
              <span className="text-sm font-medium">Importar Tudo do Arquivo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="importType" value="shared" checked={importType === "shared"} onChange={(e) => setImportType(e.target.value)} />
              <span className="text-sm font-medium">Importar Apenas Compartilhados</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="importType" value="private" checked={importType === "private"} onChange={(e) => setImportType(e.target.value)} />
              <span className="text-sm font-medium">Importar Apenas Privados</span>
            </label>
          </div>
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            onClick={handleImportClick}
            disabled={isImporting}
            variant="destructive"
            className="w-full font-medium bg-red-600 hover:bg-red-700 text-white"
          >
            <Upload className="w-4 h-4 mr-2" />
            {isImporting ? "Importando..." : "Carregar Arquivo e Importar"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
